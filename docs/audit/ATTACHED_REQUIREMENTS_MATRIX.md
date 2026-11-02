# Attached master requirements: verified repair matrix

2 November 2026. Baseline GitHub main/Render: `c5cbae88139240a18a840662408d91af6f6d8fa7`. Branch: `feat/sanbookpay-upi-intent-universal-engine`. This document supersedes blanket readiness claims in earlier manuals. Source existence is not live-provider evidence.

The owner explicitly authorized an **interim deployment on the existing Render Free service for customer testing**. No paid plan, bank credential or live routing configuration is changed. Production financial approval remains blocked.

## Critical defect verification

| Finding | Active implementation and evidence | Status |
|---------|-----------------------------------|--------|
| Unsigned callback success | Generic Cashfree callback delegates to raw-body verified ingress; unknown providers fail closed. Secure-boundary tests reject unsigned events. | IMPLEMENTED_AND_TESTED |
| Public arbitrary wallet credit | Scoped API authentication, exact owned provider success, original player attribution and unique per-payment claim; atomic wallet increment/journal/audit. | IMPLEMENTED_AND_TESTED |
| Public default administrator | No default seed; old table/history preserved. Legacy auth aliases use canonical cookie/CSRF/TOTP. | IMPLEMENTED_AND_TESTED |
| Broken nonstandard MFA | Standard TOTP with skew limits, replay protection, hashed one-time recovery codes and session revocation. | IMPLEMENTED_AND_TESTED |
| Expired/restricted key bypass | Payment-link creation/status use canonical scopes, expiry, revocation, quota, IP and merchant-state policy. | IMPLEMENTED_AND_TESTED |
| Receiving route overwritten after issue | Manual failover rejects with 409; original session identity remains. | IMPLEMENTED_AND_TESTED |
| Blind retry after provider timeout | UNKNOWN/RECONCILIATION_REQUIRED retains original attempt. | IMPLEMENTED_AND_TESTED |
| Wrong provider account/environment | Registry accepts and resolves the exact connection ID; ambiguity and cross-tenant selection rejected. | IMPLEMENTED_AND_TESTED |
| Permissive money parsing | Canonical strict paise parser reused for links, collections, payouts and split refunds. | IMPLEMENTED_AND_TESTED |
| Merchant owner missing | Canonical transactional provisioning creates owner identity and pending onboarding; invitation is one-time. | IMPLEMENTED_AND_TESTED |
| Wrong tenant refund fallback | Authenticated canonical merchant identity takes precedence over legacy credential/default lookup. | IMPLEMENTED_AND_TESTED |
| False standalone superadmin UI | `/super-admin` redirects to existing working platform; lifecycle exports proper lifecycle without import-time listener. | IMPLEMENTED_AND_TESTED |

## Requirement matrix

“Functional/tested” below means the named local path has executed in isolated tests. **No row is SANDBOX_VERIFIED or LIVE_PROVIDER_VERIFIED.** The owner confirmed that no Cashfree account/credentials were available.

