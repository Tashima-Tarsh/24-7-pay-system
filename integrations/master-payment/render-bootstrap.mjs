import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { config } from "./dist/config.js";
import { hash } from "./dist/payment.js";
import { openStore } from "./dist/store.js";

const settings = config();
const email = "merchant@example.test";
const password = process.env.PORTAL_BOOTSTRAP_PASSWORD;
if (!password || password.length < 16 || Buffer.byteLength(password) > 72) {
  throw new Error("Set a portal bootstrap password of 16 to 72 bytes");
}
const store = await openStore(settings.mongoUri);
try {
  if (!(await store.merchants.findOne({ email }))) {
    const key = "sb_" + randomBytes(32).toString("hex");
    await store.merchants.insertOne({
      _id: new ObjectId(), email, password: await bcrypt.hash(password, 12),
      gameName: "Sanbookpay merchant", apiKeyHash: hash(key), apiKeyPrefix: key.slice(0, 11),
      authVersion: 1, createdAt: new Date(), upiIds: [], appSignatures: [],
      securityConfig: {
        adminIpWhitelist: settings.adminIps, webhookSourceIps: [],
        playerRateLimitPerMin: settings.rateMax, enableGeoBlocking: true,
      },
    });
  }
} finally {
  await store.client.close();
}
