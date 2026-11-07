import { HttpServer } from '../server.js';
import {
  PaymentStatus,
  safeEqual
} from '@youpi/common';
import {
  createSignedOrderToken,
  generateOrderNonce
} from '@youpi/core/crypto/order-token';

export function registerOrderCreateRoutes(server, ctx) {
  const { sessionRepo, merchantRepo, db, webhookEngine } = ctx;

  // POST /api/v1/orders
  // Creates a payment order with a signed token for client-side UPI intent flow.
  // The token is returned to the merchant checkout page and must be presented
  // by the browser when the UPI app returns, enabling the /verify-callback
  // endpoint to authenticate the return.
  server.post('/api/v1/orders', async (req, res) => {
    try {
      const body = await HttpServer.parseBody(req);
      const { merchant_id, amount_paise, payee_vpa, fingerprint_hash } = body;

      // Validate required fields
      if (!merchant_id || !amount_paise || !payee_vpa) {
        return HttpServer.json(res, 400, {
          error: 'Missing required fields: merchant_id, amount_paise, payee_vpa',
          code: 'MISSING_REQUIRED_FIELDS'
        });
      }

      // Validate amount is positive
      const amount = Number(amount_paise);
      if (!Number.isInteger(amount) || amount <= 0) {
        return HttpServer.json(res, 400, {
          error: 'amount_paise must be a positive integer',
          code: 'INVALID_AMOUNT'
        });
      }

      // Authenticate merchant
      const merchant = merchantRepo.findById(merchant_id);
      if (!merchant) {
        return HttpServer.json(res, 401, {
          error: 'Invalid merchant_id',
          code: 'INVALID_MERCHANT'
        });
      }

      // Validate fingerprint hash if provided
      const fpHash = fingerprint_hash || '';

      // Generate one-time nonce
      const nonce = generateOrderNonce();
      const now = Date.now();

      // Create order in database
      const orderId = `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

      try {
        db.execute(
          `INSERT INTO payment_orders (
            id, merchant_id, amount_paise, payee_vpa, status,
            nonce, fingerprint_hash, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'INITIATED', ?, ?, ?, ?)`,
          [order_id, merchant_id, amount, payee_vpa, nonce, fpHash, now.toString(), now.toString()]
        );
      } catch (dbErr) {
        console.error('[order-create] DB insert failed:', dbErr.message);
        return HttpServer.json(res, 500, {
          error: 'Failed to create payment order',
          code: 'DB_INSERT_FAILED'
        });
      }

      // Create signed token
      const token = createSignedOrderToken({
        order_id: order_id,
        amount_paise: amount,
        payee_vpa: payee_vpa,
        nonce: nonce,
        created_at: now,
        fingerprint_hash: fpHash
      });

      const expiresAt = now + 5 * 60 * 1000; // 5 minutes

      return HttpServer.json(res, 201, {
        order_id: order_id,
        token: token,
        upi_uri: `upi://pay?pa=${encodeURIComponent(payee_vpa)}&pn=Merchant&am=${(amount / 100).toFixed(2)}&tn=Order${order_id}&cu=INR`,
        expires_at: expiresAt,
        expires_in_ms: 5 * 60 * 1000
      });
    } catch (err) {
      console.error('[order-create] error:', err.message);
      return HttpServer.json(res, 500, {
        error: 'Internal Server Error',
        code: 'INTERNAL_ERROR'
      });
    }
  });
}
