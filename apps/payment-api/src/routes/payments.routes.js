import rateLimit from 'express-rate-limit';
import {enforcePaymentControls} from '../payment-controls.js';
import { HttpServer, resolveClientIp } from '../server.js';
import { toPaise, toRupeesString, resolveRuntimeUrls, PaymentStatus, safeEqual, maskPhone, maskEmail, generateCustomerId, isValidVpa } from '@youpi/common';
import { isTerminalStatus, toPublicOutcome, PaiseOffsetAllocator } from '@youpi/core';
import { isAdminRequest } from '../auth-guard.js';

const DEFAULT_MERCHANT_ID = '00000000-0000-0000-0000-000000000001';

// Per-IP key for limiter runs through the trusted resolver: a client-supplied X-Forwarded-For
// must not be able to mint a fresh rate-limit bucket per request.
const clientIp = (req) => resolveClientIp(req) || '127.0.0.1';

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 payment creations per window
  message: { error: 'Too many payment sessions created, please try again later.' },
  keyGenerator: (req) => clientIp(req)
});

async function enforcePaymentLimiter(req, res) {
  let nextCalled = false;
  const adaptedReq = { ip: clientIp(req) };
  const adaptedRes = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { res.setHeader(name, value); return this; },
    append(name, value) { res.setHeader(name, value); return this; },
    get headersSent() { return res.headersSent; },
    get writableEnded() { return res.writableEnded; },
    send(body) {
      const str = typeof body === 'object' ? JSON.stringify(body) : String(body);
      res.writeHead(this.statusCode || 200, { 'Content-Type': typeof body === 'object' ? 'application/json' : 'text/plain' });
      res.end(str);
    }
  };
  await paymentLimiter(adaptedReq, adaptedRes, () => { nextCalled = true; });
  return nextCalled;
}

function testReceivingVpa(merchantId) {
  const vpa = String(process.env.DYNAMO_TEST_RECEIVING_VPA || '').trim().toLowerCase();
  return merchantId === DEFAULT_MERCHANT_ID && isValidVpa(vpa) ? vpa : null;
}

/**
 * True when the caller may read the merchant-private fields of a payment session.
 *
 * Requires proof of ownership: either the gateway's own admin/observer credential, or the
 * owning merchant's webhook secret presented via `X-Merchant-Key` (which every merchant
 * integration already holds). Without it, only the public view is returned, so a leaked or
 * guessed payment id cannot be used to read internal status, verification internals,
 * merchant metadata or the return URL.
 */
function isPaymentOwner(req, session, ctx) {
  if (isAdminRequest(req)) return true;

  const presented = req.headers['x-merchant-key'];
  if (!presented || typeof presented !== 'string' || !presented.trim()) return false;

  const merchant = ctx.merchantRepo?.findById ? ctx.merchantRepo.findById(session.merchantId) : null;
  if (!merchant?.webhookSecret) return false;
  return safeEqual(presented.trim(), merchant.webhookSecret);
}

/**
 * Registers merchant-facing payment routes.
 * @param {HttpServer} server
 * @param {{
 *   merchantRepo: import('@youpi/db').MerchantRepository,
 *   accountRepo: import('@youpi/db').ReceivingAccountRepository,
 *   sessionRepo: import('@youpi/db').PaymentSessionRepository,
 *   queueEngine: import('@youpi/core').QueueEngine,
 *   timingEngine: import('@youpi/core').TimingEngine,
 *   auditRepo: import('@youpi/db').AuditLogRepository,
 *   checkoutBaseUrl: string
 * }} ctx
 */
