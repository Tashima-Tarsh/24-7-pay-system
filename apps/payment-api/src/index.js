import {registerPaymentControls} from './payment-controls.js';
import {registerPlatformIdentity} from './platform/identity.js';
import {registerPlatformPayments} from './platform/payments.js';
import {registerPlatformOperations} from './platform/operations.js';
import fs from 'node:fs';
import { registerMerchantConsoleRoutes } from './routes/merchant-console.routes.js';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PaymentStatus, safeEqual } from '@youpi/common';
import { DynamoPayQueue } from '@youpi/common';
import { DynamoPayWebhooks } from '@youpi/common';

// Increase libuv thread pool for higher concurrency under burst load
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '128';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const rootDir = path.resolve(__dirname, '../../..');

// In production, reliably ensure environment variables from .env are loaded if not already provided
if (!process.env.BASE_CHECKOUT_URL && typeof process.loadEnvFile === 'function') {
  try {
    const rootEnv = path.resolve(rootDir, '.env');
    if (fs.existsSync(rootEnv)) {
      process.loadEnvFile(rootEnv);
    }
  } catch {}
}

// Validate production environment before starting services
import { default as validateEnv } from '../../../scripts/validate-env.js';
validateEnv();
import {
  getDatabase,
  ensureDatabaseInitialized,
  runMigrations,
  MerchantRepository,
  ReceivingAccountRepository,
  CustomerRepository,
  CustomerSessionRepository,
  PaymentSessionRepository,
  ObservationRepository,
  PpMerchantPaymentProfileRepository,
  SupportTicketRepository,
  AuditLogRepository,
  DeviceRepository,
  SuperAdminRepository,
  MerchantUserRepository,
  RoleRepository,
  MfaRepository,
  SmartRoutingEngine,
  RoutingRepository,
  WalletRepository,
  PricingRepository,
  DiagnosticRepository,
  MerchantUpiConnectionRepository,
  SubscriptionEntitlementRepository,
  ConnectionHealthEventRepository,
  AdminAuditEventRepository,
  CallbackOutboxRepository,
  CallbackDeliveryAttemptRepository
} from '@youpi/db';
import {
  QueueEngine,
  TimingEngine,
  AttributionEngine,
  RecoveryEngine,
  WebhookEngine,
  PaymentVerificationPipeline,
  PaiseOffsetAllocator,
  VpaRotationGuard
} from '@youpi/core';
import { HttpServer } from './server.js';
import { PaymentGateway } from './server.js';
import { authGuard, isAdminRequest } from './auth-guard.js';
import { registerPaymentRoutes } from './routes/payments.routes.js';
import { registerCheckoutRoutes } from './routes/checkout.routes.js';
import { registerPollerRoutes } from './routes/pollers.routes.js';
import { registerAdminRoutes } from './routes/admin.routes.js';
import { registerCustomerRoutes } from './routes/customer.routes.js';
import { registerDeviceRoutes } from './routes/device.routes.js';
import { registerCollectionsRoutes } from './routes/collections.routes.js';
import { registerPayoutsRoutes } from './routes/payouts.routes.js';
import { registerBankingRoutes } from './routes/banking.routes.js';
import { registerProviderWebhooksRoutes } from './routes/provider-webhooks.routes.js';
import { registerHyperswitchRoutes } from './routes/hyperswitch.routes.js';
import { registerSettlementsRoutes } from './routes/settlements.routes.js';
import { registerRefundsRoutes } from './routes/refunds.routes.js';
import { registerSplitSettlementRoutes } from './routes/split-settlement.routes.js';
import { registerOperationsRoutes } from './routes/operations.routes.js';
import { registerDynamoPayRoutes } from './routes/dynamopay.routes.js';
import { registerSuperAdminRoutes } from './routes/super-admin.routes.js';
import { registerSuperAdminUpiMirrorRoutes } from './routes/super-admin-upi-mirror.routes.js';
import { registerUpiMirrorRoutes } from './routes/upi-mirror.routes.js';
import { registerPaymentLinkRoutes } from './routes/payment-link.routes.js';
import { registerCallbackWalletRoutes } from './routes/callback-wallet.routes.js';
import { createUpiSimpleService } from './services/upi-simple.js';
import { registerUpiSimpleRoutes } from './routes/upi-simple.routes.js';
import { registerUpiIntentRoutes } from './routes/upi-intent.routes.js';
import { registerOrderCreateRoutes } from './routes/order-create.routes.js';
import { registerVerifyCallbackRoutes } from './routes/verify-callback.routes.js';
import { registerManualVerificationRoutes } from './routes/manual-verification.routes.js';
import { registerLERequestRoutes } from './routes/le-request.routes.js';
import { getWhatsAppBerryService, WhatsAppBerryService } from './services/whatsapp-berry.service.js';
import { ReceiptNotificationService } from './services/receipt-notification.service.js';
import { NotificationDeliveryService } from './services/notification-delivery.service.js';

