# RED TEAM ASSESSMENT: 24-7-PAY-SYSTEM UPI PAYMENT GATEWAY

**Date:** 2026-11-10  
**Scope:** UPI Intent Generation, Payment Processing, Ledger Integrity, Webhook Security, Tenant Isolation, Provider Routing, Frontend Security  
**Overall Finding:** CRITICAL — Multiple vulnerabilities (CVSS 7.0+) that allow unauthorized payment settlement, tenant isolation bypass, and fraudulent transaction processing.

---

## EXECUTIVE SUMMARY

The system implements hardened UPI intent generation (the `buildBulletproofUpiIntent` replacement) with proper VPA validation, amount formatting, and single URL encoding. However, the payment processing pipeline contains **critical logic flaws** that allow attackers to mark payments as successful without any actual bank verification, bypass tenant isolation, and manipulate provider circuit breakers. The system **cannot safely process real UPI payments** in its current state.

---

## 1. CRITICAL VULNERABILITIES (CVSS 7.0+)

### VULN-1: Tenant Isolation Bypass via Merchant ID Fallback — CVSS 9.0 (CRITICAL)

**File:** `apps/payment-api/src/routes/collections.routes.js:20-37`  
**Function:** `getMerchantId(req)`

The `getMerchantId()` function falls back to `SELECT id FROM merchants LIMIT 1` when:
- No API key is provided, OR
- The provided API key doesn't match any merchant

This means an attacker **without any credentials** can access the first/default merchant's complete data — all transactions, VPAs, customer information, and webhook secrets.

**Proof of Concept:**
```bash
# No authentication headers at all — returns first merchant's collections
curl -X GET http://localhost:7000/api/v1/collections

# Invalid API key — still returns first merchant's data
curl -X GET http://localhost:7000/api/v1/collections \
  -H "x-api-key: definitely_not_a_real_key"
```

**Fix:** Remove the `LIMIT 1` fallback. Require valid API key authentication; return `401 Unauthorized` if no merchant can be resolved from the presented credentials.

---

### VULN-2: COD Force-SUCCESS Without Payment Verification — CVSS 9.0 (CRITICAL)

**File:** `apps/payment-api/src/routes/checkout.routes.js:1580-1711`  
**Endpoint:** `POST /api/v1/checkout/:id/confirm-cod`

The `confirm-cod` endpoint directly sets `status = 'SUCCESS'` with `verification_level = 1` without:
- Any actual payment collection
- Amount verification against the session's expected amount
- Provider or bank communication
- Any check that the customer actually paid

Unlike `card-pay` and `netbanking-pay` (guarded by `process.env.NODE_ENV !== 'test'`), COD has **no environment guard**. Any user with access to the endpoint can mark any session as paid via COD.

**Proof of Concept:**
```bash
# Mark any payment session as SUCCESS via COD — no payment actually made
curl -X POST http://localhost:7000/api/v1/checkout/{session_id}/confirm-cod \
  -H "Authorization: Bearer {any_token}" \
  -H "Content-Type: application/json"
```

**Fix:** Remove the automatic SUCCESS marking. Require actual COD confirmation through an authenticated merchant/staff action with amount verification. Add `NODE_ENV` guard consistent with card-pay/netbanking-pay.

---

### VULN-3: Client-Reported Payment Success Without Bank Verification — CVSS 8.5 (HIGH)

**File:** `apps/payment-api/src/routes/upi-intent.routes.js:460-475`  
**Endpoint:** `POST /api/v1/payments/:id/client-return`

The `client-return` endpoint transitions a session to `CLIENT_REPORTED_SUCCESS` based solely on client-reported `parsedStatus === 'SUCCESS'`. The code comment acknowledges "Client-reported, not bank-confirmed" but still mutates internal status to a success-like state. Downstream systems may interpret `CLIENT_REPORTED_SUCCESS` as a confirmed payment and release goods/services.

**Proof of Concept:**
```bash
# Report payment as success from client side — no bank verification
curl -X POST http://localhost:7000/api/v1/payments/{session_id}/client-return \
  -H "Content-Type: application/json" \
  -d '{"parsedStatus": "SUCCESS", "amount": "500.00", "utr": "FAKE123456789"}'
```

