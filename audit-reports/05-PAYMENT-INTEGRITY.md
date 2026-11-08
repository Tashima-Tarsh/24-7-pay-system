# 24-7 PAY SYSTEM — PAYMENT INTEGRITY

**Mandatory launch gate:** YES (callback-only automated payment processing)  
**Verdict:** VERIFIED — end-to-end callback verification executed against a pristine in-memory SQLite database (`callback-verification-e2e.test.js`, 9/9 scenarios pass).

---

## Payment architecture (callback-only)

The system does **not** treat a customer-side payment success screen or application return as proof of settlement. Settlement authority is the bank callback / attribution pipeline:

1. Merchant backend creates order → `PaymentSession` (CREATED → ACTIVE, UPI concurrency slot reserved).
2. Customer pays via UPI app (intent/QR).
3. Bank/provider callback arrives → `/api/v1/verify-callback` or provider webhook route.
4. `AttributionEngine` matches amount + UTR + merchant + receiving account.
5. `PaymentVerificationPipeline` verifies and transitions state.
6. `SUCCESS` is terminal; webhook dispatched to merchant; receipt sent; slot promoted.
7. Customer return page is informational only.

---

## State-machine transition matrix

| From → To | CREATED | INITIATED | QUEUED | ACTIVE | PROCESSING | VERIFY_PENDING | SUCCESS | FAILED | EXPIRED | CANCELLED |
|---|---|---|---|---|---|---|---|---|---|---|
| CREATED | — | ✅ | — | — | — | — | — | ✅ | ✅ | ✅ |
| INITIATED | — | — | — | ✅ | — | — | — | ✅ | ✅ | ✅ |
| QUEUED | — | — | — | ✅ | — | — | — | ✅ | ✅ | ✅ |
| ACTIVE | — | — | — | — | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| PROCESSING | — | — | — | — | — | ✅ | ✅ | ✅ | ✅ | — |
| VERIFY_PENDING | — | — | — | — | — | — | ✅ | ✅ | ✅ | — |
| SUCCESS | — | — | — | — | — | — | — | — | — | — |
| FAILED | — | — | — | — | — | — | — | — | — | — |
| EXPIRED | — | — | — | — | — | — | — | — | — | — |
| CANCELLED | — | — | — | — | — | — | — | — | — | — |

`TERMINAL_STATES = [SUCCESS, FAILED, EXPIRED, CANCELLED]` — no outgoing transitions.  
`EXPIRED` is reachable from every non-terminal state (universal "gave up").  
`assertValidTransition()` throws on any illegal transition.

---

## Integrity invariants (code-verified)

| Invariant | Mechanism | Status |
|-----------|-----------|--------|
| Unpaid order cannot become fulfilled | No transition to SUCCESS except after verification | Code-verified |
| Repeated callbacks don't duplicate fulfillment | Terminal-state guard + idempotency repository | Code-verified |
| Concurrent callbacks don't double credit | `BEGIN IMMEDIATE` transactions + slot guard | Code-verified |
| Expired orders not reused | EXPIRED terminal; queue-sync daemon expires sessions | Code-verified |
| DB failure can't create false confirmation | `BEGIN IMMEDIATE` + rollback on exception | Code-verified |
| Every state change traceable | `AuditLogRepository` + EventEmitter `PAYMENT.*` events | Code-verified |
| Recovery jobs don't violate idempotency | `RecoveryEngine.recover()` + idempotency keys | Code-verified |

---

## End-to-end callback verification results (9/9 PASS)

Executed against pristine in-memory SQLite DB via `apps/payment-api/src/__tests__/callback-verification-e2e.test.js`:

| Scenario | Result | Mechanism |
|----------|--------|-----------|
| Authentic callback | SUCCESS | Token HMAC valid, nonce fresh, amount/fingerprint/time/UTR all match; atomic commit sets SUCCESS |
| Duplicate callback (same nonce+UTR) | REJECTED | `NONCE_ALREADY_USED` / `UTR_ALREADY_USED`; session stays SUCCESS |
| Forged callback (bad token signature) | REJECTED (401) | `verifySignedOrderToken` HMAC check fails at check 1 |
| Wrong amount | REJECTED (409) | `AMOUNT_MISMATCH` vs `payment_orders.actual_amount_paise` |
| Order/session mismatch | REJECTED (409) | `ORDER_SESSION_MISMATCH` — session orderId != token order_id |
| Failed responseCode (≠'00') | REJECTED | `PAYMENT_FAILED`; session set to FAILED, never SUCCESS |
| Malformed UTR | REJECTED (400) | `MALFORMED_UTR` regex validation |
| Expired token (>5 min) | REJECTED | `verifySignedOrderToken` expiry check rejects at check 1 |
| Replay after SUCCESS | REJECTED | Terminal-state guard; nonce already consumed |

---

## Authoritative settlement basis

A customer-side success screen / application return is NEVER treated as proof of settlement. Settlement is determined solely by the bank callback → `AttributionEngine` → `PaymentVerificationPipeline` → atomic state commit (nonce consumed + UTR registered + session SUCCESS in one `BEGIN IMMEDIATE` transaction). Webhook to merchant fires only after the durable commit.

---

## Gap: Live end-to-end verification

Executed against in-memory SQLite DB. For production, execute against a pristine SQLite/Postgres DB with a real merchant webhook secret and record results here.
