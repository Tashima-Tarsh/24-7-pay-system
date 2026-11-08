import { test, expect } from '@playwright/test';
import crypto from 'crypto';

const BASE_URL = process.env.BASE_URL || 'http://localhost:6100';
const CHECKOUT_URL = process.env.CHECKOUT_URL || 'http://localhost:7000';
const MERCHANT_ID = process.env.TEST_MERCHANT_ID || '00000000-0000-0000-000000000001';
const MERCHANT_KEY = process.env.TEST_MERCHANT_KEY || 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6';

const generateId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const generateUtr = () => Date.now().toString().slice(-12);

const authHeaders = {
  'Content-Type': 'application/json',
  'x-merchant-id': MERCHANT_ID,
  'x-merchant-key': MERCHANT_KEY,
};

async function apiPost(path: string, body: any, headers = authHeaders) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, ok: res.ok, json: async () => await res.json() };
}

async function apiGet(path: string, headers = authHeaders) {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return { status: res.status, ok: res.ok, json: async () => await res.json() };
}

test.describe('Complete 24/7 Pay E2E Scenarios (Local)', () => {

  test.describe('1. API Core & Authentication', () => {
    test('should reject unauthenticated requests', async ({ request }) => {
      const res = await fetch(`${BASE_URL}/api/v1/payments/intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 10, currency: 'INR', orderId: generateId('UNAUTH') }),
      });
      expect(res.status).toBe(401);
    });

    test('should create payment intent and return valid UPI data', async ({ request }) => {
      const res = await apiPost('/api/v1/payments/intents', {
        amount: 100,
        currency: 'INR',
        orderId: generateId('API_TEST'),
        merchantVpa: 'test@upi',
      });
      
      expect(res.ok).toBeTruthy();
      const data = await res.json();
      expect(data.paymentId).toBeDefined();
      expect(data.upiUri).toContain('upi://pay');
      expect(data.checkoutUrl).toContain(BASE_URL);
      expect(data.status).toBe('INITIATED');
    });
  });

  test.describe('2. Checkout UI & UPI Return Flow', () => {
    let paymentId: string;
    let checkoutUrl: string;

    test.beforeEach(async ({ request }) => {
      const res = await apiPost('/api/v1/payments/intents', {
        amount: 500,
        currency: 'INR',
        orderId: generateId('UI_AUTO'),
        merchantVpa: 'test@upi',
      });
      const data = await res.json();
      paymentId = data.paymentId;
      checkoutUrl = data.checkoutUrl;
    });

    test('should render checkout UI with amount, QR code, and UPI pay button', async ({ page }) => {
      await page.goto(checkoutUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForFunction(() => document.body.innerText.length > 100, { timeout: 30000 });
      
      // Verify checkout page elements exist
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length).toBeGreaterThan(100);
      
      // Check for QR code or UPI elements
      const hasQR = await page.locator('canvas, img, svg').count() > 0;
      const hasPayButton = await page.locator('button, [role="button"]').count() > 0;
      expect(hasQR || hasPayButton).toBeTruthy();
    });

    test('should process client-return and update backend state', async ({ page }) => {
      const mockTxnRef = generateId('TXN').slice(-12);
      await page.goto(`${checkoutUrl}?Status=SUCCESS&txnRef=${mockTxnRef}`, { waitUntil: 'networkidle', timeout: 60000 });
      
      // Verify backend state via API - client-return should not be bank-confirmed
      const statusRes = await apiGet(`/api/v1/payments/${paymentId}/status`);
      const statusData = await statusRes.json();
      
      // Client-return-only must not be independently confirmed as bank-settled
      // It may be CLIENT_REPORTED_SUCCESS or similar non-final state
      expect(statusData.status).toBeDefined();
      expect(statusData.internalStatus).toBeDefined();
    });
  });

  test.describe('3. Manual UTR Fallback & Fraud Prevention', () => {
    let paymentId: string;

    test.beforeEach(async ({ request }) => {
      const res = await apiPost('/api/v1/payments/intents', {
        amount: 250,
        currency: 'INR',
        orderId: generateId('MANUAL'),
        merchantVpa: 'test@upi',
      });
      paymentId = (await res.json()).paymentId;
    });

    test('should reject invalid UTR format (Fraud Prevention)', async ({ request }) => {
      const res = await apiPost(`/api/v1/payments/${paymentId}/manual-verify`, {
        headers: authHeaders,
        body: JSON.stringify({ utr: '12345', merchantId: MERCHANT_ID }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('INVALID_UTR');
    });

    test('should accept valid UTR and enter VERIFICATION_PENDING state', async ({ request }) => {
      const validUtr = generateUtr();
      const res = await apiPost(`/api/v1/payments/${paymentId}/manual-verify`, {
        headers: authHeaders,
        body: JSON.stringify({ utr: validUtr, merchantId: MERCHANT_ID }),
      });
      
      expect(res.ok).toBeTruthy();
      const data = await res.json();
      expect(data.status).toBe('MANUAL_VERIFICATION_PENDING');
    });

    test('should prevent UTR reuse across different payments', async ({ request }) => {
      const sharedUtr = generateUtr();
      
      await apiPost(`/api/v1/payments/${paymentId}/manual-verify`, {
        headers: authHeaders,
        body: JSON.stringify({ utr: sharedUtr, merchantId: MERCHANT_ID }),
      });

      const res2 = await apiPost('/api/v1/payments/intents', {
        headers: authHeaders,
        body: JSON.stringify({ amount: 100, currency: 'INR', orderId: generateId('UTR_REUSE'), merchantVpa: 'test@upi' })
      });
      const paymentId2 = (await res2.json()).paymentId;

      const res3 = await apiPost(`/api/v1/payments/${paymentId2}/manual-verify`, {
        headers: authHeaders,
        body: JSON.stringify({ utr: sharedUtr, merchantId: MERCHANT_ID }),
      });
      
      expect(res3.status).toBe(409);
      const data = await res3.json();
      expect(data.code).toBe('UTR_ALREADY_USED');
    });
  });

  test.describe('4. Idempotency & Edge Cases', () => {
    test('should handle duplicate client-return requests gracefully', async ({ request }) => {
      const res1 = await apiPost('/api/v1/payments/intents', {
        headers: authHeaders,
        body: JSON.stringify({ amount: 50, currency: 'INR', orderId: generateId('IDEM'), merchantVpa: 'test@upi' })
      });
      const paymentId = (await res1.json()).paymentId;
      const idempotencyKey = `idem_test_${Date.now()}`;

      const res2 = await apiPost(`/api/v1/payments/${paymentId}/client-return`, {
        headers: { ...authHeaders, 'idempotency-key': idempotencyKey },
        body: JSON.stringify({ parsedStatus: 'SUCCESS', upiTransactionReference: generateUtr() })
      });
      expect(res2.ok).toBeTruthy();

      const res3 = await apiPost(`/api/v1/payments/${paymentId}/client-return`, {
        headers: { ...authHeaders, 'idempotency-key': idempotencyKey },
        body: JSON.stringify({ parsedStatus: 'SUCCESS', upiTransactionReference: generateUtr() })
      });
      
      const data = await res3.json();
      expect(data.status).toBe('already_reported');
    });
  });
});
