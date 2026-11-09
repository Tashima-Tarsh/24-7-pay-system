# E2E Testing — Manual UI Verification Checklist

## Prerequisites

Start the unified server:

```bash
node server.mjs
```

Confirm the terminal shows:
- `[server] Public gateway listening on port 7000`
- `[server] Proxying API routes to http://127.0.0.1:6100`
- `[server] Payment API started on port 6100`

Seed test data before checkout/admin tests:

```bash
node scripts/seed-test-data.mjs
export TEST_ORDER_ID=<order_id printed above>
```

---

## Landing Page — http://localhost:7000/

| Step | Action | Expected Result |
|------|--------|-----------------|
| L1 | Open `http://localhost:7000/` | `landing.html` renders with no console errors (F12 → Console) |
| L2 | Observe typography | Headings use **Space Grotesk**, body uses **Inter**; heading font-size 48–72px, letter-spacing `-0.02em`; body 16–18px line-height 1.6 |
| L3 | Observe colors | Background deep navy `#0A0E27`; accent electric cyan `#00D4FF`; violet `#7C3AED` used sparingly (~20%) |
| L4 | Hero section | 60/40 split: text left, abstract geometric CSS shape right (no images) |
| L5 | Animated mesh gradient | `conic-gradient` background animates slowly (CSS-only) |
| L6 | Stats bar below hero | 3 metrics in monospace (JetBrains Mono) separated by vertical lines: `99.99% uptime`, `₹2.4Cr processed`, `12ms latency` |
| L7 | Live indicator | Small pulsing 8px `#00D4FF` dot next to "System Status: Operational" |
| L8 | CTA buttons | 48px height, 24px horizontal padding, `rounded-lg` (not pill), hover lifts `translateY(-2px)` |
| L9 | Staggered fade-in | Elements fade in sequentially with ~0.1s animation delays on page load |
| L10 | Grid background | Subtle `repeating-linear-gradient` grid lines at 1px, `rgba(255,255,255,0.03)` |
| L11 | Responsive | Below 768px: hero stacks vertically, stat cards stack, buttons full-width |

---

## Checkout Page — http://localhost:7000/checkout/<ORDER_ID>

Use the `TEST_ORDER_ID` from `scripts/seed-test-data.mjs`.

| Step | Action | Expected Result |
|------|--------|-----------------|
| C1 | Open `http://localhost:7000/checkout/<SESSION_UUID>` | `checkout.html` renders; no console errors |
|    | (Use the Session UUID from `scripts/seed-test-data.mjs`, not the order ID) | |
| C2 | Merchant name | Displays "Test Store" (from seeded merchant) |
| C3 | Amount | Displays `₹100.00` (from seeded session) |
| C4 | QR code | Visible QR code rendered from `upiQr` data URI |
| C5 | UPI URI | `upiUri` present in API response (visible as payable link/intent) |
| C6 | Payee VPA | Displays `testmerchant@upi` |
| C7 | Copy VPA | Click VPA text → copies to clipboard → shows "✅ Copied!" temporarily |
| C8 | DevTools Network | Open F12 → Network; filter `/api/v1/checkout/*/state` |
| C9 | Polling | A `fetch` request to `/api/v1/checkout/<SESSION_UUID>/state` fires every ~3 seconds returning `200 OK` |
| C10 | Polling response | Each poll returns JSON with `status: "ACTIVE"`, `upiUri`, `amount` |
| C11 | Session expiry | After ~15 minutes, status transitions to `EXPIRED` (server-managed) |

---

## Admin Page — http://localhost:7000/admin

