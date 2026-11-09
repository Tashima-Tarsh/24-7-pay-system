import { HttpServer } from '../server.js';
import crypto from 'node:crypto';
import {
  PaymentStatus,
  safeEqual
} from '@youpi/common';
import {
  verifySignedOrderToken
} from '@youpi/core/crypto/order-token';

export function registerVerifyCallbackRoutes(server, ctx) {
  const { sessionRepo, obsRepo, callbackOutboxRepo, webhookEngine, merchantRepo, db } = ctx;

  // POST /api/v1/payments/:id/verify-callback
  // 7-layer verification of UPI app return:
  //   1. Verify token signature (HMAC-SHA256)
  //   2. Verify nonce not reused (one-time use)
  //   3. Verify token not expired (< 5 minutes old)
  //   4. Verify device fingerprint matches original creation
  //   5. Verify time delta (8-300 seconds between app open and return)
  //   6. Verify UTR format (10-22 alphanumeric chars)
  //   7. Verify UTR not already used by another payment
  server.post('/api/v1/payments/:id/verify-callback', async (req, res, params) => {
    const paymentId = params.id;
    try {
      const body = await HttpServer.parseBody(req);
      const {
        utr,
        token,
        responseCode,
        amount,
        fingerprint,
        returnedAt,
        appOpenedAt
      } = body;

      // ---- CHECK 0: Required fields ----
      if (!token || !utr || !responseCode) {
        return HttpServer.json(res, 400, {
          error: 'Missing required fields: token, utr, responseCode',
          code: 'MISSING_REQUIRED_FIELDS'
        });
      }

      // ---- CHECK 1: Verify token signature (HMAC-SHA256) ----
      const tokenResult = verifySignedOrderToken(token);
      if (!tokenResult.valid) {
        return HttpServer.json(res, 401, {
          verdict: 'REJECTED',
          reason: 'INVALID_TOKEN_SIGNATURE',
          code: 'INVALID_TOKEN_SIGNATURE'
        });
      }

      const { order_id, amount_paise, payee_vpa, nonce, fingerprint_hash, created_at } = tokenResult.payload;

      // ---- CHECK 2: Verify nonce not reused (one-time use) ----
      const nonceRow = db.queryOne(
        `SELECT id, used FROM payment_nonces WHERE nonce = ?`,
        [nonce]
      );

      if (!nonceRow) {
        return HttpServer.json(res, 409, {
          verdict: 'REJECTED',
          reason: 'NONCE_EXPIRED_OR_NOT_FOUND',
          code: 'NONCE_EXPIRED_OR_NOT_FOUND'
        });
      }

      if (Number(nonceRow.used) === 1) {
        return HttpServer.json(res, 409, {
          verdict: 'REJECTED',
          reason: 'NONCE_ALREADY_USED',
          code: 'NONCE_ALREADY_USED'
        });
      }

      // ---- CHECK 3: Verify token not expired (< 5 minutes old) ----
      // Already verified in verifySignedOrderToken, but double-check here
      const now = Date.now();
      if (now - created_at > 5 * 60 * 1000) {
        return HttpServer.json(res, 409, {
          verdict: 'REJECTED',
          reason: 'TOKEN_EXPIRED',
          code: 'TOKEN_EXPIRED'
        });
      }

      // ---- CHECK 4: Verify device fingerprint matches ----
      if (!fingerprint || fingerprint !== fingerprint_hash) {
        return HttpServer.json(res, 409, {
          verdict: 'REJECTED',
          reason: 'FINGERPRINT_MISMATCH',
          code: 'FINGERPRINT_MISMATCH'
        });
      }

      // ---- CHECK 4.5: Verify amount matches actual_amount_paise ----
      const orderRow = db.queryOne(
        `SELECT actual_amount_paise FROM payment_orders WHERE id = ?`,
        [order_id]
      );
      if (!orderRow) {
        return HttpServer.json(res, 404, {
          verdict: 'REJECTED',
          reason: 'ORDER_NOT_FOUND',
          code: 'ORDER_NOT_FOUND'
        });
      }
      const expectedAmount = Number(orderRow.actual_amount_paise) / 100;
      if (Number(amount) !== expectedAmount) {
        return HttpServer.json(res, 409, {
          verdict: 'REJECTED',
          reason: 'AMOUNT_MISMATCH',
          code: 'AMOUNT_MISMATCH'
        });
      }

      // ---- CHECK 5: Verify time delta (8-300 seconds) ----
      const timeInAppMs = returnedAt - appOpenedAt;
      const timeInAppSec = timeInAppMs / 1000;
      if (!Number.isFinite(Number(returnedAt)) || !Number.isFinite(Number(appOpenedAt)) ||
          Number(returnedAt) > now + 60_000 || Number(appOpenedAt) > Number(returnedAt)) {
        return HttpServer.json(res, 409, { verdict: 'REJECTED', reason: 'INVALID_RETURN_TIMESTAMPS', code: 'INVALID_RETURN_TIMESTAMPS' });
      }

      if (timeInAppSec < 8) {
        return HttpServer.json(res, 409, {
          verdict: 'REJECTED',
          reason: 'TOO_FAST_BOT',
          code: 'TOO_FAST_BOT'
        });
      }
      if (timeInAppSec > 300) {
        return HttpServer.json(res, 409, {
          verdict: 'REJECTED',
          reason: 'TOO_SLOW_TIMEOUT',
          code: 'TOO_SLOW_TIMEOUT'
        });
      }

      // ---- CHECK 6: Verify UTR format ----
      // UTR must be 10-22 alphanumeric characters with bank prefix
      const utrPattern = /^(?:[0-9]{12}|(?:SBI|HDFC|ICICI|TXN|KKBK|AXIS|UTRB|UT)[A-Z0-9]{6,18})$/i;
      if (!utr || !utrPattern.test(utr)) {
        return HttpServer.json(res, 400, {
          verdict: 'REJECTED',
          reason: 'MALFORMED_UTR',
          code: 'MALFORMED_UTR'
        });
      }

      // ---- CHECK 7: Verify UTR not reused ----
      const existingUtr = db.queryOne(
        `SELECT id FROM utr_registry WHERE utr = ? LIMIT 1`,
        [utr]
      );

      if (existingUtr) {
        return HttpServer.json(res, 409, {
          verdict: 'REJECTED',
          reason: 'UTR_ALREADY_USED',
          code: 'UTR_ALREADY_USED'
        });
      }

      // Signed checkout tokens and client-return codes prove only that the
      // attempt originated from this checkout. They do NOT prove bank credit.
      const isPaymentSuccess = String(responseCode).trim() === '00';
      const session = sessionRepo.findById(paymentId);
      if (!session) {
        return HttpServer.json(res, 404, {
          verdict: 'REJECTED', reason: 'SESSION_NOT_FOUND', code: 'SESSION_NOT_FOUND'
        });
      }
      if (String(session.orderId) !== String(order_id)) {
        return HttpServer.json(res, 409, {
          verdict: 'REJECTED', reason: 'ORDER_SESSION_MISMATCH', code: 'ORDER_SESSION_MISMATCH'
        });
      }
      if ([PaymentStatus.SUCCESS, PaymentStatus.FAILED, PaymentStatus.EXPIRED, PaymentStatus.CANCELLED].includes(session.status)) {
        return HttpServer.json(res, 409, {
          verdict: 'REJECTED', reason: 'SESSION_TERMINAL', code: 'SESSION_TERMINAL'
        });
      }

      if (!isPaymentSuccess) {
        // A failure reported by a payer app does not prove a bank debit did
        // not occur. Record the failed attempt but leave the order unchanged.
        try {
          db.transaction(() => {
            const consumed = db.execute(
              'UPDATE payment_nonces SET used = 1, used_at = ? WHERE nonce = ? AND used = 0',
              [new Date().toISOString(), nonce]
            );
            if (Number(consumed.changes) !== 1) throw new Error('NONCE_ALREADY_USED');
          });
        } catch (err) {
          return HttpServer.json(res, 409, {
            verdict: 'REJECTED', reason: 'NONCE_ALREADY_USED', code: 'NONCE_ALREADY_USED'
          });
        }
        ctx.auditRepo?.log({
          merchantId: session.merchantId, entityType: 'PAYMENT_SESSION', entityId: session.id,
          action: 'CUSTOMER_APP_RETURN_FAILED', actorType: 'CUSTOMER',
          details: { responseCode: String(responseCode), bankVerified: false }
        });
        return HttpServer.json(res, 200, {
          verdict: 'REJECTED', reason: 'PAYMENT_FAILED', code: 'PAYMENT_FAILED',
          order_id, payment_id: paymentId, status: session.status, bankVerified: false
        });
      }

      const nowIso = new Date().toISOString();
      const reportedMetadata = {
        ...(typeof session.metadata === 'object' && session.metadata !== null ? session.metadata : {}),
        reportedUtr: utr,
        reportedUtrSource: 'CUSTOMER_APP_RETURN',
        appReturnCode: '00',
        bankVerified: false
      };
      const verifyExpires = new Date(Date.now() + 30 * 60_000).toISOString();

      // Atomic nonce consumption + pending state. There is deliberately no
      // utr_registry credit, journal posting or SUCCESS webhook here.
      try {
        db.transaction(() => {
          const consumed = db.execute(
            'UPDATE payment_nonces SET used = 1, used_at = ? WHERE nonce = ? AND used = 0',
            [nowIso, nonce]
          );
          if (Number(consumed.changes) !== 1) throw new Error('NONCE_ALREADY_USED');
          const updated = db.execute(
            `UPDATE payment_sessions SET status = ?, reported_utr = ?, reported_utr_source = ?,
              verification_expires_at = ?, metadata = ?, updated_at = ?
              WHERE id = ? AND status NOT IN ('SUCCESS','FAILED','EXPIRED','CANCELLED')`,
            [PaymentStatus.VERIFICATION_PENDING, utr, 'CUSTOMER_APP_RETURN',
             verifyExpires, JSON.stringify(reportedMetadata), nowIso, paymentId]
          );
          if (Number(updated.changes) !== 1) throw new Error('SESSION_TERMINAL');
        });
      } catch (commitErr) {
        console.error('[verify-callback] pending-state commit failed:', commitErr.message);
        return HttpServer.json(res, 409, {
          verdict: 'REJECTED', reason: 'COMMIT_FAILED', code: 'COMMIT_FAILED'
        });
      }
      ctx.auditRepo?.log({
        merchantId: session.merchantId, entityType: 'PAYMENT_SESSION', entityId: session.id,
        action: 'CUSTOMER_APP_RETURN_REQUIRES_BANK_EVIDENCE', actorType: 'CUSTOMER',
        details: { bankVerified: false, source: 'UPI_APP_RETURN' }
      });
      server.broadcastSse(paymentId, 'status_change', {
        status: PaymentStatus.VERIFICATION_PENDING,
        verificationTag: 'CUSTOMER_RETURN_UNVERIFIED'
      });

      return HttpServer.json(res, 200, {
        verdict: 'VERIFICATION_PENDING',
        order_id,
        payment_id: paymentId,
        status: PaymentStatus.VERIFICATION_PENDING,
        bankVerified: false,
        message: 'Payment reported by UPI app. Awaiting independent bank/provider confirmation.',
        reported_at: nowIso
      });
    } catch (err) {
      console.error('[verify-callback] error:', err.message);
      return HttpServer.json(res, 500, {
        error: 'Internal Server Error',
        code: 'INTERNAL_ERROR'
      });
    }
  });
}
