# 24/7 Pay — Evidence-based release readiness

Assessment date: 2026-11-10

## Scope
Active merchant workspace: `public/platform.html`, `public/assets/247-portal.js` and `public/assets/247-brand.css`.
Payment engine, PostgreSQL persistence, bank/PSP ingress and outgoing merchant callback logic remain managed by the existing backend.

## Implemented in the premium workspace
- Real backend KPI overview with outcome distribution and transparent unclassified states
- Transaction browsing with client-side search/status filters on the latest 50 fetched records
- Backend-sourced payment event timeline with explicit distinction between observations, payment state and callback HTTP delivery
- Callback delivery explorer with server-provided attempts, HTTP response, next retry and existing-event redelivery
- Existing payment creation with idempotency key and merchant-scoped access
- Existing provider connection diagnostics and permissioned configuration

## Automated quality gates
Workflow: `.github/workflows/quality-gates.yml`
- Locked dependency installation with Node 22
- Active portal syntax verification
- Runtime JavaScript build validation
- TypeScript checking
- Existing full regression suite and uploaded results

**Never claim the workflow passed until its latest GitHub Actions run has conclusion `success`.**

## Release blockers requiring operational evidence
1. Verified live UPI transactions using an authorized bank/PSP source and the intended merchant account, including rejected/expired cases
2. Bank- or PSP-authoritative confirmation, exact amount/currency/payment reference attribution, and settlement reconciliation
3. Callback endpoint connectivity with real signed events, duplicate delivery, retry recovery and merchant idempotency
4. Real production database backup/restore drill, migrations and secrets audit
5. Render deployment of the intended commit and authenticated browser-based end-to-end verification
6. Physical-device Android intent checkout tests with Google Pay and PhonePe; returning from an app is **not** proof of payment
7. Role/tenant isolation, concurrent transactions, error budgets and load/latency SLO evidence
8. Accessibility/responsive UI validation, including mobile checkout and merchant portal

## Release decision
**NOT YET PRODUCTION-VERIFIED**. A passing CI run is required but insufficient evidence for a live payment product. Do not change this status to `READY` without links to the results of every applicable release gate.

## Scope exclusions
This increment does not replace the payment core with Hyperswitch. Full visual routing editor, enhanced reconciliation operations and complete developer-studio redesign are future feature work, not completed features.
