import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

const BASE_URL = process.env.BASE_URL || 'https://dynamo-pay-d545.onrender.com';
const MERCHANT_ID = process.env.TEST_MERCHANT_ID || '00000000-0000-0000-000000000001';
const MERCHANT_KEY = process.env.TEST_MERCHANT_KEY || 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6';

// Helper to generate unique IDs
const generateId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
// Helper to generate unique 12-digit UTR
const generateUtr = () => Date.now().toString().slice(-12);

test.describe('🚀 Complete 24/7 Pay E2E Scenarios (Live Render)', () => {
  
  test.describe('1. API Core & Authentication', () => {
    test('should reject unauthenticated requests', async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/v1/payments/intents`, {
        data: { amount: 10, currency: 'INR', orderId: generateId('UNAUTH') }
      });
      expect(res.status()).toBe(401);
    });

    test('should create payment intent and return valid UPI data', async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/v1/payments/intents`, {
        headers: { 'x-merchant-id': MERCHANT_ID, 'x-merchant-key': MERCHANT_KEY, 'Content-Type': 'application/json' },
        data: { amount: 100, currency: 'INR', orderId: generateId('API_TEST'), merchantVpa: 'test@upi' }
      });
      
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(data.paymentId).toBeDefined();
      expect(data.upiUri).toContain('upi://pay');
      expect(data.checkoutUrl).toContain(BASE_URL);
      expect(data.status).toBe('INITIATED');
    });
  });

  test.describe('2. Checkout UI & Auto UPI Return Flow', () => {
    let paymentId: string;
    let checkoutUrl: string;

    test.beforeEach(async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/v1/payments/intents`, {
        headers: { 'x-merchant-id': MERCHANT_ID, 'x-merchant-key': MERCHANT_KEY, 'Content-Type': 'application/json' },
        data: { amount: 500, currency: 'INR', orderId: generateId('UI_AUTO'), merchantVpa: 'test@upi' }
      });
      const data = await res.json();
      paymentId = data.paymentId;
      checkoutUrl = data.checkoutUrl;
    });

    test('should render checkout UI with amount, QR code, and UPI pay button', async ({ page }) => {
      await page.goto(checkoutUrl, { waitUntil: 'networkidle', timeout: 60000 });
      // Page is server-rendered HTML; verify body has content
      await page.waitForFunction(() => document.body.innerText.length > 100, { timeout: 30000 });
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).toContain('Payable');
      expect(bodyText).toContain('UPI');
      expect(bodyText).toContain('Checkout');
    });

    test('should process auto UPI app return and update backend', async ({ page, request }) => {
      const mockTxnRef = generateId('TXN').slice(-12);
      await page.goto(`${checkoutUrl}?Status=SUCCESS&txnRef=${mockTxnRef}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForFunction(() => document.body.innerText.includes('Payment Successful'), { timeout: 30000 });
      await page.waitForSelector(`text=${mockTxnRef}`, { timeout: 10000 });
      
      const statusRes = await request.get(`${BASE_URL}/api/v1/payments/${paymentId}/status`, {
        headers: { 'x-merchant-id': MERCHANT_ID, 'x-merchant-key': MERCHANT_KEY }
      });
      const statusData = await statusRes.json();
      expect(statusData.status).toBe('CLIENT_REPORTED_SUCCESS');
    });
  });

  test.describe('3. Manual UTR Fallback & Fraud Prevention', () => {
    let paymentId: string;

    test.beforeEach(async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/v1/payments/intents`, {
        headers: { 'x-merchant-id': MERCHANT_ID, 'x-merchant-key': MERCHANT_KEY, 'Content-Type': 'application/json' },
        data: { amount: 250, currency: 'INR', orderId: generateId('MANUAL'), merchantVpa: 'test@upi' }
      });
      paymentId = (await res.json()).paymentId;
    });

    test('should reject invalid UTR format (Fraud Prevention)', async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/v1/payments/${paymentId}/manual-verify`, {
        headers: { 'Content-Type': 'application/json' },
        data: { utr: '12345', merchantId: MERCHANT_ID }
      });
      expect(res.status()).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('INVALID_UTR');
    });

    test('should accept valid UTR and enter VERIFICATION_PENDING state', async ({ request }) => {
      const validUtr = generateUtr();
      const res = await request.post(`${BASE_URL}/api/v1/payments/${paymentId}/manual-verify`, {
        headers: { 'Content-Type': 'application/json' },
        data: { utr: validUtr, merchantId: MERCHANT_ID }
      });
      
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(data.status).toBe('MANUAL_VERIFICATION_PENDING');
      
      const statusRes = await request.get(`${BASE_URL}/api/v1/payments/${paymentId}/status`, {
        headers: { 'x-merchant-id': MERCHANT_ID, 'x-merchant-key': MERCHANT_KEY }
      });
      const statusData = await statusRes.json();
      expect(statusData.internalStatus).toBe('MANUAL_VERIFICATION_PENDING');
    });

    test('should prevent UTR reuse across different payments', async ({ request }) => {
      const sharedUtr = generateUtr();
      
      await request.post(`${BASE_URL}/api/v1/payments/${paymentId}/manual-verify`, {
        headers: { 'Content-Type': 'application/json' },
        data: { utr: sharedUtr, merchantId: MERCHANT_ID }
      });

      const res2 = await request.post(`${BASE_URL}/api/v1/payments/intents`, {
        headers: { 'x-merchant-id': MERCHANT_ID, 'x-merchant-key': MERCHANT_KEY, 'Content-Type': 'application/json' },
        data: { amount: 100, currency: 'INR', orderId: generateId('UTR_REUSE'), merchantVpa: 'test@upi' }
      });
      const paymentId2 = (await res2.json()).paymentId;

      const res3 = await request.post(`${BASE_URL}/api/v1/payments/${paymentId2}/manual-verify`, {
        headers: { 'Content-Type': 'application/json' },
        data: { utr: sharedUtr, merchantId: MERCHANT_ID }
      });
      
      expect(res3.status()).toBe(409);
      const data = await res3.json();
      expect(data.code).toBe('UTR_ALREADY_USED');
    });
  });

  test.describe('4. Idempotency & Edge Cases', () => {
    test('should handle duplicate client-return requests gracefully', async ({ request }) => {
      const res1 = await request.post(`${BASE_URL}/api/v1/payments/intents`, {
        headers: { 'x-merchant-id': MERCHANT_ID, 'x-merchant-key': MERCHANT_KEY, 'Content-Type': 'application/json' },
        data: { amount: 50, currency: 'INR', orderId: generateId('IDEM'), merchantVpa: 'test@upi' }
      });
      const paymentId = (await res1.json()).paymentId;
      const idempotencyKey = `idem_test_${Date.now()}`;

      const res2 = await request.post(`${BASE_URL}/api/v1/payments/${paymentId}/client-return`, {
        headers: { 
          'x-merchant-id': MERCHANT_ID, 
          'x-merchant-key': MERCHANT_KEY, 
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey 
        },
        data: { parsedStatus: 'SUCCESS', upiTransactionReference: generateUtr() }
      });
      expect(res2.ok()).toBeTruthy();

      const res3 = await request.post(`${BASE_URL}/api/v1/payments/${paymentId}/client-return`, {
        headers: { 
          'x-merchant-id': MERCHANT_ID, 
          'x-merchant-key': MERCHANT_KEY, 
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey 
        },
        data: { parsedStatus: 'SUCCESS', upiTransactionReference: generateUtr() }
      });
      
      const data = await res3.json();
      expect(data.status).toBe('already_reported');
    });
  });
});