// New production features (disputes, event replay, circuit breaker, payer VPA, bank reconciliation, multi-operator, direct bank)
import { registerDisputesRoutes } from './routes/disputes.routes.js';
import { registerEventReplayRoutes } from './routes/event-replay.routes.js';
import { registerCircuitBreakerRoutes } from './routes/circuit-breaker.routes.js';
import { registerPayerVpaRoutes } from './routes/payer-vpa.routes.js';
import { registerBankReconciliationRoutes } from './routes/bank-reconciliation.routes.js';
import { registerMultiOperatorRoutes } from './routes/multi-operator.routes.js';
import { registerDirectBankRoutes } from './routes/direct-bank.routes.js';
import { registerCodeAttestationRoutes } from './routes/code-attestation.routes.js';
import { registerReceivingAccountRoutes } from './routes/receiving-accounts.routes.js';
import { registerProviderConnectionsRoutes } from './routes/provider-connections.routes.js';
import { registerAcceptanceRulesRoutes } from './routes/acceptance-rules.routes.js';

export function createPaymentApp(customDb = null, options = {}) {
  const db = customDb || getDatabase();
  ensureDatabaseInitialized(db);
  const { defaultMerchant } = runMigrations(db);
  const isCustom = !!customDb;
  const whatsappBerryService = options.whatsappBerryService || (isCustom ? new WhatsAppBerryService({
    sessionId: 'test_berry_session',
    sessionPath: path.resolve(rootDir, 'data/test_berry_auth'),
    databasePath: path.resolve(rootDir, 'data/test_berry_store.db'),
    metaFile: path.resolve(rootDir, 'data/test_whatsapp_session.json'),
    simulated: process.env.NODE_ENV === 'test'
  }) : getWhatsAppBerryService());

  const merchantRepo = new MerchantRepository(db);
  const accountRepo = new ReceivingAccountRepository(db);
  const customerRepo = new CustomerRepository(db);
  const customerSessionRepo = new CustomerSessionRepository(db, customerRepo);
  const sessionRepo = new PaymentSessionRepository(db);
  const obsRepo = new ObservationRepository(db);
  const upiConnectionRepository = new MerchantUpiConnectionRepository(db);
  const subscriptionEntitlementRepository = new SubscriptionEntitlementRepository(db);
  const connectionHealthEventRepository = new ConnectionHealthEventRepository(db);
  const adminAuditEventRepository = new AdminAuditEventRepository(db);
  const callbackOutboxRepository = new CallbackOutboxRepository(db);
  const callbackDeliveryAttemptRepository = new CallbackDeliveryAttemptRepository(db);
  const ticketRepo = new SupportTicketRepository(db);
  const auditRepo = new AuditLogRepository(db);
  const ppMerchantPaymentProfileRepo = new PpMerchantPaymentProfileRepository(db);
  const deviceRepo = new DeviceRepository(db);
  const notificationDeliveryService = new NotificationDeliveryService(db);
  const receiptService = new ReceiptNotificationService(db, auditRepo, notificationDeliveryService);
  notificationDeliveryService.start();

  // Super Admin repositories
  const superAdminRepo = new SuperAdminRepository(db);
  const merchantUserRepo = new MerchantUserRepository(db);
  const roleRepo = new RoleRepository(db);
  const mfaRepo = new MfaRepository(db);
  const walletRepo = new WalletRepository(db);
  const pricingRepo = new PricingRepository(db);
  const diagnosticRepo = new DiagnosticRepository(db);

  const eventEmitter = new EventEmitter();

  const queueEngine = new QueueEngine({
    sessionRepo,
    accountRepo,
    eventEmitter,
    auditRepo
  });

  const paiseOffsetAllocator = new PaiseOffsetAllocator({
    sessionRepo,
    eventEmitter,
    auditRepo
  });

  sessionRepo.paiseOffsetAllocator = paiseOffsetAllocator;

  const vpaRotationGuard = new VpaRotationGuard({
    accountRepo,
    sessionRepo,
    eventEmitter,
    auditRepo
  });

  sessionRepo.paiseOffsetAllocator = paiseOffsetAllocator;
  sessionRepo.vpaRotationGuard = vpaRotationGuard;

  const timingEngine = new TimingEngine({
    sessionRepo,
    queueEngine,
    eventEmitter,
    auditRepo,
    activeDurationMs: Number(process.env.PAYMENT_ACTIVE_WINDOW_MS || 300000),
    processingDurationMs: Number(process.env.PAYMENT_PROCESSING_WINDOW_MS || 30000),
    verificationDurationMs: Number(process.env.PAYMENT_VERIFICATION_WINDOW_MS || 1800000)
  });

  const attributionEngine = new AttributionEngine({
    sessionRepo,
    obsRepo,
    ticketRepo,
    auditRepo,
    eventEmitter
  });

  const recoveryEngine = new RecoveryEngine({
    db,
    sessionRepo,
    accountRepo,
    queueEngine,
    timingEngine,
    auditRepo
  });

  const providerWebhookEngine = new WebhookEngine({db,merchantRepo,deliveryTable:'provider_webhook_deliveries'});
  const webhookEngine = new WebhookEngine({
    db,
    merchantRepo,
    maxRetries: Number(process.env.WEBHOOK_MAX_RETRIES || 5)
  });

  // Dynamo Pay production services
  const dynamoQueue = new DynamoPayQueue();
  const dynamoWebhooks = new DynamoPayWebhooks();

  // Connect Dynamo Pay queue to Redis (auxiliary job queue only).
  // Durable financial event persistence is provided by the database-backed callback_outbox
  // (callback_outbox / callback_delivery_attempts tables), NOT by an in-memory queue.
  // An in-memory fallback must never silently replace durable financial processing.
  let dynamoQueueRedisAvailable = false;
  dynamoQueue.connect().then(() => {
    dynamoQueueRedisAvailable = true;
  }).catch((err) => {
    dynamoQueueRedisAvailable = false;
    console.warn('[DynamoPay Queue] Redis unavailable:', err.message);
    console.warn('[DynamoPay Queue] Durable financial events remain persisted in callback_outbox (PostgreSQL/SQLite).');
    console.warn('[DynamoPay Queue] No in-memory queue is used as a durable substitute for financial events.');
  });

  const server = new HttpServer();
  server.use(authGuard);
  let checkoutBaseUrl = process.env.BASE_CHECKOUT_URL || 'http://localhost:7000';
  try {
    const rootEnv = path.resolve(__dirname, '../../../.env');
    if (fs.existsSync(rootEnv)) {
      const raw = fs.readFileSync(rootEnv, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith('BASE_CHECKOUT_URL=')) {
          const val = trimmed.split('=')[1]?.trim();
          if (val) checkoutBaseUrl = val.replace(/^["']|["']$/g, '');
        }
      }
    }
  } catch {}

  // BULLETPROOF QUEUE PROMOTION HANDLER
  function handleSlotFreedAndPromote(receivingAccountId) {
    if (!receivingAccountId) return null;
    const promoted = queueEngine.promoteNext(receivingAccountId);
    if (promoted) {
      if (promoted.expiresAt) {
        timingEngine.startActiveTimer(promoted.id, promoted.expiresAt);
      }
      server.broadcastSse(promoted.id, 'status_change', {
        status: PaymentStatus.ACTIVE,
        queuePosition: 0,
        expiresAt: promoted.expiresAt
      });
      server.broadcastSse(`queue_${receivingAccountId}`, 'queue_update', {
        promotedId: promoted.id
      });
    }
    return promoted;
  }

  for(const name of ['SESSION.ACTIVATED','SESSION.QUEUED','SESSION.PROCESSING','PAYMENT.SUCCESS','PAYMENT.FAILED','PAYMENT.EXPIRED','PAYMENT.CANCELLED','PAYMENT.VERIFICATION_PENDING','PAYMENT.VERIFICATION_UPGRADED']) {
    eventEmitter.on(name,data=>{
      const id=data.paymentId||data.sessionId;
      if(!id)return;
      const session=sessionRepo.findById(id);
      if(session) server.broadcastSse(`console_${session.merchantId}`,'activity',{paymentId:session.id,status:session.status});
    });
  }

  // When a payment succeeds, fails, expires, or cancels: dispatch webhook & promote next queued customer
  eventEmitter.on('PAYMENT.SUCCESS', (data) => {
    const session = sessionRepo.findById(data.paymentId);
    if (session) {
      server.broadcastSse(session.id, 'status_change', {
        status: PaymentStatus.SUCCESS,
        verificationLevel: data.verificationLevel ?? session.verificationLevel ?? 1,
        verificationTag: data.verificationTag || session.verificationTag,
        sources: data.sources || session.verificationSources
      });
      if(!data.webhookQueued)webhookEngine.dispatch('SUCCESS', session).catch(() => {});
      try {
        const customer = session.customerId ? customerRepo.findById(session.customerId) : null;
        const merchant = (session.merchantId ? merchantRepo.findById(session.merchantId) : null) || defaultMerchant;
        receiptService.sendPaymentReceipt(session, customer, merchant).catch(error=>console.error('[Receipt generation]',error.message));
      } catch (err) {
        console.error('[ReceiptNotification] Failed to dispatch receipt:', err.message);
      }
      handleSlotFreedAndPromote(session.receivingAccountId);
    }
  });

  eventEmitter.on('PAYMENT.LEVEL1_VERIFIED', (data) => {
    server.broadcastSse(data.paymentId, 'status_change', {
      status: 'VERIFYING',
      verificationLevel: 1,
      verificationTag: data.verificationTag,
      message: 'Payment detected! Verifying secondary channel...'
    });
  });

  eventEmitter.on('PAYMENT.FAILED', (data) => {
    const session = sessionRepo.findById(data.paymentId);
    if (session) {
      webhookEngine.dispatch('FAILED', session).catch(() => {});
      handleSlotFreedAndPromote(session.receivingAccountId);
    }
  });
  eventEmitter.on('PAYMENT.VERIFICATION_PENDING', data => {
    server.broadcastSse(data.paymentId, 'status_change', { status: PaymentStatus.VERIFICATION_PENDING });
    try{attributionEngine.reconcilePendingPayment(data.paymentId);}catch(error){console.error('[Pending bank reconciliation]',error.message);}
  });

  eventEmitter.on('PAYMENT.EXPIRED', (data) => {
    const session = sessionRepo.findById(data.paymentId);
    if (session) {
      server.broadcastSse(session.id, 'status_change', {
        status: PaymentStatus.EXPIRED
      });
      webhookEngine.dispatch('EXPIRED', session).catch(() => {});
      handleSlotFreedAndPromote(session.receivingAccountId);
    }
  });

  eventEmitter.on('PAYMENT.CANCELLED', (data) => {
    const session = sessionRepo.findById(data.paymentId);
    if (session) {
      server.broadcastSse(session.id, 'status_change', {
        status: PaymentStatus.CANCELLED
      });
      webhookEngine.dispatch('CANCELLED', session).catch(() => {});
      handleSlotFreedAndPromote(session.receivingAccountId);
    }
  });

  eventEmitter.on('PAYMENT.FRAUD_BLOCKED', (data) => {
    if (data.sessionId) {
      server.broadcastSse(data.sessionId, 'status_change', {
        status: 'BLOCKED',
        isBanned: true,
        fraudDetected: true,
        orderId: data.orderId,
        reason: data.reason || 'FRAUDULENT_PAYMENT_INJECTION',
        blockedNotice: {
          title: 'FRAUDULENT ACTIVITY DETECTED',
          subtitle: 'Payment Session Terminated & Account Suspended',
          message: 'Our automated verification engine detected fraudulent payment activity associated with this account. Access has been immediately suspended while our security operations team investigates the issue.',
          investigating: true
        }
      });
      server.broadcastSse(data.sessionId, 'account_blocked', {
        status: 'BLOCKED',
        isBanned: true,
        fraudDetected: true,
        orderId: data.orderId,
        reason: data.reason || 'FRAUDULENT_PAYMENT_INJECTION'
      });
    }
  });

  // Consolidated verification sweep: one timer processes all processing sessions,
  // instead of one timer per session (which starved the event loop under load).
  const sweepIntervalMs = Number(process.env.SWEEP_INTERVAL_MS || 2000);
  const sweepBatchSize = Number(process.env.SWEEP_BATCH_SIZE || 50);
  let sweepTimerActive = false;

  eventEmitter.on('SESSION.PROCESSING', (data) => {
    if (!sweepTimerActive) {
      sweepTimerActive = true;
      const sweepTimer = setInterval(async () => {
        try {
          const sessions = db.query(`SELECT id, receiving_account_id FROM payment_sessions WHERE status = 'PROCESSING' LIMIT ?`, [sweepBatchSize]);
          if (sessions.length === 0) return;

          // Sweep 2: Process unattributed observations for each session
          for (const session of sessions) {
            try {
              const current = sessionRepo.findById(session.id);
              if (!current || current.status !== 'PROCESSING' || current.verificationLevel >= 3) continue;

              const unattributed = obsRepo.findUnattributed(current.receivingAccountId);
              for (const obs of unattributed) {
                attributionEngine.processObservation({
                  source: obs.source,
                  receivingAccountId: current.receivingAccountId,
                  amountPaise: obs.amountPaise,
                  observedAt: obs.observedAt,
                  bankReferenceNumber: obs.bankReferenceNumber,
                  senderVpa: obs.senderVpa,
                  rawPayload: obs.rawPayload,
                  fingerprintHash: obs.fingerprintHash
                });
              }
            } catch {}
          }
        } catch {}
      }, sweepIntervalMs);
      if (sweepTimer.unref) sweepTimer.unref();
    }
  });

  // Continuous 1-second background queue sync and auto-expiry daemon
  const queueSyncDaemon = setInterval(() => {
    try {
      const nowIso = new Date().toISOString();

      // Sweep expired ACTIVE sessions. An ACTIVE session whose issue TTL elapsed must
      // NOT auto-expire if a UTR was already reported: move it to VERIFICATION_PENDING
      // and start the 30-minute verification window instead.
      const expiredActive = db.query(`
        SELECT id, receiving_account_id, metadata FROM payment_sessions
        WHERE status = 'ACTIVE' AND expires_at <= ?
      `, [nowIso]);

      for (const row of expiredActive) {
        let metadata = {};
        try { metadata = JSON.parse(row.metadata || '{}'); } catch {}
        if (metadata && metadata.reportedUtr) {
          const session = sessionRepo.findById(row.id);
          if (!session) continue;
          const now = new Date();
          const nowIso2 = now.toISOString();
          const verificationExpiresAt = new Date(now.getTime() + timingEngine.verificationDurationMs).toISOString();
          sessionRepo.db.execute(`
            UPDATE payment_sessions
            SET status = ?, verification_expires_at = ?, updated_at = ?
            WHERE id = ? AND status = 'ACTIVE'
          `, [PaymentStatus.VERIFICATION_PENDING, verificationExpiresAt, nowIso2, row.id]);
          server.broadcastSse(row.id, 'status_change', { status: PaymentStatus.VERIFICATION_PENDING, verificationExpiresAt });
          try { timingEngine.startVerificationTimer(row.id, new Date(verificationExpiresAt)); } catch {}
          try { attributionEngine.reconcilePendingPayment(row.id); } catch {}
        } else {
          sessionRepo.transitionToTerminal(row.id, PaymentStatus.EXPIRED);
          server.broadcastSse(row.id, 'status_change', { status: PaymentStatus.EXPIRED });
          handleSlotFreedAndPromote(row.receiving_account_id);
        }
      }

      // Expire VERIFICATION_PENDING sessions past their verification window, release the slot.
      const expiredPending = db.query(`
        SELECT id, receiving_account_id FROM payment_sessions
        WHERE status = 'VERIFICATION_PENDING' AND verification_expires_at <= ?
      `, [nowIso]);

      for (const row of expiredPending) {
        sessionRepo.transitionToTerminal(row.id, PaymentStatus.EXPIRED);
        server.broadcastSse(row.id, 'status_change', { status: PaymentStatus.EXPIRED });
        handleSlotFreedAndPromote(row.receiving_account_id);
      }

      const pendingBankMatches=db.query(`SELECT DISTINCT ps.id FROM payment_sessions ps JOIN payment_observations obs ON obs.receiving_account_id=ps.receiving_account_id AND obs.amount_paise=ps.amount_paise AND obs.bank_reference_number=json_extract(ps.metadata,'$.reportedUtr') WHERE ps.status='VERIFICATION_PENDING' AND obs.attributed_payment_id IS NULL AND obs.attribution_status IN ('UNATTRIBUTED','LATE_UNMATCHED')`);
      for(const row of pendingBankMatches)attributionEngine.reconcilePendingPayment(row.id);

      // Scan for vacant receiving accounts that have waiting queued sessions
      const vacantAccounts = db.query(`
        SELECT id FROM payment_receiving_accounts
        WHERE is_active = 1 AND (is_slot_busy = 0 OR current_active_session_id IS NULL)
      `);

      for (const acc of vacantAccounts) {
        handleSlotFreedAndPromote(acc.id);
      }
    } catch {}
  }, 1000);

  if (queueSyncDaemon.unref) queueSyncDaemon.unref();

  // Execute crash recovery on boot
  const recoveryStats = recoveryEngine.recover();

  // Health check routes
  const healthHandler = (req, res) => {
    HttpServer.json(res, 200, {
      status: 'UP',
      service: 'payment-api',
      timestamp: new Date().toISOString(),
      recoveryStats
    });
  };
  server.get('/health', healthHandler);
  server.get('/api/v1/health', healthHandler);

  const pipeline = new PaymentVerificationPipeline({
    db,
    sessionRepo,
    obsRepo,
    customerRepo,
    attributionEngine,
    auditRepo,
    merchantRepo,
    server,
    eventEmitter
  });

  const context = {
    db,
    merchantRepo,
    accountRepo,
    customerRepo,
    customerSessionRepo,
    sessionRepo,
    deviceRepo,
    obsRepo,
    ticketRepo,
    auditRepo,
    ppMerchantPaymentProfileRepo,
    queueEngine,
    timingEngine,
    attributionEngine,
    pipeline,
    recoveryEngine,
    eventEmitter,
    defaultMerchant,
    checkoutBaseUrl,
    whatsappBerryService,
    receiptService,
    webhookEngine,
    providerWebhookEngine,
    dynamoQueue,
    dynamoQueueRedisAvailable: () => dynamoQueueRedisAvailable,
    dynamoWebhooks,
    paiseOffsetAllocator,
    vpaRotationGuard,
    superAdminRepo,
    merchantUserRepo,
    roleRepo,
    mfaRepo,
    routingRepo: new RoutingRepository(db),
    walletRepo,
    pricingRepo,
    diagnosticRepo,
    upiConnectionRepo: upiConnectionRepository,
    subscriptionEntitlementRepo: subscriptionEntitlementRepository,
    connectionHealthEventRepo: connectionHealthEventRepository,
    adminAuditEventRepo: adminAuditEventRepository,
    callbackOutboxRepo: callbackOutboxRepository,
    callbackDeliveryAttemptRepo: callbackDeliveryAttemptRepository,
    httpServer: server
  };

  // Smart Routing Engine (created after context is available)
  context.routingEngine = new SmartRoutingEngine(context);

  const upiSimple = createUpiSimpleService(context);
  context.upiSimple = upiSimple;

  const platformIdentity=registerPlatformIdentity(server,context);
  const platformPayments=registerPlatformPayments(server,context,platformIdentity);
  context.platformIdentity=platformIdentity;
  context.platformPayments=platformPayments;
  context.canActivateMerchant=id=>Boolean(db.queryOne("SELECT c.id FROM provider_connections c JOIN pp_connection_policy p ON p.connection_id=c.id WHERE c.merchant_id=? AND c.environment='PRODUCTION' AND p.approved=1 AND p.enabled=1 AND c.is_active=1",[id])||db.queryOne("SELECT p.merchant_id FROM pp_receiver_policies p JOIN payment_receiving_accounts a ON a.id=p.account_id AND a.merchant_id=p.merchant_id JOIN merchants m ON m.id=p.merchant_id WHERE p.merchant_id=? AND p.auto_success=1 AND EXISTS(SELECT 1 FROM pp_receiver_source_policies sp WHERE sp.merchant_id=p.merchant_id AND sp.trusted_sources<>'{\"android\":[],\"smsSenders\":[]}') AND a.is_active=1 AND m.webhook_url IS NOT NULL AND m.webhook_url<>'' AND EXISTS(SELECT 1 FROM pp_receiver_devices b JOIN android_devices d ON d.id=b.device_id JOIN payment_receiving_accounts bound ON bound.id=b.account_id WHERE d.is_active=1 AND lower(bound.upi_id)=lower(a.upi_id))",[id]));
  // Existing merchants retain their current operational state; registration never creates this grant.
  for(const legacy of merchantRepo.findAll())if(!db.queryOne('SELECT account_id FROM pp_platform_accounts WHERE account_id=?',[legacy.id])&&!db.queryOne('SELECT merchant_id FROM pp_merchants WHERE merchant_id=?',[legacy.id]))db.execute('INSERT INTO pp_merchants(merchant_id,status,profile,created_at,updated_at) VALUES(?,?,?,?,?)',[legacy.id,'ACTIVE',JSON.stringify({businessName:legacy.businessName,legacyInstallation:true}),legacy.createdAt?.toISOString?.()||new Date().toISOString(),new Date().toISOString()]);
  server.use(platformPayments.guard);
  server.use(platformIdentity.guard);
  registerPlatformOperations(server,context,platformIdentity);
  server.use((req,res,pathname)=>{
    if(req.method==='POST'&&pathname==='/api/v1/payments'&&!isAdminRequest(req)){
      const mid=req.headers['x-merchant-id'];
      if(!mid)return false;
      const m=mid&&merchantRepo.findById(mid);
      if(!m||!safeEqual(String(req.headers['x-merchant-key']||''),m.webhookSecret||'')){HttpServer.json(res,401,{error:'Authenticate the merchant backend before creating a payment.',code:'AUTH_REQUIRED'});return true;}
      try{platformPayments.requireActive(mid);}catch(e){HttpServer.json(res,e.statusCode||403,{error:e.message,code:e.code});return true;}
    }
    return false;
  });
  registerPaymentControls(server,context);
  registerPaymentRoutes(server, context);
  registerCheckoutRoutes(server, context);
  registerPollerRoutes(server, context);
  registerAdminRoutes(server, context);
  registerMerchantConsoleRoutes(server, { ...context, eventEmitter });
  registerCustomerRoutes(server, context);
  registerDeviceRoutes(server, context);
  registerCollectionsRoutes(server, context);
  registerPayoutsRoutes(server, context);
  registerBankingRoutes(server, context);
  registerProviderWebhooksRoutes(server, context);
registerHyperswitchRoutes(server, context);
  registerSettlementsRoutes(server, context);
  registerRefundsRoutes(server, context);
  registerSplitSettlementRoutes(server, context);
  registerOperationsRoutes(server, context);
  registerDynamoPayRoutes(server, context);

  registerUpiSimpleRoutes(server, context);

  // Universal UPI Intent Return API (Phase 1 & 3)
  registerUpiIntentRoutes(server, context);

  // Manual UTR verification API
  registerManualVerificationRoutes(server, context);

  // Order creation & verify-callback API (5-layer UPI verification)
  registerOrderCreateRoutes(server, context);
  registerVerifyCallbackRoutes(server, context);

  // Law Enforcement Cooperation Protocol (Deliverable 6)
  registerLERequestRoutes(server, context);

  // Super Admin authentication routes
  registerSuperAdminRoutes(server, context);

  // Payment Links & Failover routes
  registerPaymentLinkRoutes(server, context);

  // Callback, Wallet, Diagnostics, Pricing routes
  registerCallbackWalletRoutes(server, context);

  // New production features
  registerDisputesRoutes(server, context);
  registerEventReplayRoutes(server, context);
  registerCircuitBreakerRoutes(server, context);
  registerPayerVpaRoutes(server, context);
  registerBankReconciliationRoutes(server, context);
  registerMultiOperatorRoutes(server, context);
  registerDirectBankRoutes(server, context);
  registerCodeAttestationRoutes(server, context);

  // Receiving Accounts, Provider Connections, Acceptance Rules
  registerReceivingAccountRoutes(server, context);
  registerProviderConnectionsRoutes(server, context);
  registerAcceptanceRulesRoutes(server, context);

  // Initialize PaymentGateway with WebSocket listener for UPI signals (port 6101)
  try {
    const paymentGateway = new PaymentGateway(context);
    context.paymentGateway = paymentGateway;
    paymentGateway.initWebSocketListener(Number(process.env.UPI_WS_PORT || 6101));
  } catch (err) {
    console.warn('[PaymentGateway] WebSocket listener unavailable:', err.message);
    console.warn('[PaymentGateway] Continuing without real-time UPI listener; SSE still available via API.');
  }

function destroy() {
    notificationDeliveryService.stop();
    clearInterval(webhookRetryTimer);
    webhookEngine.stop();providerWebhookEngine.stop();
    clearInterval(queueSyncDaemon);
    timingEngine.destroy();
    if (typeof attributionEngine.destroy === 'function') {
      attributionEngine.destroy();
    }
    // Close WebSocket listener
    if (paymentGateway && paymentGateway.wss) {
      try { paymentGateway.wss.close(); } catch {}
    }
    // Dynamo Pay services shutdown
    dynamoQueue.disconnect().catch(() => {});
  }

  let webhookRetryRunning=false;
  const webhookRetryTimer=setInterval(async()=>{
    if(webhookRetryRunning)return;webhookRetryRunning=true;
    try{await webhookEngine.retryPending();await providerWebhookEngine.retryPending();}catch(error){console.error('[Webhook retry]',error.message);}finally{webhookRetryRunning=false;}
  },5000);
  webhookRetryTimer.unref?.();

  return {
    server,
    context,
    destroy,
    rawServer: server.createServer()
  };
}

export function startServer(port = null, customDb = null) {
  const finalPort = port || Number(process.env.PAYMENT_API_PORT || 6100);

  // Fail fast in production rather than silently running with dev defaults.
  if (process.env.NODE_ENV === 'production') {
    const required = ['ENCRYPTION_MASTER_KEY', 'JWT_SECRET'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) {
      console.error(`[Payment API] Missing required environment variables in production: ${missing.join(', ')}`);
      process.exit(1);
    }

    // Reject weak or default admin passwords in production.
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || '';
    const weakDefaults = ['qwertyuiop' + '90', 'password', 'admin123', '<GENERATE_SECURE_32_CHAR_STRING>', ''];
    if (weakDefaults.includes(adminPassword)) {
      console.error('[Payment API] CRITICAL: INITIAL_ADMIN_PASSWORD is a weak default or placeholder value in production.');
      console.error('[Payment API] Set a strong, unique password via INITIAL_ADMIN_PASSWORD and restart.');
      process.exit(1);
    }

    // Hard fail-safe: verification bypass flags are strictly forbidden in production.
    const bypassFlags = ['SKIP_MFA', 'SKIP_EMAIL_VERIFY', 'SKIP_MOBILE_VERIFY'];
    for (const flag of bypassFlags) {
      const val = process.env[flag];
      if (val === '1' || val === 'true' || val === 'true') {
        console.error(`[Payment API] CRITICAL: Security bypass flag ${flag} is strictly forbidden in production.`);
        process.exit(1);
      }
    }
  }

  const app = createPaymentApp(customDb);

  return new Promise(resolve => {
    // Loopback by default; reach this service via the local Cloudflare Tunnel, not 0.0.0.0.
    const bindHost = process.env.YOUPI_BIND_HOST || '127.0.0.1';
    const backlog = Number(process.env.SERVER_BACKLOG || 4096);
    const instance = app.rawServer.listen({ port: finalPort, host: bindHost, backlog }, () => {
      console.log(`[Payment API] Server listening on port ${finalPort} (backlog ${backlog})`);
      resolve({
        app,
        port: finalPort,
        close: () => new Promise(cb => {
          app.destroy();
          instance.closeAllConnections?.();
          instance.close(cb);
        })
      });
    });
    instance.on('connection', (socket) => {
      socket.setTimeout(30000);
      socket.setKeepAlive(true, 5000);
    });
    instance.on('clientError', (err, socket) => {
      if (socket && !socket.destroyed) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      }
    });

    // Intent return polling (3-second interval fallback)
    // WebSocket push available at /ws/intent for production deployments

    return {
      app,
      port: finalPort,
      close: () => new Promise(cb => {
        app.destroy();
        instance.closeAllConnections?.();
        instance.close(cb);
      })
    };
  });
}

// Auto-run if executed directly as main script
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
