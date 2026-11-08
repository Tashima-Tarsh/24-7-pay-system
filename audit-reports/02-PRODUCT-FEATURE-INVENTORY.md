# 24-7 PAY SYSTEM — PRODUCT FEATURE INVENTORY

**Classification basis:** Source code inspection only (not README documentation)  
**Statuses:** IMPLEMENTED AND VERIFIED / IMPLEMENTED BUT UNTESTED / PARTIALLY IMPLEMENTED / BROKEN / NOT IMPLEMENTED / NOT APPLICABLE

---

## Backend — apps/payment-api (Node.js, Express-like)

| Feature | Status | Evidence |
|---------|--------|----------|
| Payment order creation | IMPLEMENTED AND VERIFIED | `registerPaymentRoutes`, `registerOrderCreateRoutes`, `registerVerifyCallbackRoutes` |
| Merchant identification | IMPLEMENTED AND VERIFIED | `MerchantRepository`, `x-merchant-id`/`x-merchant-key` auth |
| VPA allocation / rotation | PARTIALLY IMPLEMENTED | `VpaRotationGuard`, `vpa/routing-engine.js`, `vpa/health-scorer.js`; no concurrency test |
| Amount binding | IMPLEMENTED AND VERIFIED | `amount_paise` bound at session creation |
| Order expiration | IMPLEMENTED AND VERIFIED | `TimingEngine` (active/processing/verification windows) |
| UPI intent generation | IMPLEMENTED | `upi-intent-builder.js`, `registerUpiIntentRoutes` |
| QR generation | IMPLEMENTED | `packages/core/src/qr.js`, `upi-qr.js` |
| Callback registration | IMPLEMENTED AND VERIFIED | `WebhookEngine`, `callback_outbox`, `callback_delivery_attempts` |
| Unique transaction identifiers | IMPLEMENTED AND VERIFIED | `order-tokens.sql`, `idempotency.repository.js`, UTR handling |
| Callback verification (authentic) | IMPLEMENTED AND VERIFIED | `PaymentVerificationPipeline`, `attributionEngine.reconcilePendingPayment` |
| Callback verification (forged/replay/duplicate) | IMPLEMENTED AND VERIFIED | Idempotency repository + state machine guard (e2e tested) |
| Webhook delivery with retry | IMPLEMENTED AND VERIFIED | `webhookEngine.retryPending` every 5s, max 5 retries |
| Recovery engine (crash recovery on boot) | IMPLEMENTED AND VERIFIED | `RecoveryEngine.recover()` on boot; chaos-concurrency test passes |
| Refunds | IMPLEMENTED | `registerRefundsRoutes`, `refund.repository.js` |
| Settlements | IMPLEMENTED | `registerSettlementsRoutes`, `settlement.repository.js` |
| Split settlements | IMPLEMENTED | `registerSplitSettlementRoutes` |
| Payouts | IMPLEMENTED | `registerPayoutsRoutes`, `payout.repository.js` |
| Banking routes / connectors | PARTIALLY IMPLEMENTED | `banking-connector.js`, direct-bank provider; not live-tested |
| Disputes | IMPLEMENTED | `registerDisputesRoutes`, `dispute-case-manager.js` |
| Event replay | IMPLEMENTED | `registerEventReplayRoutes` |
| Circuit breaker | IMPLEMENTED | `registerCircuitBreakerRoutes` |
| Payer VPA | IMPLEMENTED | `registerPayerVpa.routes.js` |
| Bank reconciliation | IMPLEMENTED | `registerBankReconciliationRoutes` |
| Multi-operator | IMPLEMENTED | `registerMultiOperatorRoutes` |
| Direct bank | IMPLEMENTED | `registerDirectBank.routes.js` |
| Code attestation | IMPLEMENTED | `registerCodeAttestationRoutes` |
| Receiving accounts | IMPLEMENTED | `registerReceivingAccountRoutes` |
| Provider connections | IMPLEMENTED | `registerProviderConnectionsRoutes` |
| Acceptance rules | IMPLEMENTED | `registerAcceptanceRulesRoutes` |
| Super admin | IMPLEMENTED | `registerSuperAdminRoutes` |
| MFA | PARTIALLY IMPLEMENTED | `MfaRepository`, SMS/Gmail verification levels tested; bypass flags forbidden in prod |
| Device binding | IMPLEMENTED AND VERIFIED | `device-binding-duplicate-session.test.js` passes |
| Rate limiting | IMPLEMENTED AND VERIFIED | `rate-limit.test.js` passes |
| Fraud ban pipeline | IMPLEMENTED AND VERIFIED | `fraud-ban-pipeline.test.js` passes |
| WhatsApp Berry (observer) | PARTIALLY IMPLEMENTED | `whatsapp-berry.service.js`; simulated mode in tests |
| Gmail observer | PARTIALLY IMPLEMENTED | `gmail-service.js`, `gmail-routes.js`; NOT callback-only mandatory path |

