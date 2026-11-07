/**
 * VPA Health Scorer — Section 4 of Phase 4 Bulletproof Operations.
 *
 * Manages health score decay and recovery for VPA pool entries.
 * Health score ranges from 0-100; below 40 a VPA is excluded from routing.
 *
 * Score adjustments:
 *   SUCCESSFUL_TX:    +1   (legitimate transaction)
 *   VELOCITY_SPIKE:   -15  (unusual velocity pattern)
 *   SENDER_CONCENTRATION: -20 (same sender 3x in 1 hour)
 *   ROUND_FIGURE_PATTERN: -10 (>80% round amounts)
 *   FREEZE_REPORTED:  -60  (frozen by bank or fraud team)
 *   MANUAL_THAW:      +30  (manual recovery)
 *   DAILY_RESET:      +5   (overnight recovery, runs at 00:05 IST)
 *
 * Health score transitions:
 *   >= 70:  ACTIVE
 *   40-69:  WARMING (reduced routing weight)
 *   < 40:   COOLING (excluded from routing)
 *   Frozen: FROZEN (manually frozen by admin or bank)
 */

export class VPAHealthScorer {
  /**
   * @param {{
   *   db: import('@youpi/db').Database,
   *   auditRepo?: import('@youpi/db').AuditLogRepository
   * }} options
   */
  constructor(options = {}) {
    this.db = options.db;
    this.auditRepo = options.auditRepo || null;
  }

