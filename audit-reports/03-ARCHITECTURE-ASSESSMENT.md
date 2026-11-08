# 24-7 PAY SYSTEM — ARCHITECTURE ASSESSMENT

**Architecture style:** Monorepo (npm workspaces), self-hosted white-label UPI payment gateway  
**Runtime:** Node.js ≥22.13, ES modules  
**Database:** SQLite (node:sqlite, WAL, foreign_keys, ACID) with Postgres option  
**Queue/Job:** BullMQ (auxiliary), database-backed `callback_outbox` for durable financial events  
**Cache/Coordination:** Redis (auxiliary DynamoPay queue, not durable financial store)  
**Real-time:** SSE (server-sent events) for console/status push  
**Frontend:** Next.js (checkout-portal, master-merchant-portal, merchant-console), Express (merchant-admin, super-admin, etc.)

---

## Architectural Strengths (verified in code)

### 1. Callback-only payment processing
Settlement authority is the bank callback/attribution pipeline (`PaymentVerificationPipeline`, `AttributionEngine`, `callback_outbox`), not a client-side success screen. This is the correct architecture for a UPI gateway.

### 2. Durable financial event store
`callback_outbox` + `callback_delivery_attempts` tables persist webhook events; Redis/in-memory must never substitute for durable financial processing.

### 3. ACID + FK enforcement
`BEGIN IMMEDIATE` transactions, `PRAGMA foreign_keys = ON`, WAL mode, `0o600` db file permissions.

### 4. Defense-in-depth secrets
Env var override → persisted random secret (`0o600`), `crypto.timingSafeEqual`, blind indexes for token lookup, envelope encryption (`enc:v1:` AES-256-GCM) for data at rest.

### 5. SSRF protection
`validateOutboundWebhookUrl` rejects loopback/private/link-local unless `YOUPI_ALLOW_PRIVATE_WEBHOOKS=true`.

### 6. State-machine enforcement
`VALID_TRANSITIONS` + `assertValidTransition` + terminal states prevent double fulfillment and illegal state regressions.

### 7. Single-slot concurrency
`SLOT_OCCUPYING_STATES` (ACTIVE, PROCESSING) + queue promotion (`handleSlotFreedAndPromote`) prevents overselling a merchant's UPI concurrency slot.

### 8. Observability hooks
EventEmitter on `PAYMENT.*`, `SESSION.*` events; SSE broadcast; audit log repository; `AdminAuditEventRepository`.

### 9. Production hardening
`startServer()` fails fast in production on missing `ENCRYPTION_MASTER_KEY`/`JWT_SECRET`, weak admin passwords, and security bypass flags (`SKIP_MFA`, etc.).

### 10. Idempotency
`idempotency.repository.js` protects against duplicate submission/replay.

---

## Architectural Concerns

| Concern | Severity | Detail |
|---------|----------|--------|
| No measured load results | Medium | k6 scripts exist but no P50/P95/P99 captured |
| Backup/restore not drilled | Medium | `scripts/backup.sh`, `docs/deployment/BACKUP_RECOVERY.md` exist; not executed |
| `.next/` build artifacts in working tree | Low | Must be gitignored before release (fixed in `.gitignore`) |
| Some admin portals not type-checked | Low | `merchant-console`, `master-merchant-portal` Next.js apps not built |
| WhatsApp/Gmail observers | Low | Present but outside callback-only mandatory path |

---

## Component Interaction (callback payment flow)

```
Merchant backend → POST /api/v1/payments (x-merchant-id/key auth)
  → PaymentSession created (CREATED → ACTIVE, slot reserved)
  → UPI intent/QR generated, returned to customer
  → Customer pays via UPI app
  → Bank callback → /api/v1/verify-callback (or provider webhook)
    → AttributionEngine matches amount + UTR + merchant
    → PaymentVerificationPipeline verifies (callback is authoritative)
    → Session → SUCCESS (terminal) OR FAILED/EXPIRED
    → WebhookEngine dispatches SUCCESS/FAILED to merchant webhook (with retry)
    → ReceiptNotificationService sends receipt
    → QueueEngine promotes next queued session
  → Customer return page shows outcome (informational only, never authoritative)
```

---

## Diagrams present (not audited for runtime accuracy)

- `docs/system/Dynamo-Pay-System-Design.mmd` / `.svg`
- `docs/system/Dynamo-Pay-Payment-Sequence.svg`
