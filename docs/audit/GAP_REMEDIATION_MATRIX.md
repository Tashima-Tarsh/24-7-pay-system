# Sanbookpay — Gap & Remediation Matrix (Phase 0 Audit)

**Repository:** https://github.com/Tashima-Tarsh/Sanbookpay
**Audit baseline:** main branch, 2 November 2026
**Branch:** `feat/sanbookpay-upi-intent-universal-engine`

Each gap maps to a remediation, the file(s) changed, and the verification status.

---

| # | Gap | Severity | Remediation | File(s) changed | Status |
|---|-----|----------|-------------|-----------------|--------|
| G1 | No generic UPI Intent Engine; app-specific packages assumed | HIGH | Built `packages/android-upi-intent-sdk` with `discoverCompatibleUpiApps()` using package-query for `upi://pay`, no hardcoding | `packages/android-upi-intent-sdk/*.kt` | Done (source) |
| G2 | No server-side intent-return API (intents create, client-return, status, events, compatibility, webhook test) | HIGH | Implemented `registerUpiIntentRoutes` with all 6 endpoints; idempotency, ownership enforcement | `apps/payment-api/src/routes/upi-intent-routes.js` + `index.js` | Done |
| G3 | Missing mission payment states | HIGH | Extended `PaymentStatus` enum and `VALID_TRANSITIONS` | `packages/common/src/enums.js`, `packages/common/src/state-transitions.js` | Done |
| G4 | Missing PaymentEvidenceLevel + new webhook event types | HIGH | Added `PaymentEvidenceLevel` enum and `UpiMirrorWebhookEvent` intent/credit/verified events | `packages/common/src/enums.js` | Done |
| G5 | Android observer uses avoidable 5-second polling loop | HIGH | Rewrote for event-triggered forwarding + `ForwardRetryWorker` WorkManager durable retry | `apps/android-bridge/.../MainActivity.kt`, `.../workers/ForwardRetryWorker.kt` | Done (source) |
| G6 | Redis unavailable silently falls back to in-memory queue | HIGH | Removed silent in-memory fallback; DB-backed `callback_outbox` for durable persistence | `apps/payment-api/src/index.js` | Done |
| G7 | No triple-signal correlation for UPI intent return source | HIGH | Added `AttributionEngine.processIntentReturnSignal` correlating intent return with bank observations | `packages/core/src/attribution-engine.js` | Done |
| G8 | No real-time payment investigation endpoint | MEDIUM | Added `GET /api/v1/payments/:id/investigation` | `upi-intent-routes.js` | Done |
| G9 | No universal "Pay by Any UPI App" on web checkout | MEDIUM | Added `payByAnyUpiApp` deep-link card + `upiIntentStatusStrip` | `apps/checkout-portal/src/views/checkout.html` | Done |
| G10 | Webhook secret rotation workflow missing | MEDIUM | `webhook_secret` stored on merchant connections; rotation requires explicit merchant action | — | Documented |
| G11 | Dashboard full-text search | MEDIUM | Investigation endpoint provides per-payment detail | — | Documented |
| G12 | Android APK cannot be built in this environment | MEDIUM | SDK source written; build requires Android SDK + Gradle | `packages/android-upi-intent-sdk/build.gradle.kts` | Documented |
| G13 | Performance targets not certified | MEDIUM | Targets documented; k6 load test required | — | Documented |
| G14 | App compatibility acceptance per UPI app | MEDIUM | Compatibility matrix template documented | — | Documented |
| G15 | Slice / Airtel / Jio not to be marked complete | HIGH | Generic UPI functionality preserved; provider-specific callbacks reported as limitations | CAPABILITY_MATRIX.md | Documented |
| G16 | No receiving account management | HIGH | `registerReceivingAccountRoutes` — UPI ID, payee, bank, active toggle | `routes/receiving-accounts.routes.js` | Done |
| G17 | No provider connection management | HIGH | `registerProviderConnectionsRoutes` — Cashfree credentials, test, enable/disable | `routes/provider-connections.routes.js` | Done |
| G18 | No acceptance rules (WATCH/BLOCK) | HIGH | `registerAcceptanceRulesRoutes` — rules per receiving VPA, BLOCK takes precedence | `routes/acceptance-rules.routes.js` | Done |
| G19 | No multi-source evidence matching | HIGH | `registerMultiSourceEvidenceRoutes` — Android SMS + Gmail + Direct Bank, any 2 confirm | `routes/multi-source-evidence.routes.js`, `packages/core/src/multi-source-matching-engine.js` | Done |
| G20 | No Gmail OAuth adapter | HIGH | `registerGmailRoutes` — authorize, callback, disconnect, refresh | `routes/gmail.routes.js`, `packages/core/src/gmail-service.js` | Done |

---

## Remediation verification

- `npm run typecheck` — PASSES
- `npm test` — 63/63 PASS
- `node scripts/scan-secrets.js` — PASSED (703 tracked paths)
- `npm ci --include=dev` — INSTALLED

## Items requiring external validation

- Android APK build on real device
- k6 load testing at 1000 concurrent against multi-instance cluster
- Real-device UPI app compatibility tests
- Docker Compose + environment configuration
- PostgreSQL acceptance
- Live provider / bank credentials

## Production deployment notes

- Do not deploy or merge without explicit authorization.
- Preserve existing merchant records, secrets, and financial ledgers.
- Client-return reports are buyer-reported (REPORTED evidence); confirmation requires multi-source match or bank/provider event.
