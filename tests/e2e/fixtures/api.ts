import crypto from 'node:crypto';

const PAYMENT_API_BASE = 'http://localhost:6100';
const CHECKOUT_BASE = 'http://localhost:7000';

export function paymentApi(path) {
  return `${PAYMENT_API_BASE}${path}`;
}

export function checkoutUrl(path) {
  return `${CHECKOUT_BASE}${path}`;
}

/** Generic JSON request helper. */
export async function apiRequest(method, path, body = null, headers = {}) {
  const url = paymentApi(path);
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body !== null) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { data = await res.text(); }
  return { status: res.status, ok: res.ok, headers: res.headers, body: data };
}

/** Create a merchant via the admin/payments API.
    The /api/v1/payments endpoint resolves a default merchant if x-merchant-id is omitted,
    but for E2E we insert the merchant directly in DB and then call create payment with the header.
    This helper uses the DB fixture to create the merchant, then returns the merchant object.
*/
export async function createMerchantViaDb(dbFixture, merchant) {
  // Merchant is created in DB via dbFixture.createTestMerchant.
  // We return it so tests can use its webhook_secret for HMAC.
  return merchant;
}

/** Create a payment session via POST /api/v1/payments. */
export async function createPayment(orderId, amount, merchantId, webhookSecret, returnUrl = null) {
  const body = {
    orderId,
    amount: String(amount),
    currency: 'INR',
    method: 'UPI',
    returnUrl,
    metadata: { source: 'e2e-test' },
  };
  const headers = {
    'x-merchant-id': merchantId,
    'x-merchant-key': webhookSecret,
  };
  return apiRequest('POST', '/api/v1/payments', body, headers);
}

/** Get payment session details via GET /api/v1/payments/:id (merchant-authenticated). */
export async function getPayment(paymentId, merchantId, webhookSecret) {
  return apiRequest('GET', `/api/v1/payments/${paymentId}`, null, {
    'x-merchant-id': merchantId,
    'x-merchant-key': webhookSecret,
  });
}

/** Get checkout state via GET /api/v1/checkout/:id/state. */
export async function getCheckoutState(paymentId) {
  return apiRequest('GET', `/api/v1/checkout/${encodeURIComponent(paymentId)}/state`);
}

/** Get UPI QR data via GET /api/v1/checkout/:id/upi-qr. */
export async function getUpicQr(paymentId) {
  return apiRequest('GET', `/api/v1/checkout/${encodeURIComponent(paymentId)}/upi-qr`);
}

/** Simulate a payment observation via POST /api/v1/checkout/:id/simulate-observation. */
export async function simulateObservation(paymentId, rawText, sender = 'SMS_GATEWAY', source = 'SMS') {
  return apiRequest('POST', `/api/v1/checkout/${encodeURIComponent(paymentId)}/simulate-observation`, {
    source,
    rawText,
    sender,
    isTest: true,
    testModeActive: true,
  });
}

/** Customer reports payment done via POST /api/v1/checkout/:id/payment-done. */
export async function reportPaymentDone(paymentId, utr = null, payerName = null, payerVpa = null) {
  return apiRequest('POST', `/api/v1/checkout/${encodeURIComponent(paymentId)}/payment-done`, {
    utr,
    payerName,
    payerVpa,
  });
}

/** Verify UTR via POST /api/v1/checkout/:id/verify-utr. */
export async function verifyUtr(paymentId, utr) {
  return apiRequest('POST', `/api/v1/checkout/${encodeURIComponent(paymentId)}/verify-utr`, { utr });
}

/** Generate HMAC-SHA256 signature for a webhook payload. */
export function generateHmacSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf8').digest('hex');
}

/** Build a mock provider webhook payload (Cashfree-style SUCCESS). */
export function buildProviderWebhookPayload(paymentId, orderId, amount, utr, currency = 'INR') {
  return {
    event: 'SUCCESS',
    paymentId,
    orderId,
    amount: String(amount),
    amountPaise: Math.round(Number(amount) * 100),
    currency,
    method: 'UPI',
    utr,
    completedAt: new Date().toISOString(),
    metadata: { source: 'e2e-mock-webhook' },
  };
}

/** Send a mock merchant webhook with HMAC signature to a test listener URL. */
export async function sendMockWebhook(listenerUrl, payload, secret) {
  const bodyStr = JSON.stringify(payload);
  const signature = generateHmacSignature(bodyStr, secret);
  const res = await fetch(listenerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signature,
      'X-Timestamp': String(Date.now()),
    },
    body: bodyStr,
  });
  let data = null;
  try { data = await res.json(); } catch { data = await res.text(); }
  return { status: res.status, ok: res.ok, body: data };
}

/** Wait for a condition to become true, polling every interval. */
export async function waitFor(conditionFn, { timeoutMs = 30000, intervalMs = 500, msg = 'condition' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await conditionFn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for: ${msg}`);
}