## Frontend — apps/checkout-portal (Next.js)

| Feature | Status | Evidence |
|---------|--------|----------|
| Overview dashboard | IMPLEMENTED AND VERIFIED | `pages/index.tsx`, `next build` passes |
| Payments table | IMPLEMENTED AND VERIFIED | `pages/payments.tsx`, table with status badges |
| Checkout / UPI intent pay | IMPLEMENTED AND VERIFIED | `pages/checkout/[id].tsx`, UPI URI launch, QR generation |
| VPA pool | NOT IMPLEMENTED | Not present in checkout-portal |
| Quarantine review | NOT IMPLEMENTED | Not present in checkout-portal |
| Reports | NOT IMPLEMENTED | Not present in checkout-portal |
| Settings | IMPLEMENTED | `pages/settings.tsx`, business profile + receiving UPI |
| Sidebar navigation | FIXED | `components/Sidebar.tsx` — `next/link` + `useRouter` |
| + Create payment button | FIXED | `components/Header.tsx` → `/checkout` |
| Command palette (Cmd+K) | IMPLEMENTED | `components/CommandPalette.tsx`, `useToast` |
| Toast notifications | IMPLEMENTED | `useToast.tsx` + `Toast.tsx` + `ToastProvider` in AppShell |
| Auth (login) | IMPLEMENTED AND VERIFIED | `pages/login.tsx`, backend auth via `/api/v1/auth/verify` |

## Frontend — apps/master-merchant-portal (Next.js)

| Feature | Status | Evidence |
|---------|--------|----------|
| Auth (login/register) | IMPLEMENTED | `app/(auth)/login/page.tsx`, `register/page.tsx` |
| Merchant dashboard | IMPLEMENTED | `app/(merchant)/dashboard/page.tsx` |
| Security settings | IMPLEMENTED | `app/(merchant)/security/page.tsx` |
| UPI IDs | IMPLEMENTED | `app/(merchant)/upi-ids/page.tsx` |
| Audit log | IMPLEMENTED | `app/(merchant)/audit-log/page.tsx` |
| API backend routes | IMPLEMENTED | `app/api/backend/[...segments]/route.ts` |

## Backend — apps/master-payment-api (TypeScript)

| Feature | Status | Evidence |
|---------|--------|----------|
| HTTP payment API | IMPLEMENTED | `src/app.ts`, `src/payment.ts`, `src/store.ts`, `src/throttle.ts` |
| Tests | IMPLEMENTED AND VERIFIED | `test/http.test.ts`, `test/payment.test.ts` |

## Shared Packages

| Package | Status | Evidence |
|---------|--------|----------|
| `@youpi/common` | IMPLEMENTED AND VERIFIED | State machine, enums, crypto, secrets, money, observation, upi; `tsc` clean |
| `@youpi/core` | IMPLEMENTED AND VERIFIED | Queue/timing/attribution/recovery/webhook engines; tests pass |
| `@youpi/db` | IMPLEMENTED AND VERIFIED | SQLite/Postgres, repositories, migrations, schema; ACID + FK |
| `@youpi/ui` | IMPLEMENTED AND VERIFIED | Button/Card/Badge/Input/Skeleton/cn; checkout-portal builds |
| `@youpi/design-tokens` | IMPLEMENTED | `tokens.css` |
| `@youpi/merchant-sdk` | IMPLEMENTED | `client.js`, `youpi.js`, `youpi-checkout.js`; tests pass |

## Deleted (per product request — Sanbook store removal)

| Item | Action |
|------|--------|
| `Sanbook_Pay_UPI_Payment_Manual.pdf` | Deleted |
| `apps/merchant-admin/public/sanbook-pay-admin.{css,js}` | Deleted |
| `apps/payment-api/src/__tests__/sanbook-pay-production.test.js` | Deleted |
| `packages/merchant-sdk/src/__tests__/sanbook-pay-sdk.test.js` | Deleted |
| `scripts/test-all.js` | Sanbook entries removed |

## NOT IMPLEMENTED (not part of declared callback-only architecture)

| Item | Rationale |
|------|-----------|
| Gmail/SMS/Android notification observer as payment-confirmation fallback | Explicitly excluded — callback-only architecture |
| Manual UTR verification as settlement proof | Excluded — callback/attribution is authoritative |
| Multi-tenant SaaS subscriptions | Not declared as requirement; white-label self-hosted |
| Mobile native apps | `youpi-sms-gateway.apk` present as asset, not audited |
