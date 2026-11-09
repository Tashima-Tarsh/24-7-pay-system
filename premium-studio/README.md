# 24/7 Pay — Cinematic Premium Merchant Studio

A full-screen, responsive React/Vite merchant interface at `/premium-studio/index.html`. It keeps the original production backend, `/platform` workspace, checkout flow, financial database, verification state machine and outgoing callbacks unchanged.

## Technology

React 18, Tailwind v4, shadcn-style Button/Card primitives, Radix Tabs, Motion, Phosphor React icons, Visx charts, editorial typography and responsive Apple-inspired rounded controls. Scalar documentation remains at `/api-reference.html`.

## Real payment-link creation

1. Sign in with your existing merchant credentials directly in Premium Studio (or use an existing same-tab session).
2. Open **Create payment link**, enter an order reference and INR amount, and submit.
3. The frontend calls `POST /api/platform/v1/payments` with the existing bearer session and a stable `Idempotency-Key`.
4. A successful backend response supplies `checkoutUrl`. Only same-origin HTTP(S) checkout paths are opened or copied.
5. The existing customer checkout handles active UPI QR and app-intent handoff. **UPI app return is not confirmation.** Only the existing bank/PSP provider-authoritative backend status may confirm the order.

Payment creation is limited to authenticated **merchant** accounts with the `payments.create` permission. Platform operators may inspect transactions but do not impersonate merchant accounts for payment creation. The frontend does not have a mark-paid, manual UTR approval, ledger rewrite, settlement override, or spoofed callback path.

## Safety boundary

- GET-only for monitoring KPIs, payments and callback delivery records.
- The *only business write* in Premium Studio is the existing permissioned payment-creation API. User sign-in continues to use the existing bearer authentication route.
- The idempotency key is reused for explicit retries of an unchanged request, avoiding unintended duplicates after an uncertain network response.
- Bank/PSP verification, refunds, payouts, settlement, ledger, payment state transitions and signed webhook delivery are not implemented in the frontend and remain exclusively backend-owned.
- Original active merchant console, backend source code, `server.mjs`, root npm workspace and database schema are untouched.

## Build and review

```sh
node --test scripts/premium-react-boundary.test.js
npm ci --prefix premium-studio --no-audit --no-fund
npm run build --prefix premium-studio
```

The isolated CI workflow compiles the static output to `public/premium-studio/` and archives it for review. Production should deploy the compiled assets only after TypeScript, financial boundary tests, the pre-existing payment regression workflow, and the Render rollout succeed.

### Review before replacing classic `/platform`

Verify: merchant sign-in, role-based permissions, payment link creation against a safely configured merchant account, same-origin checkout URL, QR and UPI intent handoff on a physical device, duplicate submission idempotency, responsive mobile layout, browser accessibility, and production rollback. Until verified, keep the classic workspace as an always-available alternative.
