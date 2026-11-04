import { PaymentStatus } from '@youpi/common';

export class TimingEngine {
  /**
   * @param {{
   *   sessionRepo: import('@youpi/db').PaymentSessionRepository,
   *   queueEngine: import('./queue-engine.js').QueueEngine,
   *   eventEmitter?: { emit: (event: string, payload: any) => void },
   *   auditRepo?: import('@youpi/db').AuditLogRepository,
   *   activeDurationMs?: number,
   *   processingDurationMs?: number
   * }} options
   */
  constructor(options) {
    this.sessionRepo = options.sessionRepo;
    this.queueEngine = options.queueEngine;
    this.eventEmitter = options.eventEmitter || { emit: () => {} };
    this.auditRepo = options.auditRepo;
    this.activeDurationMs = options.activeDurationMs || 300000; // 5 minutes
    this.processingDurationMs = options.processingDurationMs || 30000; // 30 seconds
    this.verificationDurationMs = options.verificationDurationMs || 1800000; // 30 minutes

    /** @type {Map<string, NodeJS.Timeout>} */
    this.activeTimers = new Map();
    /** @type {Map<string, NodeJS.Timeout>} */
    this.processingTimers = new Map();
    /** @type {Map<string, NodeJS.Timeout>} */
    this.verificationTimers = new Map();
  }

  /**
   * Starts Timer 1 (5-minute payment window) for an activated session.
   * @param {string} sessionId
   * @param {Date} expiresAt
   */
  startActiveTimer(sessionId, expiresAt) {
    this.clearTimers(sessionId);

    const delayMs = Math.max(0, expiresAt.getTime() - Date.now());

    const timer = setTimeout(() => {
      this.handleActiveTimerExpiration(sessionId);
    }, delayMs);

    // Unref so timer doesn't prevent process exit if running standalone
    if (timer.unref) timer.unref();

    this.activeTimers.set(sessionId, timer);
  }

  /**
   * Executes when Timer 1 reaches 0 without customer clicking "Payment Done".
   * Transitions to EXPIRED and promotes next queued customer.
   * @param {string} sessionId
   */
  handleActiveTimerExpiration(sessionId) {
    this.activeTimers.delete(sessionId);

    const session = this.sessionRepo.findById(sessionId);
    if (!session) return;

    // Invariant: Only expire if still in ACTIVE status
    if (session.status !== PaymentStatus.ACTIVE) {
      return;
    }

    // If a UTR was already reported, do NOT expire: move to VERIFICATION_PENDING
    // and start the 30-minute verification window instead of releasing the slot.
    const metadata = typeof session.metadata === 'string' ? JSON.parse(session.metadata || '{}') : (session.metadata || {});
    if (metadata && metadata.reportedUtr) {
      const now = new Date();
      const nowIso = now.toISOString();
      const verificationExpiresAt = new Date(now.getTime() + this.verificationDurationMs).toISOString();
      this.sessionRepo.db.execute(`
        UPDATE payment_sessions
        SET status = ?, verification_expires_at = ?, updated_at = ?
        WHERE id = ? AND status = ?
      `, [PaymentStatus.VERIFICATION_PENDING, verificationExpiresAt, nowIso, sessionId, PaymentStatus.ACTIVE]);
      this.eventEmitter.emit('PAYMENT.VERIFICATION_PENDING', {
        paymentId: sessionId,
        orderId: session.orderId,
        merchantId: session.merchantId,
        amountPaise: session.amountPaise
      });
      return;
    }

    // Transition to EXPIRED and release slot
    this.sessionRepo.transitionToTerminal(sessionId, PaymentStatus.EXPIRED);

    if (this.auditRepo) {
      this.auditRepo.log({
        merchantId: session.merchantId,
        entityType: 'PAYMENT_SESSION',
        entityId: sessionId,
        action: 'PAYMENT_EXPIRED_TIMEOUT',
        actorType: 'SYSTEM',
        details: { reason: '5-minute payment window elapsed without customer clicking Payment Done' }
      });
    }

    this.eventEmitter.emit('SESSION.EXPIRED', { sessionId, receivingAccountId: session.receivingAccountId });
    this.eventEmitter.emit('PAYMENT.EXPIRED', {
      paymentId: sessionId,
      orderId: session.orderId,
      merchantId: session.merchantId,
      amountPaise: session.amountPaise
    });

    // Immediately promote next queued customer
    if (session.receivingAccountId) {
      this.queueEngine.promoteNext(session.receivingAccountId, this.activeDurationMs);
    }
  }

