# 24/7 Pay — Active Merchant Workspace Feature-Parity Audit
Date: 10 November 2026
Scope: current React premium-studio, payment-api/platform and relevant packages. Static code inspection plus existing CI. This is not bank/PSP integration certification.

## Verified working surfaces and code
| Capability | Backend evidence | Merchant React workspace | Status / limitation |
|---|---|---|---|
| Payment link creation | platform/payments.js POST /payments, active receiving account, idempotency | PaymentLinkStudio | UI wired; provider settlement must still be independently verified |
| Receiving UPI ID | platform/payments.js /receiving-accounts and /state | MerchantUpiAccounts | Create, activate/deactivate, list. One active account; active state is not bank verification |
| Transactions | platform/operations.js /transactions, /dashboard/kpis | App.tsx explorer and KPIs | Last 50 loaded results; filters client-side |
| Analytics | platform/operations.js /dashboard/kpis | App.tsx Visx outcome donut and a 7-day trend from loaded orders | Trend is a sample, not full data warehouse history |
| Callback deliveries | platform/payments.js /webhook-deliveries and retry | App.tsx callback monitor | Read-only monitor; retry, configuration and secret rotation are not yet exposed in React |
| Double-entry ledger | platform/payments.js GET /balance using LedgerRepository | MerchantOperations ledger tab | Account balances shown; does not imply bank balance |
| API key inventory | platform/payments.js GET /api-keys, /api-usage | MerchantOperations API & providers | Read-only metadata; issuing/rotating/revoking keys is not yet exposed in React |
| Provider connections | platform/payments.js GET /connections | MerchantOperations API & providers | Inventory shown; configuration and tests still need UI |
| Rules and policy | platform/payments.js GET /rules | MerchantOperations Risk controls | Read-only inventory; creation/editing and history need UI |
| Platform merchant administration | platform/identity.js /merchants, /staff | AdminConsole | Creating merchants and staff invitation, directory; does not yet cover all platform operations |
| Support/reconciliation cases | platform/operations.js /cases | Not yet shown in React | Backend endpoints exist; requires a scoped cases workspace |
| Billing/invoices | platform/operations.js /billing/* | Not yet shown in React | Platform finance permissions and merchant finance permissions need separate UI |
| Outgoing notifications | services/notification-delivery.service.js | Not shown in React | Runtime service exists with configured channels; no merchant-facing scoped delivery console verified |
| Quarantine/fraud holds | packages/core/src/quarantine/engine.js | Not shown | Class is exported but no runtime invocation of evaluateQuarantine found by code search; do not describe it as active |
| VPA scoring/routing | packages/core/src/vpa/* | MerchantUpiAccounts diagnostic copy only | Some supporting library code exists; automatic active routing/integration cannot be claimed from file presence alone |
| Audit logs and compliance | platform/identity.js and database audit | Limited diagnostics | No complete searchable cross-module audit console in premium React |

## Immediate fixes implemented
- Premium workspace: consistent enterprise glass-style surfaces, interactive controls, typography, responsive navigation and data presentation.
- New protected read-only merchant screens for internal ledger, merchant API-key metadata and usage, provider connections, and policy rules.
- Seven-day payment count chart from latest loaded backend rows; no fabricated amounts or settlement statistics.
- Render build now installs premium-studio devDependencies and rebuilds the React app instead of reusing stale generated files.
- No new payment-approval, merchant-scope, or money-settlement authorization routes introduced.

## Known verification gaps
- Re-run Render build and GitHub CI after each new change. The working branch is main; no payment-processing functions were modified by this UX pass.
- Run Playwright on desktop + 390px and 360px browsers and verify real account navigation.
- The separate original /legacy-console UI remains a fallback, not the active React premium workspace.
- Do not treat an empty dataset as a production-ready KPI, a bank confirmation, or successfully delivered callback.
- No real-money or bank-provider tests were performed for this audit.

## Methods and reused open-source code
- WondelAI skills: refactoring-ui, web-typography, ux-heuristics, top-design, steve-jobs-design-review (from user-supplied create-website skill); methodology applied, external skill software not installed.
- Existing dependencies actually reused: React, Radix UI Tabs, Visx pie, Tailwind CSS, class-variance-authority, Phosphor icons, Motion and Vite.
- Inspired by enterprise BI/SaaS information architecture, not copied proprietary Salesforce or Power BI code.
- The user-listed scanners (Trivy, Semgrep, ZAP, Sentry, Biome, Pa11y, Keploy, Scorecard, StrykerJS, Spectral and KICS) were not all executed by this UI feature-parity pass. Do not claim otherwise.
