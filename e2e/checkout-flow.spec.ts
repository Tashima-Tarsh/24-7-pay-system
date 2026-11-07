import { test, expect } from '@playwright/test';
import { ai, aiAssert, aiQuery } from '@midscene/web/playwright';
import crypto from 'crypto';

// Test Configuration
const MERCHANT_ID = process.env.TEST_MERCHANT_ID || '00000000-0000-0000-0000-0000-000000000001';
const MERCHANT_KEY = process.env.TEST_MERCHANT_KEY || 'your_test_webhook_secret';
// Payment Core API (Pure API) runs on :6100 per packages/common/src/runtime-config.js
const BASE_URL = process.env.BASE_URL || 'http://localhost:6100';
// Checkout Portal runs on :7000 per packages/common/src/runtime-config.js
const CHECKOUT_PORTAL = process.env.CHECKOUT_PORTAL_URL || 'http://localhost:7000';

// Helper to generate HMAC for API auth
function signPayload(payload: any, secret: string) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

test.describe('Pure UPI Intent Return E2E Flow', () => {
  let paymentId: string;
  let checkoutUrl: string;
  let orderId: string;

  test.beforeEach(async ({ request }) => {
    // STEP 1: API Test - Create Payment Intent
    orderId = `E2E_ORD_${Date.now()}`;
    const payload = {
      amount: 10, // ₹10 test amount
      currency: 'INR',
      orderId: orderId,
      merchantVpa: 'test@upi' // Replace with your actual test VPA
    };

    const response = await request.post(`${BASE_URL}/api/v1/payments/intents`, {
      headers: {
        'Content-Type': 'application/json',
        'x-merchant-id': MERCHANT_ID,
        'x-merchant-key': MERCHANT_KEY,
      },
      data: payload,
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    paymentId = data.paymentId;
    checkoutUrl = data.checkoutUrl;

    expect(paymentId).toBeDefined();
    expect(checkoutUrl).toBeDefined();
    expect(data.status).toBe('INITIATED');
  });

  test('should display checkout, simulate UPI return, and show success', async ({ page }) => {
    // STEP 2: UI Test - Navigate to Checkout Portal
    await page.goto(checkoutUrl);

    // Wait for the page to load and amount to be visible
    await page.waitForSelector('text=Amount to Pay', { timeout: 10000 });

    // STEP 3: Midscene AI Assertion - Verify Initial UI State
    await aiAssert(page, 'The page shows the correct amount (₹10), a QR code, and a "Pay via UPI App" button at the bottom');

    // STEP 4: Simulate UPI App Return
    const mockTxnRef = '319283746501';
    const returnUrl = `${checkoutUrl}?Status=SUCCESS&txnRef=${mockTxnRef}`;

    await page.goto(returnUrl);

    // STEP 5: Midscene AI Assertion - Verify Success State
    await page.waitForTimeout(2000); // Give SSE a moment to process

    await aiAssert(page, 'The page shows a success message, confetti animation, and a UTR reference number');

    const utrText = await aiQuery<string>(page, 'Extract the UTR reference number text');
    expect(utrText).toContain(mockTxnRef);
  });

  test('should verify backend state updated to CLIENT_REPORTED_SUCCESS', async ({ request }) => {
    // STEP 6: API Test - Verify Backend State
    const response = await request.get(`${BASE_URL}/api/v1/payments/${paymentId}/status`, {
      headers: {
        'x-merchant-id': MERCHANT_ID,
        'x-merchant-key': MERCHANT_KEY,
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data.status).toBe('CLIENT_REPORTED_SUCCESS');
    expect(data.internalStatus).toBe('CLIENT_REPORTED_SUCCESS');
  });

  test('should handle idempotency and prevent duplicate client-returns', async ({ page, request }) => {
    const returnUrl1 = `${CHECKOUT_PORTAL}/checkout/${paymentId}?Status=SUCCESS&txnRef=999888777666`;
    await page.goto(returnUrl1);
    await page.waitForTimeout(1500);

    await page.goto(returnUrl1);
    await page.waitForTimeout(1500);

    const response = await request.get(`${BASE_URL}/api/v1/payments/${paymentId}/status`, {
      headers: {
        'x-merchant-id': MERCHANT_ID,
        'x-merchant-key': MERCHANT_KEY,
      },
    });

    const data = await response.json();
    expect(data.status).toBe('CLIENT_REPORTED_SUCCESS');
  });
});
