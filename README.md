# Sanbook Pay

Sanbook Pay is a white-label UPI payment collection engine for independent merchants. The Platform Owner (Root Super Admin) operates Sanbook Pay as the central supplier, creating and managing hundreds or thousands of independent merchant accounts. Merchants receive UPI payments directly into their own VPA — the platform never holds funds.

## Architecture (Best Practice)

```
Platform Owner (Root Super Admin)
├── Platform Administrators, Operations, Finance, Security, Support
│   ├── Merchant onboarding & approval
│   ├── Smart UPI routing with automatic failover
│   ├── Circuit-breaker control plane per provider connection
│   ├── Multi-operator role & permission system
│   ├── Disputes case management with evidence tracking
│   ├── Distributed event replay for recovery
│   ├── Automatic bank-statement reconciliation
│   ├── Direct corporate bank API connectors (H2H)
│   └── Full audit trail (immutable pp_audit log)
└── Merchant N (Independent dashboard)
    ├── Amount-only payment link creation
    ├── Dynamic UPI QR / intent generation
    ├── Multi-operator staff & role management
    ├── Authenticated payer-VPA binding & verification
    ├── HMAC-SHA256 signed webhook callbacks with retries
    ├── Double-entry ledger for every confirmed payment
    └── Transaction history & reconciliation exceptions
```

### Services

| Service | Port | Purpose |
|---------|------|---------|
| Payment API | 6100 | Core payment processing, UPI intent, provider webhooks, ledger, callbacks |
| Super Admin Control Center | 9000 | Platform owner portal: merchants, routing, failover, disputes, reconciliation |
| Checkout Portal | 7000 | Customer-facing hosted UPI checkout with QR, intent, status |
| Merchant Console | 6001 | Merchant dashboard for independent operations |
| Webhook Worker | — | Concurrent callback dispatch with exponential backoff |

### Storage

- **PostgreSQL 16** — Durable transaction system (mandatory for production)
- **Redis 7** — Cache and fast lookup (not sole durable record)
- **SQLite WAL** — Local/test adapter only

### Data Model (`pp_*` tables)

`pp_merchants`, `pp_users`, `pp_sessions`, `pp_tokens`, `pp_login_limits`, `pp_user_permissions`, `pp_audit`, `pp_cases`/`pp_case_events`, `pp_pricing_plans`, `pp_api_keys`/`pp_api_windows`/`pp_api_requests`, `pp_connection_policy` (provider routing + circuit breaker), `pp_rules`/`pp_rule_revisions`, `ledger_accounts`, `ledger_transactions`, `ledger_entries`, `payment_orders`, `payment_sessions`, `callback_outbox`, `callback_delivery_attempts`, `payer_vpa_bindings`.

---

## Core Capabilities

### Platform Owner (Super Admin Control Center)

- Create and manage merchant accounts with unique Merchant IDs
- Assign approved receiving bank accounts and UPI routes
- Configure pricing plans, transaction fees, API quotas
- **Smart UPI routing** with automatic failover across providers
- **Circuit-breaker control plane** — trip, reset, half-open per provider connection
- **Multi-operator role system** — merchant users, roles, permissions, invitations
- **Disputes case management** — lifecycle, evidence tracking, resolution workflow
- **Distributed event replay** — durable outbox replay for recovery after failures
- **Automatic bank-statement reconciliation** — reconcile ledger vs bank statements, record exceptions
- **Direct corporate bank APIs** — bank connector management for H2H integration
- Authorized bank/PSP payment verification with signature validation
- Merchant callbacks and webhook management with durable retries
- Settlement and reconciliation with double-entry ledger
- Payment diagnostics and incident management
- Full audit trail for all platform actions

### Merchants

- Independent secure login and dashboard (MFA required for sensitive ops)
- **Amount-only payment link creation** — amount ₹ only, no manual Order ID/customer/mobile/UTR
- **Dynamic UPI QR / intent generation** — payee VPA, QR image, app launcher grid
- API key management with scopes and rate limits
- Webhook configuration and delivery monitoring (HMAC-SHA256 verified)
- Transaction history and reporting
- Staff and role management (Owner, Admin, Developer, Finance, Operations, Viewer)
- **Authenticated payer-VPA identity** — bind and verify payer UPA identity to sessions

### Customers (Payers)

- Hosted checkout portal with glassmorphism UI
- Scan UPI QR with any app (Google Pay, PhonePe, Paytm, BHIM, Amazon Pay, CRED)
- Android deep-link intent launching for installed UPI apps
- Generic UPI URI fallback for any compatible app
- Intent-return status tracking (APP_OPENED → CLIENT_REPORTED_SUCCESS → bank verified)
- Real-time payment status polling (3-second interval)
- Terminal success / failed / expired / cancelled screens

---

## UPI Payment Flow (End-to-End)

**No KYC. No aggregator. No fund holding. Money goes straight to the merchant's UPI VPA.**

