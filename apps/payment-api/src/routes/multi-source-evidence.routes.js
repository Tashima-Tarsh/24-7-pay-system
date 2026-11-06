import { HttpServer } from '../server.js';
import { MultiSourceMatchingEngine } from '@youpi/core';

/**
 * Multi-Source Evidence Routes — Android SMS, Gmail email, Direct Bank evidence submission.
 * Any TWO sources matching → payment confirmed → ledger → callback → mobile app update.
 * Android SMS requires a bound device (device pairing via QR).
 */
export function registerMultiSourceEvidenceRoutes(server, ctx) {
  const db = ctx.db;
  const engine = new MultiSourceMatchingEngine(db);
  const deviceBindingService = ctx.deviceBindingService;

  function requireAuth(req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
  }

  // POST /api/v1/evidence/submit — submit evidence from any source
  server.post('/api/v1/evidence/submit', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { paymentId, source, sourceId, amountPaise, utr, senderVpa, payeeVpa, rawPayload, observedAt } = body;
    if (!paymentId || !source) return HttpServer.json(res, 400, { error: 'paymentId and source required' });

    const result = engine.submitEvidence({ paymentId, source, sourceId, amountPaise, utr, senderVpa, payeeVpa, rawPayload, observedAt });

    // If confirmed by 2 sources, confirm payment
    if (result.confirmed) {
      const payment = db.queryOne('SELECT * FROM payment_orders WHERE id = $1', [paymentId]);
      if (payment) {
        const acceptance = engine.evaluateAcceptance(payment.merchant_id, 'RECEIVING_VPA', payment.payee_vpa || '');
        if (!acceptance.allowed) {
          return HttpServer.json(res, 403, { error: 'Payment blocked by acceptance rule', reason: acceptance.reason });
        }
        const confirmation = await engine.confirmPayment(paymentId, payment.merchant_id, payment.amount_paise, utr, payeeVpa, senderVpa);
        return HttpServer.json(res, 200, {
          confirmed: true,
          matchCount: result.matchCount,
          requiredMatches: result.requiredMatches,
          sources: result.sources,
          ledgerEntry: confirmation.ledgerEntry,
          callbackSent: confirmation.callbackSent,
          mobileUpdated: confirmation.mobileUpdated
        });
      }
    }

    return HttpServer.json(res, 200, {
      confirmed: false,
      matchCount: result.matchCount,
      requiredMatches: result.requiredMatches,
      sources: result.sources,
      note: `Need ${result.requiredMatches - result.matchCount} more source match(es) to confirm`
    });
  });

  // GET /api/v1/evidence/:paymentId — get evidence status
  server.get('/api/v1/evidence/:paymentId', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const evidence = engine.getEvidence(params.paymentId);
    if (!evidence) return HttpServer.json(res, 404, { error: 'No evidence for this payment' });
    return HttpServer.json(res, 200, evidence);
  });

  // POST /api/v1/evidence/android-sms — Android SMS observer endpoint
  server.post('/api/v1/evidence/android-sms', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { paymentId, amountPaise, utr, senderVpa, payeeVpa, rawSms, deviceId, observedAt } = body;
    if (!paymentId) return HttpServer.json(res, 400, { error: 'paymentId required' });
    if (!deviceId) return HttpServer.json(res, 400, { error: 'deviceId required — Android device must be bound to merchant first' });

    // Verify device is bound and active for this merchant
    const payment = db.queryOne('SELECT * FROM payment_orders WHERE id = $1', [paymentId]);
    if (!payment) return HttpServer.json(res, 404, { error: 'Payment not found' });

    const isBound = deviceBindingService.isDeviceBound(payment.merchant_id, deviceId);
    if (!isBound) {
      return HttpServer.json(res, 403, {
        error: 'Android device not bound to this merchant',
        note: 'Pair the Android device via /api/v1/device/pairing/create QR code first'
      });
    }

    // Record device heartbeat
    deviceBindingService.heartbeat(deviceId);

    const result = engine.submitEvidence({
      paymentId, source: 'ANDROID_OBSERVER', sourceId: deviceId || 'android_device',
      amountPaise, utr, senderVpa, payeeVpa,
      rawPayload: { rawSms, deviceId },
      observedAt
    });

    if (result.confirmed) {
      const payment = db.queryOne('SELECT * FROM payment_orders WHERE id = $1', [paymentId]);
      if (payment) {
        const confirmation = await engine.confirmPayment(paymentId, payment.merchant_id, payment.amount_paise, utr, payeeVpa, senderVpa);
        return HttpServer.json(res, 200, {
          confirmed: true, matchCount: result.matchCount,
          sources: result.sources, ledgerEntry: confirmation.ledgerEntry,
          mobileUpdated: confirmation.mobileUpdated
        });
      }
    }
    return HttpServer.json(res, 200, {
      confirmed: false, matchCount: result.matchCount,
      requiredMatches: result.requiredMatches,
      note: `Android SMS evidence recorded. Need ${result.requiredMatches - result.matchCount} more match(es).`
    });
  });

  // POST /api/v1/evidence/gmail-email — Gmail email adapter endpoint
  server.post('/api/v1/evidence/gmail-email', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { paymentId, amountPaise, utr, senderVpa, payeeVpa, emailSubject, emailFrom, messageId, observedAt } = body;
    if (!paymentId) return HttpServer.json(res, 400, { error: 'paymentId required' });

    const result = engine.submitEvidence({
      paymentId, source: 'GMAIL', sourceId: messageId || emailFrom,
      amountPaise, utr, senderVpa, payeeVpa,
      rawPayload: { subject: emailSubject, from: emailFrom, messageId },
      observedAt
    });

    if (result.confirmed) {
      const payment = db.queryOne('SELECT * FROM payment_orders WHERE id = $1', [paymentId]);
      if (payment) {
        const confirmation = await engine.confirmPayment(paymentId, payment.merchant_id, payment.amount_paise, utr, payeeVpa, senderVpa);
        return HttpServer.json(res, 200, {
          confirmed: true, matchCount: result.matchCount,
          sources: result.sources, ledgerEntry: confirmation.ledgerEntry,
          mobileUpdated: confirmation.mobileUpdated
        });
      }
    }
    return HttpServer.json(res, 200, {
      confirmed: false, matchCount: result.matchCount,
      requiredMatches: result.requiredMatches,
      note: `Gmail email evidence recorded. Need ${result.requiredMatches - result.matchCount} more match(es).`
    });
  });

  // POST /api/v1/evidence/direct-bank — direct bank webhook endpoint
  server.post('/api/v1/evidence/direct-bank', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { paymentId, amountPaise, utr, senderVpa, payeeVpa, bankReference, rawPayload, observedAt } = body;
    if (!paymentId) return HttpServer.json(res, 400, { error: 'paymentId required' });

    const result = engine.submitEvidence({
      paymentId, source: 'DIRECT_BANK', sourceId: bankReference || 'bank_webhook',
      amountPaise, utr, senderVpa, payeeVpa,
      rawPayload: rawPayload || {},
      observedAt
    });

    if (result.confirmed) {
      const payment = db.queryOne('SELECT * FROM payment_orders WHERE id = $1', [paymentId]);
      if (payment) {
        const confirmation = await engine.confirmPayment(paymentId, payment.merchant_id, payment.amount_paise, utr, payeeVpa, senderVpa);
        return HttpServer.json(res, 200, {
          confirmed: true, matchCount: result.matchCount,
          sources: result.sources, ledgerEntry: confirmation.ledgerEntry,
          mobileUpdated: confirmation.mobileUpdated
        });
      }
    }
    return HttpServer.json(res, 200, {
      confirmed: false, matchCount: result.matchCount,
      requiredMatches: result.requiredMatches,
      note: `Direct bank evidence recorded. Need ${result.requiredMatches - result.matchCount} more match(es).`
    });
  });

  // GET /api/v1/mobile-status/:paymentId — mobile app loads amount + status
  server.get('/api/v1/mobile-status/:paymentId', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const row = db.queryOne(
      `SELECT mas.payment_id, mas.merchant_id, mas.status, mas.amount_paise, mas.updated_at,
              po.order_id, po.payee_vpa
       FROM mobile_app_status mas
       LEFT JOIN payment_orders po ON po.id = mas.payment_id
       WHERE mas.payment_id = $1`,
      [params.paymentId]
    );
    if (!row) return HttpServer.json(res, 404, { error: 'No mobile status for this payment' });
    return HttpServer.json(res, 200, {
      paymentId: row.payment_id, merchantId: row.merchant_id, status: row.status,
      amountPaise: row.amount_paise, orderId: row.order_id, payeeVpa: row.payee_vpa,
      updatedAt: row.updated_at
    });
  });
}
