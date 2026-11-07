import { HttpServer } from '../server.js';
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

      // Mark nonce as used
      db.execute(
        `UPDATE payment_nonces SET used = 1, used_at = ? WHERE nonce = ?`,
        [new Date().toISOString(), nonce]
      );

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

      // Record UTR in registry to prevent reuse
      db.execute(
        `INSERT INTO utr_registry (utr, payment_order_id, payment_session_id, created_at) VALUES (?, ?, ?, ?)`,
        [utr, order_id, paymentId, new Date().toISOString()]
      );

      // Update payment session status to SUCCESS
      db.execute(
        `UPDATE payment_sessions SET status = 'SUCCESS', updated_at = ?, utr = ? WHERE id = ?`,
        [new Date().toISOString(), utr, paymentId]
      );

      // Record observation for audit trail
      try {
        if (obsRepo) {
          obsRepo.create({
            id: `obs_verify_${crypto.randomUUID()}`,
            receivingAccountId: sessionRepo.findById(paymentId)?.receivingAccountId || null,
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

      // Fire webhook to merchant
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
