# Readiness decision — UPI-only production (no KYC, no bank)

UPI-only production readiness: READY for customer-testing release on existing Render Free service. Production financial readiness remains BLOCKED until live UPI receiving VPA is activated by the owner (no KYC/bank required — UPI collection only).

## Verified results (2 November 2026)

| Check | Result | Evidence |
|-------|--------|----------|
| TypeScript typecheck | PASS | `npm run typecheck` (tsc -b --noEmit) |
| Regression tests | 63/63 PASS | `npm test` — all suites pass |
| Secret scan | PASS | `node scripts/scan-secrets.js` — 693 tracked paths |
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

## Remaining for live production (owner action, after 28 Nov)

1. **Activate live UPI receiving VPA** — owner provides the UPI ID to receive funds. No KYC/bank needed; UPI collection only.
2. **Multi-instance load test** — start 2 payment-api replicas behind Caddy (docker-compose), run k6 at 1000 concurrent against that cluster.
3. **Real device APK install** — install `app-debug.apk` on an Android device and verify notification listening + VPA pairing.
4. **Backup/restore drill** — before Render Free DB expires 30 November 2026.

## Secrets

`.env` exists locally with development placeholder values. It is gitignored and must NOT be committed. Generate real secrets:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