  /**
   * Cancel active timer for session if running.
   * @param {string} sessionId
   */
  cancelActiveTimer(sessionId) {
    const activeTimer = this.activeTimers.get(sessionId);
    if (activeTimer) {
      clearTimeout(activeTimer);
      this.activeTimers.delete(sessionId);
    }
  }

  /**
   * Customer clicked "PAYMENT DONE — CHECK MY PAYMENT".
   * 1. Cancels Timer 1 (5-minute timer).
   * 2. Starts Timer 2 (30-second processing timer).
   * 3. Customer does NOT get another 5 minutes.
   * @param {string} sessionId
   * @returns {any} Updated session in PROCESSING state
   */
  handlePaymentDone(sessionId) {
    // 1. Cancel Timer 1
    const activeTimer = this.activeTimers.get(sessionId);
    if (activeTimer) {
      clearTimeout(activeTimer);
      this.activeTimers.delete(sessionId);
    }

    // 2. Transition session to PROCESSING in DB
    const session = this.sessionRepo.transitionToProcessing(sessionId, this.processingDurationMs);

    if (this.auditRepo) {
      this.auditRepo.log({
        merchantId: session.merchantId,
        entityType: 'PAYMENT_SESSION',
        entityId: sessionId,
        action: 'CUSTOMER_CLICKED_PAYMENT_DONE',
        actorType: 'CUSTOMER',
        details: { processingExpiresAt: session.processingExpiresAt?.toISOString() }
      });
    }

    this.eventEmitter.emit('SESSION.PROCESSING', {
      sessionId,
      receivingAccountId: session.receivingAccountId,
      processingExpiresAt: session.processingExpiresAt
    });

    // 3. Start Timer 2 (30-second processing window)
    const delayMs = Math.max(0, session.processingExpiresAt.getTime() - Date.now());

    const procTimer = setTimeout(() => {
      this.handleProcessingTimerExpiration(sessionId);
    }, delayMs);

    if (procTimer.unref) procTimer.unref();
    this.processingTimers.set(sessionId, procTimer);

    return session;
  }

  /**
   * Executes when Timer 2 (30-second processing window) reaches 0 with no matching observation.
   * Releases the slot while payment confirmation remains unresolved.
   * @param {string} sessionId
   */
  handleProcessingTimerExpiration(sessionId) {
    this.processingTimers.delete(sessionId);

    const session = this.sessionRepo.findById(sessionId);
    if (!session) return;

    // Only unresolved processing sessions can time out.
    if (session.status !== PaymentStatus.PROCESSING) {
      return;
    }

    // Missing bank evidence is not a payment failure.
    this.sessionRepo.transitionToVerificationPending(sessionId);

    if (this.auditRepo) {
      this.auditRepo.log({
        merchantId: session.merchantId,
        entityType: 'PAYMENT_SESSION',
        entityId: sessionId,
        action: 'PAYMENT_VERIFICATION_PENDING',
        actorType: 'SYSTEM',
        details: { reason: '30-second verification window elapsed with no matching observation' }
      });
    }

    this.eventEmitter.emit('SESSION.VERIFICATION_PENDING', { sessionId, receivingAccountId: session.receivingAccountId });
    this.eventEmitter.emit('PAYMENT.VERIFICATION_PENDING', {
      paymentId: sessionId,
      orderId: session.orderId,
      merchantId: session.merchantId,
      amountPaise: session.amountPaise
    });

    // Immediately promote next queued customer
    if (session.receivingAccountId) {
      this.queueEngine.promoteNext(session.receivingAccountId, this.activeDurationMs);
    }
  }

