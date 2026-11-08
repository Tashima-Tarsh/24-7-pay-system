import crypto from 'node:crypto';

/**
 * VPA Routing Engine — Section 4 of Phase 4 Bulletproof Operations.
 *
 * Selects the healthiest VPA for a payment based on health score,
 * daily velocity caps, unique sender limits, and inflow limits.
 *
 * NPCI/RBI Compliance Constraints:
 *   - Daily tx count cap: 25 per VPA
 *   - Daily inflow cap: ₹4,00,000 per VPA (₹40,00,000 in paise)
 *   - Unique senders per 24h cap: 20 per VPA
 *   - Minimum health score: 40 (below this, VPA is excluded)
 *
 * All amounts are in paise internally.
 */

export class VPARoutingEngine {
  /**
   * @param {{
   *   db: import('@youpi/db').Database,
   *   auditRepo?: import('@youpi/db').AuditLogRepository
   * }} options
   */
  constructor(options = {}) {
    this.db = options.db;
    this.auditRepo = options.auditRepo || null;
    // Operational thresholds (NPCI/RBI-aligned defaults). All monetary values in paise.
    // Make configurable so a ₹10 crore/month merchant can right-size per-VPA limits
    // without hardcoding a bank-approved transaction ceiling.
    this.maxDailyTxPerVpa = Number(options.maxDailyTxPerVpa ?? 25);
    this.maxDailyInflowPaisePerVpa = Number(options.maxDailyInflowPaisePerVpa ?? 4000000);
    this.maxUniqueSenders24h = Number(options.maxUniqueSenders24h ?? 20);
    this.minHealthScore = Number(options.minHealthScore ?? 40);
  }

  /**
   * Selects the best VPA for a payment order.
   *
   * Selection criteria (in priority order):
   *   1. Status must be ACTIVE or WARMING
   *   2. Health score must be > 40
   *   3. Daily tx count < 25 (hard cap)
   *   4. Daily inflow + new amount < ₹4,00,000 (hard cap)
   *   5. Unique senders 24h < 20 (hard cap)
   *   6. Weighted random selection by health score (higher health = higher probability)
   *
   * @param {string} merchantId
   * @param {number} amountPaise
   * @returns {{ vpa: string, vpa_id: string, reason: string }}
   * @throws {Error} If no healthy VPA is available (VPA_POOL_EXHAUSTED)
   */
  selectVPAForOrder(merchantId, amountPaise) {
    const candidates = this.db.query(`
      SELECT *
      FROM vpa_pool
      WHERE merchant_id = ?
        AND status IN ('ACTIVE', 'WARMING')
        AND health_score > ?
        AND daily_tx_count < ?
        AND daily_inflow_paise + ? < ?
        AND unique_senders_24h < ?
      ORDER BY health_score DESC, last_transaction_at ASC NULLS FIRST
      LIMIT 5
    `, [merchantId, this.minHealthScore, this.maxDailyTxPerVpa, amountPaise, this.maxDailyInflowPaisePerVpa, this.maxUniqueSenders24h]);

    if (!candidates || candidates.length === 0) {
      const err = new Error('VPA_POOL_EXHAUSTED: No healthy VPA available for merchant ' + merchantId);
      err.code = 'VPA_POOL_EXHAUSTED';
      err.merchantId = merchantId;
      throw err;
    }

    // Weighted random selection by health score
    const totalHealth = candidates.reduce((sum, r) => sum + Number(r.health_score), 0);
    let roll = Math.random() * totalHealth;
    for (const row of candidates) {
      roll -= Number(row.health_score);
      if (roll <= 0) {
        this._audit('VPA_SELECTED', row.id, row.vpa, {
          amount_paise: amountPaise,
          health_score: row.health_score,
          reason: 'HEALTH_WEIGHTED'
        });
        return {
          vpa: row.vpa,
          vpa_id: row.id,
          reason: 'HEALTH_WEIGHTED'
        };
      }
    }

    // Fallback to first candidate
    const row = candidates[0];
    this._audit('VPA_SELECTED', row.id, row.vpa, {
      amount_paise: amountPaise,
      health_score: row.health_score,
      reason: 'FALLBACK'
    });
    return {
      vpa: row.vpa,
      vpa_id: row.id,
      reason: 'FALLBACK'
    };
  }