**Fix:** Never treat client-reported status as payment success. Maintain a clear separation: `CLIENT_REPORTED` → `VERIFICATION_PENDING` → only `SUCCESS` after bank/PSP webhook confirmation. Frontend must not release goods on `CLIENT_REPORTED_SUCCESS`.

---

### VULN-4: Circuit Breaker Authentication Bypass — CVSS 8.0 (HIGH)

**File:** `apps/payment-api/src/routes/circuit-breaker.routes.js:9-13`  
**Function:** `requireAuth(req)`

The `requireAuth()` function extracts a Bearer token but **never validates it** against any known token, user, or session. Any non-empty `Authorization: Bearer <anything>` header passes authentication.

**Proof of Concept:**
```bash
# Trip a circuit breaker with any bearer token
curl -X POST http://localhost:7000/api/v1/circuit-breaker/{connection_id}/trip \
  -H "Authorization: Bearer attacker_token" \
  -H "Content-Type: application/json" \
  -d '{"reason": "denial of service"}'

# Reset it back to allow a compromised provider
curl -X POST http://localhost:7000/api/v1/circuit-breaker/{connection_id}/reset \
  -H "Authorization: Bearer attacker_token"
```

**Fix:** Validate the bearer token against actual admin/session tokens. Implement role-based access control (only SECURITY/OPERATIONS roles can manipulate circuit breakers).

---

### VULN-5: Simulate-Observation Dev Tool Can Settle Live Payments — CVSS 8.0 (HIGH)

**File:** `apps/payment-api/src/routes/checkout.routes.js:2054-2112`  
**Endpoint:** `POST /api/v1/checkout/:id/simulate-observation`

This endpoint injects synthetic SMS/Email observations into the verification pipeline. While guarded by `YOUPI_ALLOW_DEV_TOOLS !== 'true'` and admin authentication, if admin credentials are compromised, an attacker can settle live payments with fraudulent bank observations.

**Proof of Concept:**
```bash
# Inject synthetic SMS indicating bank credit — settles payment without real funds
curl -X POST http://localhost:7000/api/v1/checkout/{session_id}/simulate-observation \
  -H "Authorization: Bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{"source": "SMS", "rawText": "₹500.00 credited to your account. UTR: HDFC1234567890", "sender": "HDFCBK", "isTest": true}'
```

**Fix:** Remove this endpoint from production entirely, or require dual authorization (two admin signatures) and comprehensive audit logging. Never allow synthetic observations to settle live payments.

---

### VULN-6: Wide-Open CORS — CVSS 6.5 (MEDIUM)

**File:** `apps/payment-api/src/server.js:199,160`  
**Function:** `HttpServer.json`, SSE handler

All JSON responses and SSE streams set `Access-Control-Allow-Origin: '*'`. This allows any website to make cross-origin requests to the payment API and read responses, bypassing same-origin policy.

**Proof of Concept:**
```html
<!-- Malicious site can read payment data due to wildcard CORS -->
<script>
fetch('https://payment-api.example.com/api/v1/collections', {
  credentials: 'include'
}).then(r => r.json()).then(data => console.log('Exfiltrated:', data));
</script>
```

**Fix:** Replace wildcard CORS with specific allowed origins. Implement `Access-Control-Allow-Origin` based on validated merchant domains.

---

## 2. LOGIC FLAWS PREVENTING PAYMENT PROCESSING

### LF-1: COD/Card/NetBanking Marked SUCCESS Without Provider Verification

**Files:** `checkout.routes.js:1580` (COD), `:1714` (card-pay), `:1840` (netbanking-pay)

All three endpoints directly set `status = 'SUCCESS'` without any provider communication, bank verification, or actual fund movement. Card and NetBanking are only guarded by `NODE_ENV !== 'test'`, meaning they work in test mode but are stubs in production. COD works in all environments.

**Impact:** These payment methods cannot actually process real payments. Goods may be released without any money changing hands.

### LF-2: Client-Reported Success Not Distinguished from Bank-Verified Success

**File:** `upi-intent.routes.js:460-475`

`CLIENT_REPORTED_SUCCESS` is an internal status that frontend systems may conflate with actual bank-confirmed `SUCCESS`. There is no clear separation in the public API response.

