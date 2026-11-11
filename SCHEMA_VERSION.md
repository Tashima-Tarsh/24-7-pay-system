# Schema Versioning — YOUPI PG

## Current Schema Version

**`2026.11.12-01`**

## Schema Migration Strategy

The database layer (`@youpi/db`) supports both SQLite WAL (local/test) and PostgreSQL (production) through a single abstraction layer (`packages/db/src/database.js` + `postgres-database.js`). Migrations are idempotent: every `CREATE TABLE` uses `IF NOT EXISTS`, every `ALTER TABLE ADD COLUMN` is wrapped in try/catch or checked against `PRAGMA table_info`, and every `CREATE INDEX` uses `IF NOT EXISTS`.

## Version Tracking

The `schema_migrations` table records every applied schema version:

| Column | Type | Description |
|--------|------|-------------|
| `version` | TEXT PRIMARY KEY | Schema version string (e.g. `2026.11.12-01`) |
| `applied_at` | TEXT | ISO-8601 timestamp when the migration was applied |
| `description` | TEXT | Human-readable description of the change |

On every boot, `runMigrations()`:
1. Executes all idempotent DDL (tables, indexes, columns)
2. Inserts a row into `schema_migrations` for `SCHEMA_VERSION` if not already present
3. Returns `{ db, defaultMerchant, schemaVersion }`

## How to Bump the Schema Version

1. Increment `SCHEMA_VERSION` in `packages/db/src/migrate.js` (e.g. `2026.11.12-02`)
2. Add new `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` blocks in `runMigrations()`
3. Add a description for the new version
4. Do not modify existing migration blocks — they must remain idempotent for databases created with earlier versions

## Schema Files

| File | Purpose |
|------|---------|
| `packages/db/src/schema.sql` | Canonical PostgreSQL schema (53 tables, all `CREATE TABLE IF NOT EXISTS`) |
| `packages/db/src/sqlite-schema.sql` | SQLite-equivalent schema (same tables, TEXT timestamps) |
| `packages/db/src/migrate.js` | Migration runner + `SCHEMA_VERSION` + `schema_migrations` tracking |
| `packages/db/src/migrations/` | Versioned additive migration SQL files (001-upi-mirror, 002-order-tokens, 003-vpa-pool-health) |
| `packages/db/src/database.js` | Database abstraction: SQLite + PostgreSQL, synchronous transactions |
| `packages/db/src/postgres-database.js` | PostgreSQL worker-thread implementation |
| `packages/db/src/repositories/` | Repository pattern abstractions for every entity |

## Database Abstraction Layer

The `Database` class (`database.js`) normalizes SQL parameter markers (`$1` → `?`) and routes to:
- **SQLite** (`node:sqlite` `DatabaseSync`): local/dev/test, WAL mode, foreign keys, busy timeout
- **PostgreSQL** (`postgres-database.js`): worker-thread I/O, `BEGIN ISOLATION LEVEL SERIALIZABLE`, SAVEPOINT nesting

Both dialects expose the same interface: `execute`, `query`, `queryOne`, `exec`, `transaction`, `close`.

## Accessing the Schema Version

```js
import { runMigrations, SCHEMA_VERSION } from '@youpi/db';

const { db, defaultMerchant, schemaVersion } = runMigrations();
// schemaVersion === '2026.11.12-01'
```

## Version History

| Version | Date | Description |
|---------|------|-------------|
| `2026.11.12-01` | 2026-11-12 | Initial schema version tracking; `schema_migrations` table added |
