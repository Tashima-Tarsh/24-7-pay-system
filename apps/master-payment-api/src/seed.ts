import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { config } from "./config.ts";
import { hash } from "./payment.ts";
import { openStore } from "./store.ts";

const settings = config();
const email = z.email().parse(process.env.MASTER_SEED_EMAIL).toLowerCase();
const password = z.string().min(12).refine(value => Buffer.byteLength(value) <= 72).parse(process.env.MASTER_SEED_PASSWORD);
const upiId = z.string().regex(/^[a-z0-9][a-z0-9._-]+@[a-z0-9][a-z0-9.-]+$/).parse(process.env.MASTER_SEED_UPI_ID);
const appSignature = z.string().regex(/^[a-f0-9]{64}$/i).parse(process.env.MASTER_SEED_APP_SIGNATURE).toLowerCase();
if (settings.approvedUpiOwners.get(upiId) !== email) throw new Error("Seed UPI ID must match the seed merchant in MASTER_APPROVED_UPI_OWNERS");

const store = await openStore(settings.mongoUri);
try {
  const apiKey = "sb_" + randomBytes(32).toString("hex");
  await store.merchants.insertOne({
    _id:new ObjectId(),email,password:await bcrypt.hash(password,12),gameName:"Local game fixture",
    apiKeyHash:hash(apiKey),apiKeyPrefix:apiKey.slice(0,11),authVersion:1,createdAt:new Date(),
    upiIds:[{id:randomUUID(),upiId,name:"Local merchant fixture",type:"merchant",bank:upiId.split("@")[1],isActive:true,dailyLimit:150}],
    appSignatures:[appSignature],
    securityConfig:{adminIpWhitelist:settings.adminIps,webhookSourceIps:[],playerRateLimitPerMin:settings.rateMax,enableGeoBlocking:false}
  });
  // The newly issued key is printed once for the local smoke fixture.
  console.log(JSON.stringify({email,apiKey,upiId,appSignature}));
} finally {
  await store.client.close();
}
