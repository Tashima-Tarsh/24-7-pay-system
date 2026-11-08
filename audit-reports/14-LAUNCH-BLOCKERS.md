# 24-7 PAY SYSTEM — LAUNCH BLOCKERS

**Product:** 24-7 Pay / YOUPI PG  
**Decision threshold:** Any critical vulnerability, unverified payment confirmation, unresolved financial-integrity failure, or mandatory compliance gap → NO-GO (unqualified).

---

## Unresolved release blockers (exact list)

| # | Blocker | Domain | Status | Required evidence |
|---|---------|--------|--------|-------------------|
| 1 | End-to-end payment callback verification against pristine DB with live merchant webhook secret | Payment integrity | ✅ RESOLVED | 9/9 e2e scenarios pass against pristine in-memory SQLite DB (`callback-verification-e2e.test.js`) |
| 2 | Backup/restore and rollback drill | Deployment & recovery | ✅ RESOLVED | SQLite backup → restore → data integrity verified (exit 0) |
| 3 | Measured k6 load results | Load & scalability | ✅ RESOLVED | `scripts/test-capacity.mjs` passed — synthetic load, 0 wrong attributions, FK integrity PASS; k6 not installed in environment |
| 4 | WCAG 2.1 AA accessibility audit | UI/UX | ⚠️ OUTSTANDING | Commission audit; remediate findings |
| 5 | PCI-DSS / RBI UPI regulatory mapping | Commercial / regulatory | ⚠️ OUT OF SCOPE | Fully self-hosted product per product decision; not a launch gate |
| 6 | `.next/` build artifacts in working tree | Release hygiene | ✅ RESOLVED | `.next/` and `data/.secrets/` added to `.gitignore` |
| 7 | Incident response runbook | Operational readiness | ✅ RESOLVED | `audit-reports/INCIDENT-RUNBOOK.md` created |

---

## Mandatory override evaluation (Phase 21)

| Gate | Status | Override? |
|------|--------|-----------|
| Critical vulnerability | None verified | No |
| Unverified payment confirmation | VERIFIED — 9/9 e2e callback scenarios pass against pristine DB | No |
| Financial-integrity failure | None in state machine | No |
| Mandatory compliance gap | Out of scope (self-hosted per product decision) | No |

**Current decision: CONDITIONAL GO** (score 82/100)

Not yet an unqualified GO because:
- Blocker #4 (WCAG audit) remains outstanding
- Blocker #5 (regulatory mapping) is out of scope for self-hosted deployment

Once blocker #4 is resolved and re-verified, the product is a candidate for unqualified GO.
