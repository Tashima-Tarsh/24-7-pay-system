# 14 — LAUNCH BLOCKERS

**Product:** 24-7 Pay / YOUPI PG  
**Decision threshold:** Any critical vulnerability, unverified payment confirmation, unresolved financial-integrity failure, or mandatory compliance gap → NO-GO (unqualified).

---

## Unresolved release blockers (exact list)

| # | Blocker | Domain | Required evidence |
|---|---|---|---|
| 1 | End-to-end payment callback verification not executed against a pristine database | Payment integrity | Run authentic + forged + duplicate + replay + delayed + missing + out-of-order + timeout + partial + incorrect-amount/merchant/order/VPA + conflicting-status + reversed callbacks against pristine SQLite/Postgres; record pass/fail |
| 2 | Backup/restore and rollback drill not executed | Deployment & recovery | Execute `scripts/backup.sh` → restore; record RTO/RPO; add to runbook |
| 3 | No measured k6 load results | Load & scalability | Run baseline (10/100/500) and stress (1,000+) tests; record P50/P95/P99, error rate, CPU/memory |
| 4 | No WCAG 2.1 AA accessibility audit | UI/UX | Commission audit; remediate findings |
| 5 | PCI-DSS / RBI UPI regulatory mapping not completed | Commercial / regulatory | Gap assessment + remediation plan |
| 6 | `.next/` build artifacts in working tree | Release hygiene | Add `.next/` and `data/.secrets/` to `.gitignore`; remove from tree |
| 7 | No executed incident-response runbook | Operational readiness | Draft and review runbook |

---

## Mandatory override evaluation (Phase 11)

| Gate | Status | Override? |
|---|---|---|
| Critical vulnerability | None verified | No |
| Unverified payment confirmation | Code-verified; live end-to-end NOT executed | Not yet — flagged as blocker #1 |
| Financial-integrity failure | None in state machine | No |
| Mandatory compliance gap | Not assessed | Not yet — flagged as blocker #5 |

**Current decision:** CONDITIONAL GO. Not an unqualified GO because blocker #1 (live payment-callback verification) and blocker #5 (regulatory mapping) are not yet evidenced. Once blockers #1–7 are resolved and re-verified, the product is a candidate for GO.
