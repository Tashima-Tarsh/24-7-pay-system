# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: payment-flow.spec.ts >> 24-7-pay-system E2E Payment Flow >> payment-done transitions to VERIFICATION_PENDING
- Location: payment-flow.spec.ts:264:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.ypg-processing-box, [text*="verif" i], [text*="processing" i]')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('.ypg-processing-box, [text*="verif" i], [text*="processing" i]') with timeout 10000ms
  - waiting for locator('.ypg-processing-box, [text*="verif" i], [text*="processing" i]')

```

```yaml
- text: Direct UPI QR is active for instant banking verification
- banner:
  - text: M E2E Test Store Powered by Test Merchant
  - button "User Profile":
    - img
- main:
  - status: Awaiting bank verification
  - text: Reference saved — waiting for bank confirmation The merchant portal is verifying your payment with the bank.
```

# Test source

```ts
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
  202 |     const { merchantId, webhookSecret } = TEST_MERCHANT;
  203 |     const fx = PAYMENT_FIXTURES.success;
  204 | 
  205 |     const createRes = await createPayment(fx.orderId, fx.amount, merchantId, webhookSecret);
  206 |     expect(createRes.status).toBe(201);
  207 |     const paymentId = createRes.body.paymentId;
  208 | 
  209 |     // Send mock webhook with WRONG amount
  210 |     const wrongPayload = buildProviderWebhookPayload(paymentId, fx.orderId, '9999.00', MOCK_UTRS.success);
  211 |     await sendMockWebhook(WEBHOOK_LISTENER_URL, wrongPayload, webhookSecret);
  212 | 
  213 |     await new Promise((r) => setTimeout(r, 2000));
  214 |     const session = getPaymentSession(paymentId);
  215 |     expect(session.status).not.toBe('SUCCESS');
  216 |   });
  217 | 
  218 |   // ------------------------------------------------------------------
  219 |   // Edge case: invalid HMAC signature on webhook
  220 |   // ------------------------------------------------------------------
  221 |   test('rejects webhook with invalid HMAC signature', async ({ page }) => {
  222 |     const { merchantId, webhookSecret } = TEST_MERCHANT;
  223 |     const fx = PAYMENT_FIXTURES.success;
  224 | 
  225 |     const createRes = await createPayment(fx.orderId, fx.amount, merchantId, webhookSecret);
  226 |     expect(createRes.status).toBe(201);
  227 |     const paymentId = createRes.body.paymentId;
  228 | 
  229 |     const payload = buildProviderWebhookPayload(paymentId, fx.orderId, fx.amount, MOCK_UTRS.success);
  230 |     // Send with wrong secret
  231 |     await sendMockWebhook(WEBHOOK_LISTENER_URL, payload, 'wrong_secret_0000000000');
  232 | 
  233 |     await new Promise((r) => setTimeout(r, 2000));
  234 |     const session = getPaymentSession(paymentId);
  235 |     expect(session.status).not.toBe('SUCCESS');
  236 |   });
  237 | 
  238 |   // ------------------------------------------------------------------
  239 |   // Edge case: expired payment
  240 |   // ------------------------------------------------------------------
  241 |   test('expires payment past verification window', async ({ page }) => {
  242 |     const { merchantId, webhookSecret } = TEST_MERCHANT;
  243 |     const fx = PAYMENT_FIXTURES.expired;
  244 | 
  245 |     // Create a session directly in DB with expired status
  246 |     const session = createPaymentSession(merchantId, {
  247 |       paymentId: `pay_expired_${Date.now()}`,
  248 |       orderId: fx.orderId,
  249 |       amountPaise: fx.amountPaise,
  250 |       status: 'EXPIRED',
  251 |       expiresAt: new Date(Date.now() - 60000).toISOString(), // already expired
  252 |     });
  253 |     expect(session).toBeTruthy();
  254 |     expect(session.status).toBe('EXPIRED');
  255 | 
  256 |     // Opening checkout for expired session should show expired view
  257 |     await page.goto(`/checkout/${session.id}`, { waitUntil: 'networkidle' });
  258 |     await expect(page.locator('.ypg-expired-box, [text*="expired" i]')).toBeVisible({ timeout: 10000 });
  259 |   });
  260 | 
  261 |   // ------------------------------------------------------------------
  262 |   // Edge case: payment-done transitions to VERIFICATION_PENDING
  263 |   // ------------------------------------------------------------------
  264 |   test('payment-done transitions to VERIFICATION_PENDING', async ({ page }) => {
  265 |     const { merchantId, webhookSecret } = TEST_MERCHANT;
  266 | 
  267 |     const createRes = await createPayment('ORD-E2E-VP-001', '399.00', merchantId, webhookSecret);
  268 |     expect(createRes.status).toBe(201);
  269 |     const paymentId = createRes.body.paymentId;
  270 | 
  271 |     // Customer reports payment done (no UTR)
  272 |     const doneRes = await reportPaymentDone(paymentId, null, 'Payer', 'payer@upi');
  273 |     expect(doneRes.status).toBe(200);
  274 | 
  275 |     // Session should be VERIFICATION_PENDING
  276 |     const session = getPaymentSession(paymentId);
  277 |     expect(session.status).toBe('VERIFICATION_PENDING');
  278 | 
  279 |     // Checkout page should show processing/verifying view
  280 |     await page.goto(`/checkout/${paymentId}`, { waitUntil: 'networkidle' });
> 281 |     await expect(page.locator('.ypg-processing-box, [text*="verif" i], [text*="processing" i]')).toBeVisible({ timeout: 10000 });
      |                                                                                                  ^ Error: expect(locator).toBeVisible() failed
  282 |   });
  283 | 
  284 |   // ------------------------------------------------------------------
  285 |   // Verify HMAC signature generation utility
  286 |   // ------------------------------------------------------------------
  287 |   test('generates valid and invalid HMAC pairs', () => {
  288 |     const payload = { event: 'SUCCESS', paymentId: 'pay_1', orderId: 'ORD_1', amount: '100.00' };
  289 |     const { valid, invalid, secret } = generateHmacTestPair(payload, TEST_MERCHANT.webhookSecret);
  290 | 
  291 |     // Valid signature verifies
  292 |     const checkValid = generateHmacSignature(JSON.stringify(payload), secret);
  293 |     expect(checkValid).toBe(valid);
  294 | 
  295 |     // Invalid signature differs
  296 |     expect(invalid).not.toBe(valid);
  297 |     expect(invalid.length).toBe(64); // SHA256 hex = 64 chars
  298 |   });
  299 | });
  300 | 
```