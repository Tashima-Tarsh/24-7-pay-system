# SAAS READINESS ASSESSMENT
Repository: https://github.com/Tashima-Tarsh/24-7-pay-system
Base commit: 5236a8e
Patch commit: (pending)
Generated: 2026-11-08
Scope: Assessment only — no SaaS conversion, billing, pricing tiers, or new frontend implemented.

## Readiness Matrix

| Area | Rating | Basis |
|---|---|---|
| Tenant isolation | PARTIAL | payment_orders, payment_sessions, vpa_pool all carry merchant_id; routing and queries filter by merchant. Cross-merchant binding verified in verify-callback (ORDER_SESSION_MISMATCH). Not all code paths audited for merchant_id scoping. |
| Merchant authorization and RBAC | PARTIAL | acceptancerules WATCH/BLOCK per merchant; merchant_user_roles, role_permissions, pp_user_permissions tables exist. Full RBAC enforcement on every endpoint not exhaustively verified. |
| Merchant-specific API keys | PARTIAL | pp_api_keys table exists. Usage/enforcement not fully traced. |
| VPA ownership and isolation | READY | vpa_pool has merchant_id + UNIQUE(merchant_id, vpa). VPARoutingEngine filters by merchant_id. Atomic reservation (reserveVPAForOrder) added. Frozen VPA exclusion verified. |
| Tenant-specific configuration | PARTIAL | Merchant tiers (max_single_tx_paise, vpa_pool_size_required), pricing plans exist. Configuration not fully tenant-scoped in all paths. |
| Database scaling | BLOCKED | Single SQLite file with BEGIN IMMEDIATE write lock — single writer, no sharding/read replicas. Cannot scale to multi-tenant SaaS load without PostgreSQL migration and connection pooling. |
| Idempotency across instances | PARTIAL | idempotency_keys table exists; order nonce is one-time-use; verify-callback consumes nonce atomically. Distributed idempotency across API instances not verified (single SQLite write lock). |
| Background workers | BLOCKED | Redis unavailable at runtime (logs: "Redis disconnected"); no durable background worker for financial events observed. callback_outbox exists but worker not verified. |
| Webhook isolation | PARTIAL | webhook_deliveries table exists; webhookEngine dispatches per payment after durable commit (verified in verify-callback). Tenant-scoped webhook isolation not fully verified. |
| Event and ledger integrity | READY | Double-entry ledger (ledger_accounts, ledger_entries, ledger_transactions); utr_registry prevents duplicate UTR; pp_audit append-only with triggers. Verified via regression tests. |
| Audit logging | PARTIAL | pp_audit table exists with append-only triggers (no DELETE/UPDATE). AuditLogger used in attribution engine and verify-callback. Coverage not exhaustive. |
| Backups and disaster recovery | BLOCKED | No backup/restore mechanism, WAL archive, or point-in-time recovery observed in code or scripts. |
| Monitoring and alerting | PARTIAL | operational_alerts table exists; VPA health scoring with events; no alerting rules or dashboards observed. |
| Secret management | PARTIAL | ORDER_SIGNING_SECRET must be non-default in production (enforced via patch). Other secrets (DB, API keys) management not fully audited. |
| Merchant onboarding and regulatory arrangements | PARTIAL | check-merchant-onboarding.test.js exists; pp_merchant_payment_profile and mcc/orgid fields support regulatory data. Full onboarding flow and regulatory arrangements not verified. |

## Overall
**SaaS readiness: NOT READY (partial foundations, blocking gaps in database scaling, background workers, backups).**

The codebase has strong single-tenant payment foundations (double-entry ledger, idempotent nonce/UTR, HMAC tokens, per-merchant VPA pools, append-only audit). Converting to multi-tenant SaaS would require:
1. Migrating from single-writer SQLite to PostgreSQL with connection pooling (database scaling).
2. Durable background worker for callback_outbox / financial events (Redis currently unavailable).
3. Backup and point-in-time recovery.
4. Exhaustive tenant-scoping audit on every code path.

No subscription billing, pricing tiers, or SaaS frontend was implemented (per constraints).
