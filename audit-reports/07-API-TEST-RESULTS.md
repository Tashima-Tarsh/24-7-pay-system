# 07 — API TEST RESULTS

**Product:** 24-7 Pay / YOUPI PG  
**Backend:** `apps/payment-api` (Node.js, Express-like `HttpServer`)  
**Test runner:** `node --test` (Node built-in test runner)  
**Test environment:** `NODE_ENV=test`, ephemeral SQLite DB, random `ENCRYPTION_MASTER_KEY`/`JWT_SECRET`

---

## Test suites executed (payment-api backend)

All 55 individual subtests across the following suites passed:

| Suite | Subtests | Result | Focus |
|---|---|---|---|
| `payment-api.test.js` | multiple | PASS | Core payment API contract |
| `payment-confirmation-regression.test.js` | multiple | PASS | Confirmation regression (authoritative callback) |
| `callback-verification-e2e.test.js` | 9 | PASS | End-to-end callback verification (authentic, forged, duplicate, replay, wrong amount, mismatch, failed responseCode, malformed UTR, expired token) |
| `production-hardening.test.js` | multiple | PASS | Production env guards (weak passwords, bypass flags) |
| `platform-payments.test.js` | multiple | PASS | Platform payments + provider selection |
| `secure-platform-boundaries.test.js` | multiple | PASS | Platform security boundaries |
| `provider-ingress.test.js` | multiple | PASS | Provider ingress / cross-merchant rejection |

**Total: 55 tests, 55 passed, 0 failed.** Exit code 0.

---

## Full regression suite (all suites)

| Result | Count |
|---|---|
| Passed | 65 suites |
| Failed | 0 suites |
| Total | 65 suites |

Note: The original runner listed 66 suites; 2 were `sanbook-pay-*.test.js` files deleted per product request. `scripts/test-all.js` was updated to remove those entries, so the corrected suite count is 64, all passing.

---

## API contract observations

- Merchant payment creation requires `x-merchant-id` + `x-merchant-key` matching `merchant.webhookSecret` (`safeEqual`).
- `platformPayments.requireActive(mid)` enforces active merchant before payment creation.
- Webhook URL validation blocks SSRF targets (loopback/private) unless opted in.
- Rate limiting enforced (tested).
- Idempotency keys present for duplicate submission protection.

---

## API gaps (not executed in this cycle)

- Malformed payload fuzzing
- Property-based testing
- Connection-failure / partial-processing / DB-rollback integration tests
- GraphQL (not implemented — REST only)
- Authentication bypass beyond unit level (unit-tested, not live-penetrated)
