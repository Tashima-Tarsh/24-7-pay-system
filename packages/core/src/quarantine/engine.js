/**
 * Auto-Quarantine Engine — Phase 4 Deliverable 5
 *
 * When fraud patterns are detected, automatically quarantines the order,
 * payment session, and optionally freezes the associated VPA.
 *
 * Quarantine triggers:
 *   VELOCITY:    Merchant has >50 transactions in last hour
 *   AMOUNT_PATTERN: >80% round-figure payments in last 24h
 *   SENDER_CONCENTRATION: Same sender >3x in 1 hour on same VPA
 *   UTR_REUSE: Same UTR used across multiple orders
 *   MULTI_ACCOUNT: Same device fingerprint used across >3 merchants in 24h
 *
 * Severity:
 *   CRITICAL → also freezes the associated VPA
 *   WARN     → quarantine order only
 */

import { Database } from '@youpi/db';
import { AuditLogger } from '../audit/logger.js';

export class AutoQuarantineEngine {
  /**
   * @param {{
   *   db: import('./database.js').Database,
   *   auditLogger: import('../audit/logger.js').AuditLogger
   * }} options
   */
  constructor({ db, auditLogger }) {
    this.db = db;
    this.auditLogger = auditLogger;
  }

  /**
   * Evaluate a payment order for quarantine triggers.
   * If any trigger fires, quarantines the order and optionally freezes the VPA.
   *
   * @param {string} orderId - Payment order ID to evaluate
   * @returns {{ quarantined: boolean, triggers: Array }}
   */
  async evaluateQuarantine(orderId) {
    const order = this.db.queryOne(
      `SELECT * FROM payment_orders WHERE id = ?`,
      [orderId]
    );

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // If already quarantined, skip
    if (order.status === 'QUARANTINED') {
      return { quarantined: false, triggers: [] };
    }

    const triggers = [];

    // ---- Check 1: Velocity — merchant has >50 tx in last hour ----
    const velocityRow = this.db.queryOne(
      `SELECT COUNT(*) AS count FROM payment_orders
       WHERE merchant_id = ?
         AND created_at > datetime('now', '-1 hour')`,
      [order.merchant_id]
    );
    const velocityCount = parseInt(velocityRow.count || '0', 10);
    if (velocityCount > 50) {
      triggers.push({
        type: 'VELOCITY',
        severity: 'CRITICAL',
        metadata: { count: velocityCount, timeframe: '1_hour' }
      });
    }

    // ---- Check 2: Amount pattern — >80% round figures in last 24h ----
    const roundFiguresRow = this.db.queryOne(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE actual_amount_paise % 100 = 0) AS round_count
      FROM payment_orders
      WHERE merchant_id = ?
        AND created_at > datetime('now', '-24 hours')
    `, [order.merchant_id]);
    const roundCount = parseInt(roundFiguresRow.round_count || '0', 10);
    const totalCount = parseInt(roundFiguresRow.total || '0', 10);
    const roundRatio = totalCount > 0 ? roundCount / totalCount : 0;
    if (roundRatio > 0.8 && totalCount >= 5) {
      triggers.push({
        type: 'AMOUNT_PATTERN',
        severity: 'WARN',
        metadata: { ratio: roundRatio, total_count: totalCount, round_count: roundCount }
      });
    }

    // ---- Check 3: Multi-account — same device fingerprint across >3 merchants in 24h ----
    const multiMerchantRow = this.db.queryOne(`
      SELECT COUNT(DISTINCT merchant_id) AS merchant_count
      FROM payment_orders
      WHERE device_fingerprint = ?
        AND created_at > datetime('now', '-24 hours')
    `, [order.device_fingerprint || '']);
    const merchantCount = parseInt(multiMerchantRow.merchant_count || '0', 10);
    if (merchantCount > 3) {
      triggers.push({
        type: 'MULTI_ACCOUNT',
        severity: 'CRITICAL',
        metadata: { merchant_count: merchantCount, timeframe: '24_hours' }
      });
    }

    // ---- Check 4: UTR reuse — same UTR used across multiple orders ----
    if (order.utr) {
      const utrReuseRow = this.db.queryOne(`
        SELECT COUNT(*) AS count FROM payment_orders
        WHERE utr = ? AND id != ?
      `, [order.utr, orderId]);
      const utrReuseCount = parseInt(utrReuseRow.count || '0', 10);
      if (utrReuseCount > 0) {
        triggers.push({
          type: 'UTR_REUSE',
          severity: 'CRITICAL',
          metadata: { utr: order.utr, reuse_count: utrReuseCount }
        });
      }
    }

    // ---- Check 5: Sender concentration — same sender >3x in 1 hour on same VPA ----
    const receivingAccountId = order.receiving_account_id || null;
    if (receivingAccountId && order.sender_vpa) {
      const senderCountRow = this.db.queryOne(`
        SELECT COUNT(*) AS count FROM payment_orders
        WHERE payee_vpa_id = ?
          AND sender_vpa = ?
          AND created_at > datetime('now', '-1 hour')
      `, [receivingAccountId, order.sender_vpa]);
      const senderCount = parseInt(senderCountRow.count || '0', 10);
      if (senderCount >= 3) {
        triggers.push({
          type: 'SENDER_CONCENTRATION',
          severity: 'CRITICAL',
          metadata: { sender_vpa: order.sender_vpa, count: senderCount, timeframe: '1_hour' }
        });
      }
    }

    // If no triggers, return early
    if (triggers.length === 0) {
      return { quarantined: false, triggers: [] };
    }

    // ---- QUARANTINE THE ORDER ----
    const quarantineReason = JSON.stringify(triggers.map(t => ({
      type: t.type,
      severity: t.severity,
      metadata: t.metadata
    })));

    this.db.execute(`
      UPDATE payment_orders
      SET status = 'QUARANTINED',
          quarantine_reason = ?,
          quarantined_at = ?,
          updated_at = ?
      WHERE id = ?
    `, [quarantineReason, new Date().toISOString(), new Date().toISOString(), orderId]);

    // Audit log the quarantine
    this.auditLogger.log({
      actorType: 'SYSTEM',
      actorId: null,
      action: 'ORDER_QUARANTINED',
      resourceType: 'payment_order',
      resourceId: orderId,
      ipAddress: null,
      userAgent: null,
      deviceFingerprint: order.device_fingerprint,
      requestPayload: { order_id: orderId, merchant_id: order.merchant_id },
      responsePayload: { triggers },
      outcome: 'QUARANTINED',
      rejectionReason: triggers.map(t => t.type).join(',')
    });

    // If CRITICAL trigger, also freeze the VPA
    const hasCritical = triggers.some(t => t.severity === 'CRITICAL');
    if (hasCritical && receivingAccountId) {
      this.db.execute(`
        UPDATE vpa_pool
        SET status = 'FROZEN',
            frozen_at = ?,
            frozen_reason = ?,
            updated_at = ?
        WHERE id = ?
      `, [new Date().toISOString(), quarantineReason, new Date().toISOString(), receivingAccountId]);

      this.auditLogger.log({
        actorType: 'SYSTEM',
        actorId: null,
        action: 'VPA_FROZEN',
        resourceType: 'vpa_pool',
        resourceId: receivingAccountId,
        ipAddress: null,
        userAgent: null,
        deviceFingerprint: order.device_fingerprint,
        requestPayload: { vpa_pool_id: receivingAccountId, triggers },
        responsePayload: { status: 'FROZEN' },
        outcome: 'QUARANTINED',
        rejectionReason: 'CRITICAL_TRIGGER: ' + triggers.map(t => t.type).join(',')
      });
    }

    return { quarantined: true, triggers };
  }
}
