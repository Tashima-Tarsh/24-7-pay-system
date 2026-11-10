/**
 * Payment Intent API — serves hardened UPI Intent data to the frontend checkout.
 * GET /api/v1/payment-intent/:id   or   GET /api/v1/payment-intent?id=PAYMENT_ID
 *
 * Returns upi:// (QR) and intent:// (Android app launcher) URIs for all major
 * UPI apps (GPay, PhonePe, Paytm, BHIM, generic chooser), computed server-side
 * from the validated payment session so the frontend never constructs intents.
 */
import { HttpServer } from '../server.js';
import {
  buildAndroidIntent,
  generatePaymentIntent,
  UPI_PACKAGES,
  SUPPORTED_TARGET_APPS,
  NPCI_MAX_AMOUNT_PAISE,
  validateVpa,
  formatAmount,
  sanitizeTransactionRef,
  sanitizeTransactionNote
} from '../services/upi-intent-builder.js';
import { PaymentStatus } from '@youpi/common';

/**
 * Register payment-intent routes.
 * @param {import('../server.js').HttpServer} server
 * @param {object} ctx - { db, sessionRepo, accountRepo, merchantRepo, checkoutBaseUrl, auditRepo, eventEmitter }
 */
export function registerPaymentIntentRoutes(server, ctx) {
  const { db, sessionRepo, accountRepo, merchantRepo, checkoutBaseUrl, auditRepo, eventEmitter } = ctx;

  /**
   * Resolve the merchant-facing VPA (upi_id) and display name for a session.
   * Falls back to merchant business name if receiving account display name is absent.
   */
  function resolvePayee(merchantId, receivingAccountId) {
    const account = receivingAccountId
      ? db.queryOne(
          'SELECT upi_id, display_name FROM payment_receiving_accounts WHERE id = ? AND merchant_id = ?',
          [receivingAccountId, merchantId]
        )
      : null;

    const upiId = account?.upi_id;
    const payeeName = account?.display_name
      ? String(account.display_name).trim()
      : null;

    if (!upiId) {
      throw new Error('No active receiving account (VPA) configured for this merchant');
    }

    let merchantName = null;
    if (merchantId && merchantRepo?.findById) {
      const m = merchantRepo.findById(merchantId);
      if (m?.businessName) merchantName = String(m.businessName).trim();
      else if (m?.name) merchantName = String(m.name).trim();
    }

    return {
      payeeVpa: upiId,
      payeeName: payeeName || merchantName || 'Merchant'
    };
  }

  async function handlePaymentIntent(req, res, params) {
    const id = params?.id || req.query?.id;
    if (!id) {
      return HttpServer.json(res, 400, { error: 'Payment ID required' }, req);
    }

    const session = sessionRepo.findById(id);
    if (!session) {
      return HttpServer.json(res, 404, { error: 'Payment session not found' }, req);
    }

    // Tenant isolation: only the owning merchant may fetch intent data.
    const presentedMerchantId = req.headers['x-merchant-id'] || req.query.merchant_id;
    if (presentedMerchantId && presentedMerchantId !== session.merchantId) {
      return HttpServer.json(res, 403, { error: 'Merchant ID does not match payment session' }, req);
    }

    // Terminal states cannot generate new intents.
    if ([PaymentStatus.SUCCESS, PaymentStatus.FAILED, PaymentStatus.EXPIRED, PaymentStatus.CANCELLED].includes(session.status)) {
      return HttpServer.json(res, 410, {
        error: 'Payment already processed',
        status: session.status
      }, req);
    }

    // NPCI 15-minute expiry check.
    const now = new Date();
    const createdAt = new Date(session.created_at || session.createdAt || now);
    const ageMs = now - createdAt;
    if (ageMs > 15 * 60 * 1000 && !session.reported_utr) {
      return HttpServer.json(res, 410, {
        error: 'Payment expired after 15 minutes per NPCI rules',
        status: PaymentStatus.EXPIRED
      }, req);
    }

    try {
      const { payeeVpa, payeeName } = resolvePayee(session.merchantId, session.receivingAccountId);

      const baseUrl = checkoutBaseUrl || process.env.BASE_CHECKOUT_URL || 'https://checkout.yourdomain.com';

      const intentData = generatePaymentIntent({
        payeeVpa,
        payeeName,
        amountPaise: Number(session.amountPaise),
        transactionRef: session.orderId || session.id,
        transactionNote: (session.metadata ? JSON.parse(session.metadata).transactionNote : null) || 'Payment'
      }, baseUrl);

      auditRepo?.log({
        merchantId: session.merchantId,
        entityType: 'PAYMENT_SESSION',
        entityId: session.id,
        action: 'PAYMENT_INTENT_GENERATED',
        actorType: 'MERCHANT',
        details: { targetApps: SUPPORTED_TARGET_APPS, amountPaise: session.amountPaise }
      });

      eventEmitter?.emit('PAYMENT.INTENT_GENERATED', {
        paymentId: session.id,
        merchantId: session.merchantId,
        amountPaise: session.amountPaise
      });

      return HttpServer.json(res, 200, intentData, req);
    } catch (err) {
      return HttpServer.json(res, 400, { error: err.message || 'Failed to generate payment intent' }, req);
    }
  }

  // GET /api/v1/payment-intent/:id
  server.get('/api/v1/payment-intent/:id', handlePaymentIntent);

  // GET /api/v1/payment-intent (query param alias)
  server.get('/api/v1/payment-intent', handlePaymentIntent);
}
