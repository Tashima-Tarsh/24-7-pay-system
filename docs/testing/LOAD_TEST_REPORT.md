# Measured local capacity report — 31 October 2026 (updated 2 November 2026)

Isolated in-memory SQLite, Node v24.14.1, loopback HTTP and synthetic accounts. No real provider or bank traffic. The benchmark explicitly overrides the global IP limiter to 20,000; per-key limits remain recorded. The receiving-slot policy allows one active checkout per account.

## Enterprise capacity test (`scripts/test-enterprise-capacity.mjs`)

| Workload | Accepted | Errors | Active | Queued | Result |
|---|---:|---:|---:|---:|---|
| 100 merchants, 1,000 requests, concurrency 100 | 1000 | 0 | 100 | 900 | PASS |
| 100 merchants, 1,000 requests, concurrency 1,000 | 232 | 768 | 100 | 132 | FAIL |

At concurrency 100, p50=157 ms, p95=297 ms and p99=307 ms; elapsed 1773 ms. Unique IDs: 1000; wrong merchant/player attributions: 0. These figures do not measure bank confirmation or Render throughput.

The failed burst recorded {'ECONNREFUSED': 768}. It reproduced with network escalation; increasing the test listener backlog did not make it pass. The application served only the accepted requests. This does not prove a database corruption or explain all host transport behavior, and is not a 1,000-concurrent readiness certification.

A separate direct confirmation-service storm ran 10000 calls across 100 synthetic provider orders: 100 journal transactions, 100 durable outbox events and 9900 duplicates suppressed. No webhook was sent to a real merchant, and no external wallet fulfillment is claimed.

## k6 load test (`scripts/k6-load-test.js`) against local server

Ran 2 November 2026 against `http://localhost:6100` with ramping VUs (100 → 500 → 1000 → 0):

| Threshold | Target | Actual | Status |
|---|---|---|---|
| intent_creation_rate | >0.90 | 0.138 | FAIL |
| client_return_rate | >0.90 | 0.809 | FAIL |
| http_req_failed | <0.10 | 0.747 | FAIL |
| intent_creation duration avg | <500ms | 1,730ms | FAIL |
| client_return duration avg | <300ms | 4,100ms | FAIL |
| payment_status duration avg | <200ms | 3,250ms | FAIL |
| investigation duration avg | <1000ms | 3,240ms | FAIL |
| callback_test duration avg | <300ms | 7,370ms | FAIL |

Checks: 29.6% succeeded, 70.4% failed. 74.7% of HTTP requests failed (mostly ECONNREFUSED and connection reset).

**Root cause:** Single Node.js instance on Windows cannot absorb a 1,000-VU burst. The event loop is saturated by concurrent request handling plus background processing (verification sweeps, queue sync, webhook retries). The production architecture (`docker-compose.production.yml`) already addresses this with **2 payment-api replicas behind Caddy**; multi-instance testing has not yet been performed.

## Reproduction

- `node scripts/test-enterprise-capacity.mjs` (concurrency 1,000); set `SANBOOK_LOAD_CONCURRENCY=100` for bounded test
- `k6 run scripts/k6-load-test.js` (requires running Payment API server on port 6100)

Each run uses a new isolated in-memory database. Steady-rate 50/100/250/500 RPS, real PostgreSQL, multi-process workers, provider network and hosted scale remain unverified. A larger host/proxy transport test is required before diagnosing or claiming the 1,000-concurrent target.
