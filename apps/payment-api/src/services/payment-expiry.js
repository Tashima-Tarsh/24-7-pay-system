import { PaymentStatus } from '@youpi/common';

/**
 * NPCI 15-Minute Payment Timeout Enforcement.
 *
 * NPCI mandates that a UPI payment transaction must complete within 15 minutes
 * of initiation. This service provides a hard expiry check that can be run on
 * every status poll and by a background sweeper to transition stale payments
 * to EXPIRED, releasing merchant slots and preventing indefinite holds.
 */
const NPCI_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Check whether a payment has exceeded the NPCI 15-minute timeout.
 * Returns { expired: boolean, status: string, remaining_ms?: number }.
 * @param {object} ctx - Service context with { db, sessionRepo?, auditRepo?, eventEmitter? }
 * @param {string} paymentId
 * @returns {Promise<{expired: boolean, status: string, remaining_ms?: number}>}
 */
export async function checkPaymentExpiry(ctx, paymentId) {
  const { db } = ctx;

  const row = db.queryOne(
    'SELECT id, created_at, status, reported_utr FROM payment_sessions WHERE id = ?',
    [paymentId]
  );

  if (!row) {
    throw new Error('Payment not found');
  }

  const { created_at, status, reported_utr } = row;

  // Already terminal — nothing to expire.
  if (['SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(status)) {
    return { expired: false, status };
  }

  const age = Date.now() - new Date(created_at).getTime();

  // If UTR was already reported, the 30-minute verification window governs,
  // not the 15-minute NPCI initiation timeout.
  if (reported_utr) {
    return { expired: false, status, remaining_ms: Math.max(0, NPCI_TIMEOUT_MS - age) };
  }

  if (age > NPCI_TIMEOUT_MS) {
    const nowIso = new Date().toISOString();

    // Transition to EXPIRED atomically (only if still non-terminal).
    db.execute(
      `UPDATE payment_sessions
       SET status = ?, expired_at = ?, updated_at = ?
       WHERE id = ? AND status NOT IN ('SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED')`,
      [PaymentStatus.EXPIRED, nowIso, nowIso, paymentId]
    );

    ctx.auditRepo?.log({
      merchantId: row.merchant_id,
      entityType: 'PAYMENT_SESSION',
      entityId: paymentId,
      action: 'PAYMENT_NPCI_EXPIRED',
      actorType: 'SYSTEM',
      details: { reason: '15-minute NPCI payment timeout elapsed', age_ms: age }
    });

    ctx.eventEmitter?.emit('PAYMENT.EXPIRED', {
      paymentId,
      orderId: row.id,
      merchantId: row.merchant_id,
      amountPaise: row.amount_paise
    });

    return { expired: true, status: PaymentStatus.EXPIRED };
  }

  return { expired: false, status, remaining_ms: Math.max(0, NPCI_TIMEOUT_MS - age) };
}

/**
 * Sweep all non-terminal payments older than 15 minutes and expire them.
 * Intended for background cron execution.
 * @param {object} ctx
 * @returns {Promise<{expiredCount: number}>}
 */
export async function sweepExpiredPayments(ctx) {
  const { db, auditRepo, eventEmitter } = ctx;
  const nowIso = new Date().toISOString();
  const cutoffIso = new Date(Date.now() - NPCI_TIMEOUT_MS).toISOString();

  const stale = db.query(
    `SELECT id, merchant_id, created_at, status FROM payment_sessions
     WHERE status NOT IN ('SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED')
       AND reported_utr IS NULL
       AND created_at < ?`,
    [cutoffIso]
  ) || [];

  let expiredCount = 0;
  for (const row of stale) {
    db.execute(
      `UPDATE payment_sessions
       SET status = ?, expired_at = ?, updated_at = ?
       WHERE id = ? AND status NOT IN ('SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED')`,
      [PaymentStatus.EXPIRED, nowIso, nowIso, row.id]
    );
    expiredCount++;

    auditRepo?.log({
      merchantId: row.merchant_id,
      entityType: 'PAYMENT_SESSION',
      entityId: row.id,
      action: 'PAYMENT_NPCI_EXPIRED_SWEEP',
      actorType: 'SYSTEM',
      details: { reason: '15-minute NPCI payment timeout (background sweep)', created_at: row.created_at }
    });

    eventEmitter?.emit('PAYMENT.EXPIRED', {
      paymentId: row.id,
      orderId: row.id,
      merchantId: row.merchant_id,
      amountPaise: row.amount_paise
    });
  }

  return { expiredCount };
}

export { NPCI_TIMEOUT_MS };
