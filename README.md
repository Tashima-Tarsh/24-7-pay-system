# 24/7 Pay

**The Complete UPI Payment Operating System for Independent Merchants**

Accept UPI payments directly into your own VPA — no aggregator, no fund holding, no KYC middleman. 24/7 Pay gives you a complete white-label payment gateway with QR checkout, smart routing, double-entry ledgering, and fraud-hardened verification.

---

## What 24/7 Pay Does

| Capability | What It Means For You |
|---|---|
| **White-label UPI Gateway** | Your brand, your VPA, your customers — never touch a third-party merchant aggregator |
| **Amount-Only Payment Links** | Create a payment in seconds: just enter the amount. Order ID, QR, and checkout link are auto-generated |
| **Dynamic UPI QR & Intent** | QR image + app launcher grid (Google Pay, PhonePe, Paytm, BHIM, Amazon Pay, CRED) for instant in-app payment |
| **Smart UPI Routing** | Auto-failover across provider connections — if one bank is down, payment routes to the next healthy one |
| **Circuit Breaker Control Plane** | Trip, reset, half-open per provider — no single point of failure |
| **Double-Entry Ledger** | Every confirmed payment posts atomically: integer-paise accounting, no floating-point errors, immutable records |
| **HMAC-SHA256 Webhooks** | Signed callbacks to your backend — tamper-proof payment confirmation |
| **Multi-Operator Roles** | Owner, Admin, Finance, Support, Viewer — granular permissions for your team |
| **Disputes & Reconciliation** | Case management, evidence tracking, bank-statement reconciliation exceptions |
| **Payer-VPA Binding** | Authenticate and bind payer identity to payment sessions |
| **Direct Bank APIs** | Corporate bank connector management for H2H integration |

---

## How It Works

```
1. Platform onboards merchant  →  Account created, MFA enabled, webhook secret issued
2. Merchant registers UPI VPA  →  Payments go straight to your VPA, never held by platform
3. Merchant creates order      →  Amount only; system generates UPI QR + checkout link
4. Customer pays               →  Scans QR with any UPI app or taps Android intent tile
5. Provider confirms credit    →  UTR matched to order + amount, bank-verified
6. Real-time callback          →  Your backend receives HMAC-signed PAYMENT_SUCCESS
7. Ledger entry                →  Atomic double-entry: PROVIDER_CLEARING → MERCHANT_RECEIVABLES
8. You verify & fulfill        →  Check UTR, confirm order, credit customer/wallet
```

---

## Services (Ready to Deploy)

| Service | Port | Role |
|---|---|---|
| **Payment API** | 6100 | Core payment engine, UPI processing, provider webhooks, ledger |
| **Super Admin Control Center** | 9000 | Merchant management, routing, failover, disputes, reconciliation |
| **Checkout Portal** | 7000 | Customer-facing hosted UPI checkout with QR and intent |
| **Merchant Console** | 6001 | Independent merchant dashboard and operations |
| **Control Center** | 8090 | Process supervision and service management |
| **Payment Help Portal** | 3000 | Customer help and support |
| **Coin Wallet Store** | 5000 | Game wallet and demo store |

---

## Checkout Experience (Mobile-First)

- **Glassmorphism UI** — clean, premium, trust-inspiring design
- **Live UPI QR** — SVG QR code, copy-to-cl
ipboard payee VPA
- **App launcher grid** — one-tap launch into Google Pay, PhonePe, Paytm, BHIM, Amazon Pay, CRED
- **Intent-return status strip** — App Opened → Client Reported → Bank Verified
- **Auto-polling** — payment status every 3 seconds
- **Terminal screens** — verified success, failed, expired, cancelled, under review

---

## Security & Trust

- **Tenant isolation** — server-authoritative merchant identity, zero cross-tenant access
- **MFA required** for sensitive operations
- **HMAC-SHA256 webhook signatures** — every callback is cryptographically verifiable
- **8-hour session expiry**, CSRF protection on all state-changing requests
- **Never commit plaintext credentials** — `.env` is gitignored
- **Client-return is evidence, not proof** — payments confirm only via bank-verified provider webhook or matched UTR observation

---

## Run It

```bash
# Install
npm ci --install-links

# Typecheck
npm run typecheck

# Test (66 suites)
npm test

# Start Payment API (port 6100)
npm run start:prod:api

# Start Super Admin (port 9000)
npm run start:super-admin

# Start Checkout Portal (port 7000)
npm run start:hosted
```

---

## Built For

- Independent merchants who want their own UPI gateway
- Platform operators managing hundreds of merchant accounts
- Businesses that need bank-verified payment confirmation, not just app-return screens
- Teams that want immutable, auditable financial records

---

**24/7 Pay** — Accept UPI payments your way, directly into your VPA, with bank-grade verification and zero fund-holding.
