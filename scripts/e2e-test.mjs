import http from 'node:http';

const BASE = 'http://localhost:6100';
const MERCHANT_ID = '00000000-0000-0000-0000-000000000001';
const TOKEN = 'internal_service_test_token_12345';

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + TOKEN,
    'X-Merchant-Id': MERCHANT_ID,
    ...extra
  };
}

function req(method, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const h = { ...headers(), ...extraHeaders };
    if (body) h['Content-Length'] = Buffer.byteLength(body).toString();
    const opts = { hostname: 'localhost', port: 6100, path: path, method: method, headers: h };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

async function run() {
  console.log('=== E2E Test: Full Payment Flow ===\n');

  // 1. Check compatibility
  console.log('1. GET /upi/compatibility');
  let r = await req('GET', '/api/v1/upi/compatibility');
  console.log('   Status:', r.status, '| genericIntentSupported:', JSON.parse(r.body).genericIntentSupported);

  // 2. Create payment intent
  console.log('\n2. POST /payments/intents');
  const orderId = 'E2E_' + Date.now();
  r = await req('POST', '/api/v1/payments/intents', JSON.stringify({
    amount: 250, currency: 'INR', orderId: orderId,
    merchantVpa: 'fixture-payee@upi',
    returnUrl: BASE + '/checkout/success',
    expiryMinutes: 30,
    metadata: { test: 'e2e-flow' }
  }));
  console.log('   Status:', r.status);
  const intent = JSON.parse(r.body);
  console.log('   paymentId:', intent.paymentId);
  console.log('   orderId:', intent.orderId);
  console.log('   attemptId:', intent.attemptId);
  console.log('   correlationId:', intent.correlationId);
  console.log('   amount:', intent.amount, '| currency:', intent.currency);
  console.log('   status:', intent.status);
  console.log('   upiUri:', intent.upiUri.substring(0, 60) + '...');
  const paymentId = intent.paymentId;

  // 3. Client return
  console.log('\n3. POST /payments/' + paymentId + '/client-return');
  const idemKey = 'e2e_return_' + Date.now();
  r = await req('POST', '/api/v1/payments/' + paymentId + '/client-return', JSON.stringify({
    idempotencyKey: idemKey,
    sourcePlatform: 'ANDROID',
    appIdentity: 'Google Pay',
    rawResult: 'Status=SUCCESS&TxnRef=UTR_E2E_123456',
    parsedStatus: 'SUCCESS',
    upiTransactionReference: 'UTR_E2E_123456',
    eventTimestamp: Date.now(),
    attemptId: intent.attemptId,
    metadata: { senderVpa: 'customer@upi', amountPaise: '25000' }
  }), { 'Idempotency-Key': idemKey });
  console.log('   Status:', r.status);
  const ret = JSON.parse(r.body);
  console.log('   status:', ret.status);
  console.log('   reportedStatus:', ret.reportedStatus);
  console.log('   evidenceLevel:', ret.evidenceLevel);
  console.log('   message:', ret.message);
  console.log('   upiTransactionReference:', ret.upiTransactionReference);

  // 4. Check payment status
  console.log('\n4. GET /payments/' + paymentId + '/status');
  r = await req('GET', '/api/v1/payments/' + paymentId + '/status');
  console.log('   Status:', r.status);
  const st = JSON.parse(r.body);
  console.log('   status:', st.status);
  console.log('   amount:', st.amount, '| currency:', st.currency);

  // 5. Check events
  console.log('\n5. GET /payments/' + paymentId + '/events');
  r = await req('GET', '/api/v1/payments/' + paymentId + '/events');
  console.log('   Status:', r.status);
  const ev = JSON.parse(r.body);
  console.log('   eventCount:', ev.eventCount);
  ev.events.forEach((e, i) => console.log('   event', i + 1, ':', e.eventType, '| source:', e.source, '| status:', e.status));

  // 6. Investigation
  console.log('\n6. GET /payments/' + paymentId + '/investigation');
  r = await req('GET', '/api/v1/payments/' + paymentId + '/investigation');
  console.log('   Status:', r.status);
  const inv = JSON.parse(r.body);
  console.log('   correlationStatus:', inv.correlationStatus);
  console.log('   androidReturnResult:', inv.androidReturnResult ? inv.androidReturnResult.parsedStatus : 'none');
  console.log('   duplicates:', inv.duplicateCount);
  console.log('   reconciliationException:', inv.reconciliationException ? inv.reconciliationException.type : 'none');
  console.log('   sourceHealth:', JSON.stringify(inv.sourceHealth));

  // 7. Webhook test
  console.log('\n7. POST /merchant/webhooks/test');
  r = await req('POST', '/api/v1/merchant/webhooks/test', JSON.stringify({
    callbackUrl: BASE + '/api/v1/merchant/webhooks/test',
    eventType: 'payment.created',
    secret: 'test_webhook_secret_key'
  }));
  console.log('   Status:', r.status);
  console.log('   sent:', JSON.parse(r.body).sent);

  // 8. Duplicate prevention
  console.log('\n8. Duplicate idempotency key test');
  r = await req('POST', '/api/v1/payments/' + paymentId + '/client-return', JSON.stringify({
    idempotencyKey: ret.eventId,
    sourcePlatform: 'ANDROID',
    appIdentity: 'Google Pay',
    rawResult: 'duplicate',
    parsedStatus: 'SUCCESS',
    eventTimestamp: Date.now(),
    attemptId: intent.attemptId
  }), { 'Idempotency-Key': ret.eventId });
  console.log('   Status:', r.status);
  console.log('   result:', JSON.parse(r.body).message || JSON.parse(r.body).status);

  console.log('\n=== E2E Test Complete ===');
}

run().catch(e => console.error('ERROR:', e.message));
