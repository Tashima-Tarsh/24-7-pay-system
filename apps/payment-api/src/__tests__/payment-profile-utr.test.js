import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Database, runMigrations, MerchantRepository, ReceivingAccountRepository, PpMerchantPaymentProfileRepository, PaymentSessionRepository } from '@youpi/db';
import { startServer } from '../index.js';
import { PaymentStatus, isValidVpa } from '@youpi/common';

function request(baseUrl, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOpts = {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    };
    const req = http.request(url, reqOpts, res => {
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

test('active legacy merchant backfills a payer-visible payment profile on first payment', async () => {
  const testDb = new Database({ inMemory: true });
  runMigrations(testDb);
  const merchantRepo = new MerchantRepository(testDb);
  const accountRepo = new ReceivingAccountRepository(testDb);
  const ppRepo = new PpMerchantPaymentProfileRepository(testDb);
  const merchant = merchantRepo.getDefault();
  const account = accountRepo.findActiveForMerchant(merchant.id);
  assert.equal(ppRepo.findByMerchantId(merchant.id), null);

  const server = await startServer(0, testDb);
  const baseUrl = `http://localhost:${server.port}`;
  try {
    const created = await request(baseUrl, '/api/v1/payments', {
      method: 'POST', body: { orderId: 'PROFILE-BACKFILL-1', amount: '2.00', autoActivate: true }
    });
    assert.equal(created.status, 201);
    const profile = ppRepo.findActiveByMerchantId(merchant.id);
    assert.ok(profile);
    assert.equal(profile.payeeVpa, account.upiId);
    assert.equal(profile.payeeEmail, merchant.contactEmail);
  } finally {
    await server.close();
    testDb.close();
  }
});

test('configured test VPA applies only to payment sessions created while it is enabled', async () => {
  const previous = process.env.DYNAMO_TEST_RECEIVING_VPA;
  delete process.env.DYNAMO_TEST_RECEIVING_VPA;
  const testDb = new Database({ inMemory: true });
  runMigrations(testDb);
  const merchantRepo = new MerchantRepository(testDb);
  const accountRepo = new ReceivingAccountRepository(testDb);
  const merchant = merchantRepo.getDefault();
  const account = accountRepo.findActiveForMerchant(merchant.id);
  const server = await startServer(6196, testDb);
  const baseUrl = `http://localhost:${server.port}`;

  try {
    const beforeOverride = await request(baseUrl, '/api/v1/payments', {
      method: 'POST', body: { orderId: 'VPA-BEFORE-OVERRIDE', amount: '2.00', autoActivate: true }
    });
    assert.equal(beforeOverride.status, 201);

    process.env.DYNAMO_TEST_RECEIVING_VPA = 'sanbo67326.ibz@icici';
    const whileEnabled = await request(baseUrl, '/api/v1/payments', {
      method: 'POST', body: { orderId: 'VPA-WHILE-OVERRIDE', amount: '2.00', autoActivate: true }
    });
    assert.equal(whileEnabled.status, 201);

    const existingState = await request(baseUrl, `/api/v1/checkout/${beforeOverride.body.paymentId}/state`);
    assert.equal(existingState.status, 200);
    assert.equal(existingState.body.payeeVpa, account.upiId);

    const testState = await request(baseUrl, `/api/v1/checkout/${whileEnabled.body.paymentId}/state`);
    assert.equal(testState.status, 200);
    assert.equal(testState.body.payeeVpa, 'sanbo67326.ibz@icici');
  } finally {
    if (previous === undefined) delete process.env.DYNAMO_TEST_RECEIVING_VPA;
    else process.env.DYNAMO_TEST_RECEIVING_VPA = previous;
    await server.close();
    testDb.close();
  }
});

test('AC-4/AC-5/AC-6/AC-13: payment-done UTR validation, conflict, no-deviceId, state payload', async () => {
  const testDb = new Database({ inMemory: true });
  runMigrations(testDb);
  const merchantRepo = new MerchantRepository(testDb);
  const accountRepo = new ReceivingAccountRepository(testDb);
  const ppRepo = new PpMerchantPaymentProfileRepository(testDb);
  const sessionRepo = new PaymentSessionRepository(testDb);

  const merchant = merchantRepo.findAll()[0];
  assert.ok(merchant, 'seeded demo merchant');
  const accounts = accountRepo.findByMerchantId(merchant.id);
  assert.ok(accounts.length > 0, 'demo receiving account');
  const vpa = accounts[0].upiId;

  // PART 1: activate a payment profile pointing at the merchant's own VPA
  ppRepo.upsert(merchant.id, {
    payeeVpa: vpa,
    payeeName: 'Test Merchant',
    payeeEmail: 'billing@test.example',
    mcc: '5411',
    orgid: null,
    intentSignKeyPem: null,
    supportPhone: null,
    isActive: 1
  });

  const server = await startServer(6197, testDb);
  const baseUrl = `http://localhost:${server.port}`;
  try {
    // AC-6: payment creation works with no deviceId / no customer; 503 only when no profile
    const created = await request(baseUrl, '/api/v1/payments', {
      method: 'POST', body: { orderId: 'UTR-ORD-1', amount: '100.00', autoActivate: true }
    });
    assert.equal(created.status, 201, 'payment creation must succeed with active profile');
    assert.equal(created.body.status, PaymentStatus.ACTIVE);
    const paymentId = created.body.paymentId;

    // AC-13: state payload exposes payment identity, but not private merchant email.
    const state = await request(baseUrl, `/api/v1/checkout/${paymentId}/state`);
    assert.equal(state.status, 200);
    assert.equal(state.body.payeeVpa, vpa);
    assert.equal(state.body.payeeName, 'Test Merchant');
    assert.equal(state.body.payeeEmail, undefined);
    assert.equal(state.body.copyVpa, vpa);
    assert.ok(state.body.upiUri, 'upiUri present');
    assert.ok(state.body.upiQr, 'upiQr present');
    const qr=await request(baseUrl,`/api/v1/checkout/${paymentId}/upi-qr`);
    assert.equal(qr.status,200,'active checkout must expose QR and app links');
    assert.ok(qr.body.upiQr.startsWith('data:image/svg+xml;base64,'));
    assert.ok(qr.body.upiDeepLinks.gpay.startsWith('intent://pay?'));
    assert.ok(qr.body.upiDeepLinks.phonepe.includes('package=com.phonepe.app'));
    assert.ok(qr.body.upiDeepLinks.paytm.includes('package=net.one97.paytm'));
    assert.equal(new URL(qr.body.upiUri).searchParams.get('am'),'100.00');

    const upiQuery = new URL(state.body.upiUri).searchParams;
    assert.equal(upiQuery.get('tr'), 'UTRORD1');
    assert.equal(upiQuery.get('cu'), 'INR');
    assert.equal(upiQuery.get('mc'), null, 'Unknown merchant MCC must not be fabricated');
    assert.equal(upiQuery.get('pn'),'Test Merchant');
    assert.equal(upiQuery.get('mode'),null,'P2P checkout must not declare merchant mode');
    assert.equal(new URL(qr.body.upiUri).searchParams.get('tr'),upiQuery.get('tr'),'Fallback QR must use the same reference');

    // AC-4: 11-digit UTR -> 400 INVALID_UTR
    const bad = await request(baseUrl, `/api/v1/checkout/${paymentId}/payment-done`, {
      method: 'POST', body: { utr: '12345678901' }
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'INVALID_UTR');

    // AC-4 / AC-6: 12-digit UTR, no deviceId -> 200 VERIFICATION_PENDING
    const done = await request(baseUrl, `/api/v1/checkout/${paymentId}/payment-done`, {
      method: 'POST', body: { utr: '630414503470' }
    });
    assert.equal(done.status, 200);
    assert.equal(done.body.status, PaymentStatus.VERIFICATION_PENDING);
    assert.equal(done.body.utr, '630414503470');
    assert.equal(done.body.payeeVpa, vpa);
    assert.equal(done.body.payeeName, 'Test Merchant');
    assert.equal(done.body.payeeEmail, undefined);
    assert.equal(sessionRepo.findById(paymentId).status, PaymentStatus.VERIFICATION_PENDING);

    // AC-5: same UTR on a second session -> 409 UTR_ALREADY_CLAIMED
    const created2 = await request(baseUrl, '/api/v1/payments', {
      method: 'POST', body: { orderId: 'UTR-ORD-2', amount: '100.00', autoActivate: true }
    });
    assert.equal(created2.status, 201);
    const conflict = await request(baseUrl, `/api/v1/checkout/${created2.body.paymentId}/payment-done`, {
      method: 'POST', body: { utr: '630414503470' }
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, 'UTR_ALREADY_CLAIMED');

  } finally {
    await server.close();
    testDb.close();
  }
});

test('platform payment checkout keeps the VPA captured when the order was created',async()=>{
 const db=new Database({inMemory:true});runMigrations(db);
 const merchants=new MerchantRepository(db),receivers=new ReceivingAccountRepository(db),sessions=new PaymentSessionRepository(db),profiles=new PpMerchantPaymentProfileRepository(db);
 const merchant=merchants.getDefault(),receiver=receivers.findActiveForMerchant(merchant.id);
 const order=sessions.create({merchantId:merchant.id,receivingAccountId:receiver.id,orderId:'SNAPSHOT-CHECKOUT-1',amountPaise:100n,currency:'INR',method:'UPI',status:PaymentStatus.ACTIVE,metadata:{platform:true,receivingAccountSnapshot:{id:receiver.id,upiId:receiver.upiId,payeeName:receiver.payeeName}}});
 profiles.upsert(merchant.id,{payeeVpa:'different-receiver@okbank',payeeName:'Different Receiver',payeeEmail:'billing@example.test',mcc:'5411',isActive:1});
 const server=await startServer(0,db);
 try{
  const state=await request('http://localhost:'+server.port,'/api/v1/checkout/'+order.id+'/state');
  assert.equal(state.status,200);
  assert.equal(state.body.payeeVpa,receiver.upiId);
  assert.equal(new URL(state.body.upiUri).searchParams.get('pa'),receiver.upiId);
 }finally{await server.close();db.close();}
});

test('RBL receiving VPA is the same in checkout, QR and Android app intents despite stale profile', async () => {
  const vpa = 'reportid4705.arthpay@rbl';
  assert.equal(isValidVpa(vpa), true, 'RBL merchant VPA must pass syntax validation');
  const db = new Database({ inMemory: true });
  runMigrations(db);
  const merchants = new MerchantRepository(db);
  const accounts = new ReceivingAccountRepository(db);
  const profiles = new PpMerchantPaymentProfileRepository(db);
  const sessions = new PaymentSessionRepository(db);
  const merchant = merchants.getDefault();
  const account = accounts.create({
    merchantId: merchant.id, upiId: vpa, payeeName: 'Arthpay',
    isActive: true, isMerchantEnabled: true
  });
  profiles.upsert(merchant.id, {
    payeeVpa: 'obsolete-payee@okbank', payeeName: 'Old Payee',
    payeeEmail: 'billing@example.test', mcc: '5411', isActive: 1
  });
  const session = sessions.create({
    merchantId: merchant.id, receivingAccountId: account.id,
    orderId: 'RBL-CHECKOUT-CONSISTENCY', amountPaise: 100n, currency: 'INR',
    method: 'UPI', status: PaymentStatus.ACTIVE,
    metadata: { receivingAccountSnapshot: {
      id: account.id, upiId: vpa, payeeName: 'Arthpay', isMerchantEnabled: true
    }}
  });
  const server = await startServer(6198, db);
  try {
    const base = 'http://localhost:' + server.port;
    const state = await request(base, '/api/v1/checkout/' + session.id + '/state');
    assert.equal(state.status, 200);
    assert.equal(state.body.payeeVpa, vpa);
    assert.equal(state.body.copyVpa, vpa);
    assert.equal(state.body.payeeName, 'Arthpay');
    const qrParams = new URL(state.body.upiUri).searchParams;
    assert.equal(qrParams.get('pa'), vpa);
    assert.equal(qrParams.get('am'), '1.00');
    for (const app of ['gpay', 'phonepe']) {
      const link = state.body.upiDeepLinks[app];
      assert.ok(link?.startsWith('intent://pay?'), app + ' intent is missing');
      const params = new URLSearchParams(link.split('?')[1].split('#Intent')[0]);
      assert.equal(params.get('pa'), vpa, app + ' destination differs from QR');
      assert.equal(params.get('am'), qrParams.get('am'), app + ' amount differs from QR');
    }
  } finally {
    await server.close();
    db.close();
  }
});
