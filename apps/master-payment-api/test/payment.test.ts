import assert from "node:assert/strict";
import test from "node:test";
import { mintGrant, readGrant, safeSignature, buildUri } from "../src/payment.ts";
import { healthScore } from "../src/throttle.ts";

test("health penalties use the higher threshold once and clamp to zero", () => {
  const base = { hourly: 0, daily: 0, dailyLimit: 100, recentErrors: 0, recentFailure: false, bankShare: 0, hour: 12 };
  assert.equal(healthScore({...base, hourly: 9, daily: 91}), 30);
  assert.equal(healthScore({...base, daily: 71, recentErrors: 10}), 0);
  assert.equal(healthScore({...base, hourly: 6, bankShare: .31, hour: 23}), 55);
});

test("grant binds merchant, order and exact amount and expires at five minutes", () => {
  const now = 1000000;
  const grant = {merchantId:"merchant", orderId:"order", amountPaise:5009, issuedAt:now};
  const token = mintGrant("key", grant);
  assert.deepEqual(readGrant("key", token, now + 1), grant);
  assert.equal(readGrant("wrong", token, now), null);
  assert.equal(readGrant("key", token, now + 300000), null);
  assert.equal(readGrant("key", token, now - 1), null);
  assert.equal(safeSignature("a".repeat(64), "A".repeat(64)), true);
  assert.equal(safeSignature("g".repeat(64), "A".repeat(64)), false);
});

test("UPI URI encodes payee name and formats integer paise exactly", () => {
  const uri = new URL(buildUri("shop@bank", "A & B", 5010, "TX1", "order/1"));
  assert.equal(uri.protocol, "upi:");
  assert.equal(uri.searchParams.get("am"), "50.10");
  assert.equal(uri.searchParams.get("pn"), "A & B");
  assert.equal(uri.searchParams.get("tr"), "TX1");
});
