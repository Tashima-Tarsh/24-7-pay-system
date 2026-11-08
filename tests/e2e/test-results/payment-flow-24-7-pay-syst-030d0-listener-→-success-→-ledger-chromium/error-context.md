# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: payment-flow.spec.ts >> 24-7-pay-system E2E Payment Flow >> completes full UPI payment flow: create → checkout → listener → success → ledger
- Location: payment-flow.spec.ts:76:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=ORD-E2E-SUCCESS-001')
Expected: visible
Error: strict mode violation: locator('text=ORD-E2E-SUCCESS-001') resolved to 2 elements:
    1) <div id="dpOrderId" class="dp-order-id">Order #ORD-E2E-SUCCESS-001</div> aka locator('#dpOrderId')
    2) <span id="dpPayeeOrder" class="dp-payee-order">Order #ORD-E2E-SUCCESS-001</span> aka locator('#dpPayeeOrder')

Call log:
  - Expect "toBeVisible" locator('text=ORD-E2E-SUCCESS-001') with timeout 10000ms
  - waiting for locator('text=ORD-E2E-SUCCESS-001')

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { createServer } from 'node:http';
  3   | import {
  4   |   resetDb,
  5   |   closeDb,
  6   |   createTestMerchant,
  7   |   createReceivingAccount,
  8   |   createTestCustomer,
  9   |   createPaymentSession,
  10  |   insertObservation,
  11  |   getLedgerEntriesForOrder,
  12  |   getPaymentSession,
  13  |   getWebhookDeliveries,
  14  |   getAuditLogs,
  15  |   ensureLedgerAccounts,
  16  | } from './fixtures/db.ts';
  17  | import {
  18  |   createPayment,
  19  |   getPayment,
  20  |   getCheckoutState,
  21  |   getUpicQr,
  22  |   simulateObservation,
  23  |   reportPaymentDone,
  24  |   verifyUtr,
  25  |   sendMockWebhook,
  26  |   buildProviderWebhookPayload,
  27  |   generateHmacSignature,
  28  |   waitFor,
  29  | } from './fixtures/api.ts';
  30  | import { TEST_MERCHANT, PAYMENT_FIXTURES, MOCK_UTRS, generateHmacTestPair, expectedLedgerEntries } from './fixtures/test-data.ts';
  31  | 
  32  | const WEBHOOK_LISTENER_URL = 'http://localhost:9999/webhook/e2e';
  33  | 
  34  | let webhookCalls: Array<{ url: string; method: string; headers: any; body: string }> = [];
  35  | 
  36  | test.describe('24-7-pay-system E2E Payment Flow', () => {
  37  | 
  38  |   test.beforeAll(async () => {
  39  |     resetDb();
  40  |     // Create merchant and receiving account in DB
  41  |     (TEST_MERCHANT as any).merchant = createTestMerchant(TEST_MERCHANT);
  42  |     (TEST_MERCHANT as any).receivingAccount = createReceivingAccount(TEST_MERCHANT.merchantId);
  43  |     (TEST_MERCHANT as any).customer = createTestCustomer();
  44  |     ensureLedgerAccounts(TEST_MERCHANT.merchantId);
  45  | 
  46  |     // Start a mock webhook listener to capture merchant callbacks
  47  |     const server = createServer((req, res) => {
  48  |       let body = '';
  49  |       req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
  50  |       req.on('end', () => {
  51  |         webhookCalls.push({
  52  |           url: req.url || '',
  53  |           method: req.method || '',
  54  |           headers: req.headers,
  55  |           body,
  56  |         });
  57  |         res.writeHead(200, { 'Content-Type': 'application/json' });
  58  |         res.end(JSON.stringify({ received: true }));
  59  |       });
  60  |     });
  61  |     server.listen(9999, '127.0.0.1');
  62  |     webhookCalls = [];
  63  |   });
  64  | 
  65  |   test.afterAll(async () => {
  66  |     closeDb();
  67  |   });
  68  | 
  69  |   test.beforeEach(async () => {
  70  |     webhookCalls = [];
  71  |   });
  72  | 
  73  |   // ------------------------------------------------------------------
  74  |   // Happy path: full UPI payment flow with listener simulation
  75  |   // ------------------------------------------------------------------
  76  |   test('completes full UPI payment flow: create → checkout → listener → success → ledger', async ({ page }) => {
  77  |     const { merchantId, webhookSecret } = TEST_MERCHANT;
  78  |     const fx = PAYMENT_FIXTURES.success;
  79  | 
  80  |     // 1. Create payment via API
  81  |     const createRes = await createPayment(fx.orderId, fx.amount, merchantId, webhookSecret);
  82  |     expect(createRes.status).toBe(201);
  83  |     expect(createRes.body.paymentId).toBeTruthy();
  84  |     expect(createRes.body.orderId).toBe(fx.orderId);
  85  |     expect(createRes.body.amount).toBe(fx.amount);
  86  |     expect(['QUEUED', 'ACTIVE']).toContain(createRes.body.status);
  87  |     expect(createRes.body.checkoutUrl).toContain(`/checkout/${createRes.body.paymentId}`);
  88  | 
  89  |     const paymentId = createRes.body.paymentId;
  90  | 
  91  |     // 2. Verify payment session in DB
  92  |     const session = getPaymentSession(paymentId);
  93  |     expect(session).toBeTruthy();
  94  |     expect(session.order_id).toBe(fx.orderId);
  95  |     expect(Number(session.amount_paise)).toBe(fx.amountPaise);
  96  | 
  97  |     // 3. Open checkout page in browser
  98  |     await page.goto(`/checkout/${paymentId}`, { waitUntil: 'networkidle' });
  99  | 
  100 |     // 4. Verify checkout page loads with payment details
> 101 |     await expect(page.locator('text=' + fx.orderId)).toBeVisible();
      |                                                      ^ Error: expect(locator).toBeVisible() failed
  102 |     await expect(page.locator('text=' + fx.amount)).toBeVisible();
  103 | 
  104 |     // 5. Extract UPI intent URL from the checkout state API
  105 |     const stateRes = await getCheckoutState(paymentId);
  106 |     expect(stateRes.status).toBe(200);
  107 |     const upiUri = stateRes.body.upiUri;
  108 |     expect(upiUri).toBeTruthy();
  109 |     expect(upiUri).toStartWith('upi://pay');
  110 |     expect(upiUri).toContain((TEST_MERCHANT as any).receivingAccount.upi_id);
  111 |     expect(upiUri).toContain(fx.orderId);
  112 | 
  113 |     // Also verify QR code image is present on the page
  114 |     const qrSvg = page.locator('.ypg-qr-image-box svg');
  115 |     await expect(qrSvg).toBeVisible();
  116 | 
  117 |     // 6. Mock listener webhook: simulate SMS/Gmail payment detection
  118 |     insertObservation(merchantId, (TEST_MERCHANT as any).receivingAccount.id, {
  119 |       amountPaise: fx.amountPaise,
  120 |       bankReference: MOCK_UTRS.valid,
  121 |     });
  122 | 
  123 |     // Simulate observation via the pipeline endpoint
  124 |     const simRes = await simulateObservation(
  125 |       paymentId,
  126 |       `₹${fx.amount} credited to ${(TEST_MERCHANT as any).receivingAccount.upi_id}. UTR: ${MOCK_UTRS.valid}`,
  127 |       '9876543210@upi',
  128 |       'SMS'
  129 |     );
  130 |     expect(simRes.status).toBe(200);
  131 | 
  132 |     // 7. Wait for checkout to transition to SUCCESS (via polling)
  133 |     const finalState = await waitFor(async () => {
  134 |       const s = await getCheckoutState(paymentId);
  135 |       if (s.body.status === 'SUCCESS') return s.body;
  136 |       return null;
  137 |     }, { timeoutMs: 30000, msg: 'checkout to reach SUCCESS' });
  138 | 
  139 |     expect(finalState.status).toBe('SUCCESS');
  140 | 
  141 |     // 8. Verify the browser page shows "Payment Success"
  142 |     await expect(page.locator('.ypg-success-box')).toBeVisible();
  143 |     await expect(page.locator('.ypg-success-title')).toContainText(/success|payment/i);
  144 |     await expect(page.locator('.ypg-success-amount')).toContainText(fx.amount);
  145 | 
  146 |     // 9. Verify payment session in DB is SUCCESS
  147 |     const updatedSession = getPaymentSession(paymentId);
  148 |     expect(updatedSession.status).toBe('SUCCESS');
  149 | 
  150 |     // 10. Verify double-entry ledger entries
  151 |     const ledgerEntries = getLedgerEntriesForOrder(paymentId);
  152 |     expect(ledgerEntries.length).toBeGreaterThanOrEqual(2);
  153 | 
  154 |     const debitEntry = ledgerEntries.find((e: any) => e.account_code === 'PROVIDER_CLEARING' && e.direction === 'DEBIT');
  155 |     const creditEntry = ledgerEntries.find((e: any) => e.account_code === 'MERCHANT_RECEIVABLES' && e.direction === 'CREDIT');
  156 |     expect(debitEntry).toBeTruthy();
  157 |     expect(creditEntry).toBeTruthy();
  158 |     expect(Number(debitEntry.amount_paise)).toBe(fx.amountPaise);
  159 |     expect(Number(creditEntry.amount_paise)).toBe(fx.amountPaise);
  160 | 
  161 |     // 11. Verify webhook was dispatched to merchant
  162 |     await waitFor(async () => {
  163 |       if (webhookCalls.length > 0) return webhookCalls[0];
  164 |       return null;
  165 |     }, { timeoutMs: 15000, msg: 'merchant webhook callback' });
  166 | 
  167 |     const callback = webhookCalls[0];
  168 |     expect(callback.method).toBe('POST');
  169 |   });
  170 | 
  171 |   // ------------------------------------------------------------------
  172 |   // Edge case: duplicate UTR rejected
  173 |   // ------------------------------------------------------------------
  174 |   test('rejects duplicate UTR across sessions', async ({ page }) => {
  175 |     const { merchantId, webhookSecret } = TEST_MERCHANT;
  176 |     const dupUtr = MOCK_UTRS.duplicate;
  177 | 
  178 |     // Create first payment
  179 |     const create1 = await createPayment('ORD-E2E-DUP-1', '199.00', merchantId, webhookSecret);
  180 |     expect(create1.status).toBe(201);
  181 |     const paymentId1 = create1.body.paymentId;
  182 | 
  183 |     // Create second payment
  184 |     const create2 = await createPayment('ORD-E2E-DUP-2', '299.00', merchantId, webhookSecret);
  185 |     expect(create2.status).toBe(201);
  186 |     const paymentId2 = create2.body.paymentId;
  187 | 
  188 |     // Report payment done with UTR on first session
  189 |     const done1 = await reportPaymentDone(paymentId1, dupUtr, 'Payer One', 'payerone@upi');
  190 |     expect(done1.status).toBe(200);
  191 | 
  192 |     // Report payment done with same UTR on second session -> should be rejected (409)
  193 |     const done2 = await reportPaymentDone(paymentId2, dupUtr, 'Payer Two', 'payertwo@upi');
  194 |     expect(done2.status).toBe(409);
  195 |     expect(done2.body.code).toBe('UTR_ALREADY_CLAIMED');
  196 |   });
  197 | 
  198 |   // ------------------------------------------------------------------
  199 |   // Edge case: wrong amount in webhook
  200 |   // ------------------------------------------------------------------
  201 |   test('rejects webhook with wrong amount', async ({ page }) => {
```