  /**
   * Atomically selects and reserves a VPA for an order under concurrency.
   *
   * Performs selection and counter increment inside a single write transaction
   * so two concurrent requests cannot reserve the same VPA beyond its caps
   * (no duplicate exclusive reservation, no oversubscription).
   *
   * @param {string} merchantId
   * @param {number} amountPaise
   * @returns {{ vpa: string, vpa_id: string, reason: string }}
   * @throws {Error} VPA_POOL_EXHAUSTED when no healthy VPA can be reserved
   */
  reserveVPAForOrder(merchantId, amountPaise) {
    const amountNum = typeof amountPaise === 'bigint' ? Number(amountPaise) : Number(amountPaise);
    const now = new Date().toISOString();

    const result = this.db.transaction(() => {
      const candidates = this.db.query(`
        SELECT id, vpa, health_score, daily_tx_count, daily_inflow_paise, unique_senders_24h
        FROM vpa_pool
        WHERE merchant_id = ?
          AND status IN ('ACTIVE', 'WARMING')
          AND health_score > ?
          AND daily_tx_count < ?
          AND daily_inflow_paise + ? < ?
          AND unique_senders_24h < ?
        ORDER BY health_score DESC, last_transaction_at ASC NULLS FIRST
        LIMIT 5
      `, [merchantId, this.minHealthScore, this.maxDailyTxPerVpa, amountNum, this.maxDailyInflowPaisePerVpa, this.maxUniqueSenders24h]);

      if (!candidates || candidates.length === 0) {
        const err = new Error('VPA_POOL_EXHAUSTED: No healthy VPA available for merchant ' + merchantId);
        err.code = 'VPA_POOL_EXHAUSTED';
        err.merchantId = merchantId;
        throw err;
      }

      // Try each candidate in health order; the first conditional increment that
      // succeeds atomically reserves the VPA (SQLite serializes write transactions).
      for (const row of candidates) {
        const updated = this.db.execute(`
          UPDATE vpa_pool
          SET daily_tx_count = daily_tx_count + 1,
              daily_inflow_paise = daily_inflow_paise + ?,
              unique_senders_24h = unique_senders_24h + 1,
              last_transaction_at = ?,
              updated_at = ?
          WHERE id = ?
            AND status IN ('ACTIVE', 'WARMING')
            AND health_score > ?
            AND daily_tx_count < ?
            AND daily_inflow_paise + ? < ?
            AND unique_senders_24h < ?
        `, [amountNum, now, now, row.id, this.minHealthScore, this.maxDailyTxPerVpa, amountNum, this.maxDailyInflowPaisePerVpa, this.maxUniqueSenders24h]);

        if (updated && updated.changes && updated.changes > 0) {
          this._audit('VPA_RESERVED', row.id, row.vpa, {
            amount_paise: amountNum,
            health_score: row.health_score,
            reason: 'ATOMIC_RESERVATION'
          });
          return { vpa: row.vpa, vpa_id: row.id, reason: 'ATOMIC_RESERVATION' };
        }
        // Cap was exceeded by a concurrent request; try the next candidate.
      }

      const err = new Error('VPA_POOL_EXHAUSTED: No healthy VPA could be reserved for merchant ' + merchantId);
      err.code = 'VPA_POOL_EXHAUSTED';
      err.merchantId = merchantId;
      throw err;
    });

    return result;
  }

