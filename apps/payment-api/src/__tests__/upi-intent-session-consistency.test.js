import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  Database,
  runMigrations,
  MerchantRepository,
  ReceivingAccountRepository,
  PpMerchantPaymentProfileRepository
} from '@youpi/db';
import { startServer } from '../index.js';
import { PaymentStatus } from '@youpi/common';

function request(baseUrl, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let body;
        try { body = JSON.parse(data); } catch { body = data; }
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function intentHeaders(merchant) {
  return { 'x-merchant-id': merchant.id, 'x-merchant-key': merchant.webhookSecret };
}

// The UPI intent APIs must pin the receiving account, payee, mode and reference
// on the session so the issued intent, the QR and the stable checkout URL cannot
// drift apart after a profile or account rotation.
test('UPI intent pins the authoritative receiving account and agrees with checkout state', async () => {
  const db = new Database({ inMemory: true });
  runMigrations(db);
  const merchants = new MerchantRepository(db);
  const accounts = new ReceivingAccountRepository(db);
  const profiles = new PpMerchantPaymentProfileRepository(db);

  const merchant = merchants.getDefault();
  const receiver = accounts.findActiveForMerchant(merchant.id);
  assert.ok(receiver, 'seeded merchant has an active receiving account');

  // A stale profile points somewhere else: it must not become the payee of a new order.
  profiles.upsert(merchant.id, {
    payeeVpa: 'stale-payee@okbank',
    payeeName: 'Stale Payee',
    payeeEmail: 'billing@example.test',
    mcc: '5411',
    isActive: 1
  });

  const server = await startServer(6201, db);
  const base = `http://localhost:${server.port}`;
  try {
    const created = await request(base, '/api/v1/payments/intents', {
      method: 'POST',
      headers: intentHeaders(merchant),
      body: { amount: 10, currency: 'INR', orderId: 'INTENT-CONSISTENCY-1' }
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, PaymentStatus.ACTIVE, 'intent session must be immediately payable');
    assert.equal(created.body.payeeVpa, receiver.upiId);
    assert.equal(created.body.receivingVpa, receiver.upiId);
    assert.ok(created.body.upiReference, 'UPI reference is returned');
    assert.equal(created.body.upiMode, 'MERCHANT');
    assert.equal(created.body.isMerchantEnabled, true);

    const intentParams = new URL(created.body.upiUri).searchParams;
    assert.equal(intentParams.get('pa'), receiver.upiId);
    assert.equal(intentParams.get('tr'), created.body.upiReference, 'intent tr must be the stored reference');
    assert.equal(intentParams.get('mc'), null, 'a stale profile must not declare a merchant category');

    const state = await request(base, `/api/v1/checkout/${created.body.paymentId}/state`);
    assert.equal(state.status, 200);
    assert.equal(state.body.status, PaymentStatus.ACTIVE);
    assert.equal(state.body.payeeVpa, receiver.upiId, 'checkout must keep the assigned account');
    assert.equal(state.body.upiMode, 'MERCHANT');
    assert.ok(state.body.upiUri, 'checkout must be payable immediately');
    const stateParams = new URL(state.body.upiUri).searchParams;
    assert.equal(stateParams.get('pa'), receiver.upiId);
    assert.equal(stateParams.get('am'), intentParams.get('am'));
    assert.equal(stateParams.get('tr'), created.body.upiReference, 'checkout tr must match the intent');

    const qr = await request(base, `/api/v1/checkout/${created.body.paymentId}/upi-qr`);
    assert.equal(qr.status, 200);
    const qrParams = new URL(qr.body.upiUri).searchParams;
    assert.equal(qrParams.get('pa'), receiver.upiId);
    assert.equal(qrParams.get('tr'), created.body.upiReference);

    const diagnostics = await request(base, `/api/v1/checkout/${created.body.paymentId}/diagnostics`);
    assert.equal(diagnostics.status, 200);
    assert.equal(diagnostics.body.upiRequest.payeeVpa, receiver.upiId);
    assert.equal(diagnostics.body.upiRequest.transactionReference, created.body.upiReference);
  } finally {
    await server.close();
    db.close();
  }
});

test('personal receiving account keeps NON_MERCHANT mode through intent and checkout', async () => {
  const vpa = 'intents.personal@rbl';
  const db = new Database({ inMemory: true });
  runMigrations(db);
  const merchants = new MerchantRepository(db);
  const accounts = new ReceivingAccountRepository(db);
  const profiles = new PpMerchantPaymentProfileRepository(db);

  const merchant = merchants.getDefault();
  const receiver = accounts.create({
    merchantId: merchant.id, upiId: vpa, payeeName: 'Personal Payee',
    isActive: false, isMerchantEnabled: false
  });
  accounts.activateAccount(merchant.id, receiver.id);
  // A merchant profile for the same VPA must not turn a personal account into a merchant intent.
  profiles.upsert(merchant.id, {
    payeeVpa: vpa, payeeName: 'Personal Payee', payeeEmail: 'billing@example.test',
    mcc: '5411', isActive: 1
  });

  const server = await startServer(6202, db);
  const base = `http://localhost:${server.port}`;
  try {
    const created = await request(base, '/api/v1/payments/intents', {
      method: 'POST',
      headers: intentHeaders(merchant),
      body: { amount: '12.50', currency: 'INR', orderId: 'INTENT-PERSONAL-1' }
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.payeeVpa, vpa);
    assert.equal(created.body.upiMode, 'NON_MERCHANT');
    assert.equal(created.body.isMerchantEnabled, false);

    const intentParams = new URL(created.body.upiUri).searchParams;
    assert.equal(intentParams.get('pa'), vpa);
    assert.equal(intentParams.get('am'), '12.50');
    assert.equal(intentParams.get('mc'), null, 'personal VPA must not declare a merchant category');
    assert.equal(intentParams.get('tid'), null, 'personal VPA must not declare a merchant transaction id');
    assert.equal(intentParams.get('mode'), null, 'personal VPA must not declare merchant mode');

    const state = await request(base, `/api/v1/checkout/${created.body.paymentId}/state`);
    assert.equal(state.status, 200);
    assert.equal(state.body.upiMode, 'NON_MERCHANT');
    assert.equal(state.body.isMerchantEnabled, false);
    assert.equal(state.body.payeeVpa, vpa, 'checkout must not fall back to a merchant profile VPA');
    assert.equal(new URL(state.body.upiUri).searchParams.get('pa'), vpa);
    assert.equal(new URL(state.body.upiUri).searchParams.get('tr'), created.body.upiReference);
  } finally {
    await server.close();
    db.close();
  }
});

test('retired receiving VPA is rejected and a live explicit VPA is pinned per session', async () => {
  const db = new Database({ inMemory: true });
  runMigrations(db);
  const merchants = new MerchantRepository(db);
  const accounts = new ReceivingAccountRepository(db);

  const merchant = merchants.getDefault();
  accounts.activateAccount(merchant.id, accounts.findActiveForMerchant(merchant.id).id);

  const server = await startServer(6203, db);
  const base = `http://localhost:${server.port}`;
  try {
    const retired = await request(base, '/api/v1/payments/intents', {
      method: 'POST',
      headers: intentHeaders(merchant),
      body: { amount: 10, orderId: 'INTENT-RETIRED-1', merchantVpa: '9082843142@slc' }
    });
    assert.equal(retired.status, 400);
    assert.equal(retired.body.code, 'RETIRED_RECEIVING_VPA');

    const explicitVpa = 'explicit.payee@okhdfcbank';
    const created = await request(base, '/api/v1/payments/intents', {
      method: 'POST',
      headers: intentHeaders(merchant),
      body: { amount: 15, orderId: 'INTENT-EXPLICIT-1', merchantVpa: explicitVpa }
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.payeeVpa, explicitVpa);
    assert.equal(created.body.status, PaymentStatus.ACTIVE, 'explicit live VPA checkout must still be payable');

    const state = await request(base, `/api/v1/checkout/${created.body.paymentId}/state`);
    assert.equal(state.status, 200);
    assert.equal(state.body.payeeVpa, explicitVpa, 'the session snapshot keeps the explicit payee');
    assert.equal(new URL(state.body.upiUri).searchParams.get('pa'), explicitVpa);
    assert.equal(new URL(state.body.upiUri).searchParams.get('tr'), created.body.upiReference);
  } finally {
    await server.close();
    db.close();
  }
});