  /**
   * Adjusts the health score of a VPA based on an event.
   * Applies bounds (0-100) and updates status tier accordingly.
   *
   * @param {string} vpaId
   * @param {string} eventType - One of: SUCCESSFUL_TX, VELOCITY_SPIKE,
   *   SENDER_CONCENTRATION, ROUND_FIGURE_PATTERN, FREEZE_REPORTED,
   *   MANUAL_THAW, DAILY_RESET
   * @param {object} metadata - Additional context for audit logging
   * @returns {{ previousScore: number, newScore: number, status: string }}
   */
  adjustScore(vpaId, eventType, metadata = {}) {
    const adjustment = this._getAdjustment(eventType);

    const vpa = this.db.queryOne(`SELECT * FROM vpa_pool WHERE id = ?`, [vpaId]);
    if (!vpa) {
      const err = new Error(`VPA not found: ${vpaId}`);
      err.code = 'VPA_NOT_FOUND';
      throw err;
    }

    const previousScore = Number(vpa.health_score || 0);
    const newScore = Math.max(0, Math.min(100, previousScore + adjustment));

    // Determine new status based on score
    let newStatus = vpa.status;
    if (newScore >= 70) {
      newStatus = 'ACTIVE';
    } else if (newScore >= 40) {
      newStatus = 'WARMING';
    } else {
      newStatus = 'COOLING';
    }

    // Don't auto-thaw a FROZEN VPA via score adjustment alone
    if (vpa.status === 'FROZEN' && newStatus !== 'FROZEN') {
      newStatus = 'COOLING'; // Must be manually thawed
    }

    this.db.execute(`
      UPDATE vpa_pool
      SET health_score = ?,
          status = ?,
          updated_at = ?
      WHERE id = ?
    `, [newScore, newStatus, new Date().toISOString(), vpaId]);

    // Record health event
    const severity = this._getSeverity(eventType, adjustment);
    this.db.execute(`
      INSERT INTO vpa_health_events (id, vpa_pool_id, event_type, severity, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      `evt_${crypto.randomUUID()}`,
      vpaId,
      eventType,
      severity,
      JSON.stringify(metadata),
      new Date().toISOString()
    ]);

    if (this.auditRepo) {
      this.auditRepo.log({
        entityType: 'VPA_POOL',
        entityId: vpaId,
        action: `HEALTH_${eventType}`,
        actorType: 'SYSTEM',
        details: {
          vpaId,
          previousScore,
          newScore,
          oldStatus: vpa.status,
          newStatus,
          eventType,
          ...metadata
        }
      });
    }

    return {
      previousScore,
      newScore,
      status: newStatus,
      adjustment
    };
  }

  /**
   * Daily reset job — runs at 00:05 IST.
   * Resets daily counters and applies recovery score to non-frozen VPAs.
   *
   * @returns {number} Number of VPAs reset
   */
  dailyReset() {
    const now = new Date().toISOString();
    let count = 0;

    // Reset daily counters and apply recovery score to non-frozen VPAs
    this.db.execute(`
      UPDATE vpa_pool
      SET daily_tx_count = 0,
          daily_inflow_paise = 0,
          unique_senders_24h = 0,
          health_score = LEAST(100, health_score + 5),
          updated_at = ?
      WHERE status != 'FROZEN'
    `, [now]);

    const result = this.db.query(`SELECT changes() AS count`);
    count = result ? result[0].count : 0;

    // Record daily reset events for each non-frozen VPA
    const vpAs = this.db.query(`SELECT id FROM vpa_pool WHERE status != 'FROZEN'`);
    for (const vpa of vpAs) {
      this.db.execute(`
        INSERT INTO vpa_health_events (id, vpa_pool_id, event_type, severity, metadata, created_at)
        VALUES (?, ?, 'DAILY_RESET', 'INFO', ?, ?)
      `, [
        `evt_${crypto.randomUUID()}`,
        vpa.id,
        JSON.stringify({ reason: 'daily_reset', score_increase: 5 }),
        now
      ]);
    }

    return count;
  }

  /**
   * Evaluates all VPAs and updates their status based on current health score.
   * Call this after any score adjustment batch.
   *
   * @returns {Array<{ vpaId: string, previousStatus: string, newStatus: string }>}
   */
  reevaluateStatuses() {
    const vpAs = this.db.query(`SELECT id, health_score, status FROM vpa_pool WHERE status != 'FROZEN'`);
    const changes = [];

    for (const vpa of vpAs) {
      const score = Number(vpa.health_score || 0);
      let newStatus = vpa.status;

      if (score >= 70) {
        newStatus = 'ACTIVE';
      } else if (score >= 40) {
        newStatus = 'WARMING';
      } else {
        newStatus = 'COOLING';
      }

      if (newStatus !== vpa.status) {
        this.db.execute(`
          UPDATE vpa_pool
          SET status = ?, updated_at = ?
          WHERE id = ?
        `, [newStatus, new Date().toISOString(), vpa.id]);

        changes.push({
          vpaId: vpa.id,
          previousStatus: vpa.status,
          newStatus
        });
      }
    }

    return changes;
  }

  /**
   * Returns the health score and status for a VPA.
   * @param {string} vpaId
   * @returns {object|null}
   */
  getHealth(vpaId) {
    return this.db.queryOne(`SELECT id, health_score, status, daily_tx_count, daily_inflow_paise, unique_senders_24h FROM vpa_pool WHERE id = ?`, [vpaId]);
  }

  /**
   * Returns all VPAs for a merchant with health scores.
   * @param {string} merchantId
   * @returns {Array}
   */
  getVPAsForMerchant(merchantId) {
    return this.db.query(`
      SELECT id, vpa, health_score, status, daily_tx_count, daily_inflow_paise,
             unique_senders_24h, last_transaction_at, frozen_at, frozen_reason
      FROM vpa_pool
      WHERE merchant_id = ?
      ORDER BY health_score DESC, vpa ASC
    `, [merchantId]);
  }

  /**
   * Returns the adjustment value for a given event type.
   * @param {string} eventType
   * @returns {number}
   * @private
   */
  _getAdjustment(eventType) {
    const adjustments = {
      SUCCESSFUL_TX: 1,
      VELOCITY_SPIKE: -15,
      SENDER_CONCENTRATION: -20,
      ROUND_FIGURE_PATTERN: -10,
      FREEZE_REPORTED: -60,
      MANUAL_THAW: 30,
      DAILY_RESET: 5
    };
    return adjustments[eventType] || 0;
  }

  /**
   * Returns the severity level for a given event type and adjustment.
   * @param {string} eventType
   * @param {number} adjustment
   * @returns {string}
   * @private
   */
  _getSeverity(eventType, adjustment) {
    if (adjustment <= -20) return 'CRITICAL';
    if (adjustment <= -10) return 'WARN';
    return 'INFO';
  }
}
