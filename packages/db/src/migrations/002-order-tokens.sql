-- ============================================================
-- DYNAMO PAY — Order Token & UTR Registry Migration
-- Phase 2: Signed Order Tokens & UTR Reuse Prevention
-- ============================================================

-- 66. Payment Orders — order records created via /api/v1/orders
-- Stores the canonical order record with nonce for one-time-use verification.
CREATE TABLE IF NOT EXISTS payment_orders (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    payee_vpa TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED', 'SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED')),
    nonce TEXT NOT NULL UNIQUE,
    fingerprint_hash TEXT,
    utr TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_merchant ON payment_orders (merchant_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders (status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_nonce ON payment_orders (nonce);
CREATE INDEX IF NOT EXISTS idx_payment_orders_utr ON payment_orders (utr);

-- 67. Payment Nonces — one-time-use nonces for order token validation
-- Prevents replay attacks by ensuring each nonce is consumed exactly once.
CREATE TABLE IF NOT EXISTS payment_nonces (
    id TEXT PRIMARY KEY,
    nonce TEXT NOT NULL UNIQUE,
    used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1)),
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_nonces_nonce ON payment_nonces (nonce);
CREATE INDEX IF NOT EXISTS idx_payment_nonces_used ON payment_nonces (used);

-- 68. UTR Registry — one-time UTR enforcement
-- Prevents the same UTR (Unique Transaction Reference) from being used
# across multiple payment orders, eliminating UTR replay fraud.
CREATE TABLE IF NOT EXISTS utr_registry (
    id TEXT PRIMARY KEY,
    utr TEXT NOT NULL UNIQUE,
    payment_order_id TEXT,
    payment_session_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_utr_registry_utr ON utr_registry (utr);
CREATE INDEX IF NOT EXISTS idx_utr_registry_order ON utr_registry (payment_order_id);
CREATE INDEX IF NOT EXISTS idx_utr_registry_session ON utr_registry (payment_session_id);

-- ============================================================
-- End Phase 2 Migration
-- ============================================================
