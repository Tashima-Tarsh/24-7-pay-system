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

      if (nonceRow.used === 1) {
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
      const utrPattern = /^(SBI|HDFC|ICICI|TXN|KKBK|AXIS|UTRB|UT)[A-Z0-9]{6,18}$/i;
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

      // ---- ALL CHECKS PASSED ----

      // ---- CHECK 8: Validate responseCode - only a successful UPI response
      // leads to a confirmed payment. Any other response code is a failed
      // payment attempt and must not be treated as bank-confirmed success.
      const isPaymentSuccess = String(responseCode).trim() === '00';

      // ---- Cross-order binding: the session identified by the URL param must
      // belong to the order embedded in the signed token. Prevents an attacker
      // from presenting a valid token for order A against a session for order B.
      const session = sessionRepo.findById(paymentId);
      if (!session) {
        return HttpServer.json(res, 404, {
          verdict: 'REJECTED',
          reason: 'SESSION_NOT_FOUND',
          code: 'SESSION_NOT_FOUND'
        });
      }
      if (String(session.orderId) !== String(order_id)) {
        return HttpServer.json(res, 409, {
          verdict: 'REJECTED',
          reason: 'ORDER_SESSION_MISMATCH',
          code: 'ORDER_SESSION_MISMATCH'
        });
      }

      if (!isPaymentSuccess) {
        // Payment attempt failed (e.g. responseCode != '00'). Consume the nonce
        // so this one-time attempt cannot be replayed, but record a FAILED
        // verdict — never SUCCESS — since only customer-return evidence exists.
        try {
          db.transaction(() => {
            db.execute(
              `UPDATE payment_nonces SET used = 1, used_at = ? WHERE nonce = ?`,
              [new Date().toISOString(), nonce]
            );
            db.execute(
              `UPDATE payment_sessions SET status = 'FAILED', updated_at = ? WHERE id = ?`,
              [new Date().toISOString(), paymentId]
            );
          });
        } catch {}
        return HttpServer.json(res, 200, {
          verdict: 'REJECTED',
          reason: 'PAYMENT_FAILED',
          code: 'PAYMENT_FAILED',
          order_id: order_id,
          payment_id: paymentId,
          response_code: responseCode,
          verified_at: new Date().toISOString()
        });
      }

      // Atomic commit: consume nonce, register UTR, mark session SUCCESS.
      // All three happen in one transaction so a failure cannot leave the
      // nonce consumed without state, or state changed without the nonce.
      try {
        db.transaction(() => {
          db.execute(
            `UPDATE payment_nonces SET used = 1, used_at = ? WHERE nonce = ?`,
            [new Date().toISOString(), nonce]
          );
          db.execute(
            `INSERT INTO utr_registry (utr, payment_order_id, payment_session_id, created_at) VALUES (?, ?, ?, ?)`,
            [utr, order_id, paymentId, new Date().toISOString()]
          );
          db.execute(
            `UPDATE payment_sessions SET status = 'SUCCESS', updated_at = ? WHERE id = ?`,
            [new Date().toISOString(), paymentId]
          );
        });
      } catch (commitErr) {
        console.error('[verify-callback] atomic commit failed:', commitErr.message);
        return HttpServer.json(res, 500, {
          verdict: 'REJECTED',
          reason: 'COMMIT_FAILED',
          code: 'COMMIT_FAILED'
        });
      }

      // Record observation for audit trail (best-effort, does not affect verdict)
      try {
        if (obsRepo) {
          obsRepo.create({
            id: `obs_verify_${crypto.randomUUID()}`,
            receivingAccountId: session.receivingAccountId || null,
            source: 'INTENT_RETURN',
            amount_paise: amount_paise,
            observedAt: new Date(),
            bankReferenceNumber: utr,
            fingerprintHash: crypto.createHash('sha256').update(`${paymentId}:${utr}`).digest('hex'),
            rawPayload: { utr, responseCode, amount, fingerprint, returnedAt, appOpenedAt, order_id },
            attributionStatus: 'ATTRIBUTED',
            attributedPaymentId: paymentId
          });
        }
      } catch (obsErr) {
        console.error('[verify-callback] observation record warning:', obsErr.message);
      }

      // Fire webhook to merchant only after the durable state commit.
      try {
        if (webhookEngine) {
          const updated = sessionRepo.findById(paymentId);
          webhookEngine.dispatch('PAYMENT.SUCCESS', updated).catch(() => {});
        }
      } catch (whErr) {
        console.error('[verify-callback] webhook dispatch warning:', whErr.message);
      }

      return HttpServer.json(res, 200, {
        verdict: 'SUCCESS',
        order_id: order_id,
        payment_id: paymentId,
        utr: utr,
        status: 'SUCCESS',
        verified_at: new Date().toISOString()
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