**Impact:** Frontend may release goods/services based on unverified client claims.

### LF-3: Ledger Not Updated on Payment Confirmation

**File:** `packages/db/src/repositories/ledger.repository.js`

A proper double-entry ledger exists, but there is no evidence it is updated when payments are confirmed via webhooks, client returns, or COD confirmation. Accounting records would be incomplete or incorrect.

**Impact:** Financial reconciliation impossible. Audit trail broken.

### LF-4: Payment Timeouts Not Consistently Enforced

NPCI mandates 15-minute payment timeout. While session expiration logic exists, there is no explicit enforcement tying payment sessions to the NPCI 15-minute requirement at the protocol level.

**Impact:** Payments may remain in indeterminate states indefinitely, causing reconciliation issues.

### LF-5: `verify-utr` Trusts Customer-Reported UTR Without Immediate Verification

**File:** `checkout.routes.js:1297-1313`

The `verify-utr` endpoint stores customer-reported UTRs and calls `reconcilePendingPayment` without immediate bank verification. Fraudulent UTRs could be submitted and potentially matched to bank observations through timing attacks.

**Impact:** Fraudulent UTR submissions could lead to incorrect payment attribution.

---

## 3. NPCI SPECIFICATION VIOLATIONS

| # | Violation | Location | Severity |
|---|-----------|----------|----------|
| NPCI-1 | 15-minute payment timeout not explicitly enforced | Multiple route files | HIGH |
| NPCI-2 | Transaction note length inconsistency (legacy `buildUpiUri` vs hardened builder) | `packages/common/src/upi.js:44`, `upi.ts` | MEDIUM |
| NPCI-3 | VPA format allows homograph characters (`.`, `-`, `_`) | `upi.js:12`, `upi.ts:79` | MEDIUM |
| NPCI-4 | Client-reported UPI app returns treated as verification-pending without mandatory bank confirmation before success | `upi-intent.routes.js:460-475` | HIGH |
| NPCI-5 | No explicit merchant category code validation against NPCI-approved MCCs | `upi-qr.js:30` | LOW |

---

## 4. WEBHOOK SECURITY ASSESSMENT

### What's Done Well
- HMAC-SHA256 signature verification (`banking-integrations.js:203-215`)
- Timestamp staleness check (300 seconds) (`banking-integrations.js:217`)
- Fingerprint-based replay protection via `ON CONFLICT DO NOTHING` (`banking-integrations.js:227`)
- Webhook secret rotation endpoint exists (`verify-53-point-auth-matrix.js` references rotation)

### Gaps
- **No nonce/sequence-based replay protection** — only fingerprint deduplication
- **No specific rate limiting on webhook endpoints** — relies on global HttpServer limit (1000 req/min per IP)
- **No automatic webhook secret rotation** — manual rotation only
- Webhook signature key derivation uses `sha256(raw + secret)` which is acceptable but could be strengthened with HKDF

---

## 5. TENANT ISOLATION ASSESSMENT

### What's Done Well
- Most repository queries scope by `merchant_id` (`ledger.repository.js`, `payment-session.repository.js`, `payment-order.repository.js`)
- `isPaymentOwner()` validates webhook secret for merchant-private fields (`payments.routes.js:53-62`)
- `ownedConnection()` checks `merchant_id` on provider connections

### Critical Gaps
- **VULN-1:** `getMerchantId()` fallback to first merchant (`collections.routes.js:20-37`)
- **VULN-4:** Circuit breaker auth doesn't validate tokens (`circuit-breaker.routes.js:9-13`)
- `upi-intent.routes.js:161` falls back to default merchant when no header present
- No explicit tenant ID validation in URL path parameters (relies on header-based merchant resolution)

---

## 6. PROVIDER ROUTING & CIRCUIT BREAKER ASSESSMENT

### What's Done Well
- Circuit breaker state tracked per provider connection (`provider_connections` table)
- Failover logic checks `open_until` timestamp (`payments.js:185-195`)
- Manual trip/reset/half-open endpoints for operational control

### Gaps
- **VULN-4:** Authentication bypass on circuit breaker endpoints
- Manual reset from OPEN to CLOSED without half-open probe period
- No automated health check integration (route_health table exists but not auto-populated)
- Provider credentials encryption key resolution via `resolveSecret()` needs review

