/**
 * Sender Diversity Tracking — Phase 4 Deliverable 3: Anti-Concentration Risk.
 *
 * Prevents concentration risk where the same sender hits the same VPA
 * repeatedly. DoT FRI flags accounts receiving from too few unique senders
 * or too many transactions from the same sender.
 *
 * Rules enforced:
 *   - Same sender cannot hit same VPA 3+ times in last 1 hour
 *   - unique_senders_24h counter tracked per VPA for regulatory reporting
 */

export class SenderTracker {
  /**
   * @param {import('@youpi/db').Database} db - Database instance
   */
  constructor({ db }) {
    this.db = db;
  }

  /**
   * Record a sender-VPA interaction and check if allowed.
   *
   * @param {string} vpaId - VPA pool ID
   * @param {string} senderVpa - Sender's UPI ID
   * @param {number} amountPaise - Transaction amount in paise
   * @returns {{ allowed: boolean, reason?: string }}
   */
  async recordSender(vpaId, senderVpa, amountPaise) {
    // Check: same sender hitting same VPA 3+ times in last hour
    const recentCount = this.db.query(
      `SELECT COUNT(*) AS count
       FROM payment_orders
       WHERE payee_vpa_id = ?
         AND sender_vpa = ?
         AND created_at > datetime('now', '-1 hour')`,
      [vpaId, senderVpa]
    );

    const count = parseInt(recentCount[0].count || 0, 10);
    if (count >= 3) {
      return { allowed: false, reason: 'SENDER_CONCENTRATION' };
    }

    // Update unique_senders_24h counter
    this.db.execute(
      `UPDATE vpa_pool
       SET unique_senders_24h = unique_senders_24h + 1
       WHERE id = ?`,
      [vpaId]
    );

    return { allowed: true };
  }

  /**
   * Check if a sender can send to a VPA without recording.
   * @param {string} vpaId
   * @param {string} senderVpa
   * @returns {{ allowed: boolean, count: number }}
   */
  checkSenderCount(vpaId, senderVpa) {
    const recentCount = this.db.query(
      `SELECT COUNT(*) AS count
       FROM payment_orders
       WHERE payee_vpa_id = ?
         AND sender_vpa = ?
         AND created_at > datetime('now', '-1 hour')`,
      [vpaId, senderVpa]
    );

    const count = parseInt(recentCount[0].count || 0, 10);
    return {
      allowed: count < 3,
      count
    };
  }
}