1. **Platform onboards merchant** — creates account, sends invitation, owner sets password + MFA
2. **Merchant registers UPI VPA** — receives webhook secret, access token, callback URL
3. **Merchant creates payment order** — amount only, system generates UPI QR URI + checkout link
4. **Customer pays** — scans QR with any UPI app or taps app tile on Android; money goes directly to merchant's VPA
5. **Provider webhook confirms credit** — provider posts UTR; system matches order + amount
6. **Real-time callback** — merchant backend receives `PAYMENT_SUCCESS` with UTR, HMAC-SHA256 signed
7. **Ledger entry** — atomic double-entry: `PROVIDER_CLEARING` → `MERCHANT_RECEIVABLES` (integer paise)
8. **Merchant verifies** — checks order status, confirms UTR, credits customer/wallet

---

## 7 Production Features (Newly Implemented)

| Feature | Description | Route File |
|---------|-------------|------------|
| **Disputes Case Management** | Dispute lifecycle, evidence tracking, resolution workflow | `routes/disputes.routes.js` |
| **Distributed Event Replay** | Durable outbox replay for recovery after provider failures | `routes/event-replay.routes.js` |
| **Provider Circuit-Breaker Control Plane** | Trip/reset/half-open per provider connection, route health | `routes/circuit-breaker.routes.js` |
| **Authenticated Payer-VPA Identity** | Bind and verify payer UPI identity to payment sessions | `routes/payer-vpa.routes.js` |
| **Automatic Bank-Statement Reconciliation** | Reconcile ledger vs bank statements, record/resolve exceptions | `routes/bank-reconciliation.routes.js` |
| **Multi-Operator Role System** | Merchant users, roles, permissions, invitations | `routes/multi-operator.routes.js` |
| **Direct Corporate Bank APIs** | Bank connector management for H2H integration, health checks | `routes/direct-bank.routes.js` |

All routes registered in `apps/payment-api/src/index.js`.

---

## Frontend: Hosted UPI Checkout (Refactored)

**File:** `apps/checkout-portal/src/views/checkout-premium.html`

A glassmorphism, mobile-responsive checkout page with:

- **Amount card** — payable amount, order reference, countdown timer
- **QR card** — live UPI QR image (SVG), payee VPA display, copy-to-clipboard
- **UPI app launcher grid** — Google Pay, PhonePe, Paytm, generic UPI tiles with standard upi:// deep links
- **Intent-return status strip** — APP_OPENED → CLIENT_REPORTED_SUCCESS → bank verification
- **Sticky mobile footer** — total amount, "I've Paid" verification request
- **Terminal screens** — success (verified by provider webhook), failed, expired, cancelled, under review
- **Auto-polling** — payment status every 3 seconds, visibility-change re-poll

---

## Ledger (Every Payment is Recorded)

Every confirmed UPI payment posts atomically to a **double-entry financial ledger**:

- **Integer-paise accounting** — no floating-point rounding
- **Debit `PROVIDER_CLEARING` → Credit `MERCHANT_RECEIVABLES`** on provider collection confirmation
- **Idempotent** — same reference type + ID cannot post twice
- **Atomic** — both entries commit together or not at all
- **Immutable** — historical ledger entries are never silently rewritten

Query the journal per merchant to see every transaction with debit/credit entries and account codes.

---

## Webhooks (Outgoing to Merchants)

- **HMAC-SHA256 signature** over raw body — verifies authenticity
- **Durable outbox** — `callback_outbox` + delivery attempt history
- **Exponential backoff retries** — 5s, 30s, 2m, 10m, 1h (max 5 attempts)
- **At-least-once delivery** — merchants implement idempotent handling
- **Delivery-ID deduplication** — `X-Gateway-Delivery-Id` header
- **Circuit breaker** — opens after 5 failures, dead-letter queue for unreachable endpoints

---

## Security

- **Tenant isolation** — server-authoritative merchant identity, no cross-tenant access
- **MFA required** for sensitive operations (merchant state changes, key rotation, connection approval)
- **API key secrets SHA-256 hashed**, client secrets encrypted at rest
- **Webhook signatures verified with HMAC-SHA256**
- **No manual UTR entry** — automatic capture from authorized provider APIs
- **Sessions expire after 8 hours**, CSRF protection on all state-changing requests
- **Never commit plaintext credentials to Git** — `.env` is gitignored

---

## Runtime

- **Node.js 22.13+** required
- `npm ci --include=dev` installs all dependencies
- `npm run typecheck` — TypeScript validation
- `npm test` — 63 regression test suites
- `node scripts/scan-secrets.js` — secret scan (693 tracked paths)

Start services:
- `npm run start:hosted` — all hosted services
- `npm run start:prod:api` — Payment API (port 6100)
- `npm run start:super-admin` — Super Admin Control Center (port 9000)

---

## Verified Results (2 November 2026)

| Check | Result |
|-------|--------|
| TypeScript typecheck | PASS |
| Regression tests | 63 suites pass |
| Secret scan | PASS (693 tracked paths) |
| UPI intent engine | IMPLEMENTED |
| Intent-return flow | IMPLEMENTED |
| Callback webhooks | IMPLEMENTED |
| Server concurrency fixes | APPLIED (backlog 4096, UV_THREADPOOL_SIZE=128) |
| Sweep timer consolidation | APPLIED |
| 7 production features | IMPLEMENTED |

---

## Release Discipline

Work on a review branch; merge/deploy production only with explicit approval. Never commit `data/.secrets`, backups, keystores, or private PDFs. Green source tests do not establish live provider verification or production financial readiness — activate your live UPI receiving VPA before processing real payments.