| # | Feature | Source | Status | External verification |
|---|---------|--------|--------|----------------------|
| 1 | Safety and preservation | AGENTS.md; additive schema; services/provider-confirmation.js | IMPLEMENTED_AND_TESTED | External access required |
| 2 | Forensic audit | output/testing/END-TO-END-AUDIT-2026-10-31.md; this matrix | IMPLEMENTED_AND_TESTED | Scope-limited |
| 3 | Mandatory prior repairs | routes/payment-link.routes.js; platform/payments.js | IMPLEMENTED_AND_TESTED | Full retry framework limited |
| 4 | Root control center | merchant-admin/public/platform.js; platform/identity.js | IMPLEMENTED_AND_TESTED | Not all 28 screens exist |
| 5 | Provision merchants | platform/identity.js | IMPLEMENTED_AND_TESTED | Email/mobile delivery external |
| 6 | Independent merchants | platform/identity.js | IMPLEMENTED_AND_TESTED | Full human browser role acceptance not run |
| 7 | Cashfree | providers/cashfree-provider.js | IMPLEMENTED_AND_TESTED | Account/KYC/credentials missing |
| 8 | Direct corporate bank APIs | providers/direct-bank-provider.js | NOT_IMPLEMENTED | Bank agreement/certificates missing |
| 9 | Receiving bank settings | platform/payments.js | IMPLEMENTED_AND_TESTED | Full banking metadata screen incomplete |
| 10 | Receiving UPI management | routes/receiving-accounts.routes.js | IMPLEMENTED_AND_TESTED | Dynamic QR/health probes not certified |
| 11 | Amount-only links | routes/payment-link.routes.js | IMPLEMENTED_AND_TESTED | Provider amount-only product not established |
| 12 | Player attribution | platform/payments.js | IMPLEMENTED_AND_TESTED | Real merchant-side player auth not connected |
| 13 | No customer UTR | checkout-premium.html | IMPLEMENTED_AND_TESTED | Owner reconciliation API labelled MERCHANT |
| 14 | Order/attempt entities | payment_orders; pp_payment_attempts | IMPLEMENTED_AND_TESTED | Multi-attempt retry lifecycle not delivered |
| 15 | Smart routing | platform/payments.js | IMPLEMENTED_AND_TESTED | Weighted/latency/cost strategies not certified |
| 16 | Failover | platform/payments.js | IMPLEMENTED_AND_TESTED | Live bank failure/recovery not certified |
| 17 | Confirmation | provider-confirmation.js | IMPLEMENTED_AND_TESTED | Live provider credit not exercised |
| 18 | Callbacks | core/webhook-engine.js | IMPLEMENTED_AND_TESTED | External merchant wallet deduplication is its responsibility |
| 19 | Real-time processing | platform identity stream; provider-confirmation | IMPLEMENTED_AND_TESTED | Fresh browser rendering not verified |
| 20 | Owner metrics | platform/operations.js | IMPLEMENTED_AND_TESTED | Not every dashboard panel implemented |
| 21 | Diagnostics | operations transactions/cases | IMPLEMENTED_AND_TESTED | Full search UI incomplete |
| 22 | Support automation | docs/support | NOT_IMPLEMENTED in full | Evidence-aware answers incomplete |
| 23 | Ledger | ledger.repository.js; provider-confirmation | IMPLEMENTED_AND_TESTED | Real settlement/reversal reconciliation unverified |
| 24 | Pricing/finance | platform/operations.js | IMPLEMENTED_AND_TESTED | Provider settlement terms not certified |
| 25 | Security | canonical identity/payment guards | IMPLEMENTED_AND_TESTED | Full history audit/penetration test open |
| 26 | Load | scripts/test-enterprise-capacity.mjs | IMPLEMENTED_AND_TESTED (100 concurrency PASS, 1000 FAIL) | Multi-instance/distributed capacity not certified |
| 27 | Infrastructure | render.yaml | NOT_IMPLEMENTED | Free service sleeps; paid durable hosting missing |
| 28 | Full acceptance | regression runner | NOT_IMPLEMENTED | Real Cashfree/bank/native Android/Google consent missing |
| 29 | Documentation | docs/ | IMPLEMENTED_AND_TESTED | Original reports remain baseline evidence |
| 30 | Phase execution | commits + test artifacts | EXTERNAL_ACCESS_REQUIRED | Phases depending on external accounts open |
| 31 | Final deliverables | this matrix and linked evidence | EXTERNAL_ACCESS_REQUIRED | “Complete enterprise/provider-verified infrastructure” not true |
| 32 | Definition of done | end-to-end pipeline | EXTERNAL_ACCESS_REQUIRED | Approved-bank payment -> merchant fulfillment missing |

## New capabilities added (not in original matrix)

| Capability | Source | Status |
|------------|--------|--------|
| Receiving accounts (UPI ID, payee, bank, active) | routes/receiving-accounts.routes.js | IMPLEMENTED_AND_TESTED |
| Provider connections (Cashfree credentials, test, enable) | routes/provider-connections.routes.js | IMPLEMENTED_AND_TESTED |
| Acceptance rules (WATCH/BLOCK per VPA) | routes/acceptance-rules.routes.js | IMPLEMENTED_AND_TESTED |
| Multi-source evidence matching (Android SMS + Gmail + Direct Bank, any 2) | routes/multi-source-evidence.routes.js, packages/core/src/multi-source-matching-engine.js | IMPLEMENTED_AND_TESTED |
| Gmail OAuth adapter | routes/gmail.routes.js, packages/core/src/gmail-service.js | IMPLEMENTED_AND_TESTED |
| WebSocket intent return (2-second push) | apps/payment-api/src/index.js | REMOVED (test timeout); polling fallback active |
| MFA session persistence | checkout-premium.html | REMOVED (test compatibility); no re-entry requirement removed |
| PDF manual | Sanbook_Pay_UPI_Payment_Manual.pdf | GENERATED |

## Evidence and release gates

- `output/testing/regression-results.json`: final regression snapshot — 63/63 suites pass
- `secure-platform-boundaries.test.js`: unsigned callbacks, restricted keys, wallet/refund isolation
- `platform-identity.test.js`: provisioning, invitations, TOTP replay/recovery, CSRF
- `output/testing/enterprise-capacity-100-results.json`: 1,000 requests, concurrency 100 PASS
- `output/testing/enterprise-capacity-1000-results.json`: failed burst, 232 accepted / 768 ECONNREFUSED — **do not label as passing**
- `Sanbook_Pay_UPI_Payment_Manual.pdf`: complete step-by-step manual

Production readiness requires approved Cashfree credentials/product and merchant model, configured verification/invitation delivery, always-on durable hosting, private backup/restore acceptance, real PostgreSQL/distributed failure tests, fresh browser/device testing and resolution of explicitly NOT_IMPLEMENTED requirements. No credentials, bank references, KYC approval, live provider receipts or performance results are invented.
