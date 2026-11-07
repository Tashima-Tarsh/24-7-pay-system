import { HttpServer } from '../server.js';
import {
  PaymentStatus,
  safeEqual
} from '@youpi/common';
import {
  createSignedOrderToken,
  generateOrderNonce
} from '@youpi/core/crypto/order-token';
import {
  randomizeAmount,
  displayAmount
} from '@youpi/core/amount/randomizer';
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

      // Deliverable 7: Enforce merchant tier limits
      const tierEnforcer = new MerchantTierEnforcer({ db });
      try {
        tierEnforcer.enforceTierLimits(merchant_id, amount);
      } catch (tierErr) {
        return HttpServer.json(res, 403, {
          error: tierErr.message,
          code: tierErr.code || 'TIER_LIMIT_EXCEEDED',
          tier: tierErr.tier,
          limitType: tierErr.limitType,
          limitValue: tierErr.limitValue,
          requestedAmount: tierErr.requestedAmount,
          currentVolume: tierErr.currentVolume,
          currentCount: tierErr.currentCount
        });
      }

      // Validate fingerprint hash if provided
      const fpHash = fingerprint_hash || '';

      // Generate one-time nonce
      const nonce = generateOrderNonce();
      const now = Date.now();

      // Amount Randomization: store display amount, use randomized actual amount
      const actualAmountPaise = randomizeAmount(amount);
      const displayAmountPaise = amount;

      // Create order in database with both display and actual amounts
      const orderId = `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

      try {
        db.execute(
          `INSERT INTO payment_orders (
            id, merchant_id, amount_paise, display_amount_paise, actual_amount_paise,
            payee_vpa, status, nonce, fingerprint_hash, sender_vpa, device_fingerprint,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'INITIATED', ?, ?, ?, ?, ?)`,
          [
            order_id, merchant_id, actualAmountPaise, displayAmountPaise,
            actualAmountPaise, payee_vpa, nonce, fpHash, sender_vpa || null,
            device_fingerprint || null, now.toString(), now.toString()
          ]
        );
      } catch (dbErr) {
        console.error('[order-create] DB insert failed:', dbErr.message);
        return HttpServer.json(res, 500, {
          error: 'Failed to create payment order',
          code: 'DB_INSERT_FAILED'
        });
      }

      // Create signed token using display amount (what user sees)
      const token = createSignedOrderToken({
        order_id: order_id,
        amount_paise: displayAmountPaise,
        payee_vpa: payee_vpa,
        nonce: nonce,
        created_at: now,
        fingerprint_hash: fpHash
      });

      const expiresAt = now + 5 * 60 * 1000; // 5 minutes

      return HttpServer.json(res, 201, {
        order_id: order_id,
        token: token,
        upi_uri: `upi://pay?pa=${encodeURIComponent(payee_vpa)}&pn=Merchant&am=${(actualAmountPaise / 100).toFixed(2)}&tn=Order${order_id}&cu=INR`,
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
