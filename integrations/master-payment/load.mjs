import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

const base = process.env.MASTER_API_URL ?? "http://127.0.0.1:3000";
const apiKey = process.env.SMOKE_MERCHANT_API_KEY;
const signature = process.env.SMOKE_APP_SIGNATURE ?? "a".repeat(64);
const count = Number(process.env.LOAD_REQUESTS ?? 1000);
assert(apiKey && Number.isSafeInteger(count) && count > 0 && count <= 1000);
const interval = 60_000 / count;

async function createSession(index) {
  const response = await fetch(base + "/api/payment-sessions", {
    method: "POST",
    headers: { "x-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      orderId: "load-" + randomUUID(),
      amountPaise: 5000 + index,
      appSignature: signature,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  assert(response.ok, "Session setup returned " + response.status);
  return (await response.json()).sessionToken;
}

const sessions = [];
for (let start = 0; start < count; start += 20) {
  const batch = Array.from({ length: Math.min(20, count - start) }, (_, index) => start + index);
  sessions.push(...await Promise.all(batch.map(createSession)));
}

const started = performance.now();
const results = await Promise.all(sessions.map(async (token, index) => {
  await delay(Math.max(0, started + index * interval - performance.now()));
  const sent = performance.now();
  try {
    const response = await fetch(base + "/api/upi/next", {
      headers: {
        authorization: "Bearer " + token,
        "x-device-id": (index + 1).toString(16).padStart(16, "0"),
        "x-app-signature": signature,
        "x-device-model": "Fixture Phone",
        "x-os-version": "14",
      },
      signal: AbortSignal.timeout(15_000),
    });
    await response.arrayBuffer();
    return { status: response.status, ms: performance.now() - sent };
  } catch {
    return { status: "network_error", ms: performance.now() - sent };
  }
}));
const statuses = Object.create(null);
for (const { status } of results) statuses[status] = (statuses[status] ?? 0) + 1;
const latency = results.map(({ ms }) => ms).sort((a, b) => a - b);
console.log(JSON.stringify({
  requests: results.length,
  elapsedMs: Math.round(performance.now() - started),
  statuses,
  p95Ms: Math.round(latency[Math.ceil(latency.length * 0.95) - 1]),
}, null, 2));
assert.equal(statuses.network_error ?? 0, 0, "Transport errors");
assert.equal(Object.entries(statuses).filter(([code]) => !["200", "429", "503"].includes(code))
  .reduce((total, [, value]) => total + value, 0), 0, "Unexpected API responses");
assert((statuses[200] ?? 0) > 0, "Fixture pool accepted no payments");
