/**
 * Dispute Case Management — Phase 4 Deliverable 10
 *
 * Dispute cases for payment disputes (amount mismatch, non-receipt,
 * unauthorized, fraud). Provides evidence preservation and
 * case lifecycle management.
 */

export class DisputeCaseManager {
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
   * Create a new dispute case.
   *
   * @param {object} params
   * @param {string} params.payment_order_id - Related payment order ID
   * @param {string} params.raised_by - USER | MERCHANT | SYSTEM
   * @param {string} params.reason - AMOUNT_MISMATCH | NON_RECEIPT | UNAUTHORIZED | FRAUD
   * @param {object} params.evidence - Evidence object (screenshots, logs, UTRs, etc.)
   * @param {string} params.actorId - User/merchant/admin ID who raised it
   * @returns {object} Created dispute case
   */
  async createCase({ paymentOrderId, raisedBy, reason, evidence, actorId }) {
    const caseId = `dispute_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    this.db.execute(`
      INSERT INTO dispute_cases (id, payment_order_id, raised_by, reason, status, evidence, created_at)
      VALUES (?, ?, ?, ?, 'OPEN', ?, ?)
    `, [caseId, paymentOrderId, raisedBy, reason, JSON.stringify(evidence), new Date().toISOString()]);

    // Log audit event
    if (this.auditLogger) {
      this.auditLogger.log({
        actorType: raisedBy === 'SYSTEM' ? 'SYSTEM' : 'USER',
        actorId: actorId,
        action: 'DISPUTE_CASE_CREATED',
        resourceType: 'dispute_case',
        resourceId: caseId,
        ipAddress: null,
        userAgent: null,
        deviceFingerprint: null,
        requestPayload: { payment_order_id: paymentOrderId, reason, evidence },
        responsePayload: { case_id: caseId, status: 'OPEN' },
        outcome: 'SUCCESS',
        rejectionReason: null
      });
    }

    return this.getCase(caseId);
  }

  /**
   * Get a dispute case by ID.
   * @param {string} caseId
   * @returns {object|null}
   */
  getCase(caseId) {
    return this.db.queryOne(`
      SELECT * FROM dispute_cases WHERE id = ?
    `, [caseId]);
  }

  /**
   * Update dispute case status and resolution.
   * @param {string} caseId
   * @param {string} status - OPEN | UNDER_REVIEW | RESOLVED | ESCALATED
   * @param {string} resolution - Resolution description
   * @param {string} actorId - Who resolved it
   * @returns {object|null} Updated case
   */
  async resolveCase(caseId, status, resolution, actorId) {
    const validStatuses = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    this.db.execute(`
      UPDATE dispute_cases
      SET status = ?, resolution = ?, resolved_at = ?
      WHERE id = ?
    `, [status, resolution, new Date().toISOString(), caseId]);

    // Log dispute event
    this.db.execute(`
      INSERT INTO dispute_events (id, case_id, actor, action, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [`evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`, caseId, actorId, `STATUS_CHANGED_TO_${status}`, resolution, new Date().toISOString()]);

    // Audit log
    if (this.auditLogger) {
      this.auditLogger.log({
        actorType: 'USER',
        actorId: actorId,
        action: 'DISPUTE_RESOLVED',
        resourceType: 'dispute_case',
        resourceId: caseId,
        ipAddress: null,
        userAgent: null,
        deviceFingerprint: null,
        requestPayload: { case_id: caseId, status, resolution },
        responsePayload: { case_id: caseId, status },
        outcome: 'SUCCESS',
        rejectionReason: null
      });
    }

    return this.getCase(caseId);
  }

  /**
   * Add an event to a dispute case.
   * @param {string} caseId
   * @param {string} actor - Who performed the action
   * @param {string} action - Action taken
   * @param {string} notes - Notes about the action
   * @returns {object} Created event
   */
  async addEvent(caseId, actor, action, notes) {
    const eventId = `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    this.db.execute(`
      INSERT INTO dispute_events (id, case_id, actor, action, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [eventId, caseId, actor, action, notes, new Date().toISOString()]);

    return {
      id: eventId,
      case_id: caseId,
      actor,
      action,
      notes,
      created_at: new Date().toISOString()
    };
  }

  /**
   * List dispute cases with optional filtering.
   * @param {object} filters - { status, raisedBy, paymentOrderId, limit, offset }
   * @returns {Array}
   */
  listCases(filters = {}) {
    let query = `SELECT * FROM dispute_cases WHERE 1=1`;
    const params = [];

    if (filters.status) {
      query += ` AND status = ?`;
      params.push(filters.status);
    }
    if (filters.raisedBy) {
      query += ` AND raised_by = ?`;
      params.push(filters.raisedBy);
    }
    if (filters.paymentOrderId) {
      query += ` AND payment_order_id = ?`;
      params.push(filters.paymentOrderId);
    }

    query += ` ORDER BY created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT ?`;
      params.push(filters.limit);
    }
    if (filters.offset) {
      query += ` OFFSET ?`;
      params.push(filters.offset);
    }

    return this.db.query(query, params);
  }

  /**
   * Get all events for a dispute case.
   * @param {string} caseId
   * @returns {Array}
   */
  getCaseEvents(caseId) {
    return this.db.query(`
      SELECT * FROM dispute_events
      WHERE case_id = ?
      ORDER BY created_at ASC
    `, [caseId]);
  }

  /**
   * Get all open disputes for review.
   * @returns {Array}
   */
  getOpenCases() {
    return this.db.query(`
      SELECT * FROM dispute_cases
      WHERE status = 'OPEN'
      ORDER BY created_at DESC
    `);
  }
}

function cryptoRandomUUID() {
  return crypto.randomUUID();
}
import crypto from 'node:crypto';
