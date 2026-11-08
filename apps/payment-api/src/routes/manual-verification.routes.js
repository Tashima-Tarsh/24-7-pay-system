import { HttpServer } from '../server.js';
import { PaymentStatus, PaymentEvidenceLevel, ObserverSource, safeEqual } from '@youpi/common';
import crypto from 'node:crypto';

export function registerManualVerificationRoutes(server, ctx) {
  const { sessionRepo, obsRepo, callbackOutboxRepo, webhookEngine, merchantRepo, db } = ctx;

  // POST /api/v1/payments/:id/manual-verify
  server.post('/api/v1/payments/:id/manual-verify', async (req, res, params) => {
    const paymentId = params.id;
    try {
      const body = await HttpServer.parseBody(req);
      const { utr, merchantId } = body;

      // Validate 12-digit UTR format
      if (!utr || !/^\d{12}$/.test(utr)) {
        return HttpServer.json(res, 400, {
          error: 'Invalid UTR format. Must be 12 digits.',
          code: 'INVALID_UTR'
        });
      }

      const session = sessionRepo.findById(paymentId);
      if (!session) {
        return HttpServer.json(res, 404, { error: 'Payment not found.' });
      }

      // Only allow manual verification if payment is still ACTIVE/INITIATED/INTENT_OPENED
      if (session.status !== PaymentStatus.ACTIVE &&
        session.status !== PaymentStatus.INITIATED &&
        session.status !== PaymentStatus.INTENT_OPENED &&
        session.status !== PaymentStatus.MANUAL_VERIFICATION_PENDING) {
        return HttpServer.json(res, 409, {
          error: 'Payment is not in a verifiable state.',
          currentStatus: session.status
        });
      }

      // Check if this UTR was already used for another payment (prevents UTR reuse fraud).
      // The check AND observation insert happen in one BEGIN IMMEDIATE transaction so
      // concurrent requests are serialized: only the first can claim the UTR.
      let utrAlreadyUsed = false;
      let existingAttributedPaymentId = null;
      try {
        db.transaction(() => {
          const existingUtrByRef = db.queryOne(
            `SELECT id, attributed_payment_id FROM payment_observations WHERE bank_reference_number = ? LIMIT 1`,
            [utr]
          );
          if (existingUtrByRef && existingUtrByRef.attributed_payment_id !== paymentId) {
            utrAlreadyUsed = true;
            existingAttributedPaymentId = existingUtrByRef.attributed_payment_id;
            throw new Error('UTR_ALREADY_USED');
          }
          // Insert observation directly via db.execute() so it participates in the BEGIN IMMEDIATE transaction.
          let receivingAccountId = session.receivingAccountId || null;
          if (!receivingAccountId) {
            const acct = db.queryOne(
              `SELECT id FROM payment_receiving_accounts WHERE merchant_id = ? AND is_active = 1 LIMIT 1`,
              [session.merchantId]
            );
            receivingAccountId = acct?.id || null;
          }
          db.execute(
            `INSERT INTO payment_observations (
              id, receiving_account_id, source, amount_paise, observed_at,
              sender_vpa, bank_reference_number, fingerprint_hash, raw_payload,
              attribution_status, attributed_payment_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              `obs_manual_${crypto.randomUUID().replace(/-/g, '')}`,
              receivingAccountId || '',
              ObserverSource.MANUAL_UTR_ENTRY,
              Number(session.amountPaise),
              new Date().toISOString(),
              null,
              utr,
              crypto.createHash('sha256').update(`${paymentId}:${utr}`).digest('hex'),
              JSON.stringify({ utr, source: 'manual_user_entry' }),
              'PENDING_VERIFICATION',
              paymentId,
              new Date().toISOString()
            ]
          );
        });
      } catch (err) {
        if (err.message !== 'UTR_ALREADY_USED') throw err;
      }

      if (utrAlreadyUsed) {
        return HttpServer.json(res, 409, {
          error: 'This UTR has already been used for another payment.',
          code: 'UTR_ALREADY_USED'
        });
      }

      // Transition to MANUAL_VERIFICATION_PENDING (NOT SUCCESS)
      const nowIso = new Date().toISOString();
      const verificationDeadline = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      let currentMetadata = {};
      try {
        currentMetadata = JSON.parse(session.metadata || '{}');
      } catch {}
      const updatedMetadata = {
        ...currentMetadata,
        manualUtr: utr,
        manualSubmittedAt: nowIso,
        verificationStartedAt: nowIso,
        verificationDeadline: verificationDeadline
      };

      sessionRepo.db.execute(
        `UPDATE payment_sessions
         SET status = ?,
             verification_tag = ?,
             metadata = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          PaymentStatus.MANUAL_VERIFICATION_PENDING,
          `Manual UTR ${utr} submitted - awaiting bank confirmation`,
          JSON.stringify(updatedMetadata),
          nowIso,
          paymentId
        ]
      );

      // Fire webhook: payment.pending_verification (NOT success)
      if (webhookEngine) {
        const updated = sessionRepo.findById(paymentId);
        webhookEngine.dispatch('payment.pending_verification', updated).catch(() => {});
      }

      // Start background verification job (checks bank observer every 30s for 15 min)
      startVerificationJob(paymentId, utr, session.amountPaise, session.receivingAccountId, db, obsRepo, sessionRepo, webhookEngine);

      return HttpServer.json(res, 200, {
        paymentId,
        status: 'MANUAL_VERIFICATION_PENDING',
        message: 'UTR submitted. Verifying with bank records. This may take up to 15 minutes.',
        verificationDeadline: verificationDeadline
      });

    } catch (err) {
      console.error('[manual-verify] error:', err);
      return HttpServer.json(res, 500, { error: 'Internal Server Error', detail: err.message });
    }
  });

  // Background verification job
  function startVerificationJob(paymentId, utr, amountPaise, receivingAccountId, db, obsRepo, sessionRepo, webhookEngine) {
    const MAX_ATTEMPTS = 30; // 30 attempts × 30s = 15 minutes
    const INTERVAL_MS = 30000;
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;

      try {
        // Check if bank observer (Gmail/SMS) has confirmed this UTR
        const bankConfirmation = db.queryOne(
          `SELECT id FROM payment_observations
           WHERE bank_reference_number = ?
             AND source IN ('GMAIL', 'SMS_GATEWAY', 'PROVIDER_WEBHOOK', 'BANK_H2H_POLL')
           LIMIT 1`,
          [utr]
        );

        if (bankConfirmation) {
          // UTR confirmed by bank! Mark as SUCCESS
          clearInterval(interval);
          const nowIso = new Date().toISOString();
          sessionRepo.db.execute(
            `UPDATE payment_sessions
             SET status = ?,
                 verification_tag = ?,
                 completed_at = ?,
                 updated_at = ?
             WHERE id = ?`,
            [PaymentStatus.SUCCESS, `Bank-verified UTR ${utr}`, nowIso, nowIso, paymentId]
          );

          // Broadcast SSE for real-time frontend update
          try {
            if (server && typeof server.broadcastSse === 'function') {
              server.broadcastSse(paymentId, 'status_change', {
                status: PaymentStatus.SUCCESS,
                verificationTag: `Bank-verified UTR ${utr}`,
                upiTransactionReference: utr
              });
            }
          } catch {}

          if (webhookEngine) {
            const updated = sessionRepo.findById(paymentId);
            webhookEngine.dispatch('payment.success', updated).catch(() => {});
          }
          return;
        }

        // Check if deadline passed
        if (attempts >= MAX_ATTEMPTS) {
          clearInterval(interval);
          const nowIso = new Date().toISOString();
          sessionRepo.db.execute(
            `UPDATE payment_sessions
             SET status = ?,
                 verification_tag = ?,
                 updated_at = ?
             WHERE id = ?`,
            [PaymentStatus.FAILED, `Manual UTR ${utr} not confirmed by bank within 15 min`, nowIso, paymentId]
          );

          // Broadcast SSE for failed verification
          try {
            if (server && typeof server.broadcastSse === 'function') {
              server.broadcastSse(paymentId, 'status_change', {
                status: PaymentStatus.FAILED,
                verificationTag: `Manual UTR ${utr} not confirmed by bank within 15 min`
              });
            }
          } catch {}

          if (webhookEngine) {
            const updated = sessionRepo.findById(paymentId);
            webhookEngine.dispatch('payment.failed', updated).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[manual-verify] job error:', err);
      }
    }, INTERVAL_MS);

    if (interval.unref) interval.unref();
  }
}
