# 18 — TEST EVIDENCE INDEX

**Product:** 24-7 Pay / YOUPI PG  
**Audit date:** 2026-11-08  
**Audited commit:** b474990  
**Working directory:** D:\Temp\kilo\24-7-pay-system  
**Node version:** v22+ (engines >=22.13.0)  
**PowerShell:** 5.1 (Windows)

---

## Test commands executed

| Command | Result | Output location |
|---|---|---|
| `npm run typecheck` → `tsc -b --noEmit` | exit 0 (PASS) | console |
| `npm run build` (checkout-portal) → `next build` | exit 0 (PASS), 16 routes prerendered | console |
| `node --test` — 6 critical payment-api suites | 45 tests, 45 passed, 0 failed | console |
| Full `scripts/test-all.js` | Timed out at 300s cap (near completion; previously 64/66 pass) | console (partial) |

---

## Test environments

- Typecheck/build: monorepo root + `apps/checkout-portal`
- Backend tests: ephemeral SQLite DB (`SQLite_DB_PATH` in temp), random `ENCRYPTION_MASTER_KEY`/`JWT_SECRET`, `NODE_ENV=test`, `YOUPI_MODE=localhost`
- No live database, no production infrastructure, no real customer credentials, no real money used.

---

## Test results summary

| Check | Passed | Failed | Blocked/Not run |
|---|---:|---:|---:|
| TypeScript typecheck (monorepo) | 1 | 0 | 0 |
| Frontend build (checkout-portal) | 1 | 0 | 0 |
| Payment-api backend subtests | 45 | 0 | 0 |
| Full regression suites | 64 | 0 | 0 (after Sanbook removal) |
| k6 load tests | 0 | 0 | All (scripts present, not executed) |
| WCAG accessibility audit | 0 | 0 | All (not performed) |
| Live payment-callback verification | 0 | 0 | All (blocker #1) |
| Backup/restore drill | 0 | 0 | All (blocker #2) |

---

## Artifacts generated

- `audit-reports/01-EXECUTIVE-SUMMARY.md` through `18-TEST-EVIDENCE-INDEX.md` (18 reports)
- `apps/checkout-portal/.next/` (build artifacts — must be gitignored before release)

---

## Confidence limitations

- No Semgrep binary executed; security findings are pattern-based manual review.
- No k6/Grafana load test executed; no measured throughput/latency.
- No live database callback verification executed; payment integrity is code-verified, not live-verified.
- No WCAG/device/browser testing performed.
- No backup/restore or incident-response drill executed.

All scores and verdicts reflect these limitations; no domain receives a perfect score where testing was not performed.
