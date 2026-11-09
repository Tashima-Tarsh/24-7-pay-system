import crypto from 'node:crypto';

/**
 * Immutable Audit Log — Phase 4 Deliverable 4: Regulatory Defense.
 *
 * Every action, rejection, and verification attempt is logged immutably.
 * This provides evidence if ED/CBI/RBI inquiry requires audit trails.
 *
 * The pp_audit table is append-only: triggers prevent DELETE and UPDATE.
 * Retention: 7 years per RBI requirements.
 */

export class AuditLogger {
  /**
   * @param {import('@youpi/db').Database} db - Database instance
   */
  constructor({ db }) {
    this.db = db;
  }

  /**
   * Log an audit event. All fields are recorded immutably.
   *
   * @param {Object} entry
   * @param {string} entry.actorType - SYSTEM | MERCHANT | ADMIN | USER | API_KEY
   * @param {number|string} entry.actorId
   * @param {string} entry.action - e.g., PAYMENT_CREATED, PAYMENT_VERIFIED, PAYMENT_REJECTED
   * @param {string} entry.resourceType - e.g., payment_session, vpa_pool, payment_order
   * @param {string} entry.resourceId
   * @param {string} entry.ipAddress
   * @param {string} entry.userAgent
   * @param {string} entry.deviceFingerprint
   * @param {object} entry.request - Request payload (JSON)
   * @param {object} entry.response - Response payload (JSON)
   * @param {string} entry.outcome - SUCCESS | FAILURE | REJECTED | QUARANTINED
   * @param {string} entry.rejectionReason - Reason if rejected
   * @returns {Promise<void>}
   */
  async log(entry) {
    this.db.execute(`
      INSERT INTO pp_audit (
        id, actor_type, actor_id, action, resource_type, resource_id,
        ip_address, user_agent, device_fingerprint,
        request_payload, response_payload, outcome, rejection_reason,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      crypto.randomUUID(),
      entry.actorType,
      entry.actorId,
      entry.action,
      entry.resourceType,
      entry.resourceId,
      entry.ipAddress,
      entry.userAgent,
      entry.deviceFingerprint,
      JSON.stringify(entry.request),
      JSON.stringify(entry.response),
      entry.outcome,
      entry.rejectionReason,
      new Date().toISOString()
    ]);
  }

  /**
   * Convenience: log a rejection with reason.
   */
  async logRejection(entry) {
    await this.log({
      ...entry,
      outcome: 'REJECTED',
      rejectionReason: entry.rejectionReason
    });
  }

  /**
   * Convenience: log a success.
   */
  async logSuccess(entry) {
    await this.log({
      ...entry,
      outcome: 'SUCCESS',
      rejectionReason: null
    });
  }

  /**
   * Convenience: log a failure.
   */
  async logFailure(entry) {
    await this.log({
      ...entry,
      outcome: 'FAILURE',
      rejectionReason: entry.rejectionReason
    });
  }

  /**
   * Query audit logs with optional filtering.
   * @param {object} filters - Optional filters: actorId, action, resourceType, resourceId, outcome, startDate, endDate, limit
   * @returns {Array} Array of audit records
   */
  async query(filters = {}) {
    let query = 'SELECT * FROM pp_audit WHERE 1=1';
    const params = [];

    if (filters.actorId) {
      query += ' AND actor_id = $' + (params.length + 1);
      params.push(filters.actorId);
    }
    if (filters.action) {
      query += ' AND action = $' + (params.length + 1);
      params.push(filters.action);
    }
    if (filters.resourceType) {
      query += ' AND resource_type = $' + (params.length + 1);
      params.push(filters.resourceType);
    }
    if (filters.resourceId) {
      query += ' AND resource_id = $' + (params.length + 1);
      params.push(filters.resourceId);
    }
    if (filters.outcome) {
      query += ' AND outcome = $' + (params.length + 1);
      params.push(filters.outcome);
    }
    if (filters.startDate) {
      query += ' AND created_at >= $' + (params.length + 1);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      query += ' AND created_at <= $' + (params.length + 1);
      params.push(filters.endDate);
    }

    query += ' ORDER BY created_at DESC';
    if (filters.limit) {
      query += ' LIMIT $' + (params.length + 1);
      params.push(filters.limit);
    }

    return this.db.query(query, params);
  }
}
