import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import '../../../../scripts/test-support.js';
import { Database, runMigrations, MerchantRepository, PaymentSessionRepository, ObservationRepository } from '@youpi/db';
import { WebhookEngine } from '../webhook-engine.js';

describe('Webhook SUCCESS payload fields (AC-15)', () => {
  let db, merchantRepo, sessionRepo, obsRepo, webhookEngine;
  let receiverServer, receiverPort, receivedWebhooks = [];

  before(async () => {
    db = new Database({ inMemory: true });
    runMigrations(db);
    merchantRepo = new MerchantRepository(db);
    sessionRepo = new PaymentSessionRepository(db);
    obsRepo = new ObservationRepository(db);
    webhookEngine = new WebhookEngine({ db, merchantRepo, maxRetries: 3 });

    receiverServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        receivedWebhooks.push({ headers: req.headers, body: JSON.parse(body || '{}') });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      });
    });
    await new Promise(resolve => receiverServer.listen(0, () => { receiverPort = receiverServer.address().port; resolve(); }));
  });

  after(async () => {
    await new Promise(cb => receiverServer.close(cb));
    db.close();
  });

  test('AC-15: webhook on SUCCESS carries utr and verificationTag', async () => {
    const merchant = merchantRepo.create({
      businessName: 'Hook Store', slug: 'hook-store', contactEmail: 's@example.com',
      contactPhone: '9876543210', webhookUrl: `http://localhost:${receiverPort}/webhook`,
      webhookSecret: 'test_secret_for_merchant_signatures_123'
    });

    const session = sessionRepo.create({
      merchantId: merchant.id, orderId: 'HOOK-UTR-001', amountPaise: 20000n,
      status: 'SUCCESS'
    });

    // A bank observation attributed to this session carries the UTR.
    const obs = obsRepo.create({
      receivingAccountId: '00000000-0000-0000-0000-000000000002',
      source: 'GMAIL', amountPaise: 20000n,
      bankReferenceNumber: '630414503470', observedAt: new Date(),
      fingerprintHash: 'fp-ac15',
      attributionStatus: 'ATTRIBUTED',
      attributedPaymentId: session.id
    });

    db.execute(`
      UPDATE payment_sessions
      SET verification_tag = 'UTR_VERIFIED', verification_level = 3,
          verification_sources = '["GMAIL"]', attributed_observation_id = ?,
          payer_vpa = 'payer@upi', completed_at = ?
      WHERE id = ?
    `, [obs.id, new Date().toISOString(), session.id]);

    const updated = sessionRepo.findById(session.id);

    receivedWebhooks = [];
    const result = await webhookEngine.dispatch('SUCCESS', updated);
    assert.equal(result.delivered, true);

    assert.equal(receivedWebhooks.length, 1);
    const hook = receivedWebhooks[0].body;
    const hdrs = receivedWebhooks[0].headers;
    assert.equal(hook.utr, '630414503470', 'payload carries utr');
    assert.equal(hook.verificationTag, 'UTR_VERIFIED', 'payload carries verificationTag');
    assert.equal(hook.verificationLevel, 3, 'payload carries verificationLevel');
    assert.deepEqual(hook.verificationSources, ['GMAIL'], 'payload carries verificationSources');
    assert.equal(hook.payerVpa, 'payer@upi', 'payload carries payerVpa');
    assert.equal(hdrs['x-gateway-signature'].startsWith('sha256='), true, 'HMAC-SHA256 signing preserved');
    assert.equal(hdrs['x-gateway-delivery-id'], result.deliveryId, 'X-Gateway-Delivery-Id dedupe header preserved');
  });
});
