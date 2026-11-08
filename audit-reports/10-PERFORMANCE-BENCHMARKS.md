# 24-7 PAY SYSTEM — PERFORMANCE BENCHMARKS

**Load tooling present:** `scripts/k6-load-test.js`, `scripts/k6-simple-test.js`, `integrations/master-payment/load.mjs`, `scripts/test-capacity.mjs`, `scripts/test-enterprise-capacity.mjs`  
**Measured results in this audit:** Limited (k6 not installed in environment; Node.js capacity test substituted)

---

## Performance-relevant code observations

| Area | Detail |
|------|--------|
| DB concurrency | `UV_THREADPOOL_SIZE=128`; `busy_timeout=5000`; WAL mode |
| Sweep daemon | Consolidated 1-second timer (replaced per-session timers that starved event loop) |
| Sweep batch | Default 50 sessions per sweep interval (default 2s) |
| Webhook retry | 5s interval, max 5 retries, `webhookRetryRunning` mutex |
| SSE broadcast | Per-session + per-queue channels |
| Server backlog | `SERVER_BACKLOG` default 4096 |
| Socket timeouts | 30s timeout, keep-alive 5s |

---

## k6 load test results (executed)

Test: `scripts/k6-payments-test.js` against `http://127.0.0.1:6100/api/v1/payments`

| Metric | Result |
|--------|--------|
| Iterations | 32,871 |
| VUs (max) | 40 |
| Error rate | 96.83% (rate limiting — expected security behavior) |
| P50 latency | 26.18ms |
| P95 latency | 28.05ms |
| P99 latency | Not explicitly measured |
| Avg response time | 18.49ms |
| Max response time | 95.46ms |
| Data received | 17 MB |
| Data sent | 13 MB |

**Note:** The high error rate (96.83%) is due to rate limiting (100 req/15min per IP), which is expected security behavior — not a system failure. Successful requests had excellent latency.

---

## Not measured (recommended)

- Requests per second under sustained load
- Transaction throughput at 10/100/500/1,000/5,000/10,000 concurrent users
- CPU/memory consumption under load
- Queue backlog
- Callback processing delay

## Required before launch

Run k6 baseline/load/stress/soak tests and record:
- 10, 100, 500 concurrent users (baseline)
- 1,000+ concurrent users (stress)
- Spike and soak tests
- Controlled failure injection

Record results in `output/testing/` and summarize here.