export function registerPaymentRoutes(server, ctx) {
  function resolveCheckoutBaseUrl(merchant) {
    if (process.env.NODE_ENV === 'production') {
      // The public origin has already been validated by payment-api/src/index.js.
      // A stale merchant branding setting must never override it with localhost.
      const candidates = [ctx.checkoutBaseUrl, process.env.BASE_CHECKOUT_URL,
        process.env.PUBLIC_CHECKOUT_URL, process.env.RENDER_EXTERNAL_URL, process.env.DYNAMO_PUBLIC_URL];
      const selected = candidates.find(value => {
        try {
          const url = new URL(value);
          return url.protocol === 'https:' && !url.username && !url.password &&
            !/^(localhost|127\.0\.0\.1)$/i.test(url.hostname);
        } catch { return false; }
      });
      if (!selected) throw new Error('Hosted checkout requires a public HTTPS origin');
      return new URL(selected).origin;
    }
    if (process.env.DYNAMO_PUBLIC_URL) return process.env.DYNAMO_PUBLIC_URL.replace(/\/+$/, '');
    if (process.env.DYNAMO_UNIFIED_GATEWAY === 'true') return '';
    if (merchant?.branding) {
      try {
        const urls = resolveRuntimeUrls(merchant.branding);
        if (urls && urls.checkoutUrl) return urls.checkoutUrl;
      } catch {}
    }
    return ctx.checkoutBaseUrl || process.env.BASE_CHECKOUT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:7000';
  }

  // POST /api/v1/payments
  server.post('/api/v1/payments', async (req, res) => {
    if (!(await enforcePaymentLimiter(req, res))) return;
    try {
      const body = await HttpServer.parseBody(req);
      if (body.usePaiseOffset) return HttpServer.json(res,503,{
        code:'PAISE_OFFSET_UNAVAILABLE',
        error:'Paise-offset checkout is unavailable until durable multi-instance allocation is supported. Use the standard queued checkout.'
      });
      const idempotencyKey = req.headers['idempotency-key'] || body.idempotencyKey;

      // Resolve merchant (default to first/demo merchant if none passed in header)
      const merchantId = req.headers['x-merchant-id'] || body.merchantId;
      let merchant;
      if (merchantId) {
        merchant = ctx.merchantRepo.findById(merchantId);
      } else {
        merchant = ctx.merchantRepo.getDefault ? ctx.merchantRepo.getDefault() : (ctx.merchantRepo.findById('00000000-0000-0000-0000-000000000001') || ctx.merchantRepo.findAll()[0]);
      }

      if (!merchant) {
        HttpServer.json(res, 400, { error: 'Merchant not found or not configured.' });
        return;
      }

      // Legacy merchants already have an approved receiving VPA and contact email but
      // predate the payer-visible payment-profile table.  Backfill that profile once
      // from merchant-owned data so an otherwise active merchant is not blocked solely
      // by this newer configuration record.  An explicitly inactive profile is never
      // reactivated here; that remains an administrator action.
      let activeProfile = ctx.ppMerchantPaymentProfileRepo?.findActiveByMerchantId(merchant.id);
      if (!activeProfile && !ctx.ppMerchantPaymentProfileRepo?.findByMerchantId(merchant.id)) {
        const receivingAccount = ctx.accountRepo?.findActiveForMerchant?.(merchant.id);
        const payeeEmail = String(merchant.contactEmail || '').trim();
        if (receivingAccount?.upiId && receivingAccount?.payeeName && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payeeEmail)) {
          activeProfile = ctx.ppMerchantPaymentProfileRepo.upsert(merchant.id, {
            payeeVpa: receivingAccount.upiId,
            payeeName: receivingAccount.payeeName,
            payeeEmail,
            mcc: '5411',
            orgid: null,
            intentSignKeyPem: null,
            supportPhone: merchant.contactPhone || null,
            isActive: true
          });
          ctx.auditRepo?.log({
            merchantId: merchant.id,
            entityType: 'PP_MERCHANT_PAYMENT_PROFILE',
            entityId: merchant.id,
            action: 'PAYMENT_PROFILE_BACKFILLED_FROM_ACTIVE_RECEIVING_ACCOUNT',
            actorType: 'SYSTEM',
            details: { payeeVpa: receivingAccount.upiId }
          });
        }
      }
      if (!activeProfile) {
        HttpServer.json(res, 503, { error: 'Merchant payment profile is incomplete. Configure an owned active receiving UPI account and a valid merchant contact email, then activate the profile in the admin console.', code: 'PAYMENT_PROFILE_INCOMPLETE' });
        return;
      }

      if (!body.orderId || !body.amount) {
        HttpServer.json(res, 400, { error: 'Missing required fields: orderId and amount.' });
        return;
      }

      const originalExternal=ctx.sessionRepo.findByOrderId(merchant.id,body.orderId)?.metadata?.externalCollection;
      const useExternalDefault=(!body.method||String(body.method).toUpperCase()==='UPI')&&ctx.externalCollections?.getDefault(merchant.id);
      if(ctx.externalCollections&&(originalExternal||useExternalDefault)){
        if(!isAdminRequest(req)&&!(req.headers['x-merchant-key']&&merchant.webhookSecret&&safeEqual(String(req.headers['x-merchant-key']),merchant.webhookSecret)))return HttpServer.json(res,401,{error:'Merchant authentication required.'});
        return ctx.externalCollections.createFromLegacy(req,res,body,merchant.id);
      }

      const deviceId = body.deviceId || req.headers['x-device-id'] || null;
      if (deviceId && ctx.deviceRepo) {
        let dev = ctx.deviceRepo.findById(deviceId);
        if (!dev) {
          try {
            ctx.deviceRepo.create({
              id: deviceId,
              publicKey: `adhoc_${deviceId}`,
              fingerprintHash: `fp_${deviceId}`
            });
          } catch {}
        }
      }

      // Check idempotency & active session state
      const existing = ctx.sessionRepo.findByOrderId(merchant.id, body.orderId);
      if (existing) {
        // If SUCCESS: order is already paid, return existing completed session
        if (existing.status === PaymentStatus.SUCCESS) {
          HttpServer.json(res, 200, {
            paymentId: existing.id,
            orderId: existing.orderId,
            amount: toRupeesString(existing.amountPaise),
            amountPaise: existing.amountPaise.toString(),
            currency: existing.currency,
            status: existing.status,
          checkoutUrl: `${resolveCheckoutBaseUrl(merchant)}/checkout/${existing.id}`
        });
        return;
      }

      // Check if existing session is stale
      const now = Date.now();
      const isStale = (existing.status === PaymentStatus.ACTIVE && existing.expiresAt && existing.expiresAt.getTime() <= now) ||
        (existing.status === PaymentStatus.PROCESSING && existing.processingExpiresAt && existing.processingExpiresAt.getTime() <= now);
      if (isStale) {
        if(existing.status === PaymentStatus.PROCESSING) ctx.timingEngine.handleProcessingTimerExpiration(existing.id);
        else ctx.sessionRepo.transitionToTerminal(existing.id, PaymentStatus.EXPIRED);
        if (existing.receivingAccountId) {
          ctx.queueEngine.promoteNext(existing.receivingAccountId);
        }
        existing.status = existing.status === PaymentStatus.PROCESSING ? PaymentStatus.VERIFICATION_PENDING : PaymentStatus.EXPIRED;
      }

      // If existing is non-terminal (ACTIVE, PROCESSING, QUEUED, INITIATED):
      if ([PaymentStatus.ACTIVE, PaymentStatus.PROCESSING, PaymentStatus.QUEUED, PaymentStatus.INITIATED, PaymentStatus.VERIFICATION_PENDING].includes(existing.status)) {
        // CASE 3: Active session + Different device -> DUPLICATE_SESSION_DETECTED
        if (deviceId && existing.deviceId && deviceId !== existing.deviceId) {
          HttpServer.json(res, 409, {
            error: 'DUPLICATE_SESSION_DETECTED',
            code: 'DEVICE_SESSION_MISMATCH',
            session_id: existing.id,
            activeSession: {
              paymentId: existing.id,
              orderId: existing.orderId,
              amount: toRupeesString(existing.amountPaise)
            },
            action: 'END_SESSION_AND_CREATE_NEW',
            message: 'This payment session was created on another device. For security reasons, this session cannot be continued from this device.'
          });
          return;
        }

        // CASE 2: Active session + Same device -> CONTINUE ACTIVE SESSION
        HttpServer.json(res, 200, {
          paymentId: existing.id,
          orderId: existing.orderId,
          amount: toRupeesString(existing.amountPaise),
          amountPaise: existing.amountPaise.toString(),
          currency: existing.currency,
          status: existing.status,
          activeSessionDetected: true,
          checkoutUrl: `${resolveCheckoutBaseUrl(merchant)}/checkout/${existing.id}`
        });
        return;
      }

      // CASE 4: Previous session is TERMINAL (FAILED, EXPIRED, CANCELLED) -> RETRY / NEW PAYMENT!
      const cleanOrderId = body.orderId.replace(/-R\d+$/, '');
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      body.orderId = `${cleanOrderId}-R${randSuffix}`;
    }

    let amountPaise;
    try {
      amountPaise = toPaise(body.amount);
    } catch (err) {
      HttpServer.json(res, 400, { error: err.message });
      return;
    }

    const isCounterPayment = body.method === 'CASH_COUNTER' || body.method === 'CARD_COUNTER';

    let receivingAccountId = null;
    let receivingAccountSnapshot = null;

    // Paise Offset Engine: allocate a unique paise offset (₹0.00–₹0.99) per VPA
    // so multiple concurrent buyers can pay the same base amount without queueing.
    var paiseOffset = 0;
    var totalAmountPaise = Number(amountPaise) || 1;

    if (!isCounterPayment) {
      // Resolve active receiving account for UPI
      const receivingAccount = ctx.accountRepo.findActiveForMerchant(merchant.id);
      // UPI allowlist check removed - any UPI ID accepted
      if (!receivingAccount) {
        HttpServer.json(res, 500, { error: 'No active UPI receiving account configured for merchant.' });
        return;
      }
      const configuredTestVpa = testReceivingVpa(merchant.id);
      const payeeVpa = configuredTestVpa || receivingAccount.upiId;
      const ruleError=enforcePaymentControls(ctx,merchant.id,{RECEIVING_VPA:payeeVpa,CUSTOMER_VPA:body.customer?.vpa,CUSTOMER:body.customerId});
      if(ruleError)return HttpServer.json(res,403,ruleError);
      receivingAccountId = receivingAccount.id;
      receivingAccountSnapshot = {
        id: receivingAccount.id,
        upiId: payeeVpa,
        payeeName: receivingAccount.payeeName,
        isMerchantEnabled: receivingAccount.isMerchantEnabled,
        isTestOverride: Boolean(configuredTestVpa)
      };
    }

    // Multi-VPA Auto-Rotation Guard: check if this VPA can handle the payment volume
    if (!isCounterPayment && ctx.vpaRotationGuard && receivingAccountId) {
      const capacityCheck = ctx.vpaRotationGuard.checkCapacity(receivingAccountId, totalAmountPaise);
      if (!capacityCheck.ok) {
        // Try to find another active VPA for this merchant
        const alternative = ctx.vpaRotationGuard.findBestAccount(merchant.id, totalAmountPaise);
        if (alternative) {
          receivingAccountId = alternative.id;
          receivingAccountSnapshot = {
            id: alternative.id,
            upiId: alternative.upiId,
            payeeName: alternative.payeeName,
            isMerchantEnabled: alternative.isMerchantEnabled
          };
          const denied=enforcePaymentControls(ctx,merchant.id,{RECEIVING_VPA:alternative.upiId});
          if(denied)return HttpServer.json(res,403,denied);
        } else {
          HttpServer.json(res, 409, {
            error: 'VPA_CAPACITY_EXCEEDED',
            reason: capacityCheck.reason,
            suggestedAction: capacityCheck.suggestedAction,
            currentVolumePaise: capacityCheck.currentVolumePaise,
            thresholdPaise: capacityCheck.thresholdPaise,
            projectedVolumePaise: capacityCheck.projectedVolumePaise,
            message: 'All receiving accounts for this merchant are at daily volume threshold. Please try again later.'
          });
          return;
        }
      }
    }

    // Resolve or auto-generate customer with masked details
    let customer = null;
    let customerId = body.customerId || null;
    const hasCustomerInput = !!(body.customerId || body.customer || body.customerEmail || body.customerPhone || body.customerName);
    const customerName = body.customer?.name || body.customerName || null;
    const customerEmail = body.customer?.email || body.customerEmail || null;
    const customerPhone = body.customer?.mobileNumber || body.customer?.phoneNumber || body.customer?.phone || body.customerPhone || null;

    if (customerId && ctx.customerRepo) {
      customer = ctx.customerRepo.findById(customerId);
    }

    if (!customer && (customerEmail || customerPhone) && ctx.customerRepo) {
      const ident = customerEmail || customerPhone;
      customer = ctx.customerRepo.findByIdentifier(ident);
      if (customer) {
        customerId = customer.id;
      }
    }

    // Auto-generate customer record if customer info was provided by merchant
    if (!customer && hasCustomerInput && ctx.customerRepo) {
      customerId = customerId || generateCustomerId();
      const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      try {
        customer = ctx.customerRepo.create({
          id: customerId,
          name: customerName || 'Customer',
          email: customerEmail || `cust_${uniqueSuffix}@customer.247pay.invalid`,
          mobileNumber: customerPhone || `98${Math.floor(10000000 + Math.random() * 90000000)}`,
          status: 'ACTIVE'
        });
      } catch {
        customer = ctx.customerRepo.findById(customerId);
      }
      // If customer creation failed (e.g., invalid phone format), don't set customerId
      // to avoid FOREIGN KEY constraint failure on payment_sessions.customer_id
      if (!customer) {
        customerId = null;
      }
    } else if (customer) {
      customerId = customer.id;
    }

    // Server-side Ban Enforcement (Section 3)
    if (customerId && ctx.customerRepo && ctx.customerRepo.isBanned(customerId)) {
      HttpServer.json(res, 403, {
        status: 'BLOCKED',
        error: 'ACCESS BLOCKED: Your account has been temporarily blocked because suspicious payment activity was detected. Our team will review the activity before access can be restored.',
        message: 'Your account has been temporarily blocked because suspicious payment activity was detected. Our team will review the activity before access can be restored.',
        isBanned: true
      });
      return;
    }

    // Check if customer already has an active payment session on another device (CASE 3)
    if (customerId && ctx.sessionRepo) {
      const activeForCust = ctx.sessionRepo.findActiveForCustomer ? ctx.sessionRepo.findActiveForCustomer(customerId) : null;
      if (activeForCust) {
        if (deviceId && activeForCust.deviceId && deviceId !== activeForCust.deviceId) {
          HttpServer.json(res, 409, {
            error: 'DUPLICATE_SESSION_DETECTED',
            code: 'DEVICE_SESSION_MISMATCH',
            session_id: activeForCust.id,
            activeSession: {
              paymentId: activeForCust.id,
              orderId: activeForCust.orderId,
              amount: toRupeesString(activeForCust.amountPaise)
            },
            action: 'END_SESSION_AND_CREATE_NEW',
            message: 'This customer already has an active payment session on another device. For security reasons, this session cannot be continued from this device.'
          });
          return;
        }
      }
    }

    // Auto-activate UPI payments immediately so the dynamic QR is available
    // without requiring customer pre-authentication. This enables the Razorpay-like
    // flow: create order -> instant QR -> customer scans -> pays -> bank observer verifies.
    // Default: ACTIVE (gaming-ready instant collection). Set body.autoActivate === false
    // to defer slot acquisition until customer authentication.
    // Counter payments (CASH_COUNTER/CARD_COUNTER) always start as ACTIVE.
    const isExplicitNoAutoActivate = body.autoActivate === false || body.autoActivate === 'false';
    const shouldActivateNow = isCounterPayment || !isExplicitNoAutoActivate;
    const initialStatus = shouldActivateNow ? PaymentStatus.ACTIVE : PaymentStatus.INITIATED;

    const sessionMetadata = {
      ...(body.metadata || {}),
      ...(receivingAccountSnapshot ? { receivingAccountSnapshot } : {}),
      baseAmountPaise: Number(amountPaise) || 1,
      paiseOffset: paiseOffset || 0
    };

    if (deviceId && customerId && ctx.deviceRepo) {
      try { ctx.deviceRepo.associateCustomer(deviceId, customerId); } catch {}
    }

    // Create session in DB
    const session = ctx.sessionRepo.create({
      merchantId: merchant.id,
      customerId,
      receivingAccountId,
      orderId: body.orderId,
      amountPaise: totalAmountPaise,
      currency: body.currency || 'INR',
      method: body.method || 'UPI',
      // Counter payments (CASH_COUNTER/CARD_COUNTER) don't use UPI slots -> insert as ACTIVE.
      // UPI payments insert as QUEUED; enqueueOrActivate promotes to ACTIVE if slot is free.
      status: isCounterPayment ? PaymentStatus.ACTIVE : (shouldActivateNow ? PaymentStatus.QUEUED : initialStatus),
      returnUrl: body.returnUrl || null,
      idempotencyKey: idempotencyKey || null,
      deviceId,
      metadata: sessionMetadata
    });

    // Enqueue or Activate slot via QueueEngine immediately for all payment types
    let queueResult = { status: initialStatus, queuePosition: 0, expiresAt: null };
    if (receivingAccountId && shouldActivateNow) {
      queueResult = ctx.queueEngine.enqueueOrActivate(session.id, receivingAccountId);

      // If activated immediately, start Timer 1 (5 minutes)
      if (queueResult.expiresAt) {
        ctx.timingEngine.startActiveTimer(session.id, queueResult.expiresAt);
      }
      server.broadcastSse('admin_counter_events', 'status_change', {
        status: queueResult.status,
        sessionId: session.id,
        orderId: session.orderId,
        amountPaise: session.amountPaise ? session.amountPaise.toString() : '0'
      });
    }

    HttpServer.json(res, 201, {
      paymentId: session.id,
      orderId: session.orderId,
      amount: toRupeesString(totalAmountPaise),
      baseAmount: toRupeesString(totalAmountPaise),
      amountPaise: totalAmountPaise.toString(),
      baseAmountPaise: amountPaise.toString(),
      paiseOffset: paiseOffset || 0,
      currency: session.currency,
      status: queueResult.status,
      queuePosition: queueResult.queuePosition,
      customer: customer ? {
        id: customer.id,
        name: customer.name,
        maskedPhone: maskPhone(customer.mobileNumber),
        maskedEmail: maskEmail(customer.email)
      } : null,
      checkoutUrl: `${resolveCheckoutBaseUrl(merchant)}/checkout/${session.id}`
    });
    } catch (err) {
      console.error('[Payments API] Unhandled error:', err);
      HttpServer.json(res, 500, { error: 'Internal Server Error', detail: err.message });
    }
  });

  // GET /api/v1/payments/:id
  server.get('/api/v1/payments/:id', async (req, res, params) => {
    const session = ctx.sessionRepo.findById(params.id);
    if (!session) {
      HttpServer.json(res, 404, { error: `Payment session not found: ${params.id}` });
      return;
    }

    const publicStatus = isTerminalStatus(session.status)
      ? toPublicOutcome(session.status)
      : session.status;

    // Fields any payment-id holder may read. Everything else is merchant-private: the raw
    // state machine status, verification internals, merchant metadata and the return URL.
    const publicView = {
      paymentId: session.id,
      orderId: session.orderId,
      amount: toRupeesString(session.amountPaise),
      amountPaise: session.amountPaise.toString(),
      currency: session.currency,
      status: publicStatus,
      method: session.method,
      completedAt: session.completedAt ? session.completedAt.toISOString() : null
    };

    if (!isPaymentOwner(req, session, ctx)) {
      HttpServer.json(res, 200, publicView);
      return;
    }

    HttpServer.json(res, 200, {
      ...publicView,
      internalStatus: session.status,
      verificationLevel: session.verificationLevel || 0,
      verificationSources: session.verificationSources || [],
      verificationTag: session.verificationTag || 'UNVERIFIED',
      returnUrl: session.returnUrl,
      metadata: session.metadata
    });
  });

  // GET /api/v1/payments/:id/stream (SSE Real-Time Confirmation)
  server.get('/api/v1/payments/:id/stream', async (req, res, params) => {
    const session = ctx.sessionRepo.findById(params.id);
    if (!session) {
      HttpServer.json(res, 404, { error: `Payment session not found: ${params.id}` });
      return;
    }

    // A payment id is not a credential. Merchant/admin callers (or the bound device that owns an
    // already-bound session) only; an unbound session stays readable so the checkout page can stream.
    const requestingDeviceId = req.headers['x-device-id'] || req.query?.deviceId || null;
    const allowed = isPaymentOwner(req, session, ctx)
      || !session.deviceId
      || requestingDeviceId === session.deviceId;
    if (!allowed) {
      HttpServer.json(res, 409, {
        error: 'DUPLICATE_SESSION_DETECTED',
        message: 'This payment session is bound to another device.'
      });
      return;
    }

    const topic = `payment_session_${session.id}`;
    server.initSse(topic, res, req);

    if (isTerminalStatus(session.status)) {
      server.broadcastSse(topic, 'status_change', {
        sessionId: session.id,
        orderId: session.orderId,
        status: session.status,
        amountPaise: session.amountPaise ? session.amountPaise.toString() : '0',
        baseAmountPaise: session.metadata?.baseAmountPaise ? String(session.metadata.baseAmountPaise) : null,
        paiseOffset: session.metadata?.paiseOffset || 0,
        completedAt: session.completedAt ? session.completedAt.toISOString() : null
      });
    }
  });

  // GET /api/v1/payments/:id/cod (Developer COD Info Endpoint)
  server.get('/api/v1/payments/:id/cod', async (req, res, params) => {
    const session = ctx.sessionRepo.findById(params.id);
    if (!session) {
      HttpServer.json(res, 404, { error: `Payment session not found: ${params.id}` });
      return;
    }

    let customer = null;
    if (session.customerId && ctx.customerRepo) {
      const c = ctx.customerRepo.findById(session.customerId);
      if (c) {
        customer = {
          id: c.id,
          name: c.name,
          email: c.email,
          mobileNumber: c.mobileNumber
        };
      }
    }

    HttpServer.json(res, 200, {
      paymentId: session.id,
      orderId: session.orderId,
      amount: toRupeesString(session.amountPaise),
      amountPaise: session.amountPaise.toString(),
      currency: session.currency,
      method: session.method,
      status: session.status,
      verificationTag: session.verificationTag,
      isCod: session.method === 'COD',
      customer,
      placedAt: session.completedAt ? (session.completedAt.toISOString ? session.completedAt.toISOString() : session.completedAt) : (session.createdAt?.toISOString ? session.createdAt.toISOString() : session.createdAt),
      metadata: session.metadata
    });
  });

  // GET /api/v1/orders/:orderId/cod (Developer COD Info by Merchant Order ID)
  server.get('/api/v1/orders/:orderId/cod', async (req, res, params) => {
    const merchantId = req.headers['x-merchant-id'] || req.query.merchantId;
    let merchant;
    if (merchantId) {
      merchant = ctx.merchantRepo.findById(merchantId);
    } else {
      merchant = ctx.merchantRepo.getDefault ? ctx.merchantRepo.getDefault() : (ctx.merchantRepo.findById('00000000-0000-0000-0000-000000000001') || ctx.merchantRepo.findAll()[0]);
    }

    if (!merchant) {
      HttpServer.json(res, 404, { error: 'Merchant not found.' });
      return;
    }

    const session = ctx.sessionRepo.findByOrderId(merchant.id, params.orderId);
    if (!session) {
      HttpServer.json(res, 404, { error: `Order not found: ${params.orderId}` });
      return;
    }

    let customer = null;
    if (session.customerId && ctx.customerRepo) {
      const c = ctx.customerRepo.findById(session.customerId);
      if (c) {
        customer = {
          id: c.id,
          name: c.name,
          email: c.email,
          mobileNumber: c.mobileNumber
        };
      }
    }

    HttpServer.json(res, 200, {
      paymentId: session.id,
      orderId: session.orderId,
      amount: toRupeesString(session.amountPaise),
      amountPaise: session.amountPaise.toString(),
      currency: session.currency,
      method: session.method,
      status: session.status,
      verificationTag: session.verificationTag,
      isCod: session.method === 'COD',
      customer,
      placedAt: session.completedAt ? (session.completedAt.toISOString ? session.completedAt.toISOString() : session.completedAt) : (session.createdAt?.toISOString ? session.createdAt.toISOString() : session.createdAt),
      metadata: session.metadata
    });
  });

  // GET /api/v1/payments/:id/receipt (Official Digital Bill Receipt)
  server.get('/api/v1/payments/:id/receipt', async (req, res, params) => {
    const session = ctx.sessionRepo.findById(params.id);
    if (!session) {
      HttpServer.json(res, 404, { error: `Payment session not found: ${params.id}` });
      return;
    }

    if(session.status!=='SUCCESS') return HttpServer.json(res,409,{error:'A receipt is available after payment confirmation or COD order placement.'});

    let customer = null;
    if (session.customerId && ctx.customerRepo) {
      customer = ctx.customerRepo.findById(session.customerId);
    }
    const merchant = (session.merchantId ? ctx.merchantRepo?.findById(session.merchantId) : null) || ctx.defaultMerchant;

    let receipt = null;
    if (ctx.receiptService) {
      receipt = await ctx.receiptService.getOrCreateReceipt(session, customer, merchant);
    }

    const wantsJson = (req.query && req.query.format === 'json') || (req.headers['accept'] || '').includes('application/json');
    if (wantsJson) {
      HttpServer.json(res, 200, {
        success: true,
        receiptId: receipt?.receiptId || `RCPT-${session.id.slice(0, 8).toUpperCase()}`,
        paymentId: session.id,
        orderId: session.orderId,
        amount: toRupeesString(session.amountPaise),
        amountPaise: session.amountPaise.toString(),
        currency: session.currency,
        status: session.status,
        method: session.method,
        utr: receipt?.utr || null,
        customer: customer ? {
          id: customer.id,
          name: customer.name,
          maskedPhone: maskPhone(customer.mobileNumber),
          maskedEmail: maskEmail(customer.email)
        } : null,
        confirmationSource:receipt?.confirmationSource || null,
        generatedAt:receipt?.generatedAt || null,
        smsStatus: receipt?.smsStatus || 'NOT_CONFIGURED',
        emailStatus: receipt?.emailStatus || 'NOT_CONFIGURED',
        dispatchedAt: receipt?.dispatchedAt || null
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(receipt?.emailHtml || '<!doctype html><html><body><p>Receipt unavailable. Please try again.</p></body></html>');
  });
}

