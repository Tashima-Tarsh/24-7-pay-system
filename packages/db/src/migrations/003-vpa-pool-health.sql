-- ============================================================
-- DYNAMO PAY — Phase 4: Bulletproof Operations — VPA Pooling & Health Scoring
-- NPCI/RBI/ED compliance: velocity caps, per-VPA health scoring, UTR replay protection
-- ============================================================

-- 68. VPA Pool — per-merchant pool of receiving VPAs with health scoring
-- Each VPA tracks daily velocity, unique senders, inflow amount, and health score.
-- Health score decays on risk events (velocity spikes, round figures, sender concentration)
-- and recovers overnight. VPAs with health < 40 are excluded from routing.
CREATE TABLE IF NOT EXISTS vpa_pool (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    vpa VARCHAR(255) NOT NULL,
    bank_name VARCHAR(100),
    account_type VARCHAR(20) NOT NULL DEFAULT 'PERSONAL' CHECK (account_type IN ('PERSONAL', 'CURRENT', 'SALARY')),
    health_score INTEGER NOT NULL DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'WARMING', 'COOLING', 'FROZEN', 'RETIRED')),
    daily_tx_count INTEGER NOT NULL DEFAULT 0 CHECK (daily_tx_count >= 0),
    daily_inflow_paise BIGINT NOT NULL DEFAULT 0 CHECK (daily_inflow_paise >= 0),
    unique_senders_24h INTEGER NOT NULL DEFAULT 0 CHECK (unique_senders_24h >= 0),
    last_transaction_at TEXT,
    frozen_at TEXT,
    frozen_reason VARCHAR(255),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT uq_merchant_vpa_pool UNIQUE(merchant_id, vpa)
);
CREATE INDEX IF NOT EXISTS idx_vpa_pool_merchant_status ON vpa_pool(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_vpa_pool_routing ON vpa_pool(merchant_id, status, health_score DESC);
CREATE INDEX IF NOT EXISTS idx_vpa_pool_health ON vpa_pool(health_score) WHERE status IN ('ACTIVE', 'WARMING');

-- 69. VPA Health Events — audit trail of all health score changes
-- Provides the audit trail required for regulatory inquiry (ED/RBI/CBI).
CREATE TABLE IF NOT EXISTS vpa_health_events (
    id TEXT PRIMARY KEY,
    vpa_pool_id TEXT NOT NULL REFERENCES vpa_pool(id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('VELOCITY_SPIKE', 'SENDER_CONCENTRATION', 'ROUND_FIGURE', 'FREEZE', 'THAW', 'SUCCESSFUL_TX', 'DAILY_RESET', 'MANUAL_THAW')),
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('INFO', 'WARN', 'CRITICAL')),
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vpa_health_events_vpa ON vpa_health_events(vpa_pool_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vpa_health_events_type ON vpa_health_events(event_type);
CREATE INDEX IF NOT EXISTS idx_vpa_health_events_severity ON vpa_health_events(severity);

-- End Phase 4 Migration
-- ============================================================

-- ============================================================
-- Phase 4 Deliverable 2: Amount Randomization columns
-- payment_orders gets display_amount_paise (what user sees) and
-- actual_amount_paise (what UPI URI contains, with randomization)
-- ============================================================
ALTER TABLE payment_orders ADD COLUMN display_amount_paise BIGINT;
ALTER TABLE payment_orders ADD COLUMN actual_amount_paise BIGINT;
CREATE INDEX IF NOT EXISTS idx_payment_orders_display_amount ON payment_orders (display_amount_paise);
CREATE INDEX IF NOT EXISTS idx_payment_orders_actual_amount ON payment_orders (actual_amount_paise);

-- ============================================================
-- Phase 4 Deliverable 4: Immutable Audit Log (pp_audit table)
-- Regulatory defense: append-only, 7-year retention per RBI
-- ============================================================
CREATE TABLE IF NOT EXISTS pp_audit (
    id TEXT PRIMARY KEY,
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('SYSTEM', 'MERCHANT', 'ADMIN', 'USER', 'API_KEY')),
    actor_id BIGINT,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(30) NOT NULL,
    resource_id BIGINT,
    ip_address TEXT,
    user_agent TEXT,
    device_fingerprint VARCHAR(64),
    request_payload TEXT DEFAULT '{}',
    response_payload TEXT DEFAULT '{}',
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE', 'REJECTED', 'QUARANTINED')),
    rejection_reason VARCHAR(100),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pp_audit_actor ON pp_audit(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_pp_audit_action ON pp_audit(action);
CREATE INDEX IF NOT EXISTS idx_pp_audit_resource ON pp_audit(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_pp_audit_outcome ON pp_audit(outcome);
CREATE INDEX IF NOT EXISTS idx_pp_audit_created_at ON pp_audit(created_at);

-- Append-only trigger: prevent DELETE and UPDATE on pp_audit
CREATE TRIGGER IF NOT EXISTS pp_audit_no_delete
BEFORE DELETE ON pp_audit
BEGIN
    SELECT RAISE(ABORT, 'pp_audit is append-only');
END;

CREATE TRIGGER IF NOT EXISTS pp_audit_no_update
BEFORE UPDATE ON pp_audit
BEGIN
    SELECT RAISE(ABORT, 'pp_audit is append-only');
END;

-- ============================================================
-- End Phase 4 Migration
-- ============================================================