---

## 7. FRONTEND CHECKOUT SECURITY ASSESSMENT

### What's Done Well
- CSP headers on Cashfree provider checkout page (`collections.routes.js:46`)
- Nonce-based script injection on Cashfree page
- `replaceAll('<','\\u003c')` on JSON config injection (prevents basic HTML injection)

### Gaps
- **VULN-6:** Wildcard CORS on all responses
- No CSP on most API endpoints
- No CSRF tokens for browser-based state-changing requests
- `desktop-test.html` contains hardcoded test credentials and exposes admin login flow

---

## 8. PRIORITIZED FIX RECOMMENDATIONS

### P0 — Immediate (Deploy Before Processing Real Payments)

| # | Fix | File | Effort |
|---|-----|------|--------|
| P0-1 | Remove `LIMIT 1` merchant fallback in `getMerchantId()`; require valid auth | `collections.routes.js:20-37` | 15 min |
| P0-2 | Remove automatic COD SUCCESS marking; require verified COD confirmation | `checkout.routes.js:1580-1711` | 30 min |
| P0-3 | Validate circuit breaker bearer tokens; implement RBAC | `circuit-breaker.routes.js:9-13` | 30 min |
| P0-4 | Separate `CLIENT_REPORTED` from bank-verified `SUCCESS`; frontend must not act on client-reported | `upi-intent.routes.js:460-475` | 45 min |
| P0-5 | Remove `simulate-observation` from production or require dual authorization | `checkout.routes.js:2054-2112` | 30 min |

### P1 — High (Deploy Within 1 Week)

| # | Fix | File | Effort |
|---|-----|------|--------|
| P1-1 | Replace wildcard CORS with specific allowed origins | `server.js:199` | 30 min |
| P1-2 | Add CSP headers to all API responses | `server.js` | 45 min |
| P1-3 | Post ledger entries atomically with payment confirmation | `ledger.repository.js` + payment routes | 2 hrs |
| P1-4 | Enforce NPCI 15-minute payment timeout | `payments.routes.js` + timing engine | 1 hr |
| P1-5 | Add CSRF protection for state-changing browser requests | All state-changing routes | 1 hr |

### P2 — Medium (Deploy Within 1 Month)

| # | Fix | File | Effort |
|---|-----|------|--------|
| P2-1 | Stricter VPA validation (homograph resistance) | `upi.js:12`, `upi.ts:79` | 30 min |
| P2-2 | Add nonce/sequence-based webhook replay protection | `banking-integrations.js` | 1 hr |
| P2-3 | Automated webhook secret rotation policy | Migration + admin console | 2 hrs |
| P2-4 | Circuit breaker half-open probe before auto-close | `circuit-breaker.routes.js` | 1 hr |

---

## 9. PROOF-OF-CONCEPT EXPLOIT SUMMARY

| Exploit | Endpoint | Method | Impact |
|---------|----------|--------|--------|
| Tenant bypass | `/api/v1/collections` | GET (no auth) | Read all merchant data |
| COD fraud | `/api/v1/checkout/{id}/confirm-cod` | POST | Mark any payment as paid |
| Circuit breaker abuse | `/api/v1/circuit-breaker/{id}/trip` | POST (any Bearer token) | DoS / re-enable compromised providers |
| Client-reported fraud | `/api/v1/payments/{id}/client-return` | POST (`parsedStatus: SUCCESS`) | Fake payment success |
| Synthetic settlement | `/api/v1/checkout/{id}/simulate-observation` | POST (admin token) | Settle payments with fake SMS |
| CORS exfiltration | Any API endpoint | Cross-origin fetch | Data theft via wildcard CORS |

---

## CONCLUSION

**The system is NOT ready to process real UPI payments.** Five critical vulnerabilities (CVSS 7.0+) allow unauthorized payment settlement, complete tenant isolation bypass, and circuit breaker manipulation. The hardened UPI intent builder is sound, but the payment processing pipeline has fundamental logic flaws that must be remediated before production deployment.

**Recommendation:** Do not enable real payment processing until P0 fixes are implemented and verified. Conduct a follow-up penetration test after remediation.