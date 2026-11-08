# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: complete-e2e.spec.ts >> 🚀 Complete 24/7 Pay E2E Scenarios (Live Render) >> 2. Checkout UI & Auto UPI Return Flow >> should process auto UPI app return and update backend
- Location: e2e\complete-e2e.spec.ts:93:5

# Error details

```
TimeoutError: page.waitForFunction: Timeout 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]: Admin Route Not Found
```

# Test source

```ts
  1   | import { test as baseTest, expect } from '@playwright/test';
  2   | import { PlaywrightAiFixture } from '@midscene/web/playwright';
  3   | import crypto from 'crypto';
  4   | import dotenv from 'dotenv';
  5   | 
  6   | dotenv.config({ path: '.env.test' });
  7   | 
  8   | const BASE_URL = process.env.BASE_URL || 'https://dynamo-pay-d545.onrender.com';
  9   | const MERCHANT_ID = process.env.TEST_MERCHANT_ID || '00000000-0000-0000-000000000001';
  10  | const MERCHANT_KEY = process.env.TEST_MERCHANT_KEY || 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6';
  11  | 
  12  | // Extend Playwright test with Midscene AI fixtures
  13  | const test = baseTest.extend(PlaywrightAiFixture());
  14  | 
  15  | const generateId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  16  | const generateUtr = () => Date.now().toString().slice(-12);
  17  | 
  18  | const authHeaders = {
  19  |   'Content-Type': 'application/json',
  20  |   'x-merchant-id': MERCHANT_ID,
  21  |   'x-merchant-key': MERCHANT_KEY,
  22  | };
  23  | 
  24  | async function apiPost(path: string, body: any) {
  25  |   const res = await fetch(`${BASE_URL}${path}`, {
  26  |     method: 'POST',
  27  |     headers: authHeaders,
  28  |     body: JSON.stringify(body),
  29  |   });
  30  |   return { status: res.status, ok: res.ok, json: async () => await res.json() };
  31  | }
  32  | 
  33  | async function apiGet(path: string) {
  34  |   const res = await fetch(`${BASE_URL}${path}`, {
  35  |     headers: authHeaders,
  36  |   });
  37  |   return { status: res.status, ok: res.ok, json: async () => await res.json() };
  38  | }
  39  | 
  40  | test.describe('🚀 Complete 24/7 Pay E2E Scenarios (Live Render)', () => {
  41  |   
  42  |   test.describe('1. API Core & Authentication', () => {
  43  |     test('should reject unauthenticated requests', async ({ request }) => {
  44  |       const res = await fetch(`${BASE_URL}/api/v1/payments/intents`, {
  45  |         method: 'POST',
  46  |         headers: { 'Content-Type': 'application/json' },
  47  |         body: JSON.stringify({ amount: 10, currency: 'INR', orderId: generateId('UNAUTH') }),
  48  |       });
  49  |       expect(res.status).toBe(401);
  50  |     });
  51  | 
  52  |     test('should create payment intent and return valid UPI data', async ({ request }) => {
  53  |       const res = await apiPost('/api/v1/payments/intents', {
  54  |         amount: 100,
  55  |         currency: 'INR',
  56  |         orderId: generateId('API_TEST'),
  57  |         merchantVpa: 'test@upi',
  58  |       });
  59  |       
  60  |       expect(res.ok).toBeTruthy();
  61  |       const data = await res.json();
  62  |       expect(data.paymentId).toBeDefined();
  63  |       expect(data.upiUri).toContain('upi://pay');
  64  |       expect(data.checkoutUrl).toContain(BASE_URL);
  65  |       expect(data.status).toBe('INITIATED');
  66  |     });
  67  |   });
  68  | 
  69  |   test.describe('2. Checkout UI & Auto UPI Return Flow', () => {
  70  |     let paymentId: string;
  71  |     let checkoutUrl: string;
  72  | 
  73  |     test.beforeEach(async ({ request }) => {
  74  |       const res = await apiPost('/api/v1/payments/intents', {
  75  |         amount: 500,
  76  |         currency: 'INR',
  77  |         orderId: generateId('UI_AUTO'),
  78  |         merchantVpa: 'test@upi',
  79  |       });
  80  |       const data = await res.json();
  81  |       paymentId = data.paymentId;
  82  |       checkoutUrl = data.checkoutUrl;
  83  |     });
  84  | 
  85  |     test('should render checkout UI with amount, QR code, and UPI pay button', async ({ page, aiAssert }) => {
  86  |       await page.goto(checkoutUrl, { waitUntil: 'networkidle', timeout: 60000 });
  87  |       await page.waitForFunction(() => document.body.innerText.length > 100, { timeout: 30000 });
  88  |       
  89  |       // Midscene AI Assertion: Verify checkout page elements
  90  |       await aiAssert('The page shows the amount to pay, a QR code, and a Pay via UPI App button');
  91  |     });
  92  | 
  93  |     test('should process auto UPI app return and update backend', async ({ page, aiAssert, aiQuery }) => {
  94  |       const mockTxnRef = generateId('TXN').slice(-12);
  95  |       await page.goto(`${checkoutUrl}?Status=SUCCESS&txnRef=${mockTxnRef}`, { waitUntil: 'networkidle', timeout: 60000 });
  96  |       
  97  |       // Wait for frontend to process and SSE to update UI
> 98  |       await page.waitForFunction(() => document.body.innerText.includes('Payment Successful'), { timeout: 20000 });
      |                  ^ TimeoutError: page.waitForFunction: Timeout 30000ms exceeded.
  99  |       await page.waitForSelector(`text=${mockTxnRef}`, { timeout: 10000 });
  100 |       
  101 |       // Verify backend state via API
  102 |       const statusRes = await apiGet(`/api/v1/payments/${paymentId}/status`);
  103 |       const statusData = await statusRes.json();
  104 |       expect(statusData.status).toBe('CLIENT_REPORTED_SUCCESS');
  105 |     });
  106 |   });
  107 | 
  108 |   test.describe('3. Manual UTR Fallback & Fraud Prevention', () => {
  109 |     let paymentId: string;
  110 | 
  111 |     test.beforeEach(async ({ request }) => {
  112 |       const res = await apiPost('/api/v1/payments/intents', {
  113 |         amount: 250,
  114 |         currency: 'INR',
  115 |         orderId: generateId('MANUAL'),
  116 |         merchantVpa: 'test@upi',
  117 |       });
  118 |       paymentId = (await res.json()).paymentId;
  119 |     });
  120 | 
  121 |     test('should reject invalid UTR format (Fraud Prevention)', async ({ request }) => {
  122 |       const res = await apiPost(`/api/v1/payments/${paymentId}/manual-verify`, {
  123 |         headers: authHeaders,
  124 |         data: { utr: '12345', merchantId: MERCHANT_ID }
  125 |       });
  126 |       expect(res.status).toBe(400);
  127 |       const data = await res.json();
  128 |       expect(data.code).toBe('INVALID_UTR');
  129 |     });
  130 | 
  131 |     test('should accept valid UTR and enter VERIFICATION_PENDING state', async ({ request }) => {
  132 |       const validUtr = generateUtr();
  133 |       const res = await apiPost(`/api/v1/payments/${paymentId}/manual-verify`, {
  134 |         headers: authHeaders,
  135 |         data: { utr: validUtr, merchantId: MERCHANT_ID }
  136 |       });
  137 |       
  138 |       expect(res.ok).toBeTruthy();
  139 |       const data = await res.json();
  140 |       expect(data.status).toBe('MANUAL_VERIFICATION_PENDING');
  141 |       
  142 |       const statusRes = await apiGet(`/api/v1/payments/${paymentId}/status`);
  143 |       const statusData = await statusRes.json();
  144 |       expect(statusData.internalStatus).toBe('MANUAL_VERIFICATION_PENDING');
  145 |     });
  146 | 
  147 |     test('should prevent UTR reuse across different payments', async ({ request }) => {
  148 |       const sharedUtr = generateUtr();
  149 |       
  150 |       await apiPost(`/api/v1/payments/${paymentId}/manual-verify`, {
  151 |         headers: authHeaders,
  152 |         data: { utr: sharedUtr, merchantId: MERCHANT_ID }
  153 |       });
  154 | 
  155 |       const res2 = await apiPost('/api/v1/payments/intents', {
  156 |         headers: authHeaders,
  157 |         data: { amount: 100, currency: 'INR', orderId: generateId('UTR_REUSE'), merchantVpa: 'test@upi' }
  158 |       });
  159 |       const paymentId2 = (await res2.json()).paymentId;
  160 | 
  161 |       const res3 = await apiPost(`/api/v1/payments/${paymentId2}/manual-verify`, {
  162 |         headers: authHeaders,
  163 |         data: { utr: sharedUtr, merchantId: MERCHANT_ID }
  164 |       });
  165 |       
  166 |       expect(res3.status).toBe(409);
  167 |       const data = await res3.json();
  168 |       expect(data.code).toBe('UTR_ALREADY_USED');
  169 |     });
  170 |   });
  171 | 
  172 |   test.describe('4. Idempotency & Edge Cases', () => {
  173 |     test('should handle duplicate client-return requests gracefully', async ({ request }) => {
  174 |       const res1 = await apiPost('/api/v1/payments/intents', {
  175 |         headers: authHeaders,
  176 |         data: { amount: 50, currency: 'INR', orderId: generateId('IDEM'), merchantVpa: 'test@upi' }
  177 |       });
  178 |       const paymentId = (await res1.json()).paymentId;
  179 |       const idempotencyKey = `idem_test_${Date.now()}`;
  180 | 
  181 |       const res2 = await apiPost(`/api/v1/payments/${paymentId}/client-return`, {
  182 |         headers: { 
  183 |           ...authHeaders,
  184 |           'idempotency-key': idempotencyKey 
  185 |         },
  186 |         data: { parsedStatus: 'SUCCESS', upiTransactionReference: generateUtr() }
  187 |       });
  188 |       expect(res2.ok).toBeTruthy();
  189 | 
  190 |       const res3 = await apiPost(`/api/v1/payments/${paymentId}/client-return`, {
  191 |         headers: { 
  192 |           ...authHeaders,
  193 |           'idempotency-key': idempotencyKey 
  194 |         },
  195 |         data: { parsedStatus: 'SUCCESS', upiTransactionReference: generateUtr() }
  196 |       });
  197 |       
  198 |       const data = await res3.json();
```