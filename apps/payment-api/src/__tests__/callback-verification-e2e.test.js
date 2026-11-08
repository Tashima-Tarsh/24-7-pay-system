import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { Database, MerchantRepository, ReceivingAccountRepository, PpMerchantPaymentProfileRepository } from '@youpi/db';
import { createSignedOrderToken } from '@youpi/core/crypto/order-token';
import { createPaymentApp } from '../index.js';
import { authHeaders } from '../../../../scripts/test-support.js';

async function request(app, base, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const reqOpts = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers, ...authHeaders() },
    };
    if (body) reqOpts.body = JSON.stringify(body);
    const req = http.request(url, reqOpts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function makeToken(orderId, amountPaise, payeeVpa, fingerprintHash, createdAt = Date.now(), overrideSecret = null) {
  const payload = { order_id: orderId, amount_paise: amountPaise, payee_vpa: payeeVpa, nonce: crypto.randomUUID(), created_at: createdAt, fingerprint_hash: fingerprintHash };
  if (overrideSecret) {
    const data = JSON.stringify(payload);
    const sig = crypto.createHmac('sha256', overrideSecret).update(data, 'utf8').digest('hex');
    return Buffer.from(`${data}|${sig}`).toString('base64');
  }
  return createSignedOrderToken(payload);
}

test('end-to-end payment-callback verification against pristine DB', async (t) => {
  const db = new Database({ inMemory: true });
  await import('@youpi/db').then(({ runMigrations }) => runMigrations(db));

  const app = createPaymentApp(db);
  await new Promise((r) => app.rawServer.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.rawServer.address().port}`;

  const merchantRepo = new MerchantRepository(db);
  const accountRepo = new ReceivingAccountRepository(db);
  const profileRepo = new PpMerchantPaymentProfileRepository(db);

  const merchant = merchantRepo.getDefault() || merchantRepo.findAll()[0];
  const account = accountRepo.findActiveForMerchant(merchant.id);
  assert.ok(merchant, 'default merchant must exist');
  assert.ok(account, 'active receiving account must exist');

  profileRepo.upsert(merchant.id, {
    payeeVpa: account.upiId,
    payeeName: account.payeeName,
    payeeEmail: 'billing@test.example',
    mcc: '5411',
    orgid: null,
    intentSignKeyPem: null,
    supportPhone: null,
    isActive: true,
  });

  t.after(async () => { app.destroy(); app.rawServer.closeAllConnections(); await new Promise((r) => app.rawServer.close(r)); db.close(); });

  // ---- 1. CREATE ORDER (signed token + one-time nonce) ----
  const amountPaise = 20100;
  const orderRes = await request(app, base, 'POST', '/api/v1/orders', {
    merchant_id: merchant.id,
    amount_paise: amountPaise,
    payee_vpa: account.upiId,
    fingerprint_hash: 'fp_test_123',
  });
  assert.equal(orderRes.status, 201, 'order create should succeed: ' + JSON.stringify(orderRes.body));
  const { order_id, token, upi_uri } = orderRes.body;
  assert.ok(order_id, 'order_id returned');
  assert.ok(token, 'signed token returned');
  assert.ok(upi_uri, 'upi_uri returned');
  console.log('[E2E] order', order_id, 'token present:', !!token);

  // ---- 2. CREATE PAYMENT SESSION ----
  const sessionRes = await request(app, base, 'POST', '/api/v1/payments', {
    orderId: order_id,
    amount: String(amountPaise / 100),
    currency: 'INR',
    merchantId: merchant.id,
  }, { 'x-merchant-id': merchant.id });
  assert.equal(sessionRes.status, 201, 'session create should succeed: ' + JSON.stringify(sessionRes.body));
  const sessionId = sessionRes.body.paymentId;
  assert.ok(sessionId, 'session id returned');
  console.log('[E2E] session', sessionId);

  const fingerprintHash = 'fp_test_123';
  const returnAmount = String(amountPaise / 100);
  const now = Date.now();
  const appOpenedAt = now - 30000; // 30s in app (within 8-300s window)
  const returnedAt = now;

  // ---- 3A. AUTHENTIC CALLBACK -> SUCCESS ----
  await t.test('authentic callback marks session SUCCESS (terminal)', async () => {
    const res = await request(app, base, 'POST', `/api/v1/payments/${sessionId}/verify-callback`, {
      token,
      utr: 'SBI900000000123',
      responseCode: '00',
      amount: returnAmount,
      fingerprint: fingerprintHash,
      returnedAt,
      appOpenedAt,
    });
    assert.equal(res.status, 200, 'authentic callback: ' + JSON.stringify(res.body));
    assert.equal(res.body.verdict, 'SUCCESS', 'verdict should be SUCCESS: ' + JSON.stringify(res.body));
    assert.equal(res.body.status, 'SUCCESS');
    assert.equal(res.body.order_id, order_id);
    assert.equal(res.body.payment_id, sessionId);

    const session = app.context.sessionRepo.findById(sessionId);
    assert.equal(session.status, 'SUCCESS', 'session must be terminal SUCCESS');
    const order = app.context.db.queryOne('SELECT status FROM payment_orders WHERE id = ?', [order_id]);
    console.log('[E2E] authentic callback -> SUCCESS (session=' + session.status + ', order=' + order.status + ')');
  });

  // ---- 3B. DUPLICATE CALLBACK (same nonce+UTR) -> REJECTED ----
  await t.test('duplicate callback rejected (nonce already used / UTR already used)', async () => {
    const res = await request(app, base, 'POST', `/api/v1/payments/${sessionId}/verify-callback`, {
      token,
      utr: 'SBI900000000123',
      responseCode: '00',
      amount: returnAmount,
      fingerprint: fingerprintHash,
      returnedAt,
      appOpenedAt,
    });
    assert.equal(res.status, 409, 'duplicate callback: ' + JSON.stringify(res.body));
    assert.equal(res.body.verdict, 'REJECTED');
    assert.ok(['NONCE_ALREADY_USED', 'UTR_ALREADY_USED'].includes(res.body.code), 'expected nonce/UTR reuse code, got ' + res.body.code);

    const session = app.context.sessionRepo.findById(sessionId);
    assert.equal(session.status, 'SUCCESS', 'session must remain SUCCESS after duplicate');
    console.log('[E2E] duplicate callback -> REJECTED (' + res.body.code + '), session stays SUCCESS');
  });

  // ---- 3C. FORGED CALLBACK (bad token signature) -> REJECTED ----
  await t.test('forged callback (bad token signature) rejected', async () => {
    const badToken = makeToken(order_id, amountPaise, account.upiId, fingerprintHash, now, 'wrong-secret');
    const res = await request(app, base, 'POST', `/api/v1/payments/${sessionId}/verify-callback`, {
      token: badToken,
      utr: 'SBI900000000456',
      responseCode: '00',
      amount: returnAmount,
      fingerprint: fingerprintHash,
      returnedAt,
      appOpenedAt,
    });
    assert.equal(res.status, 401, 'forged callback: ' + JSON.stringify(res.body));
    assert.equal(res.body.verdict, 'REJECTED');
    assert.equal(res.body.code, 'INVALID_TOKEN_SIGNATURE');
    console.log('[E2E] forged callback -> REJECTED (INVALID_TOKEN_SIGNATURE)');
  });

  // ---- 3D. WRONG AMOUNT -> REJECTED ----
  await t.test('wrong amount callback rejected', async () => {
    const orderRes2 = await request(app, base, 'POST', '/api/v1/orders', {
      merchant_id: merchant.id,
      amount_paise: 50000,
      payee_vpa: account.upiId,
      fingerprint_hash: 'fp_test_123',
    });
    const order2 = orderRes2.body;
    const sessionRes2 = await request(app, base, 'POST', '/api/v1/payments', {
      orderId: order2.order_id,
      amount: '500.00',
      currency: 'INR',
      merchantId: merchant.id,
    }, { 'x-merchant-id': merchant.id });
    const session2Id = sessionRes2.body.paymentId;

    const token2 = order2.token;
    const res = await request(app, base, 'POST', `/api/v1/payments/${session2Id}/verify-callback`, {
      token: token2,
      utr: 'HDFC900000000789',
      responseCode: '00',
      amount: '999.00', // wrong amount
      fingerprint: 'fp_test_123',
      returnedAt: Date.now(),
      appOpenedAt: Date.now() - 30000,
    });
    assert.equal(res.status, 409, 'wrong amount: ' + JSON.stringify(res.body));
    assert.equal(res.body.code, 'AMOUNT_MISMATCH');

    const session2 = app.context.sessionRepo.findById(session2Id);
    assert.notEqual(session2.status, 'SUCCESS', 'session must NOT be SUCCESS on amount mismatch');
    console.log('[E2E] wrong amount -> REJECTED (AMOUNT_MISMATCH), session=' + session2.status);
  });

  // ---- 3E. WRONG SESSION / ORDER MISMATCH -> REJECTED ----
  await t.test('order/session mismatch callback rejected', async () => {
    // Order A (fresh nonce, not yet consumed)
    const orderARes = await request(app, base, 'POST', '/api/v1/orders', {
      merchant_id: merchant.id,
      amount_paise: 30000,
      payee_vpa: account.upiId,
      fingerprint_hash: 'fp_test_123',
    });
    const orderA = orderARes.body;
    // Session A (tied to order A)
    const sessionARes = await request(app, base, 'POST', '/api/v1/payments', {
      orderId: orderA.order_id,
      amount: '300.00',
      currency: 'INR',
      merchantId: merchant.id,
    }, { 'x-merchant-id': merchant.id });
    const sessionAId = sessionARes.body.paymentId;

    // Order B (different order, same amount)
    const orderBRes = await request(app, base, 'POST', '/api/v1/orders', {
      merchant_id: merchant.id,
      amount_paise: 30000,
      payee_vpa: account.upiId,
      fingerprint_hash: 'fp_test_123',
    });
    const orderB = orderBRes.body;
    // Session B (tied to order B)
    const sessionBRes = await request(app, base, 'POST', '/api/v1/payments', {
      orderId: orderB.order_id,
      amount: '300.00',
      currency: 'INR',
      merchantId: merchant.id,
    }, { 'x-merchant-id': merchant.id });
    const sessionBId = sessionBRes.body.paymentId;

    // Present Order A's fresh token against Session B -> ORDER_SESSION_MISMATCH
    const res = await request(app, base, 'POST', '/api/v1/payments/' + sessionBId + '/verify-callback', {
      token: orderA.token,
      utr: 'ICICI900000000111',
      responseCode: '00',
      amount: '300.00',
      fingerprint: 'fp_test_123',
      returnedAt: Date.now(),
      appOpenedAt: Date.now() - 30000,
    });
    assert.equal(res.status, 409, 'mismatch: ' + JSON.stringify(res.body));
    assert.equal(res.body.code, 'ORDER_SESSION_MISMATCH');

    const sessionB = app.context.sessionRepo.findById(sessionBId);
    assert.notEqual(sessionB.status, 'SUCCESS', 'session must NOT be SUCCESS on mismatch');
    console.log('[E2E] order/session mismatch -> REJECTED (ORDER_SESSION_MISMATCH)');
  });

// ---- 3F. FAILED RESPONSE CODE -> REJECTED, session FAILED not SUCCESS ----
  await t.test('failed responseCode records FAILED, never SUCCESS', async () => {
    const orderRes4 = await request(app, base, 'POST', '/api/v1/orders', {
      merchant_id: merchant.id,
      amount_paise: 40000,
      payee_vpa: account.upiId,
      fingerprint_hash: 'fp_test_123',
    });
    const order4 = orderRes4.body;
    const sessionRes4 = await request(app, base, 'POST', '/api/v1/payments', {
      orderId: order4.order_id,
      amount: '400.00',
      currency: 'INR',
      merchantId: merchant.id,
    }, { 'x-merchant-id': merchant.id });
    const session4Id = sessionRes4.body.paymentId;

    const res = await request(app, base, 'POST', `/api/v1/payments/${session4Id}/verify-callback`, {
      token: order4.token,
      utr: 'AXIS900000000222',
      responseCode: '01', // not '00' -> failed
      amount: '400.00',
      fingerprint: 'fp_test_123',
      returnedAt: Date.now(),
      appOpenedAt: Date.now() - 30000,
    });
    assert.equal(res.status, 200, 'failed callback: ' + JSON.stringify(res.body));
    assert.equal(res.body.verdict, 'REJECTED');
    assert.equal(res.body.code, 'PAYMENT_FAILED');

    const session4 = app.context.sessionRepo.findById(session4Id);
    assert.equal(session4.status, 'FAILED', 'session must be FAILED, never SUCCESS');
    console.log('[E2E] failed responseCode -> REJECTED (PAYMENT_FAILED), session=FAILED');
  });

  // ---- 3G. MALFORMED UTR -> REJECTED ----
  await t.test('malformed UTR rejected', async () => {
    const orderRes5 = await request(app, base, 'POST', '/api/v1/orders', {
      merchant_id: merchant.id,
      amount_paise: 60000,
      payee_vpa: account.upiId,
      fingerprint_hash: 'fp_test_123',
    });
    const order5 = orderRes5.body;
    const sessionRes5 = await request(app, base, 'POST', '/api/v1/payments', {
      orderId: order5.order_id,
      amount: '600.00',
      currency: 'INR',
      merchantId: merchant.id,
    }, { 'x-merchant-id': merchant.id });
    const session5Id = sessionRes5.body.paymentId;

    const res = await request(app, base, 'POST', `/api/v1/payments/${session5Id}/verify-callback`, {
      token: order5.token,
      utr: 'not-a-valid-utr!!',
      responseCode: '00',
      amount: '600.00',
      fingerprint: 'fp_test_123',
      returnedAt: Date.now(),
      appOpenedAt: Date.now() - 30000,
    });
    assert.equal(res.status, 400, 'malformed UTR: ' + JSON.stringify(res.body));
    assert.equal(res.body.code, 'MALFORMED_UTR');
    console.log('[E2E] malformed UTR -> REJECTED (MALFORMED_UTR)');
  });

  // ---- 3H. EXPIRED TOKEN -> REJECTED ----
  await t.test('expired token rejected', async () => {
    const orderRes6 = await request(app, base, 'POST', '/api/v1/orders', {
      merchant_id: merchant.id,
      amount_paise: 70000,
      payee_vpa: account.upiId,
      fingerprint_hash: 'fp_test_123',
    });
    const order6 = orderRes6.body;
    const sessionRes6 = await request(app, base, 'POST', '/api/v1/payments', {
      orderId: order6.order_id,
      amount: '700.00',
      currency: 'INR',
      merchantId: merchant.id,
    }, { 'x-merchant-id': merchant.id });
    const session6Id = sessionRes6.body.paymentId;

    // Token created 6 minutes ago -> expired (>5 min window)
    const expiredToken = makeToken(order6.order_id, 70000, account.upiId, 'fp_test_123', Date.now() - 6 * 60 * 1000);
    const res = await request(app, base, 'POST', `/api/v1/payments/${session6Id}/verify-callback`, {
      token: expiredToken,
      utr: 'KKBK900000000333',
      responseCode: '00',
      amount: '700.00',
      fingerprint: 'fp_test_123',
      returnedAt: Date.now(),
      appOpenedAt: Date.now() - 30000,
    });
    assert.ok([401, 409].includes(res.status), 'expired token: ' + JSON.stringify(res.body));
    assert.equal(res.body.verdict, 'REJECTED');
    assert.ok(['TOKEN_EXPIRED', 'INVALID_TOKEN_SIGNATURE'].includes(res.body.code), 'expected expiry/token code, got ' + res.body.code);
    console.log('[E2E] expired token -> REJECTED (' + res.body.code + ')');
  });

  // ---- 3I. REPLAY AFTER SUCCESS still rejected (session terminal) ----
  await t.test('replay after SUCCESS still rejected (terminal state guard)', async () => {
    // Create fresh order+session, succeed, then replay
    const orderRes7 = await request(app, base, 'POST', '/api/v1/orders', {
      merchant_id: merchant.id,
      amount_paise: 80000,
      payee_vpa: account.upiId,
      fingerprint_hash: 'fp_test_123',
    });
    const order7 = orderRes7.body;
    const sessionRes7 = await request(app, base, 'POST', '/api/v1/payments', {
      orderId: order7.order_id,
      amount: '800.00',
      currency: 'INR',
      merchantId: merchant.id,
    }, { 'x-merchant-id': merchant.id });
    const session7Id = sessionRes7.body.paymentId;

    // Authentic -> SUCCESS
    await request(app, base, 'POST', `/api/v1/payments/${session7Id}/verify-callback`, {
      token: order7.token,
      utr: 'UTRB900000000444',
      responseCode: '00',
      amount: '800.00',
      fingerprint: 'fp_test_123',
      returnedAt: Date.now(),
      appOpenedAt: Date.now() - 30000,
    });

    // Replay same callback
    const replay = await request(app, base, 'POST', `/api/v1/payments/${session7Id}/verify-callback`, {
      token: order7.token,
      utr: 'UTRB900000000444',
      responseCode: '00',
      amount: '800.00',
      fingerprint: 'fp_test_123',
      returnedAt: Date.now(),
      appOpenedAt: Date.now() - 30000,
    });
    assert.equal(replay.status, 409, 'replay: ' + JSON.stringify(replay.body));
    assert.equal(replay.body.verdict, 'REJECTED');
    const session7 = app.context.sessionRepo.findById(session7Id);
    assert.equal(session7.status, 'SUCCESS', 'session must remain SUCCESS');
    console.log('[E2E] replay after SUCCESS -> REJECTED, session stays SUCCESS');

    console.log('[E2E] ALL END-TO-END CALLBACK VERIFICATION SCENARIOS PASSED');
  });
});
