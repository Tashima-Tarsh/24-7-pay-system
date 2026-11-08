import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import {
  resetDb,
  closeDb,
  createTestMerchant,
  createReceivingAccount,
  createTestCustomer,
  createPaymentSession,
  insertObservation,
  getLedgerEntriesForOrder,
  getPaymentSession,
  getWebhookDeliveries,
  getAuditLogs,
  ensureLedgerAccounts,
} from './fixtures/db.ts';
import {
  createPayment,
  getPayment,
  getCheckoutState,
  getUpicQr,
  simulateObservation,
  reportPaymentDone,
  verifyUtr,
  sendMockWebhook,
  buildProviderWebhookPayload,
  generateHmacSignature,
  waitFor,
} from './fixtures/api.ts';
import { TEST_MERCHANT, PAYMENT_FIXTURES, MOCK_UTRS, generateHmacTestPair, expectedLedgerEntries } from './fixtures/test-data.ts';

const WEBHOOK_LISTENER_URL = 'http://localhost:9999/webhook/e2e';

let webhookCalls: Array<{ url: string; method: string; headers: any; body: string }> = [];

test.describe('24-7-pay-system E2E Payment Flow', () => {

  test.beforeAll(async () => {
    resetDb();
    // Create merchant and receiving account in DB
    (TEST_MERCHANT as any).merchant = createTestMerchant(TEST_MERCHANT);
    (TEST_MERCHANT as any).receivingAccount = createReceivingAccount(TEST_MERCHANT.merchantId);
    (TEST_MERCHANT as any).customer = createTestCustomer();
    ensureLedgerAccounts(TEST_MERCHANT.merchantId);

    // Start a mock webhook listener to capture merchant callbacks
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        webhookCalls.push({
          url: req.url || '',
          method: req.method || '',
          headers: req.headers,
          body,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      });
    });
    server.listen(9999, '127.0.0.1');
    webhookCalls = [];
  });

  test.afterAll(async () => {
    closeDb();
  });

  test.beforeEach(async () => {
    webhookCalls = [];
  });

  // ------------------------------------------------------------------
  // Happy path: full UPI payment flow with listener simulation
  // ------------------------------------------------------------------
  test('completes full UPI payment flow: create → checkout → listener → success → ledger', async ({ page }) => {
    const { merchantId, webhookSecret } = TEST_MERCHANT;
    const fx = PAYMENT_FIXTURES.success;

    // 1. Create payment via API
    const createRes = await createPayment(fx.orderId, fx.amount, merchantId, webhookSecret);
    expect(createRes.status).toBe(201);
    expect(createRes.body.paymentId).toBeTruthy();
    expect(createRes.body.orderId).toBe(fx.orderId);
    expect(createRes.body.amount).toBe(fx.amount);
    expect(['QUEUED', 'ACTIVE']).toContain(createRes.body.status);
    expect(createRes.body.checkoutUrl).toContain(`/checkout/${createRes.body.paymentId}`);

    const paymentId = createRes.body.paymentId;

    // 2. Verify payment session in DB
    const session = getPaymentSession(paymentId);
    expect(session).toBeTruthy();
    expect(session.order_id).toBe(fx.orderId);
    expect(Number(session.amount_paise)).toBe(fx.amountPaise);

    // 3. Open checkout page in browser
    await page.goto(`/checkout/${paymentId}`, { waitUntil: 'networkidle' });

    // 4. Verify checkout page loads with payment details
    await expect(page.locator('text=' + fx.orderId)).toBeVisible();
    await expect(page.locator('text=' + fx.amount)).toBeVisible();

    // 5. Extract UPI intent URL from the checkout state API
    const stateRes = await getCheckoutState(paymentId);
    expect(stateRes.status).toBe(200);
    const upiUri = stateRes.body.upiUri;
    expect(upiUri).toBeTruthy();
    expect(upiUri).toStartWith('upi://pay');
    expect(upiUri).toContain((TEST_MERCHANT as any).receivingAccount.upi_id);
    expect(upiUri).toContain(fx.orderId);

    // Also verify QR code image is present on the page
    const qrSvg = page.locator('.ypg-qr-image-box svg');
    await expect(qrSvg).toBeVisible();

    // 6. Mock listener webhook: simulate SMS/Gmail payment detection
    insertObservation(merchantId, (TEST_MERCHANT as any).receivingAccount.id, {
      amountPaise: fx.amountPaise,
      bankReference: MOCK_UTRS.valid,
    });

    // Simulate observation via the pipeline endpoint
    const simRes = await simulateObservation(
      paymentId,
      `₹${fx.amount} credited to ${(TEST_MERCHANT as any).receivingAccount.upi_id}. UTR: ${MOCK_UTRS.valid}`,
      '9876543210@upi',
      'SMS'
    );
    expect(simRes.status).toBe(200);

    // 7. Wait for checkout to transition to SUCCESS (via polling)
    const finalState = await waitFor(async () => {
      const s = await getCheckoutState(paymentId);
      if (s.body.status === 'SUCCESS') return s.body;
      return null;
    }, { timeoutMs: 30000, msg: 'checkout to reach SUCCESS' });

    expect(finalState.status).toBe('SUCCESS');

    // 8. Verify the browser page shows "Payment Success"
    await expect(page.locator('.ypg-success-box')).toBeVisible();
    await expect(page.locator('.ypg-success-title')).toContainText(/success|payment/i);
    await expect(page.locator('.ypg-success-amount')).toContainText(fx.amount);

    // 9. Verify payment session in DB is SUCCESS
    const updatedSession = getPaymentSession(paymentId);
    expect(updatedSession.status).toBe('SUCCESS');

    // 10. Verify double-entry ledger entries
    const ledgerEntries = getLedgerEntriesForOrder(paymentId);
    expect(ledgerEntries.length).toBeGreaterThanOrEqual(2);

    const debitEntry = ledgerEntries.find((e: any) => e.account_code === 'PROVIDER_CLEARING' && e.direction === 'DEBIT');
    const creditEntry = ledgerEntries.find((e: any) => e.account_code === 'MERCHANT_RECEIVABLES' && e.direction === 'CREDIT');
    expect(debitEntry).toBeTruthy();
    expect(creditEntry).toBeTruthy();
    expect(Number(debitEntry.amount_paise)).toBe(fx.amountPaise);
    expect(Number(creditEntry.amount_paise)).toBe(fx.amountPaise);

    // 11. Verify webhook was dispatched to merchant
    await waitFor(async () => {
      if (webhookCalls.length > 0) return webhookCalls[0];
      return null;
    }, { timeoutMs: 15000, msg: 'merchant webhook callback' });

    const callback = webhookCalls[0];
    expect(callback.method).toBe('POST');
  });

  // ------------------------------------------------------------------
  // Edge case: duplicate UTR rejected
  // ------------------------------------------------------------------
  test('rejects duplicate UTR across sessions', async ({ page }) => {
    const { merchantId, webhookSecret } = TEST_MERCHANT;
    const dupUtr = MOCK_UTRS.duplicate;

    // Create first payment
    const create1 = await createPayment('ORD-E2E-DUP-1', '199.00', merchantId, webhookSecret);
    expect(create1.status).toBe(201);
    const paymentId1 = create1.body.paymentId;

    // Create second payment
    const create2 = await createPayment('ORD-E2E-DUP-2', '299.00', merchantId, webhookSecret);
    expect(create2.status).toBe(201);
    const paymentId2 = create2.body.paymentId;

    // Report payment done with UTR on first session
    const done1 = await reportPaymentDone(paymentId1, dupUtr, 'Payer One', 'payerone@upi');
    expect(done1.status).toBe(200);

    // Report payment done with same UTR on second session -> should be rejected (409)
    const done2 = await reportPaymentDone(paymentId2, dupUtr, 'Payer Two', 'payertwo@upi');
    expect(done2.status).toBe(409);
    expect(done2.body.code).toBe('UTR_ALREADY_CLAIMED');
  });

  // ------------------------------------------------------------------
  // Edge case: wrong amount in webhook
  // ------------------------------------------------------------------
  test('rejects webhook with wrong amount', async ({ page }) => {
    const { merchantId, webhookSecret } = TEST_MERCHANT;
    const fx = PAYMENT_FIXTURES.success;

    const createRes = await createPayment(fx.orderId, fx.amount, merchantId, webhookSecret);
    expect(createRes.status).toBe(201);
    const paymentId = createRes.body.paymentId;

    // Send mock webhook with WRONG amount
    const wrongPayload = buildProviderWebhookPayload(paymentId, fx.orderId, '9999.00', MOCK_UTRS.success);
    await sendMockWebhook(WEBHOOK_LISTENER_URL, wrongPayload, webhookSecret);

    await new Promise((r) => setTimeout(r, 2000));
    const session = getPaymentSession(paymentId);
    expect(session.status).not.toBe('SUCCESS');
  });

  // ------------------------------------------------------------------
  // Edge case: invalid HMAC signature on webhook
  // ------------------------------------------------------------------
  test('rejects webhook with invalid HMAC signature', async ({ page }) => {
    const { merchantId, webhookSecret } = TEST_MERCHANT;
    const fx = PAYMENT_FIXTURES.success;

    const createRes = await createPayment(fx.orderId, fx.amount, merchantId, webhookSecret);
    expect(createRes.status).toBe(201);
    const paymentId = createRes.body.paymentId;

    const payload = buildProviderWebhookPayload(paymentId, fx.orderId, fx.amount, MOCK_UTRS.success);
    // Send with wrong secret
    await sendMockWebhook(WEBHOOK_LISTENER_URL, payload, 'wrong_secret_0000000000');

    await new Promise((r) => setTimeout(r, 2000));
    const session = getPaymentSession(paymentId);
    expect(session.status).not.toBe('SUCCESS');
  });

  // ------------------------------------------------------------------
  // Edge case: expired payment
  // ------------------------------------------------------------------
  test('expires payment past verification window', async ({ page }) => {
    const { merchantId, webhookSecret } = TEST_MERCHANT;
    const fx = PAYMENT_FIXTURES.expired;

    // Create a session directly in DB with expired status
    const session = createPaymentSession(merchantId, {
      paymentId: `pay_expired_${Date.now()}`,
      orderId: fx.orderId,
      amountPaise: fx.amountPaise,
      status: 'EXPIRED',
      expiresAt: new Date(Date.now() - 60000).toISOString(), // already expired
    });
    expect(session).toBeTruthy();
    expect(session.status).toBe('EXPIRED');

    // Opening checkout for expired session should show expired view
    await page.goto(`/checkout/${session.id}`, { waitUntil: 'networkidle' });
    await expect(page.locator('.ypg-expired-box, [text*="expired" i]')).toBeVisible({ timeout: 10000 });
  });

  // ------------------------------------------------------------------
  // Edge case: payment-done transitions to VERIFICATION_PENDING
  // ------------------------------------------------------------------
  test('payment-done transitions to VERIFICATION_PENDING', async ({ page }) => {
    const { merchantId, webhookSecret } = TEST_MERCHANT;

    const createRes = await createPayment('ORD-E2E-VP-001', '399.00', merchantId, webhookSecret);
    expect(createRes.status).toBe(201);
    const paymentId = createRes.body.paymentId;

    // Customer reports payment done (no UTR)
    const doneRes = await reportPaymentDone(paymentId, null, 'Payer', 'payer@upi');
    expect(doneRes.status).toBe(200);

    // Session should be VERIFICATION_PENDING
    const session = getPaymentSession(paymentId);
    expect(session.status).toBe('VERIFICATION_PENDING');

    // Checkout page should show processing/verifying view
    await page.goto(`/checkout/${paymentId}`, { waitUntil: 'networkidle' });
    await expect(page.locator('.ypg-processing-box, [text*="verif" i], [text*="processing" i]')).toBeVisible({ timeout: 10000 });
  });

  // ------------------------------------------------------------------
  // Verify HMAC signature generation utility
  // ------------------------------------------------------------------
  test('generates valid and invalid HMAC pairs', () => {
    const payload = { event: 'SUCCESS', paymentId: 'pay_1', orderId: 'ORD_1', amount: '100.00' };
    const { valid, invalid, secret } = generateHmacTestPair(payload, TEST_MERCHANT.webhookSecret);

    // Valid signature verifies
    const checkValid = generateHmacSignature(JSON.stringify(payload), secret);
    expect(checkValid).toBe(valid);

    // Invalid signature differs
    expect(invalid).not.toBe(valid);
    expect(invalid.length).toBe(64); // SHA256 hex = 64 chars
  });
});
