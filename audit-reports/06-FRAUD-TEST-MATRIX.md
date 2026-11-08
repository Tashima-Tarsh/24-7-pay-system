# 24-7 PAY SYSTEM — FRAUD TEST MATRIX

**Scope:** Simulated adversarial scenarios (code-verified protections; live adversarial execution NOT performed in this cycle)  
**Environment:** Local/sandbox only — no real customer credentials, no real money.

---

## Fraud threat model (20 scenarios)

| # | Attack | Preconditions | Simulated Input | Expected Secure Behavior | Existing Protection | Missing Protection | Required Fix | Regression Test |
|---|--------|---------------|-----------------|-------------------------|---------------------|-------------------|--------------|-----------------|
| 1 | Fake payment success | Customer return page | `?Status=success` on `/checkout` | Return page informational only; settlement requires bank callback | Client return never authoritative | Live test | Execute against pristine DB | — |
| 2 | Forged callback | Know callback endpoint | POST `/verify-callback` with fake HMAC | Rejected; HMAC/merchant secret validation | Merchant `webhookSecret` validation | Live test | Execute | — |
| 3 | Replayed callback | Captured valid callback | Re-send same callback payload | Idempotency key rejects duplicate | `idempotency.repository.js` | Live test | Execute | — |
| 4 | Duplicate order submission | Rapid repeated POST | Same order_id, amount | Idempotent; second returns existing | `idempotency.repository.js` | Live test | Execute | — |
| 5 | Order ID tampering | Guess/predict order_id | Modify `order_id` in callback | Attribution mismatch → FAILED | `AttributionEngine` matches merchant+UTR+amount | Live test | Execute | — |
| 6 | Amount tampering | Modify callback amount | Different `amount_paise` | Amount binding mismatch → rejected | Amount bound at session creation | Live test | Execute | — |
| 7 | VPA substitution | Swap receiving VPA | Different VPA in callback | Receiving-account mismatch → rejected | Session tied to `receivingAccountId` | Live test | Execute | — |
| 8 | Payment-to-order misattribution | Attribute payment to wrong order | Wrong UTR/order combo | Attribution engine requires all signals | Multi-signal matching | Live test | Execute | — |
| 9 | Expired transaction reuse | Use expired order/callback | Callback past `expires_at` | EXPIRED terminal; no state change | `TimingEngine` + queue-sync expiry | Live test | Execute | — |
| 10 | Race-condition exploitation | Concurrent callbacks | Two callbacks simultaneously | `BEGIN IMMEDIATE` serializes writes | ACID transactions + slot guard | Concurrency test | `chaos-concurrency.test.js` passes | — |
| 11 | Duplicate fulfillment | Double SUCCESS callback | Two SUCCESS callbacks | Terminal state blocks second | `TERMINAL_STATES` | Live test | Execute | — |
| 12 | Merchant impersonation | Forge `x-merchant-id/key` | Wrong merchant key | 401 `AUTH_REQUIRED` | `safeEqual` key validation | Live test | Execute | — |
| 13 | Unauthorized admin action | No admin session | POST admin route without token | 401/403 | `authGuard` + `isAdminRequest` | Penetration test | — | — |
| 14 | Session hijacking | Stolen session token | Use token on another device | Device binding + duplicate-session | `DeviceRepository`, duplicate-session test | Live test | — | — |
| 15 | API token abuse | Stolen API token | Calls with token | Scope-limited; MFA where required | `MfaRepository` | Live test | — | — |
| 16 | Callback endpoint flooding | High-rate POST | Flood `/verify-callback` | Rate limited | `rate-limit.test.js` passes | Load test | Execute | — |
| 17 | Retry amplification | Excessive webhook retries | Force many retries | Max 5 retries, backoff | `WEBHOOK_MAX_RETRIES=5` | Load test | Execute | — |
| 18 | Payment-status manipulation | Alter status field | Force SUCCESS from CREATED | `assertValidTransition` throws | State machine enforcement | Live test | Execute | — |
| 19 | Ledger mismatch | Inconsistent ledger | Corrupt write | Transaction rollback | `BEGIN IMMEDIATE` + rollback | Chaos test | `chaos-concurrency.test.js` passes | — |
| 20 | Refund/reversal inconsistency | Partial refund | Refund exceeds paid | Refund bounded by paid amount | `refund.repository.js` | Live test | Execute | — |

---

## Protection summary

| Protection | Verified | Coverage |
|------------|----------|----------|
| Idempotency (duplicate/replay) | Code | All write paths |
| State-machine guard | Code | All transitions |
| HMAC/merchant-secret callback auth | Code | Payment creation + callback |
| Rate limiting | Tested | `rate-limit.test.js` |
| Device binding + MFA | Tested | `device-binding-duplicate-session`, `sms-gmail-verification-levels` |
| ACID serialization | Code | `BEGIN IMMEDIATE` |
| Chaos concurrency | Tested | `chaos-concurrency.test.js` |

**Required before unqualified GO:** Execute scenarios 1–9, 11–12, 16–20 against a pristine database in a sandbox and record pass/fail per scenario.
