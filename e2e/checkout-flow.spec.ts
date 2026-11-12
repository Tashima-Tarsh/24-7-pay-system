import { test, expect } from '@playwright/test';
import crypto from 'crypto';

// Test Configuration
const MERCHANT_ID = process.env.TEST_MERCHANT_ID || '00000000-0000-0000-0000-000000000001';
const MERCHANT_KEY = process.env.TEST_MERCHANT_KEY || 'test_webhook_secret_e2e_12345';
const BASE_URL = process.env.BASE_URL || 'http://localhost:6100';

const authHeaders = {
  'Content-Type': 'application/json',
  'x-merchant-id': MERCHANT_ID,
  'x-merchant-key': MERCHANT_KEY,
};

test.describe('Pure UPI Intent Return E2E Flow', () => {
  let paymentId: string;
  let checkoutUrl: string;

  test.beforeEach(async ({ request, }) => {
    // STEP 1: Create Payment Intent via Pure API
    const orderId = `E2E_ORD_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const response = await request.post(`${BASE_URL}/api/v1/payments/intents`, {
      headers: authHeaders,
      data: {
        amount: 10,
        currency: 'INR',
        orderId: orderId,
        merchantVpa: 'test@upi',
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    paymentId = data.paymentId;
    checkoutUrl = data.checkoutUrl;
    expect(paymentId).toBeDefined();
    expect(checkoutUrl).toBeDefined();
    // The intent session is auto-activated by default so the returned checkout
    // URL is payable immediately; a busy receiving slot leaves it QUEUED.
    expect(['ACTIVE', 'QUEUED']).toContain(data.status);
  });

  test('should simulate UPI app return and update backend to CLIENT_REPORTED_SUCCESS', async ({ request }) => {
    // STEP 2: Simulate UPI App Return via client-return endpoint
    const mockTxnRef = '319283746501';
    const returnResponse = await request.post(
      `${BASE_URL}/api/v1/payments/${encodeURIComponent(paymentId)}/client-return`,
      {
        headers: {
          ...authHeaders,
          'idempotency-key': `return_${paymentId}_${mockTxnRef}`,
        },
        data: {
          sourcePlatform: 'WEB_CHECKOUT',
          parsedStatus: 'SUCCESS',
          upiTransactionReference: mockTxnRef,
          eventTimestamp: new Date().toISOString(),
        },
      }
    );

    expect(returnResponse.ok()).toBeTruthy();

    // STEP 3: Verify Backend State
    const statusResponse = await request.get(`${BASE_URL}/api/v1/payments/${paymentId}/status`, {
      headers: authHeaders,
    });

    expect(statusResponse.ok()).toBeTruthy();
    const statusData = await statusResponse.json();
    expect(statusData.status).toBe('CLIENT_REPORTED_SUCCESS');
    expect(statusData.internalStatus).toBe('CLIENT_REPORTED_SUCCESS');
  });

  test('should handle idempotency and prevent duplicate client-returns', async ({ request }) => {
    const mockTxnRef = '999888777666';
    const idempotencyKey = `return_${paymentId}_${mockTxnRef}`;

    // First client-return
    await request.post(`${BASE_URL}/api/v1/payments/${encodeURIComponent(paymentId)}/client-return`, {
      headers: {
        ...authHeaders,
        'idempotency-key': idempotencyKey,
      },
      data: {
        sourcePlatform: 'WEB_CHECKOUT',
        parsedStatus: 'SUCCESS',
        upiTransactionReference: mockTxnRef,
        eventTimestamp: new Date().toISOString(),
      },
    });

    // Duplicate client-return with same idempotency key
    const duplicateResponse = await request.post(
      `${BASE_URL}/api/v1/payments/${encodeURIComponent(paymentId)}/client-return`,
      {
        headers: {
          ...authHeaders,
          'idempotency-key': idempotencyKey,
        },
        data: {
          sourcePlatform: 'WEB_CHECKOUT',
          parsedStatus: 'SUCCESS',
          upiTransactionReference: mockTxnRef,
          eventTimestamp: new Date().toISOString(),
        },
      }
    );

    // Duplicate should be handled gracefully (not a 500 error)
    expect([200, 201, 409].includes(duplicateResponse.status())).toBeTruthy();

    // Backend state should remain CLIENT_REPORTED_SUCCESS
    const statusResponse = await request.get(`${BASE_URL}/api/v1/payments/${paymentId}/status`, {
      headers: authHeaders,
    });

    const statusData = await statusResponse.json();
    expect(statusData.status).toBe('CLIENT_REPORTED_SUCCESS');
  });

  test('should verify checkout state endpoint returns payment details', async ({ request }) => {
    // Verify checkout state endpoint works for the payment
    const stateResponse = await request.get(`${BASE_URL}/api/v1/checkout/${paymentId}/state`, {
      headers: authHeaders,
    });

    expect(stateResponse.ok()).toBeTruthy();
    const stateData = await stateResponse.json();
    expect(stateData.paymentId || stateData.id).toBe(paymentId);
    expect(stateData.orderId).toBeDefined();
    expect(stateData.amount).toBeDefined();
  });
});