  /**
   * Releases a VPA reservation when a payment does not complete (e.g., callback
   * failure or timeout), decrementing the counters so the capacity returns to
   * the pool. Safe to call multiple times (idempotent-ish via conditional).
   *
   * @param {string} vpaId
   * @param {number} amountPaise
   */
  releaseVPA(vpaId, amountPaise) {
    const amountNum = typeof amountPaise === 'bigint' ? Number(amountPaise) : Number(amountPaise);
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.execute(`
        UPDATE vpa_pool
        SET daily_tx_count = CASE WHEN daily_tx_count > 0 THEN daily_tx_count - 1 ELSE 0 END,
            daily_inflow_paise = CASE WHEN daily_inflow_paise >= ? THEN daily_inflow_paise - ? ELSE 0 END,
            unique_senders_24h = CASE WHEN unique_senders_24h > 0 THEN unique_senders_24h - 1 ELSE 0 END,
            updated_at = ?
        WHERE id = ?
      `, [amountNum, amountNum, now, vpaId]);
      this.db.execute(`
        INSERT INTO vpa_health_events (id, vpa_pool_id, event_type, severity, metadata, created_at)
        VALUES (?, ?, 'DAILY_RESET', 'INFO', ?, ?)
      `, [`evt_${crypto.randomUUID()}`, vpaId, JSON.stringify({ released_paise: amountNum, reason: 'payment_not_completed' }), now]);
    });
  }

  /**
   * Records a successful transaction against a VPA, updating daily counters.
   * @param {string} vpaId
   * @param {number} amountPaise
   * @param {string} senderVpa
   * @param {string} paymentId
   */
  recordTransaction(vpaId, amountPaise, senderVpa, paymentId) {
    const amountNum = typeof amountPaise === 'bigint' ? Number(amountPaise) : Number(amountPaise);
    const now = new Date().toISOString();

    this.db.transaction(() => {
      // Increment daily counters
      this.db.execute(`
        UPDATE vpa_pool
        SET daily_tx_count = daily_tx_count + 1,
            daily_inflow_paise = daily_inflow_paise + ?,
            last_transaction_at = ?,
            updated_at = ?
        WHERE id = ?
      `, [amountNum, now, now, vpaId]);

      // Increment unique senders count if this sender is new today
      // (simplified: increment on every transaction; a more sophisticated
      //  implementation would check the sender against a 24h set)
      this.db.execute(`
        UPDATE vpa_pool
        SET unique_senders_24h = unique_senders_24h + 1
        WHERE id = ?
      `, [vpaId]);

      // Record health event for successful transaction
      this.db.execute(`
        INSERT INTO vpa_health_events (id, vpa_pool_id, event_type, severity, metadata, created_at)
        VALUES (?, ?, 'SUCCESSFUL_TX', 'INFO', ?, ?)
      `, [
        `evt_${crypto.randomUUID()}`,
        vpaId,
        JSON.stringify({ amount_paise: amountNum, sender_vpa: senderVpa, payment_id: paymentId }),
        now
      ]);
    });
  }

  /**
   * Returns the health status and current metrics for a VPA.
   * @param {string} vpaId
   * @returns {object|null}
   */
  getVPAHealth(vpaId) {
    return this.db.queryOne(`SELECT * FROM vpa_pool WHERE id = ?`, [vpaId]);
  }

  /**
   * Returns all VPAs for a merchant with their health status.
   * @param {string} merchantId
   * @returns {Array}
   */
  getVPAsForMerchant(merchantId) {
    return this.db.query(`
      SELECT *,
        (daily_inflow_paise / 4000000.0) * 100 AS inflow_utilization_percent,
        (daily_tx_count / 25.0) * 100 AS tx_utilization_percent,
        (unique_senders_24h / 20.0) * 100 AS sender_utilization_percent
      FROM vpa_pool
      WHERE merchant_id = ?
      ORDER BY health_score DESC, last_transaction_at ASC NULLS FIRST
    `, [merchantId]);
  }

  /**
   * Manually freezes a VPA (e.g., due to fraud flag or bank notification).
   * @param {string} vpaId
   * @param {string} reason
   * @param {string} actorId
   */
  freezeVPA(vpaId, reason, actorId = 'SYSTEM') {
    const now = new Date().toISOString();
    this.db.execute(`
      UPDATE vpa_pool
      SET status = 'FROZEN',
          frozen_at = ?,
          frozen_reason = ?,
          updated_at = ?
      WHERE id = ?
    `, [now, reason, now, vpaId]);

    this.db.execute(`
      INSERT INTO vpa_health_events (id, vpa_pool_id, event_type, severity, metadata, created_at)
      VALUES (?, ?, 'FREEZE', 'CRITICAL', ?, ?)
    `, [`evt_${crypto.randomUUID()}`, vpaId, JSON.stringify({ reason, actor_id: actorId }), now]);

    if (this.auditRepo) {
      this.auditRepo.log({
        entityType: 'VPA_POOL',
        entityId: vpaId,
        action: 'VPA_FROZEN',
        actorType: actorId,
        details: { vpaId, reason }
      });
    }
  }

  /**
   * Manually thaws a frozen VPA (e.g., after review).
   * @param {string} vpaId
   * @param {string} actorId
   */
  thawVPA(vpaId, actorId = 'SYSTEM') {
    const now = new Date().toISOString();
    this.db.execute(`
      UPDATE vpa_pool
      SET status = 'ACTIVE',
          health_score = GREATEST(40, health_score),
          updated_at = ?
      WHERE id = ?
    `, [now, vpaId]);

    this.db.execute(`
      INSERT INTO vpa_health_events (id, vpa_pool_id, event_type, severity, metadata, created_at)
      VALUES (?, ?, 'MANUAL_THAW', 'INFO', ?, ?)
    `, [`evt_${crypto.randomUUID()}`, vpaId, JSON.stringify({ actor_id: actorId }), now]);

    if (this.auditRepo) {
      this.auditRepo.log({
        entityType: 'VPA_POOL',
        entityId: vpaId,
        action: 'VPA_THAWED',
        actorType: actorId,
        details: { vpaId }
      });
    }
  }

  _audit(eventType, vpaPoolId, vpa, metadata) {
    if (this.auditRepo) {
      this.auditRepo.log({
        entityType: 'VPA_POOL',
        entityId: vpaPoolId,
        action: eventType,
        actorType: 'SYSTEM',
        details: { vpaPoolId, vpa, ...metadata }
      });
    }
  }
}
