# 05 — PAYMENT INTEGRITY

**Product:** 24-7 Pay / YOUPI PG  
**Mandatory launch gate:** YES (callback-only automated payment processing)  
**Verdict:** UNVERIFIED for launch — code architecture is correct; end-to-end callback verification not executed against a pristine database in this audit cycle.

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
|---|---|---|
| Unpaid order cannot become fulfilled | No transition to SUCCESS except from PROCESSING/CREDIT_OVER/PAID_VERIFIED after verification | Code-verified |
| Repeated callbacks don't duplicate fulfillment | Terminal-state guard + idempotency repository | Code-verified |
| Concurrent callbacks don't double credit | `BEGIN IMMEDIATE` transactions + slot guard | Code-verified |
| Expired orders not reused | EXPIRED terminal; queue-sync daemon expires sessions | Code-verified |
| DB failure can't create false confirmation | `BEGIN IMMEDIATE` + rollback on exception | Code-verified |
| Every state change traceable | `AuditLogRepository` + EventEmitter `PAYMENT.*` events | Code-verified |
| Recovery jobs don't violate idempotency | `RecoveryEngine.recover()` + idempotency keys | Code-verified |

---

## Gap: live end-to-end verification (NOT executed)

The following attack/integrity scenarios were **not** executed against a live database in this audit cycle:

- Authentic callback → SUCCESS
- Forged callback → rejected
- Duplicate callback → idempotent (no double credit)
- Replayed callback → rejected
- Delayed callback → handled within verification window
- Missing callback → session expires → EXPIRED
- Out-of-order callback → reconciliation engine
- Callback timeout → retry with backoff (max 5)
- Partial callback payload → validation
- Incorrect amount/merchant/order/VPA → attribution mismatch → FAILED/VERIFICATION_PENDING
- Conflicting payment status → reconciliation required
- Reversed payment → disputes/refunds routes

**Required before unqualified GO:** Execute the above against a pristine SQLite/Postgres DB with a real merchant webhook secret and record results here.