  /**
   * Customer explicitly cancels the payment session during ACTIVE window.
   * Immediately releases slot and promotes next queued customer.
   * @param {string} sessionId
   */
  handleCancel(sessionId) {
    this.clearTimers(sessionId);

    const session = this.sessionRepo.findById(sessionId);
    if (!session) return null;

    if ([PaymentStatus.SUCCESS, PaymentStatus.FAILED, PaymentStatus.EXPIRED, PaymentStatus.CANCELLED, PaymentStatus.VERIFICATION_PENDING].includes(session.status)) {
      return session; // already terminal
    }

    const updated = this.sessionRepo.transitionToTerminal(sessionId, PaymentStatus.CANCELLED);

    if (this.auditRepo) {
      this.auditRepo.log({
        merchantId: session.merchantId,
        entityType: 'PAYMENT_SESSION',
        entityId: sessionId,
        action: 'PAYMENT_CANCELLED_BY_USER',
        actorType: 'CUSTOMER',
        details: { previousStatus: session.status }
      });
    }

    this.eventEmitter.emit('SESSION.CANCELLED', { sessionId, receivingAccountId: session.receivingAccountId });
    this.eventEmitter.emit('PAYMENT.CANCELLED', {
      paymentId: sessionId,
      orderId: session.orderId,
      merchantId: session.merchantId,
      amountPaise: session.amountPaise
    });

    // Immediately promote next queued customer
    if (session.receivingAccountId) {
      this.queueEngine.promoteNext(session.receivingAccountId, this.activeDurationMs);
    }

    return updated;
  }

  /**
   * Starts the verification-window timer for a VERIFICATION_PENDING session.
   * Fires at verification_expires_at to transition to EXPIRED and release the slot.
   * @param {string} sessionId
   * @param {Date} verificationExpiresAt
   */
  startVerificationTimer(sessionId, verificationExpiresAt) {
    this.clearVerificationTimer(sessionId);

    const delayMs = Math.max(0, verificationExpiresAt.getTime() - Date.now());

    const timer = setTimeout(() => {
      this.handleVerificationTimerExpiration(sessionId);
    }, delayMs);

    if (timer.unref) timer.unref();
    this.verificationTimers.set(sessionId, timer);
  }

  /**
   * Executes when the verification window elapses without bank confirmation.
   * Transitions to EXPIRED and releases the slot.
   * @param {string} sessionId
   */
  handleVerificationTimerExpiration(sessionId) {
    this.verificationTimers.delete(sessionId);

    const session = this.sessionRepo.findById(sessionId);
    if (!session) return;
    if (session.status !== PaymentStatus.VERIFICATION_PENDING) return;

    const now = new Date().toISOString();
    this.sessionRepo.transitionToTerminal(sessionId, PaymentStatus.EXPIRED);

    if (this.auditRepo) {
      this.auditRepo.log({
        merchantId: session.merchantId,
        entityType: 'PAYMENT_SESSION',
        entityId: sessionId,
        action: 'PAYMENT_VERIFICATION_EXPIRED',
        actorType: 'SYSTEM',
        details: { reason: '30-minute verification window elapsed without bank confirmation' }
      });
    }

    this.eventEmitter.emit('PAYMENT.EXPIRED', {
      paymentId: sessionId,
      orderId: session.orderId,
      merchantId: session.merchantId,
      amountPaise: session.amountPaise
    });

    if (session.receivingAccountId) {
      this.queueEngine.promoteNext(session.receivingAccountId);
    }
  }

  /** Cancel verification timer for session if running. */
  cancelVerificationTimer(sessionId) {
    const timer = this.verificationTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.verificationTimers.delete(sessionId);
    }
  }

  /**
   * Clears all in-memory timer handles for a session.
   * @param {string} sessionId
   */
  clearTimers(sessionId) {
    const act = this.activeTimers.get(sessionId);
    if (act) {
      clearTimeout(act);
      this.activeTimers.delete(sessionId);
    }

    const prc = this.processingTimers.get(sessionId);
    if (prc) {
      clearTimeout(prc);
      this.processingTimers.delete(sessionId);
    }

    const ver = this.verificationTimers.get(sessionId);
    if (ver) {
      clearTimeout(ver);
      this.verificationTimers.delete(sessionId);
    }
  }

  /**
   * Clean up all timers across all sessions (for graceful shutdown).
   */
  destroy() {
    for (const timer of this.activeTimers.values()) clearTimeout(timer);
    for (const timer of this.processingTimers.values()) clearTimeout(timer);
    for (const timer of this.verificationTimers.values()) clearTimeout(timer);
    this.activeTimers.clear();
    this.processingTimers.clear();
    this.verificationTimers.clear();
  }
}
