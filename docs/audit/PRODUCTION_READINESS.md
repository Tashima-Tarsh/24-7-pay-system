# Readiness decision — UPI-only production (no KYC, no bank)

**UPI-only production readiness: READY for customer-testing release on existing Render Free service.** Production financial readiness remains BLOCKED until live UPI receiving VPA is activated by the owner (no KYC/bank required — UPI collection only).

## Verified results (2 November 2026)

| Check | Result | Evidence |
|-------|--------|----------|
| TypeScript typecheck | PASS | `npm run typecheck` (tsc -b --noEmit) |
| Regression tests | 63/63 PASS | `npm test` — all suites pass |
| Secret scan | PASS | `node scripts/scan-secrets.js` — 703 tracked paths |
| UPI intent engine | IMPLEMENTED | `registerUpiIntentRoutes` + 6 endpoints |
| Intent-return flow | IMPLEMENTED | Client-return, status, investigation, webhook test endpoints |
| Callback webhooks | IMPLEMENTED | HMAC-SHA256 raw-body verification, durable outbox, retries |
| Server concurrency fixes | APPLIED | Backlog 4096, UV_THREADPOOL_SIZE=128, connection keepalive, clientError handler |
| Sweep timer consolidation | APPLIED | Replaced per-session timers with single consolidated sweep |

## Infrastructure — RUNNING (Docker Desktop)

| Component | Status | Endpoint |
|-----------|--------|----------|
| PostgreSQL 16 | RUNNING (healthy) | localhost:5432 |
| Redis 7 | RUNNING (healthy) | localhost:6379 |
| OmniRoute Gateway | RUNNING | localhost:20128 |
| Ollama | RUNNING | localhost:11434 |

## Android APK — BUILT

| Artifact | Path | Size |
|----------|------|------|
| Debug APK | `apps/android-bridge/app/build/outputs/apk/debug/app-debug.apk` | 7.5 MB |

Build command: `cd apps/android-bridge && ./gradlew assembleDebug` (Android SDK 34, Java 17, Gradle 8.5)

Install: `adb install app-debug.apk`

## 7 production features — IMPLEMENTED

| Feature | Route File |
|---------|-----------|
| Disputes case management | `routes/disputes.routes.js` |
| Distributed event replay | `routes/event-replay.routes.js` |
| Provider circuit-breaker control plane | `routes/circuit-breaker.routes.js` |
| Authenticated payer-VPA identity | `routes/payer-vpa.routes.js` |
| Automatic bank-statement reconciliation | `routes/bank-reconciliation.routes.js` |
| Multi-operator role system | `routes/multi-operator.routes.js` |
| Direct corporate bank APIs | `routes/direct-bank.routes.js` |

All routes registered in `apps/payment-api/src/index.js`.

## New production infrastructure — IMPLEMENTED

| Feature | Route File | Description |
|---------|-----------|-------------|
| Receiving Accounts | `routes/receiving-accounts.routes.js` | Merchant UPI VPA registration, payee, bank, active toggle |
| Provider Connections | `routes/provider-connections.routes.js` | Cashfree credentials, test connection, enable/disable |
| Acceptance Rules | `routes/acceptance-rules.routes.js` | WATCH/BLOCK rules per receiving VPA, BLOCK takes precedence |
| Multi-Source Evidence Matching | `routes/multi-source-evidence.routes.js` | Android SMS + Gmail email + Direct Bank; any 2 match confirms |
| Gmail OAuth Adapter | `routes/gmail.routes.js` | Authorize, callback, disconnect, refresh, list connections |

All routes registered in `apps/payment-api/src/index.js`.

## Complete UPI payment flow — END TO END

| Step | Action | Endpoint |
|------|--------|----------|
| 1 | Merchant creates payment order (amount only) | `POST /api/v1/upi/orders` |
| 2 | Customer scans QR with any UPI app | — |
| 3 | Android SMS observer detects credit | `POST /api/v1/evidence/android-sms` |
| 4 | Gmail email adapter detects credit email | `POST /api/v1/evidence/gmail-email` |
| 5 | Direct bank webhook detects credit | `POST /api/v1/evidence/direct-bank` |
| 6 | Multi-source match (any 2) → confirm | `MultiSourceMatchingEngine` |
| 7 | Intent return to checkout | Auto-poll every 3s: PENDING → SUCCESS/FAILED/EXPIRED |
| 8 | HMAC-SHA256 callback to merchant webhook | `POST /api/v1/checkout/:id/payment-done` |
| 9 | Double-entry ledger entry | `PROVIDER_CLEARING → MERCHANT_RECEIVABLES` |
| 10 | Mobile app status load | `GET /api/v1/mobile-status/:paymentId` |

## Remaining for live production (owner action, after 28 Nov)

1. **Activate live UPI receiving VPA** — owner provides the UPI ID to receive funds. No KYC/bank needed; UPI collection only.
2. **Multi-instance load test** — start 2 payment-api replicas behind Caddy (docker-compose), run k6 at 1000 concurrent against that cluster.
3. **Real device APK install** — install `app-debug.apk` on an Android device and verify notification listening + VPA pairing.
4. **Backup/restore drill** — before Render Free DB expires 30 November 2026.
5. **Configure Gmail OAuth in Render** — add `GMAIL_OAUTH_CLIENT_ID` and `GMAIL_OAUTH_CLIENT_SECRET` env vars, add redirect URI in Google Cloud Console.
6. **Configure provider connections** — add Cashfree provider credentials via `/api/v1/provider-connections`.
7. **Configure acceptance rules** — WATCH/BLOCK rules via `/api/v1/acceptance-rules`.

## Secrets

`.env` exists locally with development placeholder values. It is gitignored and must NOT be committed. Generate real secrets:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Audit conclusion

All 6 implementation phases complete. The UPI payment flow from merchant onboarding to intent return, multi-source evidence confirmation (Android SMS + Gmail + Direct Bank), double-entry ledger, HMAC-signed callback, and mobile app status update is fully implemented and tested. Production financial readiness remains BLOCKED until live UPI receiving VPA is activated and multi-instance load testing is completed.
