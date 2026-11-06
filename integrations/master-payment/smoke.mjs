import assert from "node:assert/strict";
import { createHmac, randomUUID, randomInt } from "node:crypto";

const baseUrl = process.env.MASTER_API_URL ?? "http://127.0.0.1:3000";
const apiKey = process.env.SMOKE_MERCHANT_API_KEY;
const webhookSecret = process.env.BANK_WEBHOOK_SECRET;
const appSignature = process.env.SMOKE_APP_SIGNATURE ?? "a".repeat(64);
assert(apiKey && webhookSecret, "Set the isolated fixture API key and bank webhook secret");

async function request(path, { method = "GET", headers, body, status = 200 } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { ...(body && { "content-type": "application/json" }), ...headers },
    body: body && (typeof body === "string" ? body : JSON.stringify(body)),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, status, path);
  return response.json();
}

await request("/health");
const orderId = "smoke-" + randomUUID();
const merchantHeaders = { "x-api-key": apiKey };
const { sessionToken } = await request("/api/payment-sessions", {
  method: "POST", headers: merchantHeaders, status: 201,
  body: { orderId, amountPaise: 5000, appSignature },
});
assert.equal(typeof sessionToken, "string");
const deviceHeaders = {
  authorization: "Bearer " + sessionToken,
  "x-device-id": "d36d2c7825351d4a",
  "x-app-signature": appSignature,
  "x-device-model": "Fixture Phone",
  "x-os-version": "14",
};
const payment = await request("/api/upi/next", { headers: deviceHeaders });
assert.equal(payment.orderId, orderId);
assert(payment.amountPaise > 5000 && payment.amountPaise < 5100);
assert.equal(new URL(payment.paymentUri).searchParams.get("tr"), payment.txnRef);
await request("/api/transactions/verify", { method: "POST", headers: deviceHeaders, status: 402 });

const body = JSON.stringify({
  eventId: randomUUID(),
  txnRef: payment.txnRef,
  upiId: payment.upiId,
  amountPaise: payment.amountPaise,
  currency: "INR",
  status: "confirmed",
  bankReference: String(randomInt(100_000_000_000, 999_999_999_999)),
});
const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");
await request("/api/webhook/bank", {
  method: "POST", headers: { "x-bank-signature": "0".repeat(64) }, body, status: 401,
});
await request("/api/webhook/bank", {
  method: "POST", headers: { "x-bank-signature": signature }, body,
});
await request("/api/webhook/bank", {
  method: "POST", headers: { "x-bank-signature": signature }, body,
});
const grant = await request("/api/transactions/verify", { method: "POST", headers: deviceHeaders });
assert.equal(grant.orderId, orderId);
assert.equal(grant.amountPaise, payment.amountPaise);
assert.equal(typeof grant.token, "string");
const redemption = await request("/api/transactions/redeem", {
  method: "POST", headers: merchantHeaders, body: { token: grant.token },
});
assert.equal(redemption.orderId, orderId);
assert.equal(redemption.amountPaise, payment.amountPaise);
await request("/api/transactions/redeem", {
  method: "POST", headers: merchantHeaders, body: { token: grant.token }, status: 409,
});
const recorded = await request("/api/transactions/" + orderId, { headers: merchantHeaders });
assert.equal(recorded.status, "confirmed");
assert(recorded.redeemedAt);
console.log("Signed webhook, pending verification, grant issuance and game server redemption passed.");
