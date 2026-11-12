import { HttpServer } from '../server.js';
import {
  toPaise,
  toRupeesString,
  buildUpiPaymentUri,
  buildUpiIntentUri,
  toP2pIntentUri,
  PaymentStatus,
  PaymentMethod,
  generateHmac,
  safeEqual,
  isValidVpa,
  isRetiredReceivingVpa,
  ObserverSource,
  PaymentEvidenceLevel,
  generateQrDataUri
} from '@youpi/common';
import {
  isValidTransition,
  assertValidTransition,
  buildUpiUri,
  buildPackageIntents
} from '@youpi/core';
import { isAdminRequest } from '../auth-guard.js';
import crypto from 'node:crypto';

/**
 * Registers the Universal UPI Intent Return API.
 *
 * Endpoints:
 *   POST   /api/v1/payments/intents          - Create a payment intent (payment id, order id, attempt id, UPI URI, checkout session, expiry, correlation id)
 *   POST   /api/v1/payments/:id/client-return - Client-reported return from a UPI app (buyer-reported, not bank-verified)
 *   GET    /api/v1/payments/:id/status        - Payment status
 *   GET    /api/v1/payments/:id/events        - Payment event timeline
 *   GET    /api/v1/upi/compatibility          - UPI generic intent capability info
 *   POST   /api/v1/merchant/webhooks/test     - Merchant webhook test
 *
 * Design invariants (per mission):
 *   - Client-return reports are recorded as buyer-reported payment information, NOT bank-confirmed settlement.
 *   - A client-return report must not directly create a bank-verified settlement record.
 *   - Authentication + ownership of the payment attempt is enforced on client-return.
 *   - Idempotency key enforced on client-return submissions.
 *   - Events are persisted immediately and a status update is published.
 *   - Legacy routes are preserved; additive only.
 */
