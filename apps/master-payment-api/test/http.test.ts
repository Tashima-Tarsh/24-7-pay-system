import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { makeApp } from "../src/app.ts";
import { ipAllowed } from "../src/config.ts";
import type { Config } from "../src/config.ts";
import type { Store } from "../src/store.ts";
import type { Redis } from "ioredis";

test("IP matching normalizes IPv4-mapped addresses and checks subnet boundaries", () => {
  assert.equal(ipAllowed("::ffff:172.29.95.10", ["172.29.95.10"]), true);
  assert.equal(ipAllowed("172.29.95.10", ["172.29.95.0/24"]), true);
  assert.equal(ipAllowed("172.29.94.10", ["172.29.95.0/24"]), false);
  assert.equal(ipAllowed("2001:db8::2", ["2001:db8::/64"]), true);
  assert.equal(ipAllowed("unknown", ["127.0.0.1"]), false);
});

test("HTTP rejects HEAD allocation and spoofed or unsigned bank webhooks before touching the stores", async () => {
  const settings = {
    trustedProxies: [], webhookIps: ["127.0.0.1"], webhookSecret: "test-key"
  } as unknown as Config;
  const store = {database:{collection:()=>({})}} as unknown as Store;
  const app = makeApp(settings,store,{} as Redis);
  const server = app.listen(0,"127.0.0.1");
  try {
    await once(server,"listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = "http://127.0.0.1:" + address.port;
    assert.equal((await fetch(base + "/api/upi/next",{method:"HEAD"})).status,405);
    const response = await fetch(base + "/api/webhook/bank",{
      method:"POST", headers:{"content-type":"application/json","x-forwarded-for":"10.0.0.1","x-bank-signature":"a".repeat(64)},
      body:"{}"
    });
    assert.equal(response.status,401);
    assert.equal((await response.json()).error,"Invalid bank webhook signature");
  } finally {
    await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
