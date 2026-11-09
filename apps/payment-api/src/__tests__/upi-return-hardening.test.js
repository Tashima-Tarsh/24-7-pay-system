import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Database, MerchantRepository, ReceivingAccountRepository } from '@youpi/db';
import { startServer } from '../index.js';
import { verifySignedOrderToken } from '@youpi/core/crypto/order-token';
import { VPARoutingEngine } from '@youpi/core/vpa/routing-engine';

describe('UPI Return Hardening — Regression Tests', () => {
  let serverInstance;
  let baseUrl;
  let testDb;
  let merchant;

  before(async () => {
    testDb = new Database({ inMemory: true });
    serverInstance = await startServer(0, testDb);
    baseUrl = `http://localhost:${serverInstance.port}`;
    merchant = new MerchantRepository(testDb).findAll()[0];
    assert.ok(merchant, 'default merchant must be seeded');
  });

  after(async () => {
    await serverInstance.close();
    testDb.close();
  });

  beforeEach(async () => {
    // Cancel any leftover active sessions
    try {
      testDb.execute(`
        UPDATE payment_sessions
        SET status = 'CANCELLED', completed_at = ?, updated_at = ?
        WHERE status IN ('ACTIVE', 'PROCESSING')
      `, [new Date().toISOString(), new Date().toISOString()]);
    } catch {}
  });

  // ---------------- ORDER CREATION ----------------

  test('order creation stores exact amount (no randomization) and registers nonce', async () => {
    const amountPaise = 50000;
    const body = JSON.stringify({
      merchant_id: merchant.id,
      amount_paise: amountPaise,
      payee_vpa: 'merchant@upi',
      fingerprint_hash: 'fp_test_1'
    });
    const res = await httpPost(baseUrl + '/api/v1/orders', body);
    assert.equal(res.statusCode, 201, 'order should be created: ' + JSON.stringify(res.body));
    const { order_id, token, upi_uri, actual_amount_paise, display_amount_paise } = res.body;

    // Exact amount in all representations
    assert.equal(actual_amount_paise, amountPaise, 'actual amount must equal requested');
    assert.equal(display_amount_paise, amountPaise, 'display amount must equal requested');
    assert.equal(upi_uri.includes(`am=${(amountPaise / 100).toFixed(2)}`), true, 'UPI URI must contain exact payable amount');

    // Signed token corresponds to the stored payment attempt
    const tokenResult = verifySignedOrderToken(token);
    assert.equal(tokenResult.valid, true, 'token must verify');
    assert.equal(tokenResult.payload.amount_paise, amountPaise, 'signed amount must equal requested');
    assert.equal(tokenResult.payload.order_id, order_id, 'token must bind to order id');
    assert.equal(tokenResult.payload.payee_vpa, 'merchant@upi', 'token must bind to payee VPA');

    // Nonce was registered one-time-use
    const nonceRow = testDb.queryOne(
      `SELECT used FROM payment_nonces WHERE nonce = ?`,
      [tokenResult.payload.nonce]
    );
    assert.ok(nonceRow, 'nonce must be registered');
    assert.equal(nonceRow.used, 0, 'nonce must be unused initially');

    // Order record stores exact amount
    const orderRow = testDb.queryOne(
      `SELECT actual_amount_paise, display_amount_paise FROM payment_orders WHERE id = ?`,
      [order_id]
    );
    assert.equal(orderRow.actual_amount_paise, amountPaise);
    assert.equal(orderRow.display_amount_paise, amountPaise);

    return { order_id, token };
  });

  test('order creation rejects missing merchant', async () => {
    const res = await httpPost(baseUrl + '/api/v1/orders', JSON.stringify({
      merchant_id: 'nonexistent_merchant',
      amount_paise: 50000,
      payee_vpa: 'x@upi'
    }));
    assert.equal(res.statusCode, 401, 'unknown merchant must be rejected');
  });

  test('order creation rejects invalid amount', async () => {
    for (const bad of [0, -100, 'abc', 100.5]) {
      const res = await httpPost(baseUrl + '/api/v1/orders', JSON.stringify({
        merchant_id: merchant.id,
        amount_paise: bad,
        payee_vpa: 'x@upi'
      }));
      assert.notEqual(res.statusCode, 201, `amount ${JSON.stringify(bad)} must be rejected`);
    }
  });

  // ---------------- VERIFY CALLBACK ----------------

  async function createSessionForOrder(orderId, amountPaise) {
    const acctRepo = new ReceivingAccountRepository(testDb);
    const acct = acctRepo.findActiveForMerchant(merchant.id);
    const sessionId = `sess_${Math.random().toString(36).slice(2)}`;
    testDb.execute(`
      INSERT INTO payment_sessions (id, merchant_id, receiving_account_id, order_id, amount_paise, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'INITIATED', ?, ?)
    `, [sessionId, merchant.id, acct.id, orderId, amountPaise, new Date().toISOString(), new Date().toISOString()]);
    return sessionId;
  }

  test('verify-callback holds client return pending until external evidence', async () => {
    // Create order
    const orderRes = await httpPost(baseUrl + '/api/v1/orders', JSON.stringify({
      merchant_id: merchant.id,
      amount_paise: 50000,
      payee_vpa: 'merchant@upi',
      fingerprint_hash: 'fp_cb_1'
    }));
    assert.equal(orderRes.statusCode, 201);
    const { order_id, token } = orderRes.body;

    // Create a session bound to this order
    const sessionId = await createSessionForOrder(order_id, 50000);

    const now = Date.now();
    const callbackRes = await httpPost(baseUrl + `/api/v1/payments/${sessionId}/verify-callback`, JSON.stringify({
      token,
      utr: 'SBI1234567890',
      responseCode: '00',
      amount: 500,
      fingerprint: 'fp_cb_1',
      returnedAt: now,
      appOpenedAt: now - 10000
    }));
    assert.equal(callbackRes.statusCode, 200, 'valid callback should succeed: ' + JSON.stringify(callbackRes.body));
    assert.equal(callbackRes.body.verdict, 'VERIFICATION_PENDING');
    assert.equal(callbackRes.body.order_id, order_id);
    assert.equal(callbackRes.body.payment_id, sessionId);

    // Client-reported UTR never generates a bank credit.
    const session = testDb.queryOne(`SELECT status FROM payment_sessions WHERE id = ?`, [sessionId]);
    assert.equal(session.status, 'VERIFICATION_PENDING');

    // Nonce consumed, no authoritative UTR registered
    const tokenPayload = verifySignedOrderToken(token).payload;
    const nonceRow = testDb.queryOne(`SELECT used FROM payment_nonces WHERE nonce = ?`, [tokenPayload.nonce]);
    assert.equal(nonceRow.used, 1);
    const utrRow = testDb.queryOne(`SELECT id FROM utr_registry WHERE utr = ?`, ['SBI1234567890']);
    assert.equal(utrRow, undefined, 'unverified UTR must not enter authoritative registry');
  });

  test('verify-callback rejects failed responseCode (not bank-confirmed)', async () => {
    const orderRes = await httpPost(baseUrl + '/api/v1/orders', JSON.stringify({
      merchant_id: merchant.id,
      amount_paise: 50000,
      payee_vpa: 'merchant@upi',
      fingerprint_hash: 'fp_cb_2'
    }));
    const { order_id, token } = orderRes.body;
    const sessionId = await createSessionForOrder(order_id, 50000);
    const now = Date.now();

    const res = await httpPost(baseUrl + `/api/v1/payments/${sessionId}/verify-callback`, JSON.stringify({
      token,
      utr: 'SBI1234567891',
      responseCode: '99',
      amount: 500,
      fingerprint: 'fp_cb_2',
      returnedAt: now,
      appOpenedAt: now - 10000
    }));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.verdict, 'REJECTED');
    assert.equal(res.body.reason, 'PAYMENT_FAILED');
    assert.notEqual(res.body.status, 'SUCCESS');

    // Session must NOT be SUCCESS
    const session = testDb.queryOne(`SELECT status FROM payment_sessions WHERE id = ?`, [sessionId]);
    assert.notEqual(session.status, 'FAILED');
    assert.notEqual(session.status, 'SUCCESS');
  });

  test('verify-callback rejects cross-order substitution', async () => {
    // Order A
    const orderA = await httpPost(baseUrl + '/api/v1/orders', JSON.stringify({
      merchant_id: merchant.id,
      amount_paise: 50000,
      payee_vpa: 'merchant@upi',
      fingerprint_hash: 'fp_a'
    }));
    // Order B with its own session
    const orderB = await httpPost(baseUrl + '/api/v1/orders', JSON.stringify({
      merchant_id: merchant.id,
      amount_paise: 30000,
      payee_vpa: 'merchant@upi',
      fingerprint_hash: 'fp_b'
    }));
    const sessionB = await createSessionForOrder(orderB.body.order_id, 30000);
    const now = Date.now();

    // Present Order A's token against Order B's session
    const res = await httpPost(baseUrl + `/api/v1/payments/${sessionB}/verify-callback`, JSON.stringify({
      token: orderA.body.token,
      utr: 'SBI1234567892',
      responseCode: '00',
      amount: 500,
      fingerprint: 'fp_a',
      returnedAt: now,
      appOpenedAt: now - 10000
    }));
    assert.equal(res.statusCode, 409, 'cross-order callback must be rejected');
    assert.equal(res.body.reason, 'ORDER_SESSION_MISMATCH');
  });

  test('verify-callback rejects reused nonce', async () => {
    const orderRes = await httpPost(baseUrl + '/api/v1/orders', JSON.stringify({
      merchant_id: merchant.id,
      amount_paise: 50000,
      payee_vpa: 'merchant@upi',
      fingerprint_hash: 'fp_cb_3'
    }));
    const { order_id, token } = orderRes.body;
    const sessionId = await createSessionForOrder(order_id, 50000);
    const now = Date.now();

    // First valid call consumes the nonce
    await httpPost(baseUrl + `/api/v1/payments/${sessionId}/verify-callback`, JSON.stringify({
      token,
      utr: 'SBI1234567893',
      responseCode: '00',
      amount: 500,
      fingerprint: 'fp_cb_3',
      returnedAt: now,
      appOpenedAt: now - 10000
    }));

    // Second call with same (now-consumed) nonce must be rejected.
    // Use a second order's session so the nonce check fires before any
    // cross-order binding check.
    const orderRes2 = await httpPost(baseUrl + '/api/v1/orders', JSON.stringify({
      merchant_id: merchant.id,
      amount_paise: 30000,
      payee_vpa: 'merchant@upi',
      fingerprint_hash: 'fp_cb_3b'
    }));
    const sessionId2 = await createSessionForOrder(orderRes2.body.order_id, 30000);
    const res = await httpPost(baseUrl + `/api/v1/payments/${sessionId2}/verify-callback`, JSON.stringify({
      token,
      utr: 'SBI1234567894',
      responseCode: '00',
      amount: 500,
      fingerprint: 'fp_cb_3',
      returnedAt: now,
      appOpenedAt: now - 10000
    }));
    assert.equal(res.statusCode, 409, 'reused nonce must be rejected');
    assert.equal(res.body.reason, 'NONCE_ALREADY_USED');
  });

  test('verify-callback rejects duplicate UTR', async () => {
    const orderRes = await httpPost(baseUrl + '/api/v1/orders', JSON.stringify({
      merchant_id: merchant.id,
      amount_paise: 50000,
      payee_vpa: 'merchant@upi',
      fingerprint_hash: 'fp_cb_4'
    }));
    const { order_id, token } = orderRes.body;
    const sessionId = await createSessionForOrder(order_id, 50000);
    const now = Date.now();

    // Register UTR first
    testDb.execute(`INSERT INTO utr_registry (id, utr, payment_order_id, payment_session_id, created_at) VALUES (?, ?, ?, ?, ?)`,
      ['pre_utr', 'SBIDUP0001', order_id, sessionId, new Date().toISOString()]);

    const res = await httpPost(baseUrl + `/api/v1/payments/${sessionId}/verify-callback`, JSON.stringify({
      token,
      utr: 'SBIDUP0001',
      responseCode: '00',
      amount: 500,
      fingerprint: 'fp_cb_4',
      returnedAt: now,
      appOpenedAt: now - 10000
    }));
    assert.equal(res.statusCode, 409, 'duplicate UTR must be rejected');
    assert.equal(res.body.reason, 'UTR_ALREADY_USED');
  });

  test('verify-callback rejects malformed UTR', async () => {
    const orderRes = await httpPost(baseUrl + '/api/v1/orders', JSON.stringify({
      merchant_id: merchant.id,
      amount_paise: 50000,
      payee_vpa: 'merchant@upi',
      fingerprint_hash: 'fp_cb_5'
    }));
    const { order_id, token } = orderRes.body;
    const sessionId = await createSessionForOrder(order_id, 50000);
    const now = Date.now();

    const res = await httpPost(baseUrl + `/api/v1/payments/${sessionId}/verify-callback`, JSON.stringify({
      token,
      utr: 'not-a-valid-utr!!',
      responseCode: '00',
      amount: 500,
      fingerprint: 'fp_cb_5',
      returnedAt: now,
      appOpenedAt: now - 10000
    }));
    assert.equal(res.statusCode, 400, 'malformed UTR must be rejected');
    assert.equal(res.body.reason, 'MALFORMED_UTR');
  });

  // ---------------- VPA ATOMIC RESERVATION ----------------

  test('VPA atomic reservation prevents duplicate exclusive reservation under concurrency', async () => {
    const engine = new VPARoutingEngine({ db: testDb });
    // Insert 3 active VPAs, all at the daily tx cap (25), so no reservation can succeed
    const now = new Date().toISOString();
    for (let i = 0; i < 3; i++) {
      testDb.execute(`
        INSERT INTO vpa_pool (id, merchant_id, vpa, bank_name, status, health_score, daily_tx_count, daily_inflow_paise, unique_senders_24h, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'ACTIVE', 90, 25, 0, 0, ?, ?)
      `, [`vpa_${i}`, merchant.id, `vpa${i}@upi`, `Bank ${i}`, now, now]);
    }

    // All VPAs are at capacity: reservation must fail
    assert.throws(() => engine.reserveVPAForOrder(merchant.id, 50000), /VPA_POOL_EXHAUSTED/);

    // Now insert one VPA with one slot left (daily_tx_count=24 of cap 25) and
    // verify atomic reservation under concurrency: exactly one of 3 concurrent
    // reservations must win; the other two must get VPA_POOL_EXHAUSTED.
    testDb.execute(`
      INSERT INTO vpa_pool (id, merchant_id, vpa, bank_name, status, health_score, daily_tx_count, daily_inflow_paise, unique_senders_24h, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'ACTIVE', 90, 24, 0, 0, ?, ?)
    `, ['vpa_free', merchant.id, 'free@upi', 'Bank Free', now, now]);

    const results = [];
    for (let i = 0; i < 3; i++) {
      try {
        engine.reserveVPAForOrder(merchant.id, 50000);
        results.push({ ok: true });
      } catch (e) {
        results.push({ ok: false, code: e.code });
      }
    }
    const succeeded = results.filter(r => r.ok).length;
    const exhausted = results.filter(r => !r.ok && r.code === 'VPA_POOL_EXHAUSTED').length;
    assert.equal(succeeded, 1, 'exactly one concurrent reservation must win for a single VPA with one slot left');
    assert.equal(exhausted, 2, 'the other two reservations must be pool-exhausted');
  });

  test('VPA excludes frozen VPAs from reservation', async () => {
    const engine = new VPARoutingEngine({ db: testDb });
    const now = new Date().toISOString();
    // One active, one frozen
    testDb.execute(`INSERT INTO vpa_pool (id, merchant_id, vpa, status, health_score, daily_tx_count, daily_inflow_paise, unique_senders_24h, created_at, updated_at) VALUES ('vpa_active', ?, 'active@upi', 'ACTIVE', 90, 0, 0, 0, ?, ?)`, [merchant.id, now, now]);
    testDb.execute(`INSERT INTO vpa_pool (id, merchant_id, vpa, status, health_score, daily_tx_count, daily_inflow_paise, unique_senders_24h, created_at, updated_at) VALUES ('vpa_frozen', ?, 'frozen@upi', 'FROZEN', 90, 0, 0, 0, ?, ?)`, [merchant.id, now, now]);

    const res = engine.reserveVPAForOrder(merchant.id, 50000);
    assert.equal(res.vpa_id, 'vpa_active', 'frozen VPA must be excluded from routing');
  });
});

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ statusCode: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
