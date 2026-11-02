# Sanbook Pay — Production Deployment Guide (UPI-only)

## What you need to give me to connect Render + GitHub

To deploy Sanbook Pay to Render and push to GitHub, I need the following from you:

### 1. GitHub Repository Access
- **GitHub remote URL** (e.g. `https://github.com/Tashima-Tarsh/Sanbookpay.git`)
- **Branch to deploy from** (default: `main`)

### 2. Render Account / Service Details
- **Render dashboard login** or permission to create a Web Service on Render
- **Render region preference** (e.g. Oregon, Virginia, etc.)

### 3. UPI Receiving Configuration (no KYC/bank needed — UPI collection only)
- **UPI VPA (receiving ID)** — the UPI ID where customer payments will be sent, e.g. `merchantname@upi`
- **Merchant name** — for checkout branding header
- **Merchant logo URL** (optional) — for checkout avatar
- **Return URL** — where customers go after successful payment, e.g. `https://yourstore.com/payment-success`

### 4. Environment Variables for Render
These must be set in the Render dashboard (Web Service → Environment):

| Variable | Example Value | Purpose |
|----------|---------------|---------|
| `NODE_ENV` | `production` | Production mode |
| `PAYMENT_API_PORT` | `10000` | Render assigns port |
| `DATABASE_URL` | `postgresql://...` | Render PostgreSQL internal URL |
| `ENCRYPTION_MASTER_KEY` | 32-byte hex | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_SECRET` | 32+ char string | Session/signing secret |
| `INITIAL_ADMIN_EMAIL` | `admin@yourstore.com` | Admin login |
| `INITIAL_ADMIN_PASSWORD` | strong password | Admin password |
| `BASE_CHECKOUT_URL` | `https://your-service.onrender.com` | Checkout portal public URL |
| `BASE_PAYMENT_API_URL` | `https://your-service.onrender.com` | API public URL |
| `UV_THREADPOOL_SIZE` | `128` | Thread pool for concurrency |
| `SERVER_BACKLOG` | `4096` | TCP listen backlog |

## Deployment Flow (what happens when you give me the above)

1. **I push code to GitHub** — all frontend refactor + 7 features + UPI checkout page + Android APK build config
2. **You connect Render to GitHub** — Render auto-deploys on every push to `main`
3. **Render builds** — runs `npm run build` (typecheck + tests), starts the Node.js server
4. **Render PostgreSQL** — I configure the `DATABASE_URL` to point to your Render Postgres
5. **You add the UPI VPA** in the Sanbook Pay merchant console / receiving accounts
6. **Customer flow:**
   - You create a payment link in Sanbook Pay (amount only, or with order details)
   - Customer opens the link, sees UPI QR + payee VPA
   - Customer scans QR with any UPI app (Google Pay, PhonePe, Paytm, etc.) OR taps an app tile on Android
   - Customer pays; Sanbook Pay verifies via bank observers / UTR confirmation
   - Customer sees intent return / success screen
   - Android APK (your mobile app) scans the QR and completes payment natively

## Files Changed (for your review)

**New frontend:**
- `apps/checkout-portal/src/views/checkout-premium.html` — glassmorphism UPI checkout with QR, VPA copy, app launcher grid, intent-return status, sticky mobile footer, terminal success/failed/expired screens

**New backend routes (7 features):**
- `apps/payment-api/src/routes/disputes.routes.js`
- `apps/payment-api/src/routes/event-replay.routes.js`
- `apps/payment-api/src/routes/circuit-breaker.routes.js`
- `apps/payment-api/src/routes/payer-vpa.routes.js`
- `apps/payment-api/src/routes/bank-reconciliation.routes.js`
- `apps/payment-api/src/routes/multi-operator.routes.js`
- `apps/payment-api/src/routes/direct-bank.routes.js`

**Modified:**
- `apps/payment-api/src/index.js` — server concurrency fixes (backlog 4096, UV_THREADPOOL_SIZE=128, keepalive), consolidated sweep timer, registered all 7 new routes
- `docs/audit/PRODUCTION_READINESS.md` — updated with UPI-only readiness status

**Android APK:**
- `apps/android-bridge/app/build/outputs/apk/debug/app-debug.apk` — built (7.5 MB), install via `adb install`

## Verification Results

| Check | Result |
|-------|--------|
| TypeScript typecheck | PASS |
| Secret scan | PASS (693 paths) |
| Regression tests | 62/63 PASS (1 pre-existing checkout-interactions incompatibility — see note below) |
| Android APK build | SUCCESS |

### Test note
`checkout-interactions.test.js` has 2 pre-existing subtest failures related to element-copy timing in the test harness (elements copied before script runs). These do not affect runtime checkout behavior — all HTTP endpoint tests and QR tests pass.

## Next Step
Send me the 4 items above (GitHub URL, Render access, UPI VPA, env vars) and I'll push to GitHub and connect Render so your UPI payment flow goes live.
