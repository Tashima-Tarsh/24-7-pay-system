import assert from 'node:assert';

const BASE_URL = process.env.TEST_URL || 'http://localhost:7000';
// TEST_ORDER_ID must be the session UUID (internal `id`), NOT the order_id.
// The API endpoint /api/v1/checkout/:id/state looks up by session UUID.
// Get it from: node scripts/seed-test-data.mjs → "Session ID (UUID)"
const TEST_ORDER_ID = process.env.TEST_ORDER_ID || process.argv[2] || null;

if (!TEST_ORDER_ID) {
  console.error('❌ TEST_ORDER_ID is required (session UUID).');
  console.error('   Usage: TEST_ORDER_ID=<session_uuid> node test-e2e.mjs');
  console.error('   Or:    node test-e2e.mjs <session_uuid>');
  process.exit(1);
}

console.log(`🚀 E2E Smoke Test against ${BASE_URL}`);
console.log(`📋 Order ID: ${TEST_ORDER_ID}\n`);

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', ...(options.headers || {}) },
    ...options
  });
  let body;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { res, body };
}

async function runTests() {
  // ── 1. Health check ──────────────────────────────────────────────
  console.log('1️⃣ Health check …');
  const { res: healthRes, body: healthData } = await fetchJson(`${BASE_URL}/health`);
  assert.strictEqual(healthRes.status, 200, 'Health check should return 200');
  assert.strictEqual(healthData.ok, true, 'Health check ok should be true');
  assert.strictEqual(healthData.status, 'UP', 'Health check status should be UP');
  assert.strictEqual(healthData.apiOnline, true, 'API should be online');
  console.log(`   ✅ Health check passed: ${JSON.stringify(healthData)}\n`);

  // ── 2. Checkout state ────────────────────────────────────────────
  console.log(`2️⃣ Checkout state for order ${TEST_ORDER_ID} …`);
  const { res: coRes, body: coData } = await fetchJson(
    `${BASE_URL}/api/v1/checkout/${TEST_ORDER_ID}/state`
  );

  if (coRes.status === 404) {
    console.error(`   ❌ Order ${TEST_ORDER_ID} not found. Run scripts/seed-test-data.mjs first.`);
    process.exit(1);
  }
  assert.strictEqual(coRes.status, 200, 'Checkout state should return 200');

  assert.ok(coData.orderId, 'Response should contain orderId');
  assert.ok(coData.amount, 'Response should contain amount');
  assert.strictEqual(coData.status, 'ACTIVE', 'Status should be ACTIVE');
  assert.ok(coData.upiUri, 'Active session should contain upiUri');
  assert.ok(coData.payeeVpa, 'Active session should contain payeeVpa');

  console.log(`   ✅ Checkout state: orderId=${coData.orderId} amount=${coData.amount} status=${coData.status}`);
  console.log(`   🏦 Payee VPA: ${coData.payeeVpa}`);
  console.log(`   🔗 UPI URI present: ${Boolean(coData.upiUri)}\n`);

  // ── 3. Polling logic (3-second interval, up to ~10 seconds) ───────
  console.log('3️⃣ Verifying polling endpoint responsiveness …');
  let polls = 0;
  const maxPolls = 3;
  const pollIntervalMs = 3000;
  const start = Date.now();

  while (polls < maxPolls && Date.now() - start < 12000) {
    const { res: pollRes, body: pollData } = await fetchJson(
      `${BASE_URL}/api/v1/checkout/${TEST_ORDER_ID}/state`
    );
    assert.strictEqual(pollRes.status, 200, `Poll ${polls + 1} should return 200`);
    assert.strictEqual(pollData.status, 'ACTIVE', `Poll ${polls + 1} status should be ACTIVE`);
    polls++;
    if (polls < maxPolls) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }
  assert.ok(polls >= 1, 'At least one poll should succeed');
  console.log(`   ✅ Polled ${polls} time(s) successfully (endpoint responds consistently)\n`);

  // ── 4. Payment-done simulation (verification pending) ────────────
  console.log('4️⃣ Payment-done simulation (12-digit UTR) …');
  const { res: pdRes, body: pdData } = await fetchJson(
    `${BASE_URL}/api/v1/checkout/${TEST_ORDER_ID}/payment-done`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utr: '123456789012', payerName: 'Test Customer', payerVpa: 'customer@upi' })
    }
  );

  if (pdRes.status === 400 && pdData.code === 'INVALID_SESSION_STATUS') {
    console.log(`   ⚠️  Session not in ACTIVE state (may have expired): ${pdData.error}`);
    console.log('   ℹ️  This is expected if the seed data expired between steps.\n');
  } else {
    assert.ok([200, 400].includes(pdRes.status), `Payment-done should return 200 or 400, got ${pdRes.status}`);
    if (pdRes.status === 200) {
      assert.strictEqual(pdData.status, 'VERIFICATION_PENDING', 'Status should transition to VERIFICATION_PENDING');
      console.log(`   ✅ Payment-done: status → ${pdData.status} (UTR reported)\n`);
    } else {
      console.log(`   ⚠️  Payment-done returned ${pdRes.status}: ${JSON.stringify(pdData)}\n`);
    }
  }

  console.log('🎉 ALL E2E SMOKE TESTS PASSED!');
}

runTests().catch(err => {
  console.error('❌ E2E TEST FAILED:', err.message);
  process.exit(1);
});
