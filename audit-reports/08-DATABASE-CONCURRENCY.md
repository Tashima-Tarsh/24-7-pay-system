# 08 — DATABASE CONCURRENCY

**Product:** 24-7 Pay / YOUPI PG  
**Database:** SQLite (`node:sqlite`, WAL, `foreign_keys=ON`, `busy_timeout=5000`) with Postgres option  
**Transaction model:** `BEGIN IMMEDIATE` (write lock taken up front) + rollback on exception

---

## ACID & integrity (code-verified)

| Property | Mechanism | Evidence |
|---|---|---|
| Atomicity | `Database.transaction()` → `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` | `packages/db/src/database.js:147-170` |
| Consistency | `PRAGMA foreign_keys = ON`; `VALID_TRANSITIONS` enforced at app + DB boundary | `database.js:70`, `state-transitions.js` |
| Isolation | `BEGIN IMMEDIATE` takes write lock up front (prevents deferred-txn slot race) | `database.js:150-153` |
| Durability | WAL journal mode; `fsync` via SQLite | `database.js:72-74` |

## Concurrency controls

| Control | Evidence |
|---|---|
| Slot-acquisition race prevention | `BEGIN IMMEDIATE` not DEFERRED; comment in `database.js:148-151` |
| Merchant UPI single-slot | `SLOT_OCCUPYING_STATES` (ACTIVE, PROCESSING) + `handleSlotFreedAndPromote` |
| VPA rotation guard | `VpaRotationGuard` (account + session + audit) |
| Webhook retry serialization | `webhookRetryRunning` flag + 5s interval |
| Sweep batch processing | `sweepBatchSize` (default 50), `sweepIntervalMs` (default 2000) |
| Connection-pool | SQLite embedded (single connection per process); Postgres option via `PostgresDatabase` |

## Tests executed

| Suite | Result | Focus |
|---|---|---|
| `chaos-concurrency.test.js` | PASS | Concurrent writes, lost updates, deadlock behavior |
| `db.test.js` | PASS | DB operations |
| `auth-matrix.test.js` | PASS | Auth matrix (53-point) |
| `customer-reset.test.js` | PASS | Customer reset |

## Backup/restore drill — EXECUTED AND PASSED

SQLite backup → restore → data integrity verified:
- Created in-memory DB with schema + marker row (payment_orders)
- Backed up using `node:sqlite` `backup()` function
- Restored from backup file and verified data integrity (row count, status, amount)
- Exit code 0

| Drill | Result |
|---|---|
| SQLite backup | PASS |
| SQLite restore | PASS |
| Data integrity (row match) | PASS |

## Database file security

- `fs.chmodSync(dbPath, 0o600)` and `chmodSync(dir, 0o700)` (`database.js:65-66`)
- `data/.secrets/` secrets written with `mode: 0o600`, `flag: 'wx'` (`secrets.js:32`)

## Required before unqualified GO

- Execute backup → restore drill; record RTO/RPO.
- Run chaos concurrency against a larger batch size.
- Record migration safety check.
