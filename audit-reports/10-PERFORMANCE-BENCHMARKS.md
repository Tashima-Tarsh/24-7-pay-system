# 10 — PERFORMANCE BENCHMARKS

**Product:** 24-7 Pay / YOUPI PG  
**Load tooling present:** `scripts/k6-load-test.js`, `scripts/k6-simple-test.js`, `integrations/master-payment/load.mjs`, `scripts/test-capacity.mjs`, `scripts/test-enterprise-capacity.mjs`  
**Measured results in this audit:** NONE (no k6/Grafana test executed against live infra)

---

## Capacity test — EXECUTED AND PASSED

`scripts/test-capacity.mjs` ran synthetic load against isolated in-memory SQLite:

| Metric | Result |
|---|---|
| Concurrent merchant checkouts | PASS |
| Duplicate-request handling | PASS |
| Queue completion | PASS |
| Wrong merchant attributions | 0 |
| Foreign key integrity | PASS |
| Exit code | 0 |

Limitations: synthetic bank observations, single process, local machine. Not a production SLA. k6 not installed in environment; Node.js capacity test used as substitute.

## Not measured (recommended)

- k6 load tests at 10/100/500/1,000/5,000/10,000 concurrent users
- P50/P95/P99 latency
- CPU/memory consumption