export function registerUpiIntentRoutes(server, ctx) {
  const {
    merchantRepo,
    sessionRepo,
    obsRepo,
    callbackOutboxRepo,
    callbackDeliveryAttemptRepo,
    auditRepo,
    eventEmitter,
    webhookEngine,
    defaultMerchant,
    attributionEngine
  } = ctx;

  const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || '';

  // Resolve owning merchant for a session; enforce merchant ownership via x-merchant-id + x-merchant-key
  // or admin/internal bearer token.
  function resolveMerchantAndAuth(req) {
    const merchantId = req.headers['x-merchant-id'];
    if (!merchantId) return null;
    const merchant = merchantRepo.findById(merchantId);
    if (!merchant) return null;
    const presented = req.headers['x-merchant-key'];
    if (!presented || typeof presented !== 'string' || !presented.trim()) return null;
    if (!merchant.webhookSecret) return null;
    if (!safeEqual(presented.trim(), merchant.webhookSecret)) return null;
    return merchant;
  }

  function isInternalRequest(req) {
    const token = req.headers['authorization'] || req.headers['x-internal-token'] || '';
    const bare = token.toLowerCase().startsWith('bearer ') ? token.slice(7).trim() : token.trim();
    return INTERNAL_SERVICE_TOKEN && safeEqual(bare, INTERNAL_SERVICE_TOKEN);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function generateId(prefix) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  // Resolve the receiving payee for a new UPI intent.
  //
  // The merchant's active receiving account is the single authoritative payee for
  // a new order. A caller-supplied merchantVpa is honored only when it is a live,
  // syntactically valid VPA; a retired VPA can never be activated by a request.
  // Merchant-only UPI fields (mc/tid/mode/orgid/sign) are taken from the payment
  // profile only when that profile belongs to the exact payee VPA and the account
  // is merchant-enabled, so a personal VPA always gets the P2P-safe payload.
  function resolveReceivingPayee(merchant, requestedVpa) {
    const requested = typeof requestedVpa === 'string' ? requestedVpa.trim() : '';
    if (requested && isRetiredReceivingVpa(requested)) {
      return {
        error: {
          status: 400,
          body: { error: 'The supplied receiving VPA is retired and cannot be used.', code: 'RETIRED_RECEIVING_VPA' }
        }
      };
    }
    if (requested && !isValidVpa(requested)) {
      return {
        error: { status: 400, body: { error: 'No valid merchant receiving VPA configured.', code: 'NO_RECEIVING_VPA' } }
      };
    }

    let account = null;
    try {
      account = ctx.accountRepo?.findActiveForMerchant ? ctx.accountRepo.findActiveForMerchant(merchant.id) : null;
    } catch {}
    if (account && isRetiredReceivingVpa(account.upiId)) account = null;

    const upiId = requested || account?.upiId || null;
    if (!upiId || !isValidVpa(upiId)) {
      return {
        error: { status: 400, body: { error: 'No valid merchant receiving VPA configured.', code: 'NO_RECEIVING_VPA' } }
      };
    }

    const matchesAccount = Boolean(account && String(account.upiId || '').trim().toLowerCase() === upiId.toLowerCase());
    const payeeName = matchesAccount && account.payeeName
      ? account.payeeName
      : (merchant.businessName || merchant.name || 'Merchant');
    const isMerchantEnabled = matchesAccount ? account.isMerchantEnabled !== false : true;

    let matchedProfile = null;
    try {
      const candidate = ctx.ppMerchantPaymentProfileRepo?.findActiveByMerchantId(merchant.id) || null;
      if (candidate && String(candidate.payeeVpa || '').trim().toLowerCase() === upiId.toLowerCase()) {
        matchedProfile = candidate;
      }
    } catch {}

    return {
      upiId,
      accountId: matchesAccount ? account.id : null,
      payeeName,
      isMerchantEnabled,
      profile: isMerchantEnabled ? matchedProfile : null,
      snapshot: {
        id: matchesAccount ? account.id : null,
        upiId,
        payeeName,
        isMerchantEnabled
      }
    };
  }

  // Activate a newly created UPI session so the stable /checkout/<id> URL is
  // payable immediately (instant QR). A session for a VPA that is not one of the
  // merchant's own receiving accounts has no slot to queue against, so it is
  // activated directly.
  function activateNewSession(session, receivingAccountId) {
    if (receivingAccountId && ctx.queueEngine?.enqueueOrActivate) {
      const queueResult = ctx.queueEngine.enqueueOrActivate(session.id, receivingAccountId);
      if (queueResult.expiresAt) ctx.timingEngine?.startActiveTimer?.(session.id, queueResult.expiresAt);
      server.broadcastSse?.('admin_counter_events', 'status_change', {
        status: queueResult.status,
        sessionId: session.id,
        orderId: session.orderId,
        amountPaise: session.amountPaise ? session.amountPaise.toString() : '0'
      });
      return sessionRepo.findById(session.id) || session;
    }

    const activeUntil = new Date(Date.now() + 300000);
    ctx.db.execute(
      'UPDATE payment_sessions SET status = ?, expires_at = ?, updated_at = ? WHERE id = ?',
      [PaymentStatus.ACTIVE, activeUntil.toISOString(), new Date().toISOString(), session.id]
    );
    ctx.timingEngine?.startActiveTimer?.(session.id, activeUntil);
    return sessionRepo.findById(session.id) || session;
  }

  // One UPI transaction reference per session. It is persisted on the session so
  // the intent, the QR payload and the hosted checkout rebuild all carry the same
  // `tr` value for the same order.
  function allocateUpiReference(merchant, orderId) {
    const sanitized = orderId ? String(orderId).replace(/[^A-Za-z0-9]/g, '').slice(0, 35) : '';
    let reference = sanitized || generateId('upi').replace(/[^A-Za-z0-9]/g, '').slice(0, 35);
    let attempt = 0;
    while (sessionRepo.findByOrderId && sessionRepo.findByOrderId(merchant.id, reference)) {
      attempt++;
      reference = `${(sanitized || 'UPI').slice(0, 31)}${String(attempt).padStart(3, '0')}`.slice(0, 35);
      if (attempt > 100) throw new Error('Unable to generate unique UPI reference.');
    }
    return reference;
  }

  // Persist a payment event and publish a status update via SSE + event emitter.
  async function persistAndPublishEvent(paymentId, event) {
    const { id, type, source, status, amountPaise, currency, reference, reportedStatus, evidenceLevel,
      observedAt, processedAt, correlationId, rawPayload, appIdentity, platform, merchantId } = event;

    // Insert into callback_outbox as a durable event record so it survives restarts.
    // merchant_id is NOT NULL in the schema; always pass the owning merchant's id.
    const evtMerchantId = merchantId || null;
    try {
      if (callbackOutboxRepo) {
        callbackOutboxRepo.create({
          id: id || generateId('evt'),
          merchantId: evtMerchantId,
          paymentId,
          eventType: type,
          payload: JSON.stringify({ ...(rawPayload || {}), source, status, reportedStatus, evidenceLevel, reference, appIdentity, platform }),
          endpointUrl: '',
          idempotencyKey: id || generateId('idem'),
          status: 'PENDING',
          attempts: 0,
          maxAttempts: 5,
          nextRetryAt: nowIso()
        });
      }
    } catch (err) {
      console.error('[upi-intent] event persist warning:', err.message);
    }

    // Publish SSE status update to clients listening on this payment.
    try {
      if (typeof eventEmitter === 'object' && eventEmitter) {
        eventEmitter.emit('PAYMENT.EVENT', { paymentId, event });
        eventEmitter.emit(`PAYMENT.EVENT.${paymentId}`, { paymentId, event });
      }
    } catch (err) {
      console.error('[upi-intent] publish warning:', err.message);
    }

    // Broadcast SSE to any open checkout/console stream for this payment.
    try {
      if (typeof ctx.server?.broadcastSse === 'function') {
        ctx.server.broadcastSse(`payment_session_${paymentId}`, 'status_change', {
          paymentId,
          status: status || reportedStatus,
          source,
          evidenceLevel,
          reportedStatus,
          reference,
          observedAt: observedAt || nowIso(),
          processedAt: processedAt || nowIso(),
          correlationId
        });
        ctx.server.broadcastSse(`console_${event.merchantId || ''}`, 'activity', {
          paymentId,
          status: status || reportedStatus,
          source
        });
      }
    } catch (err) {
      console.error('[upi-intent] sse broadcast warning:', err.message);
    }
  }

  // POST /api/v1/payments/intents
  server.post('/api/v1/payments/intents', async (req, res) => {
    try {
      const body = await HttpServer.parseBody(req);
      const idempotencyKey = req.headers['idempotency-key'] || body.idempotencyKey || generateId('idem');

      const merchantId = req.headers['x-merchant-id'] || body.merchantId;
      let merchant;
      if (merchantId) {
        merchant = merchantRepo.findById(merchantId);
      } else {
        merchant = merchantRepo.getDefault ? merchantRepo.getDefault() : (merchantRepo.findAll && merchantRepo.findAll()[0]) || defaultMerchant;
      }

      if (!merchant) {
        return HttpServer.json(res, 400, { error: 'Merchant not found or not configured.' });
      }

      // Authenticate the merchant backend.
      const presentedKey = req.headers['x-merchant-key'];
      if (!presentedKey || !merchant.webhookSecret || !safeEqual(String(presentedKey), merchant.webhookSecret)) {
        if (!isAdminRequest(req) && !isInternalRequest(req)) {
          return HttpServer.json(res, 401, { error: 'Merchant authentication required.', code: 'AUTH_REQUIRED' });
        }
      }

      const { amount, currency = 'INR', orderId, customerId, customer, returnUrl, merchantVpa, metadata = {}, expiryMinutes } = body;

      if (!amount) {
        return HttpServer.json(res, 400, { error: 'Missing required field: amount.' });
      }

      let amountPaise;
      try {
        amountPaise = toPaise(amount);
      } catch (err) {
        return HttpServer.json(res, 400, { error: err.message });
      }
      if (amountPaise <= 0n || amountPaise > 9007199254740991n) {
        return HttpServer.json(res, 400, { error: 'amount must be a positive integer in paise.' });
      }

      // Server-controlled amount and currency (INR). The client must not override amount.
      const finalCurrency = 'INR';
      const finalAmountPaise = amountPaise;

      // Resolve the authoritative receiving payee and receiving account for
      // correlation with bank observations. The receiving account is needed so
      // Gmail/SMS/Android bank observations can be matched to this payment
      // (UTR + receiving account + amount). Never amount-only matching.
      const payee = resolveReceivingPayee(merchant, merchantVpa);
      if (payee.error) {
        return HttpServer.json(res, payee.error.status, payee.error.body);
      }
      const receivingVpa = payee.upiId;
      const receivingAccountId = payee.accountId;
      const receivingAccountSnapshot = payee.snapshot;
      const upiMode = payee.isMerchantEnabled ? 'MERCHANT' : 'NON_MERCHANT';

      // Idempotency: if a payment with this idempotency key already exists, return it.
      if (idempotencyKey) {
        try {
          const existing = ctx.sessionRepo.findByIdempotencyKey ? ctx.sessionRepo.findByIdempotencyKey(idempotencyKey) : null;
          if (existing) {
            const existingMeta = existing.metadata || {};
            return HttpServer.json(res, 200, {
              paymentId: existing.id,
              orderId: existing.orderId,
              attemptId: existingMeta.attemptId || null,
              correlationId: existingMeta.correlationId || null,
              amount: toRupeesString(existing.amountPaise),
              amountPaise: existing.amountPaise.toString(),
              currency: existing.currency,
              status: existing.status,
              receivingVpa: existingMeta.receivingVpa || null,
              payeeVpa: existingMeta.payeeVpa || null,
              payeeName: existingMeta.payeeName || null,
              upiReference: existingMeta.upiReference || null,
              upiMode: existingMeta.upiMode || null,
              isMerchantEnabled: existingMeta.isMerchantEnabled !== false,
              upiUri: existingMeta.upiUri || null,
              upiIntent: existingMeta.upiIntent || null,
              upiQr: existingMeta.upiQr || null,
              copyVpa: existingMeta.copyVpa || null,
              signed: existingMeta.signed || false,
              checkoutUrl: `${(ctx.checkoutBaseUrl || process.env.BASE_CHECKOUT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:7000')}/checkout/${existing.id}`,
              expiresAt: existing.expiresAt ? existing.expiresAt.toISOString() : null,
              createdAt: existing.createdAt ? existing.createdAt.toISOString() : null
            });
          }
        } catch {}
      }

      // Generate identifiers: payment id, merchant order id, attempt id, correlation id.
      const paymentId = generateId('pay');
      const generatedOrderId = orderId || `ORD_${crypto.randomUUID().toString().replace(/-/g, '').slice(0, 14)}`;
      const attemptId = generateId('attempt');
      const correlationId = generateId('corr');

      // Auto-activate by default so the stable checkout URL is payable immediately
      // (instant QR). Pass autoActivate:false to defer slot acquisition until the
      // customer is authenticated.
      const shouldActivateNow = body.autoActivate !== false && body.autoActivate !== 'false';

      // Compute expiry for deferred (INITIATED) sessions.
      const expiryMs = expiryMinutes ? Number(expiryMinutes) * 60 * 1000 : 30 * 60 * 1000; // default 30 min
      const expiresAt = new Date(Date.now() + expiryMs);

      // Build the UPI payment URI from the authoritative payee resolved above.
      // The same reference is stored on the session so the QR, app intents and
      // checkout page always agree.
      const upiReference = allocateUpiReference(merchant, generatedOrderId);
      const payeeVpa = payee.upiId;
      const payeeName = payee.payeeName;
      const note = `24/7 Pay ${upiReference}`;

      const checkoutUrl = `${(ctx.checkoutBaseUrl || process.env.BASE_CHECKOUT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:7000')}/checkout/${paymentId}`;

      const built = buildUpiUri(
        {
          payeeVpa,
          payeeName,
          // Only declare a merchant category when the matched profile really has one.
          mcc: payee.profile ? payee.profile.mcc : undefined,
          orgid: payee.profile ? payee.profile.orgid : undefined,
          intentSignKeyPem: payee.profile ? payee.profile.intentSignKeyPem : undefined
        },
        finalAmountPaise,
        upiReference,
        note,
        checkoutUrl
      );
      const upiUri = built.uri;

      const upiIntent = buildPackageIntents(upiUri, checkoutUrl);
      const upiQr = upiUri ? generateQrDataUri(upiUri) : null;
      const copyVpa = payeeVpa;

      const sessionMetadata = {
        ...metadata,
        attemptId,
        correlationId,
        upiUri,
        upiReference,
        upiIntent,
        upiQr,
        copyVpa,
        receivingVpa,
        payeeVpa,
        payeeName,
        upiMode,
        isMerchantEnabled: payee.isMerchantEnabled,
        receivingAccountSnapshot,
        merchantId: merchant.id,
        sourcePlatform: 'UPI_INTENT',
        createdVia: 'intents_api',
        signed: built.signed
      };

      let session;
      try {
        session = sessionRepo.create({
          id: paymentId,
          merchantId: merchant.id,
          customerId: customerId || null,
          receivingAccountId, // resolved above; enables bank observation correlation
          orderId: generatedOrderId,
          amountPaise: finalAmountPaise,
          baseAmountPaise: finalAmountPaise,
          currency: finalCurrency,
          method: PaymentMethod.UPI,
          status: shouldActivateNow ? PaymentStatus.QUEUED : PaymentStatus.INITIATED,
          returnUrl: returnUrl || null,
          idempotencyKey,
          deviceId: null,
          metadata: sessionMetadata
        });
      } catch (createErr) {
        // Handle duplicate (merchant_id, order_id) UNIQUE constraint idempotently.
        if (createErr.code === 'ERR_SQLITE_ERROR' && createErr.message.includes('UNIQUE constraint failed: payment_sessions.merchant_id, payment_sessions.order_id')) {
          const existing = sessionRepo.findByOrderId(merchant.id, generatedOrderId);
          if (existing) {
            session = existing;
          } else {
            console.error('[upi-intent] create error:', createErr);
            return HttpServer.json(res, 500, { error: 'Internal Server Error', detail: createErr.message });
          }
        } else {
          console.error('[upi-intent] create error:', createErr);
          return HttpServer.json(res, 500, { error: 'Internal Server Error', detail: createErr.message });
        }
      }

      if (shouldActivateNow && session.status === PaymentStatus.QUEUED) {
        session = activateNewSession(session, receivingAccountId);
      }

      // Persist creation event.
      try {
        persistAndPublishEvent(paymentId, {
          id: generateId('evt'),
          type: 'payment.created',
          source: 'SERVER',
          status: PaymentStatus.INITIATED,
          amountPaise: finalAmountPaise,
          currency: finalCurrency,
          reference: upiReference,
          reportedStatus: PaymentStatus.INITIATED,
          evidenceLevel: PaymentEvidenceLevel.REPORTED,
          observedAt: nowIso(),
          processedAt: nowIso(),
          correlationId,
          rawPayload: { orderId: generatedOrderId, upiReference, attemptId, upiUri, receivingVpa, upiMode },
          merchantId: merchant.id
        });
      } catch (err) {
        console.error('[upi-intent] creation event publish warning:', err.message);
      }

      // Emit payment.created webhook event via the webhook engine if available.
      try {
        if (webhookEngine && typeof webhookEngine.dispatch === 'function') {
          webhookEngine.dispatch('payment.created', session).catch(() => {});
        }
      } catch {}

      return HttpServer.json(res, 201, {
        paymentId: session.id,
        orderId: session.orderId,
        attemptId,
        correlationId,
        amount: toRupeesString(session.amountPaise),
        amountPaise: session.amountPaise.toString(),
        currency: session.currency,
        status: session.status,
        merchantId: session.merchantId,
        receivingVpa,
        payeeVpa,
        payeeName,
        upiReference,
        upiMode,
        isMerchantEnabled: payee.isMerchantEnabled,
        upiUri,
        upiIntent,
        upiQr,
        copyVpa,
        signed: built.signed,
        checkoutUrl: `${(ctx.checkoutBaseUrl || process.env.BASE_CHECKOUT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:7000')}/checkout/${session.id}`,
        expiresAt: session.expiresAt ? session.expiresAt.toISOString() : expiresAt.toISOString(),
        createdAt: session.createdAt ? session.createdAt.toISOString() : nowIso(),
        idempotencyKey
      });
    } catch (err) {
      console.error('[upi-intent] create error:', err);
      return HttpServer.json(res, 500, { error: 'Internal Server Error', detail: err.message });
    }
  });

  // POST /api/v1/create-payment-intent
  // Stripe-node compatible response: returns both intent_android (for Android Chrome)
  // and deep_link_universal (for iOS/desktop/native apps).
  server.post('/api/v1/create-payment-intent', async (req, res) => {
    try {
      const body = await HttpServer.parseBody(req);
      const idempotencyKey = req.headers['idempotency-key'] || body.idempotencyKey || generateId('idem');

      const merchantId = req.headers['x-merchant-id'] || body.merchantId;
      let merchant;
      if (merchantId) {
        merchant = merchantRepo.findById(merchantId);
      } else {
        merchant = merchantRepo.getDefault ? merchantRepo.getDefault() : (merchantRepo.findAll && merchantRepo.findAll()[0]) || defaultMerchant;
      }

      if (!merchant) {
        return HttpServer.json(res, 400, { error: 'Merchant not found or not configured.' });
      }

      const presentedKey = req.headers['x-merchant-key'];
      if (!presentedKey || !merchant.webhookSecret || !safeEqual(String(presentedKey), merchant.webhookSecret)) {
        if (!isAdminRequest(req) && !isInternalRequest(req)) {
          return HttpServer.json(res, 401, { error: 'Merchant authentication required.', code: 'AUTH_REQUIRED' });
        }
      }

      const { amount, currency = 'INR', orderId, customerId, customer, returnUrl, merchantVpa, metadata = {} } = body;

      if (!amount) {
        return HttpServer.json(res, 400, { error: 'Missing required field: amount.' });
      }

      let amountPaise;
      try {
        amountPaise = toPaise(amount);
      } catch (err) {
        return HttpServer.json(res, 400, { error: err.message });
      }
      if (amountPaise <= 0n || amountPaise > 9007199254740991n) {
        return HttpServer.json(res, 400, { error: 'amount must be a positive integer in paise.' });
      }

      const finalCurrency = 'INR';
      const finalAmountPaise = amountPaise;

      // Resolve the authoritative receiving payee and receiving account for bank
      // observation correlation. A retired VPA is never accepted from a request.
      const payee = resolveReceivingPayee(merchant, merchantVpa);
      if (payee.error) {
        return HttpServer.json(res, payee.error.status, payee.error.body);
      }
      const receivingVpa = payee.upiId;
      const receivingAccountId = payee.accountId;
      const receivingAccountSnapshot = payee.snapshot;
      const upiMode = payee.isMerchantEnabled ? 'MERCHANT' : 'NON_MERCHANT';

      // Idempotency: if a payment with this idempotency key already exists, return it.
      if (idempotencyKey) {
        try {
          const existing = ctx.sessionRepo.findByIdempotencyKey ? ctx.sessionRepo.findByIdempotencyKey(idempotencyKey) : null;
          if (existing) {
            const existingMeta = existing.metadata || {};
            const existingUri = existingMeta.upiUri || null;
            return HttpServer.json(res, 200, {
              success: true,
              order_id: existing.orderId,
              amount: toRupeesString(existing.amountPaise),
              payee_vpa: existingMeta.payeeVpa || receivingVpa,
              intent_android: existingMeta.intentAndroid || null,
              deep_link_universal: existingUri || null,
              payment_id: existing.id,
              upi_reference: existingMeta.upiReference || null,
              upi_mode: existingMeta.upiMode || null,
              is_merchant_enabled: existingMeta.isMerchantEnabled !== false
            });
          }
        } catch {}
      }

      // Generate identifiers.
      const paymentId = generateId('pay');

      // Generate a unique UPI transaction reference (alphanumeric, max 35 chars).
      // This is the value emitted as tr/tid in UPI URIs. It must be unique per
      // payment so that ORD-123 and ORD123 do not collide after sanitization.
      const sanitizedOrderId = orderId ? String(orderId).replace(/[^A-Za-z0-9]/g, '').slice(0, 35) : null;
      let upiReference = sanitizedOrderId || generateId('upi').slice(0, 35);
      // Ensure uniqueness across sanitized collisions (e.g. ORD-123 vs ORD123).
      let retryCounter = 0;
      while (sessionRepo.findByOrderId && sessionRepo.findByOrderId(merchant.id, upiReference)) {
        retryCounter++;
        const suffix = String(retryCounter).slice(-3);
        upiReference = (sanitizedOrderId ? sanitizedOrderId.slice(0, 32) : generateId('upi').slice(0, 32)) + suffix;
        if (upiReference.length > 35) upiReference = upiReference.slice(0, 35);
        if (retryCounter > 100) throw new Error('Unable to generate unique UPI reference.');
      }

      const payeeVpa = payee.upiId;
      const payeeName = payee.payeeName;

      // Auto-activate by default so the returned checkout URL is payable now.
      const shouldActivateNow = body.autoActivate !== false && body.autoActivate !== 'false';

      const checkoutUrl = returnUrl || `${(ctx.checkoutBaseUrl || process.env.BASE_CHECKOUT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:7000')}/checkout/${paymentId}`;

      // Build the deep_link_universal (upi://) — works on iOS, desktop, native apps.
      const built = buildUpiUri(
        {
          payeeVpa,
          payeeName,
          mcc: payee.profile ? payee.profile.mcc : undefined,
          orgid: payee.profile ? payee.profile.orgid : undefined,
          intentSignKeyPem: payee.profile ? payee.profile.intentSignKeyPem : undefined
        },
        finalAmountPaise,
        upiReference,
        `24/7 Pay ${upiReference}`,
        checkoutUrl
      );
      const deepLinkUniversal = built.signed ? built.uri : toP2pIntentUri(built.uri);

      // Build the intent_android (intent://) — forces Android OS to handle return URL.
      const intentAndroid = buildUpiIntentUri({
        payeeVpa,
        payeeName,
        amountPaise: finalAmountPaise,
        transactionRef: upiReference,
        transactionNote: `24/7 Pay ${upiReference}`,
        targetApp: 'generic', // Let Android OS show the chooser
        checkoutUrl,
        merchantCategoryCode: payee.profile ? payee.profile.mcc : undefined
      });

      const sessionMetadata = {
        ...metadata,
        paymentId,
        orderId: upiReference,
        upiReference,
        merchantOrderId: orderId || null,
        payeeVpa,
        payeeName,
        upiMode,
        isMerchantEnabled: payee.isMerchantEnabled,
        receivingAccountSnapshot,
        upiUri: deepLinkUniversal,
        intentAndroid,
        deepLinkUniversal,
        receivingVpa,
        merchantId: merchant.id,
        sourcePlatform: 'CREATE_PAYMENT_INTENT',
        createdVia: 'create_payment_intent_api',
        signed: built.signed
      };

      let session;
      try {
        session = sessionRepo.create({
          id: paymentId,
          merchantId: merchant.id,
          customerId: customerId || null,
          receivingAccountId,
          orderId: upiReference,
          amountPaise: finalAmountPaise,
          baseAmountPaise: finalAmountPaise,
          currency: finalCurrency,
          method: PaymentMethod.UPI,
          status: shouldActivateNow ? PaymentStatus.QUEUED : PaymentStatus.INITIATED,
          returnUrl: returnUrl || null,
          idempotencyKey,
          deviceId: null,
          metadata: sessionMetadata
        });
      } catch (createErr) {
        if (createErr.code === 'ERR_SQLITE_ERROR' && createErr.message.includes('UNIQUE constraint failed: payment_sessions.merchant_id, payment_sessions.order_id')) {
          const existing = sessionRepo.findByOrderId(merchant.id, upiReference);
          if (existing) {
            session = existing;
          } else {
            console.error('[create-payment-intent] create error:', createErr);
            return HttpServer.json(res, 500, { error: 'Internal Server Error', detail: createErr.message });
          }
        } else {
          console.error('[create-payment-intent] create error:', createErr);
          return HttpServer.json(res, 500, { error: 'Internal Server Error', detail: createErr.message });
        }
      }

      if (shouldActivateNow && session.status === PaymentStatus.QUEUED) {
        session = activateNewSession(session, receivingAccountId);
      }

      // Persist creation event.
      try {
        persistAndPublishEvent(paymentId, {
          id: generateId('evt'),
          type: 'payment.created',
          source: 'SERVER',
          status: PaymentStatus.INITIATED,
          amountPaise: finalAmountPaise,
          currency: finalCurrency,
          reference: upiReference,
          reportedStatus: PaymentStatus.INITIATED,
          evidenceLevel: PaymentEvidenceLevel.REPORTED,
          observedAt: nowIso(),
          processedAt: nowIso(),
          correlationId: generateId('corr'),
          rawPayload: { orderId: upiReference, paymentId, upiUri: deepLinkUniversal, receivingVpa, upiMode },
          merchantId: merchant.id
        });
      } catch (err) {
        console.error('[create-payment-intent] creation event publish warning:', err.message);
      }

      try {
        if (webhookEngine && typeof webhookEngine.dispatch === 'function') {
          webhookEngine.dispatch('payment.created', session).catch(() => {});
        }
      } catch {}

      const expiryMs = 30 * 60 * 1000;
      const expiresAt = new Date(Date.now() + expiryMs);

      return HttpServer.json(res, 201, {
        success: true,
        order_id: session.orderId,
        amount: toRupeesString(session.amountPaise),
        payee_vpa: payeeVpa,
        payee_name: payeeName,
        upi_reference: upiReference,
        upi_mode: upiMode,
        is_merchant_enabled: payee.isMerchantEnabled,
        intent_android: intentAndroid,
        deep_link_universal: deepLinkUniversal,
        payment_id: session.id,
        currency: session.currency,
        status: session.status,
        merchant_id: session.merchantId,
        checkout_url: `${(ctx.checkoutBaseUrl || process.env.BASE_CHECKOUT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:7000')}/checkout/${session.id}`,
        expires_at: session.expiresAt ? session.expiresAt.toISOString() : expiresAt.toISOString(),
        idempotency_key: idempotencyKey
      });
    } catch (err) {
      console.error('[create-payment-intent] error:', err);
      return HttpServer.json(res, 500, { error: 'Internal Server Error', detail: err.message });
    }
  });

  // GET /api/v1/payments/:id/verify
  // Razorpay-style payment verification triplet: payment_id, order_id, signature.
  // Signature = HMAC-SHA256(secret, payment_id + "." + order_id + "." + amount).
  server.get('/api/v1/payments/:id/verify', async (req, res, params) => {
    const paymentId = params.id;
    try {
      const session = sessionRepo.findById(paymentId);
      if (!session) {
        return HttpServer.json(res, 404, { error: 'Payment not found.' });
      }

      // Ownership check.
      const merchant = resolveMerchantAndAuth(req);
      if (merchant && session.merchantId !== merchant.id) {
        return HttpServer.json(res, 403, { error: 'Ownership mismatch.', code: 'OWNERSHIP_MISMATCH' });
      }

      const merchantForSigning = merchant || defaultMerchant;
      const signingSecret = merchantForSigning?.webhookSecret || '';

      // Verification triplet: payment_id, order_id, amount.
      const signedContent = `${paymentId}.${session.orderId}.${toRupeesString(session.amountPaise)}`;
      const signature = generateHmac(signedContent, signingSecret);

      return HttpServer.json(res, 200, {
        payment_id: session.id,
        order_id: session.orderId,
        amount: toRupeesString(session.amountPaise),
        amount_paise: session.amountPaise.toString(),
        currency: session.currency,
        status: session.status,
        signature,
        verified_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('[payment-verify] error:', err);
      return HttpServer.json(res, 500, { error: 'Internal Server Error', detail: err.message });
    }
  });

  // POST /api/v1/payments/:id/client-return
  server.post('/api/v1/payments/:id/client-return', async (req, res, params) => {
    const paymentId = params.id;
    try {
      const body = await HttpServer.parseBody(req);

      // Idempotency key required.
      const idempotencyKey = req.headers['idempotency-key'] || body.idempotencyKey;
      if (!idempotencyKey) {
        return HttpServer.json(res, 400, { error: 'idempotency-key is required.', code: 'IDEMPOTENCY_REQUIRED' });
      }

      // Idempotency: reject duplicate client-return for the same attempt+key.
      try {
        const existingByKey = callbackOutboxRepo?.findByIdempotencyKey ? callbackOutboxRepo.findByIdempotencyKey(idempotencyKey) : null;
        if (existingByKey && existingByKey.paymentId === paymentId) {
          return HttpServer.json(res, 200, {
            paymentId,
            status: 'already_reported',
            message: 'Client return already recorded for this idempotency key.',
            eventId: existingByKey.id
          });
        }
      } catch {}

      const session = sessionRepo.findById(paymentId);
      if (!session) {
        return HttpServer.json(res, 404, { error: 'Payment not found.' });
      }

      // Authenticate and enforce ownership of the payment attempt.
      const merchant = resolveMerchantAndAuth(req);
      if (!merchant) {
        // Also allow internal/bearer token for trusted callers.
        if (!isAdminRequest(req) && !isInternalRequest(req)) {
          return HttpServer.json(res, 401, { error: 'Authentication required.', code: 'AUTH_REQUIRED' });
        }
      }
      if (merchant && session.merchantId !== merchant.id) {
        return HttpServer.json(res, 403, { error: 'Payment does not belong to this merchant.', code: 'OWNERSHIP_MISMATCH' });
      }

      const {
        sourcePlatform,
        appIdentity,
        rawResult,
        parsedStatus,
        upiTransactionReference,
        eventTimestamp,
        attemptId: bodyAttemptId,
        metadata = {}
      } = body;

      // Validate attempt ownership if provided.
      const sessionAttemptId = (session.metadata && session.metadata.attemptId) || null;
      if (bodyAttemptId && sessionAttemptId && bodyAttemptId !== sessionAttemptId) {
        return HttpServer.json(res, 400, { error: 'Attempt ID does not match the payment attempt.', code: 'ATTEMPT_MISMATCH' });
      }

      // Normalize reported status.
      let reportedStatus = (parsedStatus || '').toUpperCase() || 'UNKNOWN';
      const validStatuses = ['SUCCESS', 'FAILED', 'PENDING', 'CANCELLED', 'UNKNOWN'];
      if (!validStatuses.includes(reportedStatus)) {
        reportedStatus = 'UNKNOWN';
      }

      // Determine internal status transition from client report (client-reported, not bank-confirmed).
      let internalStatus = session.status;
      let evidenceLevel = PaymentEvidenceLevel.REPORTED;

      if (reportedStatus === 'SUCCESS') {
        internalStatus = PaymentStatus.VERIFICATION_PENDING;
      } else if (reportedStatus === 'FAILED') {
        internalStatus = PaymentStatus.FAILED;
      } else if (reportedStatus === 'CANCELLED') {
        internalStatus = PaymentStatus.CANCELLED;
      } else if (reportedStatus === 'PENDING') {
        internalStatus = PaymentStatus.VERIFICATION_PENDING;
      } else {
        internalStatus = PaymentStatus.INTENT_OPENED;
      }

      // Enforce state machine transition. Track whether the transition is valid so we
      // never persist an invalid state via direct SQL.
      let transitionValid = true;
      try {
        assertValidTransition(session.status, internalStatus);
      } catch (err) {
        // Transition not allowed: record the event but do not change session status.
        transitionValid = false;
        console.warn('[upi-intent] transition blocked:', err.message);
      }

      const observedAt = eventTimestamp ? new Date(eventTimestamp) : new Date();
      const processedAt = new Date();

      // Persist the client-return event immediately (durable).
      const eventId = generateId('evt');
      try {
        if (callbackOutboxRepo) {
          callbackOutboxRepo.create({
            id: eventId,
            merchantId: session.merchantId,
            paymentId,
            eventType: 'payment.client_returned',
            payload: JSON.stringify({
              sourcePlatform,
              appIdentity,
              rawResult,
              parsedStatus: reportedStatus,
              upiTransactionReference,
              eventTimestamp: observedAt.toISOString(),
              attemptId: sessionAttemptId,
              correlationId: (session.metadata && session.metadata.correlationId) || null,
              metadata,
              evidenceLevel: PaymentEvidenceLevel.REPORTED,
              source: ObserverSource.INTENT_RETURN
            }),
            endpointUrl: '',
            idempotencyKey,
            status: 'PENDING',
            attempts: 0,
            maxAttempts: 5,
            nextRetryAt: nowIso()
          });
        }
      } catch (err) {
        console.error('[upi-intent] client-return persist warning:', err.message);
      }

      // Also record as a payment observation (supplementary evidence, client-reported).
      try {
        if (obsRepo) {
          obsRepo.create({
            id: generateId('obs'),
            receivingAccountId: session.receivingAccountId || null,
            source: ObserverSource.INTENT_RETURN,
            amountPaise: Number(session.amountPaise),
            observedAt,
            senderVpa: metadata.senderVpa || null,
            bankReferenceNumber: upiTransactionReference || null,
            fingerprintHash: crypto.createHash('sha256').update(`${paymentId}:${idempotencyKey}:${observedAt.getTime()}`).digest('hex'),
            rawPayload: { sourcePlatform, appIdentity, rawResult, parsedStatus: reportedStatus, upiTransactionReference, metadata },
            attributionStatus: 'UNATTRIBUTED',
            attributedPaymentId: paymentId
          });
        }
      } catch (err) {
        console.error('[upi-intent] observation persist warning:', err.message);
      }

      // Transition session status only if the state machine allows it.
      if (transitionValid && internalStatus !== session.status) {
        try {
          if (internalStatus === PaymentStatus.FAILED || internalStatus === PaymentStatus.CANCELLED || internalStatus === PaymentStatus.EXPIRED) {
            sessionRepo.transitionToTerminal(paymentId, internalStatus, { reason: `client_return_${reportedStatus.toLowerCase()}` });
          } else if (internalStatus === PaymentStatus.VERIFICATION_PENDING) {
            sessionRepo.transitionToVerificationPending(paymentId);
          } else {
            // For CLIENT_REPORTED_SUCCESS and INTENT_OPENED, transition through the repository.
            sessionRepo.db.execute(
              'UPDATE payment_sessions SET status = ?, verification_tag = ?, updated_at = ? WHERE id = ?',
              [internalStatus, `Client-reported ${reportedStatus}`, nowIso(), paymentId]
            );
          }
        } catch (err) {
          console.error('[upi-intent] status transition warning:', err.message);
        }
      }

      // Publish status update (immediate, not waiting for observer cycle).
      try {
        persistAndPublishEvent(paymentId, {
          id: eventId,
          type: 'payment.client_returned',
          source: ObserverSource.INTENT_RETURN,
          status: internalStatus,
          amountPaise: session.amountPaise,
          currency: session.currency,
          reference: upiTransactionReference || session.orderId,
          reportedStatus,
          evidenceLevel: PaymentEvidenceLevel.REPORTED,
          observedAt: observedAt.toISOString(),
          processedAt: processedAt.toISOString(),
          correlationId: (session.metadata && session.metadata.correlationId) || null,
          rawPayload: { sourcePlatform, appIdentity, rawResult, parsedStatus: reportedStatus, upiTransactionReference, metadata },
          appIdentity,
          platform: sourcePlatform,
          merchantId: session.merchantId
        });
      } catch (err) {
        console.error('[upi-intent] client-return publish warning:', err.message);
      }

      // Triple-signal correlation: correlate the client-reported intent return with any
      // existing bank observation (Gmail/SMS/Android) to reach MULTI_SIGNAL_MATCHED.
      // PAID_VERIFIED still requires an authoritative bank/provider verification event.
      try {
        if (attributionEngine && typeof attributionEngine.processIntentReturnSignal === 'function') {
          attributionEngine.processIntentReturnSignal({
            paymentId,
            attemptId: sessionAttemptId,
            correlationId: (session.metadata && session.metadata.correlationId) || null,
            upiTransactionReference,
            amountPaise: Number(session.amountPaise),
            sourcePlatform,
            appIdentity,
            rawResult,
            eventTimestamp: observedAt,
            metadata: { senderVpa: metadata.senderVpa || null, ...metadata }
          });
        }
      } catch (err) {
        console.error('[upi-intent] attribution correlation warning:', err.message);
      }

      // Dispatch client-returned webhook (immediate client-return event, separate from verified).
      try {
        if (webhookEngine && typeof webhookEngine.dispatch === 'function') {
          const updated = sessionRepo.findById(paymentId);
          webhookEngine.dispatch('payment.client_returned', updated || session).catch(() => {});
        }
      } catch {}

      return HttpServer.json(res, 200, {
        paymentId,
        orderId: session.orderId,
        attemptId: sessionAttemptId,
        correlationId: (session.metadata && session.metadata.correlationId) || null,
        status: internalStatus,
        reportedStatus,
        evidenceLevel: PaymentEvidenceLevel.REPORTED,
        message: 'Client return recorded as buyer-reported payment information. Not bank-verified.',
        eventId,
        observedAt: observedAt.toISOString(),
        processedAt: processedAt.toISOString(),
        upiTransactionReference: upiTransactionReference || null,
        appIdentity: appIdentity || null,
        sourcePlatform: sourcePlatform || null
      });
    } catch (err) {
      console.error('[upi-intent] client-return error:', err);
      return HttpServer.json(res, 500, { error: 'Internal Server Error', detail: err.message });
    }
  });

  // GET /api/v1/payments/:id/status
  server.get('/api/v1/payments/:id/status', async (req, res, params) => {
    const paymentId = params.id;
    try {
      const session = sessionRepo.findById(paymentId);
      if (!session) {
        return HttpServer.json(res, 404, { error: 'Payment not found.' });
      }

      // Ownership check for internal fields.
      const merchant = resolveMerchantAndAuth(req);
      const isOwner = merchant ? session.merchantId === merchant.id : false;
      const isAdmin = isAdminRequest(req);

      const publicView = {
        paymentId: session.id,
        orderId: session.orderId,
        amount: toRupeesString(session.amountPaise),
        amountPaise: session.amountPaise.toString(),
        currency: session.currency,
        status: session.status,
        method: session.method,
        createdAt: session.createdAt ? session.createdAt.toISOString() : null,
        updatedAt: session.updatedAt ? session.updatedAt.toISOString() : null
      };

      if (isOwner || isAdmin) {
        return HttpServer.json(res, 200, {
          ...publicView,
          internalStatus: session.status,
          attemptId: (session.metadata && session.metadata.attemptId) || null,
          correlationId: (session.metadata && session.metadata.correlationId) || null,
          receivingVpa: (session.metadata && session.metadata.receivingVpa) || null,
          verificationLevel: session.verificationLevel || 0,
          verificationSources: session.verificationSources || [],
          verificationTag: session.verificationTag || 'UNVERIFIED',
          merchantId: session.merchantId,
          metadata: session.metadata
        });
      }

      return HttpServer.json(res, 200, publicView);
    } catch (err) {
      console.error('[upi-intent] status error:', err);
      return HttpServer.json(res, 500, { error: 'Internal Server Error', detail: err.message });
    }
  });

  // GET /api/v1/payments/:id/events
  server.get('/api/v1/payments/:id/events', async (req, res, params) => {
    const paymentId = params.id;
    try {
      const session = sessionRepo.findById(paymentId);
      if (!session) {
        return HttpServer.json(res, 404, { error: 'Payment not found.' });
      }

      const merchant = resolveMerchantAndAuth(req);
      if (merchant && session.merchantId !== merchant.id) {
        return HttpServer.json(res, 403, { error: 'Ownership mismatch.', code: 'OWNERSHIP_MISMATCH' });
      }

      // Gather events from callback_outbox for this payment.
      let events = [];
      try {
        const all = callbackOutboxRepo?.findByMerchant ? callbackOutboxRepo.findByMerchant(session.merchantId, null, 500) : [];
        events = all
          .filter(e => e.paymentId === paymentId)
          .map(e => {
            let payload = {};
            try { payload = JSON.parse(e.payload || '{}'); } catch {}
            return {
              eventId: e.id,
              eventType: e.eventType,
              status: e.status,
              createdAt: e.createdAt ? e.createdAt.toISOString() : null,
              deliveredAt: e.deliveredAt ? e.deliveredAt.toISOString() : null,
              attempts: e.attempts,
              payload
            };
          });
      } catch {}

      return HttpServer.json(res, 200, {
        paymentId,
        orderId: session.orderId,
        status: session.status,
        events,
        eventCount: events.length
      });
    } catch (err) {
      console.error('[upi-intent] events error:', err);
      return HttpServer.json(res, 500, { error: 'Internal Server Error', detail: err.message });
    }
  });

  // GET /api/v1/payments/:id/investigation
  // Real-time payment investigation screen for Super Admin / Merchant dashboards.
  // Shows order/payment IDs, amount, receiving account, buyer app, Android return result,
  // Gmail observation, SMS observation, bank verification, correlation status, callback
  // attempts, full event timeline, event arrival latency, source health, duplicate detection
  // and reconciliation exceptions.
  server.get('/api/v1/payments/:id/investigation', async (req, res, params) => {
    const paymentId = params.id;
    try {
      const session = sessionRepo.findById(paymentId);
      if (!session) {
        return HttpServer.json(res, 404, { error: 'Payment not found.' });
      }

      const merchant = resolveMerchantAndAuth(req);
      const isAdmin = isAdminRequest(req);
      if (merchant && session.merchantId !== merchant.id && !isAdmin) {
        return HttpServer.json(res, 403, { error: 'Ownership mismatch.', code: 'OWNERSHIP_MISMATCH' });
      }

      // Gather callback_outbox events for this payment (full timeline).
      let events = [];
      try {
        const all = callbackOutboxRepo?.findByMerchant ? callbackOutboxRepo.findByMerchant(session.merchantId, null, 1000) : [];
        events = all
          .filter(e => e.paymentId === paymentId)
          .map(e => {
            let payload = {};
            try { payload = JSON.parse(e.payload || '{}'); } catch {}
            return {
              eventId: e.id,
              eventType: e.eventType,
              status: e.status,
              createdAt: e.createdAt ? e.createdAt.toISOString() : null,
              deliveredAt: e.deliveredAt ? e.deliveredAt.toISOString() : null,
              attempts: e.attempts,
              maxAttempts: e.maxAttempts,
              lastError: e.lastError,
              source: payload.source || null,
              evidenceLevel: payload.evidenceLevel || null,
              reportedStatus: payload.reportedStatus || null,
              rawPayload: payload
            };
          })
          .sort((a, b) => {
            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return ta - tb;
          });
      } catch {}

      // Event arrival latency: gap between observation timestamp and server processing.
      const timeline = events.map(e => {
        const obs = e.rawPayload?.observedAt || e.createdAt;
        const proc = e.createdAt;
        let latencyMs = null;
        if (obs && proc) latencyMs = new Date(proc).getTime() - new Date(obs).getTime();
        return { ...e, arrivalLatencyMs: latencyMs };
      });

      // Source health: which signals have been received for this payment.
      const sourceHealth = {
        [ObserverSource.INTENT_RETURN]: timeline.some(e => e.source === ObserverSource.INTENT_RETURN),
        [ObserverSource.GMAIL]: timeline.some(e => e.source === ObserverSource.GMAIL),
        [ObserverSource.GOOGLE_MESSAGES]: timeline.some(e => e.source === ObserverSource.GOOGLE_MESSAGES),
        [ObserverSource.ANDROID_OBSERVER]: timeline.some(e => e.source === ObserverSource.ANDROID_OBSERVER),
        [ObserverSource.SMS_GATEWAY]: timeline.some(e => e.source === ObserverSource.SMS_GATEWAY)
      };

      // Duplicate detection: repeated eventIds or identical fingerprints within a short window.
      const seenIds = new Set();
      const duplicates = [];
      for (const e of timeline) {
        if (seenIds.has(e.eventId)) duplicates.push(e.eventId);
        seenIds.add(e.eventId);
      }

      // Reconciliation exceptions: payment not yet verified despite bank observation, or signals conflict.
      const hasBankObservation = sourceHealth[ObserverSource.GMAIL] || sourceHealth[ObserverSource.GOOGLE_MESSAGES] || sourceHealth[ObserverSource.ANDROID_OBSERVER] || sourceHealth[ObserverSource.SMS_GATEWAY];
      const isVerified = session.status === PaymentStatus.PAID_VERIFIED || session.status === PaymentStatus.SUCCESS;
      let reconciliationException = null;
      if (hasBankObservation && !isVerified && session.status !== PaymentStatus.FAILED && session.status !== PaymentStatus.EXPIRED) {
        reconciliationException = {
          type: 'BANK_OBSERVATION_WITHOUT_VERIFICATION',
          message: 'A bank/credit observation was received but the payment has not reached PAID_VERIFIED. Authoritative provider verification is required.',
          severity: 'HIGH'
        };
      } else if (session.status === PaymentStatus.RECONCILIATION_REQUIRED) {
        reconciliationException = {
          type: 'SIGNAL_CONFLICT',
          message: 'Signals could not be fully matched. Manual reconciliation required.',
          severity: 'MEDIUM'
        };
      }

      // Buyer app when known (from intent return appIdentity / sourcePlatform).
      const buyerApp = timeline.find(e => e.source === ObserverSource.INTENT_RETURN && e.rawPayload?.appIdentity);
      const androidReturnResult = timeline.find(e => e.source === ObserverSource.INTENT_RETURN);

      // Gmail / SMS observations summary.
      const gmailObs = timeline.find(e => e.source === ObserverSource.GMAIL);
      const smsObs = timeline.find(e => e.source === ObserverSource.SMS_GATEWAY) || timeline.find(e => e.source === ObserverSource.ANDROID_OBSERVER);

      // Callback attempts summary.
      const callbackAttempts = timeline.filter(e => e.eventType === 'payment.verified' || e.eventType === 'payment.client_returned' || e.eventType === 'payment.failed').length;

      return HttpServer.json(res, 200, {
        paymentId,
        orderId: session.orderId,
        attemptId: (session.metadata && session.metadata.attemptId) || null,
        correlationId: (session.metadata && session.metadata.correlationId) || null,
        amount: toRupeesString(session.amountPaise),
        amountPaise: session.amountPaise,
        currency: session.currency,
        receivingAccount: (session.metadata && session.metadata.receivingVpa) || null,
        status: session.status,
        verificationLevel: session.verificationLevel || 0,
        verificationTag: session.verificationTag || 'UNVERIFIED',
        verificationSources: session.verificationSources || [],
        buyerApp: buyerApp ? buyerApp.rawPayload?.appIdentity : null,
        androidReturnResult: androidReturnResult ? {
          parsedStatus: androidReturnResult.rawPayload?.parsedStatus,
          upiTransactionReference: androidReturnResult.rawPayload?.upiTransactionReference,
          reportedStatus: androidReturnResult.reportedStatus,
          eventTimestamp: androidReturnResult.rawPayload?.eventTimestamp,
          appIdentity: androidReturnResult.rawPayload?.appIdentity,
          sourcePlatform: androidReturnResult.source
        } : null,
        gmailObservation: gmailObs ? {
          observedAt: gmailObs.createdAt,
          evidenceLevel: gmailObs.evidenceLevel,
          payload: gmailObs.rawPayload
        } : null,
        smsObservation: smsObs ? {
          observedAt: smsObs.createdAt,
          evidenceLevel: smsObs.evidenceLevel,
          source: smsObs.source
        } : null,
        bankVerification: isVerified ? {
          verified: true,
          verificationLevel: session.verificationLevel || 0,
          verificationTag: session.verificationTag,
          sources: session.verificationSources || []
        } : null,
        correlationStatus: session.status === PaymentStatus.MULTI_SIGNAL_MATCHED ? 'MULTI_SIGNAL_MATCHED' :
          (isVerified ? 'VERIFIED' : (hasBankObservation ? 'PARTIAL' : 'UNCORRELATED')),
        callbackAttempts,
        timeline,
        sourceHealth,
        duplicates,
        duplicateCount: duplicates.length,
        reconciliationException,
        merchantId: session.merchantId,
        createdAt: session.createdAt ? session.createdAt.toISOString() : null,
        updatedAt: session.updatedAt ? session.updatedAt.toISOString() : null
      });
    } catch (err) {
      console.error('[upi-intent] investigation error:', err);
      return HttpServer.json(res, 500, { error: 'Internal Server Error', detail: err.message });
    }
  });

  // GET /api/v1/upi/compatibility
  server.get('/api/v1/upi/compatibility', async (req, res) => {
    try {
      return HttpServer.json(res, 200, {
        scheme: 'upi://pay',
        genericIntentSupported: true,
        description: 'Generic UPI intent capability discovery is the default launch mechanism. App-specific adapters are used only where officially documented and justified.',
        supportedSources: [
          ObserverSource.INTENT_RETURN,
          ObserverSource.GMAIL,
          ObserverSource.GOOGLE_MESSAGES,
          ObserverSource.ANDROID_OBSERVER,
          ObserverSource.SMS_GATEWAY
        ],
        evidenceLevels: [
          PaymentEvidenceLevel.REPORTED,
          PaymentEvidenceLevel.OBSERVED,
          PaymentEvidenceLevel.MATCHED,
          PaymentEvidenceLevel.VERIFIED
        ],
        states: [
          PaymentStatus.CREATED,
          PaymentStatus.INTENT_OPENED,
          PaymentStatus.CLIENT_REPORTED_SUCCESS,
          PaymentStatus.CREDIT_OBSERVED,
          PaymentStatus.MULTI_SIGNAL_MATCHED,
          PaymentStatus.VERIFICATION_PENDING,
          PaymentStatus.PAID_VERIFIED,
          PaymentStatus.FAILED,
          PaymentStatus.EXPIRED,
          PaymentStatus.RECONCILIATION_REQUIRED
        ],
        notes: [
          'Client-return reports are buyer-reported, not bank-confirmed.',
          'An authoritative bank/provider event is required for PAID_VERIFIED.',
          'Amount-only matching is never used as proof of payment.'
        ],
        sdk: {
          package: 'packages/android-upi-intent-sdk',
          language: 'Kotlin',
          minSdk: 21,
          targetSdk: 34
        }
      });
    } catch (err) {
      return HttpServer.json(res, 500, { error: 'Internal Server Error', detail: err.message });
    }
  });

  // POST /api/v1/merchant/webhooks/test
  server.post('/api/v1/merchant/webhooks/test', async (req, res) => {
    try {
      const body = await HttpServer.parseBody(req);
      const merchantId = req.headers['x-merchant-id'] || body.merchantId;
      const merchant = merchantId ? merchantRepo.findById(merchantId) : null;
      if (!merchant) {
        return HttpServer.json(res, 400, { error: 'Merchant not found.' });
      }
      const presentedKey = req.headers['x-merchant-key'];
      if (!presentedKey || !merchant.webhookSecret || !safeEqual(String(presentedKey), merchant.webhookSecret)) {
        if (!isAdminRequest(req) && !isInternalRequest(req)) {
          return HttpServer.json(res, 401, { error: 'Merchant authentication required.', code: 'AUTH_REQUIRED' });
        }
      }

      const { callbackUrl, eventType = 'payment.created', secret } = body;
      const targetUrl = callbackUrl || merchant.webhookUrl;
      const signingSecret = secret || merchant.webhookSecret || '';

      if (!targetUrl) {
        return HttpServer.json(res, 400, { error: 'No callback URL configured for merchant.', code: 'NO_CALLBACK_URL' });
      }

      const testPayload = {
        event: eventType,
        paymentId: `test_${crypto.randomUUID().toString().slice(0, 8)}`,
        orderId: `TEST_ORD_${Date.now()}`,
        amount: '0.00',
        currency: 'INR',
        status: 'TEST',
        timestamp: nowIso(),
        test: true
      };
      const payloadString = JSON.stringify(testPayload);
      const signature = generateHmac(payloadString, signingSecret);

      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Gateway-Event': eventType,
            'X-Gateway-Signature': 'sha256=' + signature,
            'X-Gateway-Delivery-Id': testPayload.paymentId,
            'X-Gateway-Timestamp': String(Date.now())
          },
          body: payloadString,
          signal: AbortSignal.timeout(10000)
        });
        return HttpServer.json(res, 200, {
          sent: true,
          status: response.status,
          url: targetUrl,
          eventType,
          signature
        });
      } catch (err) {
        return HttpServer.json(res, 200, {
          sent: false,
          error: err.message,
          url: targetUrl,
          eventType
        });
      }
    } catch (err) {
      console.error('[upi-intent] webhook test error:', err);
      return HttpServer.json(res, 500, { error: 'Internal Server Error', detail: err.message });
    }
  });
}
