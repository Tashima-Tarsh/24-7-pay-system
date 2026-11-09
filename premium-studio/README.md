# 24/7 Pay premium React studio — protected migration

This is a **parallel, read-only React/Vite UI**, not a replacement payment gateway or a new verification system. The current production workspace remains `/platform` and the production Node gateway, routes, database and callbacks remain unchanged.

Actual libraries: React 19, Radix Tabs, Tailwind CSS v4 + shadcn-style local Button/Card primitives (configured via `components.json`), Motion (Framer Motion successor), Phosphor Icons React and Visx Pie. The production API reference continues to use the already deployed Scalar page.

## Safety boundaries
- Reads the existing same-origin bearer session created by `/platform` from sessionStorage. Unauthorized users are directed to the existing login.
- Makes **GET requests only** to existing merchant-operations endpoints; no financial writes, UTR processing, webhook retries or manual releases.
- Uses backend-recorded amounts and states; never fabricates settlement rates or success outcomes.
- All UI lives under the separate Vite project in `premium-studio/`. The existing root `package-lock.json`, `server.mjs`, `apps/payment-api`, `public/assets/247-portal.js` and checkout paths are untouched.
- The build emits `public/premium-studio` only after a successful compile. Do not replace `/platform` until a full functional browser review and production rollback drill.

## Test
```sh
node --test scripts/premium-react-boundary.test.js
npm install --prefix premium-studio --no-package-lock
npm run build --prefix premium-studio
```

The isolated `premium-studio.yml` workflow performs build and TypeScript validation on the PR. The existing payment regression workflow runs independently. Its artifact is a staged build for review, **not a production rollout**.

## Planned promotion
1. Ensure both workflows pass and no backend files changed.
2. Review compiled build in an authenticated browser on a staging URL, including all roles and merchant isolation.
3. Confirm mobile accessibility, API error states and CSP/static assets.
4. Only then expose the compiled `/premium-studio/` route as an optional preview without redirecting `/platform`.
5. Leave any cutover to a separate reviewed change with immediate rollback capability.

No real-money payment is initiated by this UI preview.
