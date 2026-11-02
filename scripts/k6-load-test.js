import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const intentCreationRate = new Rate('intent_creation_rate');
const clientReturnRate = new Rate('client_return_rate');
const eventPersistenceRate = new Rate('event_persistence_rate');
const dashboardUpdateRate = new Rate('dashboard_update_rate');
const callbackEnqueueRate = new Rate('callback_enqueue_rate');

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '30s', target: 500 },
    { duration: '30s', target: 1000 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{endpoint:intent_creation}': ['avg<500'],
    'http_req_duration{endpoint:client_return}': ['avg<300'],
    'http_req_duration{endpoint:payment_status}': ['avg<200'],
    'http_req_duration{endpoint:investigation}': ['avg<1000'],
    'http_req_duration{endpoint:callback_test}': ['avg<300'],
    'http_req_failed': ['rate<0.10'],
    'intent_creation_rate': ['rate>0.90'],
    'client_return_rate': ['rate>0.90'],
  },
};

const BASE_URL = 'http://localhost:6100';
const INTERNAL_TOKEN = 'internal_service_test_token_12345';
const MERCHANT_ID = '00000000-0000-0000-0000-000000000001';

function authHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${INTERNAL_TOKEN}`,
    'X-Merchant-Id': MERCHANT_ID,
    ...extra,
  };
}

function createPaymentIntent() {
  const payload = JSON.stringify({
    amount: 100, // ₹100.00 in rupees
    currency: 'INR',
    orderId: `ORD_${Date.now()}_${__VU}_${__ITER}`,
    merchantVpa: '9082843142@slc',
    returnUrl: `${BASE_URL}/checkout/success`,
    expiryMinutes: 30,
    metadata: { testRun: 'k6-load-test', vu: __VU, iter: __ITER },
  });

  const res = http.post(`${BASE_URL}/api/v1/payments/intents`, payload, {
    headers: authHeaders(),
    tags: { endpoint: 'intent_creation' },
  });

  if (__ITER < 5) {
    console.log(`DEBUG intent iter=${__ITER} vu=${__VU} status=${res.status} body=${res.body.substring(0,200)}`);
  }

  if (__ITER === 0 && __VU === 1) {
    console.log(`DEBUG: status=${res.status} body=${res.body.substring(0,300)} headers=${JSON.stringify(res.headers)}`);
  }

  const success = check(res, {
    'intent creation 201': (r) => r.status === 201,
    'intent creation has ids': (r) => {
      try {
        const b = JSON.parse(r.body);
        return !!b.paymentId && !!b.orderId && !!b.attemptId && !!b.upiUri;
      } catch { return false; }
    },
  });

  intentCreationRate.add(success);
  if (success) {
    try { return JSON.parse(res.body); } catch { return null; }
  }
  return null;
}

function submitClientReturn(paymentId, attemptId) {
  const payload = JSON.stringify({
    idempotencyKey: `return_${Date.now()}_${__VU}_${__ITER}`,
    sourcePlatform: 'ANDROID',
    appIdentity: 'Google Pay',
    rawResult: 'Status=SUCCESS&TxnRef=UTR123456789',
    parsedStatus: 'SUCCESS',
    upiTransactionReference: 'UTR123456789',
    eventTimestamp: Date.now(),
    attemptId: attemptId,
    metadata: { senderVpa: 'customer@upi', amountPaise: '10000' },
  });

  const res = http.post(`${BASE_URL}/api/v1/payments/${paymentId}/client-return`, payload, {
    headers: authHeaders({ 'Idempotency-Key': `return_${Date.now()}_${__VU}_${__ITER}` }),
    tags: { endpoint: 'client_return' },
  });

  const success = check(res, {
    'client return 200': (r) => r.status === 200,
    'client return recorded': (r) => {
      try {
        const b = JSON.parse(r.body);
        return b.status === 'CLIENT_REPORTED_SUCCESS' || b.status === 'already_reported';
      } catch { return false; }
    },
  });

  clientReturnRate.add(success);
}

function getPaymentStatus(paymentId) {
  const res = http.get(`${BASE_URL}/api/v1/payments/${paymentId}/status`, {
    headers: authHeaders(),
    tags: { endpoint: 'payment_status' },
  });

  const success = check(res, {
    'payment status 200': (r) => r.status === 200,
  });

  eventPersistenceRate.add(success);
}

function getInvestigation(paymentId) {
  const res = http.get(`${BASE_URL}/api/v1/payments/${paymentId}/investigation`, {
    headers: authHeaders(),
    tags: { endpoint: 'investigation' },
  });

  const success = check(res, {
    'investigation 200': (r) => r.status === 200,
    'investigation has timeline': (r) => {
      try {
        const b = JSON.parse(r.body);
        return Array.isArray(b.timeline);
      } catch { return false; }
    },
  });

  dashboardUpdateRate.add(success);
}

function testWebhook() {
  const payload = JSON.stringify({
    callbackUrl: `${BASE_URL}/api/v1/merchant/webhooks/test`,
    eventType: 'payment.created',
    secret: 'test_webhook_secret_key',
  });

  const res = http.post(`${BASE_URL}/api/v1/merchant/webhooks/test`, payload, {
    headers: authHeaders(),
    tags: { endpoint: 'callback_test' },
  });

  const success = check(res, {
    'webhook test 200': (r) => r.status === 200,
  });

  callbackEnqueueRate.add(success);
}

export default function () {
  group('full payment flow', () => {
    const intent = createPaymentIntent();
    if (!intent) return;

    group('submit client return', () => {
      submitClientReturn(intent.paymentId, intent.attemptId);
    });

    group('get payment status', () => {
      getPaymentStatus(intent.paymentId);
    });

    group('get investigation', () => {
      getInvestigation(intent.paymentId);
    });

    group('test webhook', () => {
      testWebhook();
    });
  });

  sleep(0.5);
}
