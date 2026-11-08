# 04 — SECURITY AUDIT

**Product:** 24-7 Pay / YOUPI PG  
**Scope:** Source-code SAST-equivalent review (pattern-based, no Semgrep binary executed)  
**Method:** Manual inspection against Semgrep `code-security` / OWASP Top 10 categories  
**Vulnerability severity model:** Critical / High / Medium / Low

---

## SAST-equivalent findings

| ID | Category | Severity | Location | Status | Detail |
|---|---|---|---|---|---|
| SEC-01 | Hardcoded secrets | — | None found | PASS | No `sk_live/pk_live/api_key/password` literals in payment-api or checkout-portal |
| SEC-02 | SQL injection | — | None found | PASS | `packages/db/src/database.js` uses parameterized `stmt.run/all/get(...params)`; no template-literal SQL interpolation |
| SEC-03 | Command injection | — | None found | PASS | No `eval/exec/child_process/spawn` in payment-api |
| SEC-04 | XSS | — | None found | PASS | No `innerHTML`/`outerHTML`/`document.write`/`dangerouslySetInnerHTML` in checkout-portal |
| SEC-05 | SSRF | Controlled | `packages/common/src/secrets.js` | PASS | `validateOutboundWebhookUrl` blocks loopback/private/link-local unless opted in |
| SEC-06 | Weak crypto | — | None found | PASS | `crypto.randomBytes`, `crypto.timingSafeEqual`, `crypto.createHmac`/`createHash` (SHA-256) |
| SEC-07 | Insecure transport | — | Config | PASS | Webhook URL must be http/https; no credentials embedded; production binds to `127.0.0.1` by default |
| SEC-08 | CSRF | Mitigated | `packages/common/src/secrets.js` | PASS | OAuth `state` signed with HMAC + single-use (`consumeOAuthState`); internal service token for SSR proxies |
| SEC-09 | Broken access control | Mitigated | `apps/payment-api/src/auth-guard.js`, `platform/identity.js` | PASS | `authGuard`, `isAdminRequest`, merchant key auth, platform identity guard |
| SEC-10 | IDOR | Mitigated | Repository layer + session ownership | PASS | Sessions scoped by `merchantId`/`customerId`; `safeEqual` comparisons |
| SEC-11 | Sensitive-data leakage | Mitigated | `packages/common/src/masking.js` | PASS | Masking helpers present |
| SEC-12 | Replay attacks | Mitigated | `idempotency.repository.js` + state machine | PASS | Idempotency keys + terminal-state guard prevent replay fulfillment |
| SEC-13 | Webhook spoofing | Mitigated | `WebhookEngine` + merchant webhook secret | PASS | Merchant `webhookSecret` validated on payment creation |
| SEC-14 | Session fixation | Mitigated | `CustomerSessionRepository` + MFA | PASS | Device binding + duplicate-session test passes |
| SEC-15 | Insecure deserialization | — | None found | PASS | No unsafe deserialization patterns identified |
| SEC-16 | Race conditions | Mitigated | `BEGIN IMMEDIATE` + `VpaRotationGuard` | PASS | Immediate write lock prevents slot-acquisition race |
| SEC-17 | Insecure defaults | Controlled | `startServer()` production guards | PASS | Fails fast on weak/default admin password and bypass flags in production |

---

## Secrets management

- `ENCRYPTION_MASTER_KEY`, `JWT_SECRET`, `INITIAL_ADMIN_PASSWORD` loaded from env at runtime.
- `resolveSecret()` falls back to persisted random secret under `data/.secrets/` (`0o600`).
- `LEGACY_DEFAULT_WEBHOOK_SECRET` flagged as "must never be trusted."

## Production startup guards (`startServer`)

- Requires `ENCRYPTION_MASTER_KEY` + `JWT_SECRET` in `NODE_ENV=production`.
- Rejects weak admin passwords (`qwertyuiop90`, `password`, `admin123`, placeholder, empty).
- Rejects bypass flags `SKIP_MFA`, `SKIP_EMAIL_VERIFY`, `SKIP_MOBILE_VERIFY`.
- Binds to `127.0.0.1` by default (loopback only), reachable via Cloudflare Tunnel.

## Recommendations

1. Run an actual Semgrep scan (`semgrep --config auto`) in CI and add results to this report.
2. Add a `SECURITY.md` disclosure policy (exists; verify contact path).
3. Rotate `data/.secrets/` before first production deploy (generated secrets are local-dev values).
4. Add dependency vulnerability scanning (`npm audit`) to CI.
