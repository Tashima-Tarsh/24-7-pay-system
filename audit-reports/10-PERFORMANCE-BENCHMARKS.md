# 10 — PERFORMANCE BENCHMARKS

**Product:** 24-7 Pay / YOUPI PG  
**Load tooling present:** `scripts/k6-load-test.js`, `scripts/k6-simple-test.js`, `integrations/master-payment/load.mjs`, `scripts/test-capacity.mjs`, `scripts/test-enterprise-capacity.mjs`  
**Measured results in this audit:** NONE (no k6/Grafana test executed against live infra)

---

## Performance-relevant code observations

| Area | Detail |
|---|---|
| DB concurrency | `UV_THREADPOOL_SIZE=128`; `busy_timeout=5000`; WAL mode |
| Sweep daemon | Consolidated 1-second timer (replaced per-session timers that starved event loop) |
| Sweep batch | Default 50 sessions per sweep interval (default 2s) |
| Webhook retry | 5s interval, max 5 retries, `webhookRetryRunning` mutex |
| SSE broadcast | Per-session + per-queue channels |
| Server backlog | `SERVER_BACKLOG` default 4096 |
| Socket timeouts | 30s timeout, keep-alive 5s |

## Not measured (recommended)

- Requests per second
- Transaction throughput
- P50/P95/P99 latency
- Error rate at 10/100/500/1,000/5,000/10,000 concurrent users
- CPU/memory consumption
- Queue backlog
- Callback processing delay

## Required before launch

Run k6 baseline/load/stress/soak tests and record:
- 10, 100, 500 concurrent users (baseline)
- 1,000+ (stress)
- Spike and soak tests
- Controlled failure injection

Record results in `output/testing/` and summarize here.
