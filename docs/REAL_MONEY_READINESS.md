# 24/7 Pay — Real-Money Deployment Gate

This is an **engineering checklist**, not a PCI DSS, RBI, NPCI, or bank certification.

## Current hard gate

Production must run against **durable PostgreSQL**. If `DATABASE_URL` is missing, the application may still serve its UI for setup, but it returns HTTP 503 (`DURABLE_STORAGE_REQUIRED`) for new financial writes. `/_ready` returns HTTP 503 and `/health` remains a process health check.

An available PostgreSQL service is **not enough**: the live Render web service must have its own valid `DATABASE_URL` configured. Never commit or echo the connection string or password. Use Render's encrypted service environment settings and private/internal database connection settings.

**Do not use an expiring Free Render Postgres instance as a permanent financial ledger.** Upgrade to a plan with suitable retention, backups, support and recovery controls first. Validate database migrations and transaction rollback on a staging copy before enabling payments.

## Required acceptance checks

1. `/health` is 200 and `/_ready` is 200 with `storage:postgres`; neither confirms banking integration independently.
2. PostgreSQL tables, migrations, transactions, uniqueness constraints, indices, timestamp handling and restart persistence pass against **a real PostgreSQL instance**, not only an in-memory SQLite fixture. Run the existing `scripts/postgres-acceptance.test.js` with an isolated `DYNAMO_POSTGRES_TEST_URL`.
3. Configure one actual bank/PSP integration, verify its legally permitted merchant credentials and signatures, configure webhook URL and secret, and test provider event replay and rollback. A UPI intent/app return, customer-supplied UTR, SMS, notification, or Gmail alone must **never** make an order `SUCCESS`.
4. Confirm merchant callback signature, one-success-event idempotency, retry and dead-letter recovery, callback delivery receipt, reconciliation and payout/refund paths with sandbox fixtures.
5. Test two concurrent checkouts on one VPA, same amount, duplicated UTR, old QR, expired sessions, mobile app fallback, and reconnect after process restart. A partial/ambiguous match stays pending.
6. Verify administrator and merchant credentials are stored securely, rotate any secret shown in chat/screenshots, enforce MFA where available, and review support/contact, privacy and refund information for accuracy.
7. Only after every gate passes should a controlled low-value real payment be considered. Record bank reference, accepted amount, receiving bank credit and exact once-only merchant callback.

## CI scope

GitHub CI runs 61 curated suites with static scanning. Static analyzer zero-findings means **no findings under the selected 50 rules**, not proof that every vulnerability has been discovered. The PostgreSQL integration test is skipped unless a real isolated test database is provided. Production acceptance therefore remains **pending** until the external requirements above are verified.
