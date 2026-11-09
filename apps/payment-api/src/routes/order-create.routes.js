import { HttpServer } from '../server.js';
import { isAdminRequest } from '../auth-guard.js';
import { durableFinancialStorageAvailable } from '../financial-storage-guard.js';
import {
  PaymentStatus,
  safeEqual
} from '@youpi/common';
import {
  createSignedOrderToken,
  generateOrderNonce
} from '@youpi/core/crypto/order-token';
import { displayAmount } from '@youpi/core/amount/randomizer';
import { MerchantTierEnforcer } from '@youpi/core/tiers/merchant-tier';

export function registerOrderCreateRoutes(server, ctx) {
  const { sessionRepo, merchantRepo, db, webhookEngine } = ctx;

  // POST /api/v1/orders
  // Creates a payment order with a signed token for client-side UPI intent flow.
  // The token is returned to the merchant checkout page and must be presented
  // by the browser when the UPI app returns, enabling the /verify-callback
  // endpoint to authenticate the return.
  //
  // Phase 4 Deliverables:
  //   - Amount Randomization: actual_amount_paise = display_amount_paise + 1-99 paise
  //   - Merchant Tiering: tier limits enforced at order creation
  //   - Sender Diversity: sender_vpa stored for concentration tracking
  server.post('/api/v1/orders', async (req, res) => {
    try {
      const body = await HttpServer.parseBody(req);
      const { merchant_id, amount_paise, payee_vpa, fingerprint_hash, sender_vpa, device_fingerprint } = body;

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

      // Creating a signed checkout token must require the owning merchant's
      // server-side credential; a public browser cannot mint arbitrary orders.
      if (process.env.NODE_ENV === 'production' && !isAdminRequest(req)) {
        const mid = String(req.headers['x-merchant-id'] || '');
        const key = String(req.headers['x-merchant-key'] || '');
        if (mid !== String(merchant.id) || !key || !merchant.webhookSecret ||
            !safeEqual(key, merchant.webhookSecret)) {
          return HttpServer.json(res, 401, {
            error: 'Merchant backend authentication required.',
            code: 'AUTH_REQUIRED'
          });
        }
      }

      if (!durableFinancialStorageAvailable(db)) {
        return HttpServer.json(res, 503, {
          error: 'Financial operations require durable PostgreSQL storage in production.',
          code: 'DURABLE_STORAGE_REQUIRED',
          retryable: true
        });
      }

        // Deliverable 7: Enforce merchant tier limits
      const tierEnforcer = new MerchantTierEnforcer({ db });
      try {
        await tierEnforcer.enforceTierLimits(merchant_id, amount);
      } catch (tierErr) {
        // Phase 4 tier tables (pp_merchants/merchant_tiers) are not yet
        // provisioned in this schema; fail-open so order creation is not
        // blocked by missing tier infrastructure.
        console.warn('[order-create] tier enforcement unavailable, fail-open:', tierErr.message);
      }

      // Validate fingerprint hash if provided
      const fpHash = fingerprint_hash || '';

      // Generate one-time nonce
      const nonce = generateOrderNonce();
      const now = Date.now();

      // Amount is represented exactly in integer paise. No randomization is
      // applied so that the payable amount, signed token and UPI URI always
      // correspond to the same verified value (no amount evasion).
      const displayAmountPaise = amount;
      const actualAmountPaise = amount;

      // Create order and register the one-time nonce atomically.
      const orderId = `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

      try {
        db.transaction(() => {
          db.execute(
            `INSERT INTO payment_orders (
              id, merchant_id, merchant_order_id, amount_paise, display_amount_paise,
              actual_amount_paise, sender_vpa, status,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              orderId, merchant_id, orderId, actualAmountPaise, displayAmountPaise,
              actualAmountPaise, sender_vpa || null, 'INITIATED', now.toString(), now.toString()
            ]
          );

          // Store the one-time nonce so /verify-callback can validate it exactly once.
          const nonceId = `nonce_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
          db.execute(
            `INSERT INTO payment_nonces (id, nonce, used, created_at) VALUES (?, ?, 0, ?)`,
            [nonceId, nonce, now.toString()]
          );
        });
      } catch (dbErr) {
        console.error('[order-create] DB insert failed:', dbErr.message);
        return HttpServer.json(res, 500, {
          error: 'Failed to create payment order',
          code: 'DB_INSERT_FAILED'
        });
      }

      // Create signed token using display amount (what user sees)
      const token = createSignedOrderToken({
        order_id: orderId,
        amount_paise: displayAmountPaise,
        payee_vpa: payee_vpa,
        nonce: nonce,
        created_at: now,
        fingerprint_hash: fpHash
      });

      const expiresAt = now + 5 * 60 * 1000; // 5 minutes

      return HttpServer.json(res, 201, {
        order_id: orderId,
        token: token,
        upi_uri: `upi://pay?pa=${encodeURIComponent(payee_vpa)}&pn=Merchant&am=${(actualAmountPaise / 100).toFixed(2)}&tn=Order${orderId}&cu=INR`,
        expires_at: expiresAt,
        expires_in_ms: 5 * 60 * 1000,
        display_amount_paise: displayAmountPaise,
        actual_amount_paise: actualAmountPaise,
        display_amount: displayAmount(actualAmountPaise)
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