| Step | Action | Expected Result |
|------|--------|-----------------|
| A1 | Open `http://localhost:7000/admin` | `admin.html` renders; no console errors |
| A2 | Login form | Shows admin login form (or dashboard if session already persisted) |
| A3 | Sidebar (desktop ≥ 768px) | Fixed 240px sidebar with logo top; nav items: Dashboard, Transactions, Merchants, Settings |
| A4 | Active state | Active nav item has left border `3px #00D4FF` |
| A5 | Stat cards | 4 cards in a row (`grid-template-columns: repeat(4, 1fr)`), 32px internal padding, `2px` borders (not shadows) |
| A6 | Recent Transactions table | Zebra striping on even rows (`nth-child(even)` background `rgba(255,255,255,0.02)`) |
| A7 | Table row height | Each row `64px` height; hover state `background: rgba(0,212,255,0.05)` |
| A8 | Status badges | Pill-shaped, `20px` height, `12px` horizontal padding, `font-size: 12px`, `font-weight: 600` |
| A9 | Mobile (< 768px) | Sidebar collapses; hamburger menu toggles sidebar open/closed |
| A10 | Stat cards mobile | Stack vertically below 768px |

---

## API Endpoints (via browser or curl)

| Endpoint | Method | Expected |
|----------|--------|----------|
| `http://localhost:7000/health` | GET | `{"ok":true,"status":"UP","apiOnline":true}` |
| `http://localhost:7000/api/v1/checkout/<SESSION_UUID>/state` | GET | JSON with `status: "ACTIVE"`, `upiUri`, `amount`, `orderId` |
| `http://localhost:7000/api/v1/checkout/server-health` | GET | UPI server health indicator |

---

## 🔧 Troubleshooting — Top 3 Failure Modes

### 1. `ECONNREFUSED` on port 6100 (or port 7000)

**Cause:** `server.mjs` failed to start the internal payment API, or the server isn't running.

**Fix:**
1. Confirm the server process is running:
   ```bash
   node server.mjs
   ```
   Terminal must show `[server] Payment API started on port 6100`.
2. If port 7000 is already in use, kill the existing process:
   ```powershell
   # PowerShell
   Get-Process -Name node | Stop-Process -Force
   ```
   ```bash
   # Bash / Linux
   pkill -f "node server.mjs"
   ```
3. If the API fails to start, check that `ENCRYPTION_MASTER_KEY` and `JWT_SECRET` are set (server.mjs auto-generates fallbacks, but a corrupt `.env` can override them with invalid values).

---

### 2. "Session not found" — E2E test returns 404

**Cause:** `TEST_ORDER_ID` doesn't exist in the SQLite/Postgres database, or you passed the order ID instead of the session UUID. The API endpoint `/api/v1/checkout/:id/state` looks up by session UUID (`id` column), not `order_id`.

**Fix:**
1. Run the seed script:
   ```bash
   node scripts/seed-test-data.mjs
   ```
2. Copy the printed `Session ID (UUID)` (not the Order ID) and set it:
   ```bash
   export TEST_ORDER_ID=<session_uuid>
   ```
3. Verify the server and seed script use the same `SQLITE_DB_PATH`. By default both use `data/youpi_pg.sqlite` relative to the project root:
   ```bash
   SQLITE_DB_PATH=/absolute/path/to/youpi_pg.sqlite node scripts/seed-test-data.mjs
   SQLITE_DB_PATH=/absolute/path/to/youpi_pg.sqlite TEST_ORDER_ID=<session_uuid> node test-e2e.mjs
   ```

---

### 3. QR code doesn't show / `upiUri` is null

**Cause:** The checkout session has no active receiving account with a valid `upiId`, so `buildUpiUri()` returns nothing.

**Fix:**
1. Confirm the merchant has an active receiving account. Run this against the DB:
   ```bash
   node -e "
   import { Database, ReceivingAccountRepository } from '@youpi/db';
   const db = new Database({ autoMigrate: true });
   const repo = new ReceivingAccountRepository(db);
   console.log(JSON.stringify(repo.findAll(), null, 2));
   db.close();
   "
   ```
2. Ensure `is_active = 1` and `upi_id` is non-empty.
3. If no account exists, re-run `scripts/seed-test-data.mjs` (it creates one with `testmerchant@upi`).
4. Confirm the session status is `ACTIVE` — `upiUri` is only built for `ACTIVE` sessions (see `checkout.routes.js` line 506).
