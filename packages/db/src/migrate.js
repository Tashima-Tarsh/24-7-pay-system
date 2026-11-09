import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { getCoinStoreWebhookSecret, LEGACY_DEFAULT_WEBHOOK_SECRET } from '@youpi/common';
import { getDatabase } from './database.js';
import { MerchantRepository } from './repositories/merchant.repository.js';
import { ReceivingAccountRepository } from './repositories/receiving-account.repository.js';
import { CustomerRepository } from './repositories/customer.repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Runs database migrations and applies base seeds.
 * @param {import('./database.js').Database} [targetDb]
 */
export function runMigrations(targetDb) {
  const db = targetDb || getDatabase();
  const schemaPath = path.join(__dirname, 'sqlite-schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Detect if customers table has an obsolete schema (phone_number/merchant_id instead of email/mobile_number, or password_hash NOT NULL).
  // The old table is only rebuilt when it holds no customers: a schema mismatch must never destroy customer data.
  try {
    const tableInfo = db.query ? db.query("PRAGMA table_info(customers)") : [];
    const colNames = (tableInfo || []).map(c => c.name);
    const hasOldColumns = colNames.length > 0 && (
      !colNames.includes('email') ||
      colNames.includes('phone_number') ||
      colNames.includes('merchant_id') ||
      !colNames.includes('otp_code') ||
      tableInfo.some(c => c.name === 'password_hash' && c.notnull === 1)
    );
    if (hasOldColumns) {
      const customerCount = Number(db.queryOne('SELECT COUNT(*) AS n FROM customers')?.n || 0);
      if (customerCount === 0) {
        try { db.exec("PRAGMA foreign_keys = OFF;"); } catch {}
        try { db.exec("DROP TABLE IF EXISTS customer_sessions;"); } catch {}
        try { db.exec("DROP TABLE IF EXISTS customers;"); } catch {}
        try { db.exec("PRAGMA foreign_keys = ON;"); } catch {}
      } else {
        console.error(`[migrate] customers table has an obsolete schema but holds ${customerCount} row(s); leaving it untouched. Back up and migrate it manually.`);
      }
    }
  } catch (err) {
    console.error('[migrate] Could not inspect customers table schema; skipping rebuild:', err.message);
  }

  // Fallback alter columns if customers/sessions table exists without new columns
  try { db.exec("ALTER TABLE customers ADD COLUMN email TEXT;"); } catch {}
  try { db.exec("ALTER TABLE customers ADD COLUMN mobile_number TEXT;"); } catch {}
  try { db.exec("ALTER TABLE customers ADD COLUMN otp_code TEXT;"); } catch {}
  try { db.exec("ALTER TABLE customers ADD COLUMN otp_expires_at TEXT;"); } catch {}
  try { db.exec("ALTER TABLE customers ADD COLUMN otp_attempts INTEGER NOT NULL DEFAULT 0;"); } catch {}
  try { db.exec("ALTER TABLE customers ADD COLUMN is_phone_verified INTEGER DEFAULT 0;"); } catch {}
  try { db.exec("ALTER TABLE customers ADD COLUMN ban_reason TEXT;"); } catch {}
  try { db.exec("ALTER TABLE customers ADD COLUMN banned_at TEXT;"); } catch {}
  try { db.exec("ALTER TABLE customers ADD COLUMN unbanned_at TEXT;"); } catch {}
  try { db.exec("ALTER TABLE customers ADD COLUMN last_device TEXT;"); } catch {}
  try { db.exec("ALTER TABLE payment_sessions ADD COLUMN device_id TEXT;"); } catch {}
  try { db.exec("ALTER TABLE payment_sessions ADD COLUMN verification_level INTEGER DEFAULT 0;"); } catch {}
  try { db.exec("ALTER TABLE payment_sessions ADD COLUMN verification_sources TEXT DEFAULT '[]';"); } catch {}
  try { db.exec("ALTER TABLE payment_sessions ADD COLUMN verification_tag TEXT DEFAULT 'UNVERIFIED';"); } catch {}

  // Execute schema DDL
  db.exec(db.dialect==='postgres'?db.prepareSchema(schemaSql):schemaSql);

  // Existing databases predate the amount columns used by payment creation.
  db.transaction(() => {
    if (db.dialect === 'postgres') {
      db.exec('ALTER TABLE payment_sessions ADD COLUMN IF NOT EXISTS paise_offset BIGINT NOT NULL DEFAULT 0 CHECK (paise_offset BETWEEN 0 AND 99)');
      db.exec('ALTER TABLE payment_sessions ADD COLUMN IF NOT EXISTS base_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (base_amount_paise >= 0)');
    } else {
      const columns = db.query('PRAGMA table_info(payment_sessions)').map(column => column.name);
      if (!columns.includes('paise_offset')) db.exec('ALTER TABLE payment_sessions ADD COLUMN paise_offset INTEGER NOT NULL DEFAULT 0 CHECK (paise_offset BETWEEN 0 AND 99)');
      if (!columns.includes('base_amount_paise')) db.exec('ALTER TABLE payment_sessions ADD COLUMN base_amount_paise INTEGER NOT NULL DEFAULT 0 CHECK (base_amount_paise >= 0)');
    }
    db.execute('UPDATE payment_sessions SET base_amount_paise = amount_paise WHERE base_amount_paise = 0 AND amount_paise > 0');
  });

  // Alter table columns if migrating existing databases
  try { db.exec("ALTER TABLE payment_sessions ADD COLUMN verification_level INTEGER DEFAULT 0;"); } catch {}
  try { db.exec("ALTER TABLE payment_sessions ADD COLUMN verification_sources TEXT DEFAULT '[]';"); } catch {}
  try { db.exec("ALTER TABLE payment_sessions ADD COLUMN verification_tag TEXT DEFAULT 'UNVERIFIED';"); } catch {}
  try { db.exec("ALTER TABLE payment_receiving_accounts ADD COLUMN is_merchant_enabled INTEGER NOT NULL DEFAULT 1;"); } catch {}
  // Hosted databases created before account-volume tracking need these columns at startup.
  try { db.exec("ALTER TABLE payment_receiving_accounts ADD COLUMN daily_volume_paise BIGINT NOT NULL DEFAULT 0;"); } catch {}
  try { db.exec("ALTER TABLE payment_receiving_accounts ADD COLUMN daily_txn_count INTEGER NOT NULL DEFAULT 0;"); } catch {}
  try { db.exec("ALTER TABLE payment_receiving_accounts ADD COLUMN rotation_threshold_paise BIGINT NOT NULL DEFAULT 9000000;"); } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_vpa_per_merchant ON payment_receiving_accounts (merchant_id) WHERE is_active = 1;"); } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email ON customers (email);"); } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_mobile ON customers (mobile_number);"); } catch {}
  try { db.exec("ALTER TABLE customers ADD COLUMN ban_reason TEXT;"); } catch {}
  try { db.exec("ALTER TABLE customers ADD COLUMN banned_at TEXT;"); } catch {}
  try { db.exec("ALTER TABLE customers ADD COLUMN unbanned_at TEXT;"); } catch {}
  try { db.exec("ALTER TABLE customers ADD COLUMN last_device TEXT;"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_customer_sessions_token ON customer_sessions (token, is_active);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON customer_sessions (customer_id);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_security_events_customer ON security_events (customer_id);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_security_events_session ON security_events (payment_session_id);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events (event_type);"); } catch {}
  try { db.exec("ALTER TABLE payment_sessions ADD COLUMN device_id TEXT REFERENCES devices(id);"); } catch {}
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      public_key TEXT NOT NULL,
      fingerprint_hash TEXT NOT NULL,
      user_agent TEXT,
      platform TEXT,
      browser TEXT,
      timezone TEXT,
      language TEXT,
      screen_signature TEXT,
      device_token TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_devices_customer ON devices (customer_id);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_devices_fingerprint ON devices (fingerprint_hash);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_devices_token ON devices (device_token);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_payment_sessions_device ON payment_sessions (device_id);"); } catch {}

  // ============================================================
  // PART 1 & PART 4 — Merchant payment profile + UTR capture migration
  // ============================================================
  // payment_sessions: UTR capture and verification expiry columns
  if (db.dialect === 'postgres') {
    db.exec('ALTER TABLE payment_sessions ADD COLUMN IF NOT EXISTS reported_utr TEXT');
    db.exec('ALTER TABLE payment_sessions ADD COLUMN IF NOT EXISTS reported_utr_source TEXT');
    db.exec('ALTER TABLE payment_sessions ADD COLUMN IF NOT EXISTS payer_name TEXT');
    db.exec('ALTER TABLE payment_sessions ADD COLUMN IF NOT EXISTS payer_vpa TEXT');
    db.exec('ALTER TABLE payment_sessions ADD COLUMN IF NOT EXISTS payer_reported_at TEXT');
    db.exec('ALTER TABLE payment_sessions ADD COLUMN IF NOT EXISTS verification_expires_at TEXT');
  } else {
    const psColumns = db.query('PRAGMA table_info(payment_sessions)').map(column => column.name);
    if (!psColumns.includes('reported_utr')) db.exec('ALTER TABLE payment_sessions ADD COLUMN reported_utr TEXT');
    if (!psColumns.includes('reported_utr_source')) db.exec('ALTER TABLE payment_sessions ADD COLUMN reported_utr_source TEXT');
    if (!psColumns.includes('payer_name')) db.exec('ALTER TABLE payment_sessions ADD COLUMN payer_name TEXT');
    if (!psColumns.includes('payer_vpa')) db.exec('ALTER TABLE payment_sessions ADD COLUMN payer_vpa TEXT');
    if (!psColumns.includes('payer_reported_at')) db.exec('ALTER TABLE payment_sessions ADD COLUMN payer_reported_at TEXT');
    if (!psColumns.includes('verification_expires_at')) db.exec('ALTER TABLE payment_sessions ADD COLUMN verification_expires_at TEXT');
  }
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_sessions_utr ON payment_sessions(reported_utr) WHERE reported_utr IS NOT NULL;"); } catch {}

  // pp_merchant_payment_profile — payer-visible payee details (the "connection")
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS pp_merchant_payment_profile (
      merchant_id TEXT PRIMARY KEY,
      payee_vpa TEXT NOT NULL,
      payee_name TEXT NOT NULL,
      payee_email TEXT NOT NULL,
      mcc TEXT NOT NULL DEFAULT '5411',
      orgid TEXT,
      intent_sign_key_pem TEXT,
      support_phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_pp_merchant_payment_profile_merchant ON pp_merchant_payment_profile(merchant_id);"); } catch {}

  // pp_bank_alert_senders — allowlist of bank email domains for Gmail observer
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS pp_bank_alert_senders (
      domain TEXT PRIMARY KEY,
      bank TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_pp_bank_alert_senders_domain ON pp_bank_alert_senders(domain);"); } catch {}

  // Seed bank alert sender domains (idempotent)
  const bankSenders = [
    ['hdfcbank.net', 'HDFC Bank'],
    ['icicibank.com', 'ICICI Bank'],
    ['onlinesbi.sbi', 'State Bank of India'],
    ['axisbank.com', 'Axis Bank'],
    ['kotak.com', 'Kotak Mahindra Bank'],
    ['yesbank.in', 'Yes Bank'],
    ['idfcfirstbank.com', 'IDFC First Bank'],
    ['federalbank.co.in', 'Federal Bank']
  ];
  for (const [domain, bank] of bankSenders) {
    try {
      db.execute(
        'INSERT INTO pp_bank_alert_senders (domain, bank, created_at) VALUES (?, ?, ?) ON CONFLICT(domain) DO NOTHING',
        [domain, bank, new Date().toISOString()]
      );
    } catch {}
  }

  // ============================================================
  // DYNAMO PAY UNIVERSAL UPI MIRROR — Phase 1 Migration
  // ============================================================
  try { db.exec(`CREATE TABLE IF NOT EXISTS merchant_upi_connections (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    vpa VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    bank_name VARCHAR(255),
    preferred_app VARCHAR(100),
    connection_state VARCHAR(50) NOT NULL DEFAULT 'REGISTERED',
    ownership_verified INTEGER NOT NULL DEFAULT 0,
    verification_level VARCHAR(50) DEFAULT 'NONE',
    verification_method VARCHAR(100),
    observer_device_id TEXT,
    credit_alert_email VARCHAR(255),
    webhook_url VARCHAR(1024),
    webhook_secret VARCHAR(255),
    last_observed_at TEXT,
    last_health_at TEXT,
    health_status VARCHAR(50) DEFAULT 'UNKNOWN',
    feature_flags TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT uq_merchant_vpa UNIQUE(merchant_id, vpa)
  );`); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_upi_connections_merchant ON merchant_upi_connections (merchant_id);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_upi_connections_state ON merchant_upi_connections (connection_state);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_upi_connections_vpa ON merchant_upi_connections (LOWER(vpa));"); } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_upi_connections_merchant_lower_vpa ON merchant_upi_connections (merchant_id, LOWER(vpa));"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_upi_connections_observer_device ON merchant_upi_connections (observer_device_id);"); } catch {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS merchant_observer_devices (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    device_name VARCHAR(255) NOT NULL,
    device_model VARCHAR(255),
    android_version VARCHAR(50),
    app_version VARCHAR(50),
    public_key TEXT NOT NULL,
    fingerprint_hash VARCHAR(64) NOT NULL,
    device_token_hash VARCHAR(255) NOT NULL,
    pairing_state VARCHAR(50) NOT NULL DEFAULT 'PAIRING_REQUIRED',
    listener_status VARCHAR(50) DEFAULT 'UNKNOWN',
    notification_permission INTEGER NOT NULL DEFAULT 0,
    last_heartbeat_at TEXT,
    last_event_at TEXT,
    avg_forwarding_latency_ms INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    revoked_at TEXT,
    revocation_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_observer_devices_merchant ON merchant_observer_devices (merchant_id);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_observer_devices_state ON merchant_observer_devices (pairing_state);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_observer_devices_active ON merchant_observer_devices (is_active, last_heartbeat_at);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_observer_devices_fingerprint ON merchant_observer_devices (fingerprint_hash);"); } catch {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS device_pairing_challenges (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    challenge TEXT NOT NULL,
    qr_payload TEXT NOT NULL,
    device_id TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_pairing_challenges_merchant ON device_pairing_challenges (merchant_id, status);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_pairing_challenges_expires ON device_pairing_challenges (expires_at);"); } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_pairing_challenges_challenge ON device_pairing_challenges (challenge);"); } catch {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS observer_source_configs (
    id TEXT PRIMARY KEY,
    upi_connection_id TEXT NOT NULL REFERENCES merchant_upi_connections(id) ON DELETE CASCADE,
    source_name VARCHAR(100) NOT NULL,
    source_category VARCHAR(50) NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    parser_version VARCHAR(50) DEFAULT '1.0',
    last_event_at TEXT,
    event_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_observer_source_configs_connection ON observer_source_configs (upi_connection_id);"); } catch {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS subscription_entitlements (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES pricing_plans(id),
    max_upi_connections INTEGER NOT NULL DEFAULT 1,
    max_observer_devices INTEGER NOT NULL DEFAULT 1,
    observation_sources_enabled INTEGER NOT NULL DEFAULT 1,
    webhook_endpoints_enabled INTEGER NOT NULL DEFAULT 1,
    callback_concurrency INTEGER NOT NULL DEFAULT 5,
    api_quota_daily INTEGER NOT NULL DEFAULT 1000,
    payment_link_limit INTEGER NOT NULL DEFAULT 1000,
    feature_entitlements TEXT DEFAULT '[]',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    current_period_start TEXT,
    current_period_end TEXT,
    grace_period_ends_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_subscription_entitlements_merchant ON subscription_entitlements (merchant_id);"); } catch {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS connection_health_events (
    id TEXT PRIMARY KEY,
    upi_connection_id TEXT NOT NULL REFERENCES merchant_upi_connections(id) ON DELETE CASCADE,
    observer_device_id TEXT,
    previous_state VARCHAR(50),
    new_state VARCHAR(50) NOT NULL,
    trigger VARCHAR(100),
    latency_ms INTEGER,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_connection_health_connection ON connection_health_events (upi_connection_id, created_at);"); } catch {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS admin_audit_events (
    id TEXT PRIMARY KEY,
    admin_id TEXT,
    admin_type VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id TEXT NOT NULL,
    merchant_id TEXT,
    details TEXT DEFAULT '{}',
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_events (admin_id, created_at);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_admin_audit_merchant ON admin_audit_events (merchant_id, created_at);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_events (action);"); } catch {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS callback_outbox (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    payment_id TEXT,
    event_type VARCHAR(50) NOT NULL,
    payload TEXT NOT NULL,
    endpoint_url VARCHAR(1024) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_retry_at TEXT,
    delivered_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_callback_outbox_status ON callback_outbox (status, next_retry_at);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_callback_outbox_merchant ON callback_outbox (merchant_id, status);"); } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_callback_outbox_idempotency ON callback_outbox (idempotency_key);"); } catch {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS callback_delivery_attempts (
    id TEXT PRIMARY KEY,
    outbox_id TEXT NOT NULL REFERENCES callback_outbox(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    status_code INTEGER,
    response_body TEXT,
    latency_ms INTEGER,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_callback_attempts_outbox ON callback_delivery_attempts (outbox_id);"); } catch {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS upi_mirror_observations (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    upi_connection_id TEXT REFERENCES merchant_upi_connections(id) ON DELETE SET NULL,
    observer_device_id TEXT REFERENCES merchant_observer_devices(id) ON DELETE SET NULL,
    event_id VARCHAR(255) NOT NULL,
    source VARCHAR(100) NOT NULL,
    direction VARCHAR(50) NOT NULL DEFAULT 'INBOUND',
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    reference_utr VARCHAR(255),
    claiming_receiving_identity VARCHAR(255),
    notification_timestamp TEXT,
    device_observed_timestamp TEXT,
    server_received_timestamp TEXT NOT NULL,
    parser_version VARCHAR(50),
    event_signature VARCHAR(512),
    fingerprint_hash VARCHAR(64) NOT NULL,
    classification VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    matched_order_id TEXT,
    match_evidence TEXT DEFAULT '{}',
    raw_payload TEXT DEFAULT '{}',
    is_duplicate INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`); } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_upi_mirror_event_id ON upi_mirror_observations (event_id);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_upi_mirror_merchant ON upi_mirror_observations (merchant_id, created_at);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_upi_mirror_connection ON upi_mirror_observations (upi_connection_id);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_upi_mirror_fingerprint ON upi_mirror_observations (fingerprint_hash);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_upi_mirror_classification ON upi_mirror_observations (classification);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_upi_mirror_reference ON upi_mirror_observations (reference_utr);"); } catch {}

  // End Phase 1 Migration
  // ============================================================

  // Seed default merchant if empty
  const merchantRepo = new MerchantRepository(db);
  const existing = merchantRepo.findAll();

  let defaultMerchant;
  if (existing.length === 0) {
    defaultMerchant = merchantRepo.create({
      id: '00000000-0000-0000-0000-000000000001',
      businessName: 'Sanbook Pay Store',
      slug: 'demo-store',
      contactEmail: 'support@sanbookpay.com',
      contactPhone: '9876543210',
      webhookUrl: process.env.COIN_STORE_WEBHOOK_URL || 'http://localhost:5000/api/webhook',
      webhookSecret: getCoinStoreWebhookSecret(),
      branding: {
        appName: 'Sanbook Pay',
        primaryColor: '#059669',
        logoUrl: null
      }
    });
  } else {
    defaultMerchant = existing[0];
    if (!defaultMerchant.webhookSecret) {
      merchantRepo.update(defaultMerchant.id, {
        webhookUrl: 'http://localhost:5000/api/webhook',
        webhookSecret: getCoinStoreWebhookSecret()
      });
    } else if (defaultMerchant.webhookSecret === LEGACY_DEFAULT_WEBHOOK_SECRET) {
      // Older installs were seeded with a publicly known secret: rotate it.
      merchantRepo.update(defaultMerchant.id, { webhookSecret: getCoinStoreWebhookSecret() });
      console.warn('[migrate] Rotated the default merchant webhook secret away from the legacy public value. Update your merchant webhook verifier.');
    }
  }

  // Seed default UPI receiving account if none
  const accountRepo = new ReceivingAccountRepository(db);
  const accounts = accountRepo.findByMerchantId(defaultMerchant.id);
  if (accounts.length === 0) {
    accountRepo.create({
      id: '00000000-0000-0000-0000-000000000002',
      merchantId: defaultMerchant.id,
      upiId: '9082843142@slc',
      payeeName: 'Dynamo Pay',
      isActive: true
    });
  }

  // Ensure default merchant has an active API key
  try {
    const credRow = db.queryOne("SELECT * FROM merchant_credentials WHERE merchant_id = $1", [defaultMerchant.id]);
    if (!credRow) {
      db.execute(
        "INSERT INTO merchant_credentials (id, merchant_id, key_type, api_key, api_secret_hash, permissions, status) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        ['00000000-0000-0000-0000-000000000003', defaultMerchant.id, 'LIVE', 'sb_live_00000000000000000000000000000001', 'hash_sb_live', '["collections","payouts","refunds"]', 'ACTIVE']
      );
    }
  } catch {}

  // Demo customer seeding is opt-in and never carries real personal data.
  // Previously this unconditionally created a customer with a real name, phone number and
  // email, and flagged the phone as verified — shipping someone's PII (and a pre-authorised
  // OTP login identity) into every merchant deployment.
  if (process.env.YOUPI_SEED_DEMO_CUSTOMER === 'true') {
    const customerRepo = new CustomerRepository(db);
    const demoMobile = '9000000000';
    if (!customerRepo.findByMobile(demoMobile)) {
      customerRepo.create({
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Demo Customer',
        email: 'demo-customer@youpi.local',
        mobileNumber: demoMobile,
        isPhoneVerified: false
      });
    }
  }

  // Seed default system roles
  try {
    const roleRows = db.query('SELECT id FROM roles');
    const existingRoleIds = new Set((roleRows || []).map(r => r.id));
    const defaultRoles = [
      { id: 'role_super_admin', name: 'SUPER_ADMIN', scope: 'platform', description: 'Platform owner with full access', is_system: 1 },
      { id: 'role_platform_admin', name: 'PLATFORM_ADMIN', scope: 'platform', description: 'Platform administrator', is_system: 1 },
      { id: 'role_operations', name: 'OPERATIONS', scope: 'platform', description: 'Operations team', is_system: 1 },
      { id: 'role_finance', name: 'FINANCE', scope: 'platform', description: 'Finance team', is_system: 1 },
      { id: 'role_security', name: 'SECURITY', scope: 'platform', description: 'Security team', is_system: 1 },
      { id: 'role_support', name: 'SUPPORT', scope: 'platform', description: 'Support team', is_system: 1 },
      { id: 'role_merchant_owner', name: 'MERCHANT_OWNER', scope: 'merchant', description: 'Merchant owner', is_system: 1 },
      { id: 'role_merchant_admin', name: 'MERCHANT_ADMIN', scope: 'merchant', description: 'Merchant administrator', is_system: 1 },
      { id: 'role_merchant_developer', name: 'MERCHANT_DEVELOPER', scope: 'merchant', description: 'Merchant developer', is_system: 1 },
      { id: 'role_merchant_finance', name: 'MERCHANT_FINANCE', scope: 'merchant', description: 'Merchant finance', is_system: 1 },
      { id: 'role_merchant_operations', name: 'MERCHANT_OPERATIONS', scope: 'merchant', description: 'Merchant operations', is_system: 1 },
      { id: 'role_merchant_viewer', name: 'MERCHANT_VIEWER', scope: 'merchant', description: 'Merchant viewer (read-only)', is_system: 1 }
    ];
    for (const role of defaultRoles) {
      if (!existingRoleIds.has(role.id)) {
        db.execute(
          'INSERT INTO roles (id, name, scope, description, is_system, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [role.id, role.name, role.scope, role.description, role.is_system, new Date().toISOString()]
        );
      }
    }
  } catch {}

  // Seed default permissions
  try {
    const permRows = db.query('SELECT id FROM permissions');
    const existingPermIds = new Set((permRows || []).map(r => r.id));
    const defaultPermissions = [
      { id: 'perm_merchant_create', code: 'MERCHANT_CREATE', name: 'Create Merchant', module: 'merchant' },
      { id: 'perm_merchant_read', code: 'MERCHANT_READ', name: 'View Merchants', module: 'merchant' },
      { id: 'perm_merchant_update', code: 'MERCHANT_UPDATE', name: 'Update Merchant', module: 'merchant' },
      { id: 'perm_merchant_suspend', code: 'MERCHANT_SUSPEND', name: 'Suspend/Activate Merchant', module: 'merchant' },
      { id: 'perm_merchant_users', code: 'MERCHANT_USERS', name: 'Manage Merchant Users', module: 'merchant' },
      { id: 'perm_bank_manage', code: 'BANK_MANAGE', name: 'Manage Receiving Banks', module: 'bank' },
      { id: 'perm_upi_manage', code: 'UPI_MANAGE', name: 'Manage UPI Routes', module: 'upi' },
      { id: 'perm_routing_manage', code: 'ROUTING_MANAGE', name: 'Manage Smart Routing', module: 'routing' },
      { id: 'perm_failover_manage', code: 'FAILOVER_MANAGE', name: 'Manage Failover', module: 'routing' },
      { id: 'perm_api_keys', code: 'API_KEYS', name: 'Manage API Keys', module: 'api' },
      { id: 'perm_webhooks', code: 'WEBHOOKS', name: 'Manage Webhooks', module: 'webhook' },
      { id: 'perm_transactions_read', code: 'TRANSACTIONS_READ', name: 'View Transactions', module: 'transactions' },
      { id: 'perm_ledger_read', code: 'LEDGER_READ', name: 'View Ledger', module: 'ledger' },
      { id: 'perm_reconciliation', code: 'RECONCILIATION', name: 'Run Reconciliation', module: 'reconciliation' },
      { id: 'perm_pricing', code: 'PRICING', name: 'Manage Pricing', module: 'billing' },
      { id: 'perm_diagnostics', code: 'DIAGNOSTICS', name: 'Run Diagnostics', module: 'diagnostics' },
      { id: 'perm_incidents', code: 'INCIDENTS', name: 'Manage Incidents', module: 'operations' },
      { id: 'perm_audit_read', code: 'AUDIT_READ', name: 'View Audit Logs', module: 'security' },
      { id: 'perm_mfa_manage', code: 'MFA_MANAGE', name: 'Manage MFA', module: 'security' }
    ];
    for (const perm of defaultPermissions) {
      if (!existingPermIds.has(perm.id)) {
        db.execute(
          'INSERT INTO permissions (id, code, name, description, module, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [perm.id, perm.code, perm.name, perm.name, perm.module, new Date().toISOString()]
        );
      }
    }
  } catch {}

  // Seed role-permission mappings (SUPER_ADMIN gets all)
  try {
    const rpRows = db.query('SELECT id FROM role_permissions');
    const existingRP = new Set((rpRows || []).map(r => r.id));
    const superAdminPerms = defaultPermissions.map(p => p.id);
    const mappingCounter = (rpRows || []).length;
    let idx = 0;
    for (const permId of superAdminPerms) {
      const mapId = `rp_super_admin_${idx++}`;
      if (!existingRP.has(mapId)) {
        db.execute(
          'INSERT INTO role_permissions (id, role_id, permission_id) VALUES ($1, $2, $3)',
          [mapId, 'role_super_admin', permId]
        );
      }
    }
    // MERCHANT_OWNER gets merchant-scoped permissions
    const merchantOwnerPerms = [
      'perm_merchant_read', 'perm_bank_manage', 'perm_upi_manage', 'perm_routing_manage',
      'perm_api_keys', 'perm_webhooks', 'perm_transactions_read', 'perm_ledger_read',
      'perm_diagnostics', 'perm_audit_read'
    ];
    let mIdx = 0;
    for (const permId of merchantOwnerPerms) {
      const mapId = `rp_merchant_owner_${mIdx++}`;
      if (!existingRP.has(mapId)) {
        db.execute(
          'INSERT INTO role_permissions (id, role_id, permission_id) VALUES ($1, $2, $3)',
          [mapId, 'role_merchant_owner', permId]
        );
      }
    }
  } catch {}

  // Owner identity is provisioned from private console configuration; never seed a public password.

  // Seed default pricing plans
  try {
    const planRows = db.query('SELECT id FROM pricing_plans');
    const existingPlanIds = new Set((planRows || []).map(r => r.id));
    const defaultPlans = [
      { id: 'plan_starter', name: 'Starter', slug: 'starter', monthlyFee: 0, feePercent: 200, feeFixed: 0, apiQuota: 1000, linkLimit: 100 },
      { id: 'plan_growth', name: 'Growth', slug: 'growth', monthlyFee: 500000, feePercent: 150, feeFixed: 200, apiQuota: 10000, linkLimit: 1000 },
      { id: 'plan_enterprise', name: 'Enterprise', slug: 'enterprise', monthlyFee: 2000000, feePercent: 100, feeFixed: 100, apiQuota: 100000, linkLimit: 10000 }
    ];
    for (const plan of defaultPlans) {
      if (!existingPlanIds.has(plan.id)) {
        db.execute(
          `INSERT INTO pricing_plans (id, name, slug, description, monthly_fee_paise, transaction_fee_percent, transaction_fee_fixed_paise,
           api_quota_daily, payment_link_limit, allowed_payment_methods, feature_entitlements, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [plan.id, plan.name, plan.slug, `${plan.name} plan for growing merchants`, plan.monthlyFee, plan.feePercent, plan.feeFixed,
           plan.apiQuota, plan.linkLimit, '["UPI"]', '["dynamic_qr","upi_intent","webhooks","api_access","settlement_reports"]', 1,
           new Date().toISOString(), new Date().toISOString()]
        );
      }
    }
  } catch {}

  // Create order token / nonce / UTR registry tables
  try { createOrderTables(db); } catch {}

  // Create VPA pool and health events tables
  try { createVpaPoolTables(db); } catch {}

  // Phase 4 Deliverable 2: Amount Randomization columns
  try { db.exec("ALTER TABLE payment_orders ADD COLUMN display_amount_paise BIGINT;"); } catch {}
  try { db.exec("ALTER TABLE payment_orders ADD COLUMN actual_amount_paise BIGINT;"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_payment_orders_display_amount ON payment_orders (display_amount_paise);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_payment_orders_actual_amount ON payment_orders (actual_amount_paise);"); } catch {}

  // Phase 4 Deliverable 3: Sender diversity tracking column
  try { db.exec("ALTER TABLE payment_orders ADD COLUMN sender_vpa TEXT;"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_payment_orders_sender_vpa ON payment_orders (sender_vpa);"); } catch {}

  // Phase 4 Deliverable 4: append-only financial audit log.
  // Both the API logger and callback fulfillment use textual UUID identifiers.
  db.exec(`CREATE TABLE IF NOT EXISTS pp_audit (
    id TEXT PRIMARY KEY,
    merchant_id TEXT,
    entity_id TEXT,
    details TEXT,
    actor_type TEXT,
    actor_id TEXT,
    action TEXT,
    resource_type TEXT,
    resource_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    device_fingerprint TEXT,
    request_payload TEXT DEFAULT '{}',
    response_payload TEXT DEFAULT '{}',
    outcome TEXT,
    rejection_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // Add columns to an existing pre-revision table if they don't exist.
  try { db.exec("ALTER TABLE pp_audit ADD COLUMN actor_type VARCHAR(20);"); } catch {}
  try { db.exec("ALTER TABLE pp_audit ADD COLUMN actor_id BIGINT;"); } catch {}
  try { db.exec("ALTER TABLE pp_audit ADD COLUMN action VARCHAR(50);"); } catch {}
  try { db.exec("ALTER TABLE pp_audit ADD COLUMN resource_type VARCHAR(30);"); } catch {}
  try { db.exec("ALTER TABLE pp_audit ADD COLUMN resource_id BIGINT;"); } catch {}
  try { db.exec("ALTER TABLE pp_audit ADD COLUMN ip_address TEXT;"); } catch {}
  try { db.exec("ALTER TABLE pp_audit ADD COLUMN user_agent TEXT;"); } catch {}
  try { db.exec("ALTER TABLE pp_audit ADD COLUMN device_fingerprint VARCHAR(64);"); } catch {}
  try { db.exec("ALTER TABLE pp_audit ADD COLUMN request_payload TEXT DEFAULT '{}';"); } catch {}
  try { db.exec("ALTER TABLE pp_audit ADD COLUMN response_payload TEXT DEFAULT '{}';"); } catch {}
  try { db.exec("ALTER TABLE pp_audit ADD COLUMN outcome VARCHAR(20);"); } catch {}
  try { db.exec("ALTER TABLE pp_audit ADD COLUMN rejection_reason VARCHAR(100);"); } catch {}

  // SQLite and PostgreSQL use different trigger syntax.
  if (db.dialect === 'postgres') {
    db.exec(`CREATE OR REPLACE FUNCTION pp_audit_block_mutation()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'pp_audit is append-only'; END; $$;`);
    db.exec('DROP TRIGGER IF EXISTS pp_audit_no_delete ON pp_audit');
    db.exec('DROP TRIGGER IF EXISTS pp_audit_no_update ON pp_audit');
    db.exec('CREATE TRIGGER pp_audit_no_delete BEFORE DELETE ON pp_audit FOR EACH ROW EXECUTE FUNCTION pp_audit_block_mutation()');
    db.exec('CREATE TRIGGER pp_audit_no_update BEFORE UPDATE ON pp_audit FOR EACH ROW EXECUTE FUNCTION pp_audit_block_mutation()');
  } else {
    db.exec(`CREATE TRIGGER IF NOT EXISTS pp_audit_no_delete
      BEFORE DELETE ON pp_audit BEGIN
        SELECT RAISE(ABORT, 'pp_audit is append-only');
      END;`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS pp_audit_no_update
      BEFORE UPDATE ON pp_audit BEGIN
        SELECT RAISE(ABORT, 'pp_audit is append-only');
      END;`);
  }

  // Phase 4 Deliverable 7: Merchant tiering
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS merchant_tiers (
      id INTEGER PRIMARY KEY,
      name VARCHAR(20) NOT NULL UNIQUE CHECK (name IN ('BASIC', 'VERIFIED', 'PREMIUM')),
      max_daily_volume_paise BIGINT NOT NULL CHECK (max_daily_volume_paise > 0),
      max_tx_count_per_day INTEGER NOT NULL CHECK (max_tx_count_per_day > 0),
      max_single_tx_paise BIGINT NOT NULL CHECK (max_single_tx_paise > 0),
      vpa_pool_size_required INTEGER NOT NULL DEFAULT 1 CHECK (vpa_pool_size_required > 0),
      requires_document INTEGER NOT NULL DEFAULT 0 CHECK (requires_document IN (0, 1)),
      document_type VARCHAR(30),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `); } catch {}

  // Seed default merchant tiers
  try { db.exec(`
    INSERT OR IGNORE INTO merchant_tiers (id, name, max_daily_volume_paise, max_tx_count_per_day,
      max_single_tx_paise, vpa_pool_size_required, requires_document, document_type)
    VALUES (1, 'BASIC', 5000000, 20, 500000, 3, 0, NULL);
  `); } catch {}
  try { db.exec(`
    INSERT OR IGNORE INTO merchant_tiers (id, name, max_daily_volume_paise, max_tx_count_per_day,
      max_single_tx_paise, vpa_pool_size_required, requires_document, document_type)
    VALUES (2, 'VERIFIED', 50000000, 100, 2000000, 10, 1, 'PAN_CARD');
  `); } catch {}
  try { db.exec(`
    INSERT OR IGNORE INTO merchant_tiers (id, name, max_daily_volume_paise, max_tx_count_per_day,
      max_single_tx_paise, vpa_pool_size_required, requires_document, document_type)
    VALUES (3, 'PREMIUM', 200000000, 500, 5000000, 25, 1, 'GST_CERT');
  `); } catch {}

  // Add tier_id to pp_merchants if not exists
  try { db.exec("ALTER TABLE pp_merchants ADD COLUMN tier_id INTEGER DEFAULT 1 REFERENCES merchant_tiers(id);"); } catch {}

  // Phase 4 Deliverable 6: Law Enforcement request reports
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS le_reports (
      id TEXT PRIMARY KEY,
      case_number VARCHAR(100) NOT NULL,
      agency VARCHAR(100) NOT NULL,
      officer VARCHAR(100) NOT NULL,
      target_type VARCHAR(30) NOT NULL,
      target_id TEXT NOT NULL,
      report_blob ${db.dialect === 'postgres' ? 'BYTEA' : 'BLOB'} NOT NULL,
      report_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      retention_until TEXT NOT NULL
    );
  `); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_le_reports_case_number ON le_reports (case_number);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_le_reports_agency ON le_reports (agency);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_le_reports_created_at ON le_reports (created_at);"); } catch {}

  // Phase 4 Deliverable 10: Dispute case management
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS dispute_cases (
      id TEXT PRIMARY KEY,
      payment_order_id TEXT REFERENCES payment_orders(id) ON DELETE SET NULL,
      raised_by VARCHAR(20) NOT NULL CHECK (raised_by IN ('USER', 'MERCHANT', 'SYSTEM')),
      reason VARCHAR(50) NOT NULL CHECK (reason IN ('AMOUNT_MISMATCH', 'NON_RECEIPT', 'UNAUTHORIZED', 'FRAUD')),
      status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED')),
      evidence TEXT DEFAULT '{}',
      resolution TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_dispute_cases_status ON dispute_cases(status);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_dispute_cases_payment_order ON dispute_cases(payment_order_id);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_dispute_cases_raised_by ON dispute_cases(raised_by);"); } catch {}

  try { db.exec(`
    CREATE TABLE IF NOT EXISTS dispute_events (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES dispute_cases(id) ON DELETE CASCADE,
      actor VARCHAR(20) NOT NULL,
      action VARCHAR(30) NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_dispute_events_case_id ON dispute_events(case_id);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_dispute_events_created_at ON dispute_events(created_at);"); } catch {}

  return {
    db,
    defaultMerchant
  };
}

/**
 * Creates payment order and nonce tables for the UPI token verification flow.
 * Called during migration to ensure tables exist for /api/v1/orders and
 * /api/v1/payments/:id/verify-callback.
 */
export function createOrderTables(db) {
  // payment_orders — order records created via /api/v1/orders
  try { db.exec(`
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
  `); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_payment_orders_merchant ON payment_orders (merchant_id);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders (status);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_payment_orders_nonce ON payment_orders (nonce);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_payment_orders_utr ON payment_orders (utr);"); } catch {}

  // payment_nonces — one-time-use nonces for order token validation
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS payment_nonces (
      id TEXT PRIMARY KEY,
      nonce TEXT NOT NULL UNIQUE,
      used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1)),
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `); } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_nonces_nonce ON payment_nonces (nonce);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_payment_nonces_used ON payment_nonces (used);"); } catch {}

  // utr_registry — one-time UTR enforcement
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS utr_registry (
      id TEXT PRIMARY KEY,
      utr TEXT NOT NULL UNIQUE,
      payment_order_id TEXT,
      payment_session_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `); } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_utr_registry_utr ON utr_registry (utr);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_utr_registry_order ON utr_registry (payment_order_id);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_utr_registry_session ON utr_registry (payment_session_id);"); } catch {}
}

/**
 * Creates VPA pool and health events tables for the VPA pooling
 * with health scoring feature (Phase 4 Bulletproof Operations).
 * Called during migration to ensure tables exist for VPA routing
 * and health scoring.
 */
export function createVpaPoolTables(db) {
  // vpa_pool — per-merchant pool of receiving VPAs with health scoring
  try { db.exec(`
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
  `); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_vpa_pool_merchant_status ON vpa_pool (merchant_id, status);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_vpa_pool_routing ON vpa_pool (merchant_id, status, health_score DESC);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_vpa_pool_health ON vpa_pool (health_score) WHERE status IN ('ACTIVE', 'WARMING');"); } catch {}

  // vpa_health_events — audit trail of all health score changes
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS vpa_health_events (
      id TEXT PRIMARY KEY,
      vpa_pool_id TEXT NOT NULL REFERENCES vpa_pool(id) ON DELETE CASCADE,
      event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('VELOCITY_SPIKE', 'SENDER_CONCENTRATION', 'ROUND_FIGURE', 'FREEZE', 'THAW', 'SUCCESSFUL_TX', 'DAILY_RESET', 'MANUAL_THAW')),
      severity VARCHAR(10) NOT NULL CHECK (severity IN ('INFO', 'WARN', 'CRITICAL')),
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `); } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_vpa_health_events_vpa ON vpa_health_events (vpa_pool_id, created_at);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_vpa_health_events_type ON vpa_health_events (event_type);"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_vpa_health_events_severity ON vpa_health_events (severity);"); } catch {}
}

/**
 * Completely wipes all customer identity records and active sessions,
 * reinitializing the customer identity store to a pristine state.
 * @param {import('./database.js').Database} [targetDb]
 */
export function reinitializeCustomerIdentity(targetDb) {
  const db = targetDb || getDatabase();
  try { db.exec("PRAGMA foreign_keys = OFF;"); } catch {}
  try { db.exec("UPDATE payment_sessions SET customer_id = NULL WHERE customer_id IS NOT NULL;"); } catch {}
  try { db.exec("DELETE FROM customer_sessions;"); } catch {}
  try { db.exec("DELETE FROM customers;"); } catch {}
  try { db.exec("PRAGMA foreign_keys = ON;"); } catch {}
  return { success: true, message: 'All old customer identity records wiped and reinitialized.' };
}

// Auto-run if executed directly as script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Running YOUPI PG database migrations...');
  const result = runMigrations();
  console.log(`Migration completed successfully. Default merchant: ${result.defaultMerchant.businessName} (${result.defaultMerchant.id})`);
}
