import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { MongoServerError, ObjectId } from "mongodb";
import type { ClientSession, Filter } from "mongodb";
import type { Redis } from "ioredis";
import { parse as parseCsv } from "csv-parse/sync";
import { z } from "zod";
import { ipAllowed, validIpRule } from "./config.ts";
import type { Config } from "./config.ts";
import { buildUri, hash, mintGrant, readGrant, safeSignature, sign } from "./payment.ts";
import type { Merchant, Store, Transaction, UpiRoute } from "./store.ts";
import { AIThrottleEngine, rateAllowed } from "./throttle.ts";

const password = z.string().min(12).refine(value => Buffer.byteLength(value) <= 72, "Password exceeds 72 bytes");
const email = z.email().max(254).transform(value => value.toLowerCase());
const appSignature = z.string().regex(/^[a-f0-9]{64}$/i).transform(value => value.toLowerCase());
const orderId = z.string().regex(/^[A-Za-z0-9._-]{1,80}$/);
const amountPaise = z.number().int().min(100).max(100_000_000);
const upiId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,99}@[A-Za-z0-9][A-Za-z0-9.-]{1,49}$/).transform(value => value.toLowerCase());
const ipRules = z.array(z.string().refine(validIpRule)).min(1).max(50);
const routeInput = z.object({
  upiId, name:z.string().trim().min(1).max(100),
  type:z.literal("merchant").default("merchant"),
  dailyLimit:z.coerce.number().int().min(1).max(150).default(150)
});
const sessionInput = z.object({orderId, amountPaise, appSignature});
const webhookInput = z.object({
  eventId:z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
  txnRef:z.string().regex(/^SB[A-F0-9]{32}$/),
  upiId, amountPaise:z.number().int().positive(),
  currency:z.literal("INR"), status:z.enum(["confirmed","failed"]),
  bankReference:z.string().regex(/^\d{12}$/).optional(),
  errorCode:z.string().regex(/^[A-Z0-9_]{1,60}$/).optional()
}).refine(value => value.status !== "confirmed" || value.bankReference !== undefined, "Bank reference is required");

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function requireCondition(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new HttpError(status, message);
}

const duplicate = (error: unknown) => error instanceof MongoServerError && error.code === 11000;
const keyMaterial = () => "sb_" + randomBytes(32).toString("hex");
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const inrDay = (date: Date) => dateKey(new Date(date.getTime() + 19_800_000));
const bearer = (req: Request) => /^Bearer ([^\s]+)$/i.exec(req.get("authorization") || "")?.[1];

export function makeApp(config: Config, store: Store, redis: Redis) {
  const app = express();
  const engine = new AIThrottleEngine(redis);
  const checkouts = store.database.collection<{
    _id: string; merchantId: ObjectId; orderId: string; amountPaise: number; appSignature: string;
    createdAt: Date; deviceFingerprint?: string;
  }>("master_checkout_orders");

  app.disable("x-powered-by");
  app.set("trust proxy", (ip: string) => ipAllowed(ip, config.trustedProxies));
  app.use((req, res, next) => {
    res.set({"Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"});
    if (config.corsOrigin && req.get("origin") === config.corsOrigin) {
      res.vary("Origin");
      res.set("Access-Control-Allow-Origin", config.corsOrigin);
      res.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-API-Key, X-Device-ID, X-App-Signature, X-Device-Model, X-OS-Version");
      res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") { res.sendStatus(204); return; }
    next();
  });

  const authToken = (merchant: Merchant) => jwt.sign({version:merchant.authVersion}, config.jwtSecret, {
    algorithm:"HS256", expiresIn:"1h", subject:merchant._id.toHexString(), audience:"sanbookpay-admin"
  });

  async function merchantFor(req: Request, mode: "admin" | "key" | "checkout") {
    if (mode === "key") {
      const key = req.get("x-api-key");
      requireCondition(key && /^sb_[a-f0-9]{64}$/.test(key), 401, "Invalid merchant API key");
      const merchant = await store.merchants.findOne({apiKeyHash:hash(key), deletedAt:{$exists:false}});
      requireCondition(merchant, 401, "Invalid merchant API key");
      return {merchant, claims:undefined};
    }
    const token = bearer(req);
    requireCondition(token && token.length <= 4096, 401, "Missing authorization");
    let claims;
    try {
      claims = jwt.verify(token, config.jwtSecret, {
        algorithms:["HS256"], audience:mode === "admin" ? "sanbookpay-admin" : "sanbookpay-checkout"
      });
    } catch {
      throw new HttpError(401, "Invalid or expired authorization");
    }
    requireCondition(typeof claims === "object" && typeof claims.sub === "string" && ObjectId.isValid(claims.sub), 401, "Invalid authorization");
    const merchant = await store.merchants.findOne({_id:new ObjectId(claims.sub), authVersion:claims.version, deletedAt:{$exists:false}});
    requireCondition(merchant, 401, "Invalid authorization");
    if (mode === "admin") {
      requireCondition(ipAllowed(req.ip || "", merchant.securityConfig.adminIpWhitelist), 403, "Administrator IP is not allowed");
    }
    return {merchant, claims};
  }

  type MerchantHandler = (req: Request, res: Parameters<RequestHandler>[1], merchant: Merchant) => Promise<void>;
  const admin = (handler: MerchantHandler): RequestHandler => async (req,res) => {
    const {merchant} = await merchantFor(req, "admin");
    await handler(req,res,merchant);
  };

  function limit(scope: string, max: number): RequestHandler {
    return async (req,res,next) => {
      if (!await rateAllowed(redis, scope + ":" + (req.ip || ""), max)) {
        res.set("Retry-After","60").status(429).json({error:"Rate limit exceeded"});
        return;
      }
      next();
    };
  }

  async function withAudit<T>(
    req: Request, merchantId: ObjectId, action: string, details: Record<string, unknown>,
    change: (session: ClientSession) => Promise<T>
  ) {
    return store.client.withSession(session => session.withTransaction(async () => {
      const result = await change(session);
      await store.audit(merchantId, action, req, details, session);
      return result;
    }));
  }

  app.get("/health", async (_req,res) => {
    try {
      await Promise.all([store.database.command({ping:1}), redis.ping()]);
      res.json({status:"ok"});
    } catch {
      res.status(503).json({status:"unavailable"});
    }
  });

  app.post("/api/webhook/bank", express.raw({type:"application/json", limit:"32kb", inflate:false}), async (req,res) => {
    requireCondition(ipAllowed(req.ip || "", config.webhookIps), 403, "Webhook IP is not allowed");
    requireCondition(Buffer.isBuffer(req.body) && safeSignature(sign(config.webhookSecret, req.body), req.get("x-bank-signature")),
      401, "Invalid bank webhook signature");
    let payload: unknown;
    try { payload = JSON.parse(req.body.toString("utf8")); }
    catch { throw new HttpError(400, "Invalid webhook JSON"); }
    const event = webhookInput.parse(payload);
    const payloadHash = hash(req.body.toString("base64"));
    const tx = await store.transactions.findOne({txnRef:event.txnRef});
    requireCondition(tx && tx.upiIdUsed === event.upiId && tx.amountPaise === event.amountPaise, 409, "Webhook does not match a payment");
    const merchant = await store.merchants.findOne({_id:tx.merchantId});
    requireCondition(merchant, 409, "Webhook merchant missing");
    const ips = merchant.securityConfig.webhookSourceIps;
    requireCondition(ips.length === 0 || ipAllowed(req.ip || "", ips), 403, "Webhook IP is not allowed for merchant");

    async function applyEvent() {
      const updated = await store.transactions.findOneAndUpdate(
        {_id:tx!._id, status:{$in:["pending","expired"]}},
        {$set:{status:event.status, bankEventId:event.eventId, bankPayloadHash:payloadHash, bankEventAt:new Date(),
          ...(event.errorCode ? {bankErrorCode:event.errorCode} : {}),
          ...(event.bankReference ? {bankReference:event.bankReference} : {}),
          ...(event.status === "confirmed" ? {verifiedAt:new Date()} : {})}},
        {returnDocument:"after"}
      );
      if (updated) return updated;
      const existing = await store.transactions.findOne({_id:tx!._id});
      requireCondition(existing?.bankEventId === event.eventId && existing.bankPayloadHash === payloadHash, 409, "Payment already finalized");
      return existing;
    }

    let updated;
    try { updated = await applyEvent(); }
    catch (error) {
      if (duplicate(error)) throw new HttpError(409, "Bank event or reference already used");
      throw error;
    }
    if (updated.status === "failed") await engine.recordFailure(event.upiId, event.eventId, updated.bankEventAt?.getTime() ?? Date.now(), event.errorCode);
    res.json({status:updated.status});
  });

  app.use(express.json({limit:"128kb"}));

  app.post("/api/auth/register", limit("register",5), async (req,res) => {
    requireCondition(ipAllowed(req.ip || "", config.adminIps), 403, "Registration IP is not allowed");
    const input = z.object({email,password,gameName:z.string().trim().min(1).max(100),captchaToken:z.string().min(1).max(4096)}).parse(req.body);
    requireCondition(config.captchaSecret, 503, "Registration CAPTCHA is unavailable");
    const captcha = await fetch(config.captchaVerifyUrl, {
      method:"POST", body:new URLSearchParams({secret:config.captchaSecret, response:input.captchaToken, remoteip:req.ip || ""}),
      signal:AbortSignal.timeout(5000)
    });
    requireCondition(captcha.ok && (await captcha.json() as {success?:boolean}).success === true, 400, "CAPTCHA verification failed");
    const apiKey = keyMaterial();
    const merchant: Merchant = {
      _id:new ObjectId(), email:input.email, password:await bcrypt.hash(input.password,12), gameName:input.gameName,
      apiKeyHash:hash(apiKey), apiKeyPrefix:apiKey.slice(0,11), authVersion:1, upiIds:[], appSignatures:[],
      securityConfig:{adminIpWhitelist:config.adminIps,webhookSourceIps:[],playerRateLimitPerMin:100,enableGeoBlocking:true}, createdAt:new Date()
    };
    try {
      await withAudit(req,merchant._id,"MERCHANT_REGISTERED",{}, session => store.merchants.insertOne(merchant,{session}));
    } catch (error) {
      if (duplicate(error)) throw new HttpError(409,"Email already registered");
      throw error;
    }
    res.status(201).json({apiKey,token:authToken(merchant)});
  });

  app.post("/api/auth/login", limit("login",10), async (req,res) => {
    const input = z.object({email,password}).parse(req.body);
    const merchant = await store.merchants.findOne({email:input.email,deletedAt:{$exists:false}});
    requireCondition(merchant && await bcrypt.compare(input.password,merchant.password), 401, "Invalid credentials");
    requireCondition(ipAllowed(req.ip || "", merchant.securityConfig.adminIpWhitelist),403,"Administrator IP is not allowed");
    await store.audit(merchant._id,"ADMIN_LOGIN",req);
    res.json({token:authToken(merchant)});
  });

  app.post("/api/auth/regenerate-key", admin(async (req,res,merchant) => {
    z.object({confirm:z.literal(true)}).parse(req.body);
    const apiKey = keyMaterial();
    const updated = await withAudit(req,merchant._id,"API_KEY_REGENERATED",{}, session =>
      store.merchants.findOneAndUpdate({_id:merchant._id,authVersion:merchant.authVersion,deletedAt:{$exists:false}},
        {$set:{apiKeyHash:hash(apiKey),apiKeyPrefix:apiKey.slice(0,11)},$inc:{authVersion:1}},
        {returnDocument:"after",session}));
    requireCondition(updated,409,"Merchant credentials changed");
    res.json({apiKey,token:authToken(updated)});
  }));

  async function metrics(merchant: Merchant) {
    const routes = merchant.upiIds.filter(route => !route.deletedAt);
    const byId = new Map((await engine.metrics(routes,merchant._id.toHexString())).map(item => [item.id,item]));
    return routes.map(route => {
      const snapshot = byId.get(route.id);
      return {...route,usageCount:snapshot?.usageCount ?? 0, hourly:snapshot?.hourly ?? 0,
        healthScore:snapshot?.healthScore ?? 0,lastUsed:snapshot?.lastUsed ? new Date(snapshot.lastUsed) : null,
        disabledUntil:snapshot?.disabledUntil ? new Date(snapshot.disabledUntil) : null};
    });
  }

  app.get("/api/upi/list", admin(async (_req,res,merchant) => { res.json({upiIds:await metrics(merchant)}); }));

  async function insertRoutes(req: Request, merchant: Merchant, input: z.infer<typeof routeInput>[], action: string) {
    const ids = input.map(route => route.upiId);
    requireCondition(new Set(ids).size === ids.length,409,"Duplicate UPI ID in request");
    requireCondition(ids.every(id => config.approvedUpiOwners.get(id) === merchant.email),403,"UPI ID is not approved for merchant payments");
    const routes: UpiRoute[] = input.map(item => ({...item,id:randomUUID(),bank:item.upiId.split("@")[1],isActive:true}));
    await withAudit(req,merchant._id,action,{ids},async session => {
      const changed = await store.merchants.updateOne({
        _id:merchant._id,deletedAt:{$exists:false},
        upiIds:{$not:{$elemMatch:{upiId:{$in:ids},deletedAt:{$exists:false}}}},
        $expr:{$lte:[{$size:"$upiIds"},1000 - routes.length]}
      },{$push:{upiIds:{$each:routes}}},{session});
      requireCondition(changed.modifiedCount === 1,409,"Duplicate UPI ID or pool capacity reached");
    });
    return routes;
  }

  app.post("/api/upi/add", admin(async (req,res,merchant) => {
    const [route] = await insertRoutes(req,merchant,[routeInput.parse(req.body)],"UPI_ADDED");
    res.status(201).json({route});
  }));

  app.post("/api/upi/bulk-add", admin(async (req,res,merchant) => {
    const {csv} = z.object({csv:z.string().min(1).max(64_000)}).parse(req.body);
    let rows: unknown;
    try {
      rows = parseCsv(csv,{columns:true,bom:true,skip_empty_lines:true,trim:true,max_record_size:1000});
    } catch { throw new HttpError(400,"Invalid UPI CSV"); }
    const input = z.array(routeInput).min(1).max(100).parse(rows);
    res.status(201).json({routes:await insertRoutes(req,merchant,input,"UPI_BULK_ADDED")});
  }));

  app.patch("/api/upi/toggle/:id", admin(async (req,res,merchant) => {
    const {isActive} = z.object({isActive:z.boolean()}).parse(req.body);
    await withAudit(req,merchant._id,"UPI_TOGGLED",{id:req.params.id,isActive},async session => {
      const change = await store.merchants.updateOne({_id:merchant._id,upiIds:{$elemMatch:{id:req.params.id,deletedAt:{$exists:false}}}},
        {$set:{"upiIds.$.isActive":isActive}},{session});
      requireCondition(change.matchedCount === 1,404,"UPI ID not found");
    });
    res.sendStatus(204);
  }));

  app.delete("/api/upi/delete/:id", admin(async (req,res,merchant) => {
    await withAudit(req,merchant._id,"UPI_DELETED",{id:req.params.id},async session => {
      const change = await store.merchants.updateOne({_id:merchant._id,upiIds:{$elemMatch:{id:req.params.id,deletedAt:{$exists:false}}}},
        {$set:{"upiIds.$.isActive":false,"upiIds.$.deletedAt":new Date()}},{session});
      requireCondition(change.modifiedCount === 1,404,"UPI ID not found");
    });
    res.sendStatus(204);
  }));

  app.post("/api/upi/emergency-kill", admin(async (req,res,merchant) => {
    z.object({confirm:z.literal(true)}).parse(req.body);
    await withAudit(req,merchant._id,"UPI_EMERGENCY_KILL",{},session =>
      store.merchants.updateOne({_id:merchant._id},{$set:{"upiIds.$[].isActive":false}},{session}));
    res.sendStatus(204);
  }));

  app.post("/api/payment-sessions", async (req,res) => {
    const {merchant} = await merchantFor(req,"key");
    const input = sessionInput.parse(req.body);
    requireCondition(merchant.appSignatures.includes(input.appSignature),403,"App signing certificate is not registered");
    requireCondition(await rateAllowed(redis,"sessions:" + merchant._id, config.rateMax, config.rateWindowMs),429,"Rate limit exceeded");
    const id = hash(merchant._id.toHexString() + ":" + input.orderId);
    let checkout;
    try {
      checkout = await checkouts.findOneAndUpdate({_id:id},{$setOnInsert:{
        merchantId:merchant._id,orderId:input.orderId,amountPaise:input.amountPaise,appSignature:input.appSignature,createdAt:new Date()
      }},{upsert:true,returnDocument:"after"});
    } catch (error) {
      if (!duplicate(error)) throw error;
      checkout = await checkouts.findOne({_id:id});
    }
    requireCondition(checkout && checkout.amountPaise === input.amountPaise && checkout.appSignature === input.appSignature,409,"Order details already registered");
    const sessionToken = jwt.sign({checkout:id,version:merchant.authVersion},config.jwtSecret,{
      algorithm:"HS256",expiresIn:"30m",subject:merchant._id.toHexString(),audience:"sanbookpay-checkout"
    });
    res.status(201).json({sessionToken});
  });

  async function player(req: Request, scope: "allocate" | "verify") {
    const {merchant,claims} = await merchantFor(req,"checkout");
    const fields = z.object({
      device:z.string().min(4).max(100).regex(/^[A-Za-z0-9._-]+$/),
      signature:appSignature, model:z.string().trim().min(1).max(100), os:z.string().trim().min(1).max(50)
    }).parse({device:req.get("x-device-id"),signature:req.get("x-app-signature"),model:req.get("x-device-model"),os:req.get("x-os-version")});
    requireCondition(claims && typeof claims.checkout === "string",401,"Invalid checkout authorization");
    const checkout = await checkouts.findOne({_id:claims.checkout,merchantId:merchant._id});
    requireCondition(checkout,404,"Checkout not found");
    const fingerprint = hash([fields.device,fields.signature,fields.model,fields.os].join("\u0000"));
    const cap = merchant.securityConfig.playerRateLimitPerMin;
    const merchantRate = await rateAllowed(redis,"merchant:" + merchant._id + ":" + scope,cap,config.rateWindowMs);
    const deviceRate = await rateAllowed(redis,"device:" + merchant._id + ":" + fingerprint + ":" + scope,Math.min(cap,100),config.rateWindowMs);
    requireCondition(merchantRate && deviceRate,429,"Rate limit exceeded");
    if (fields.signature !== checkout.appSignature || !merchant.appSignatures.includes(fields.signature)
      || /genymotion|bluestacks|ldplayer|sdk_gphone|emulator/i.test(fields.model)) {
      await store.audit(merchant._id,"DEVICE_FINGERPRINT_REJECTED",req,{orderId:checkout.orderId});
      throw new HttpError(403,"Device or app signature rejected");
    }
    const geoHeader = ipAllowed(req.socket.remoteAddress || "",config.trustedProxies) ? req.get("x-geo-state")?.toUpperCase() : undefined;
    const geoState = geoHeader && /^[A-Z]{2}$/.test(geoHeader) ? geoHeader : "UNKNOWN";
    if (scope === "allocate" && merchant.securityConfig.enableGeoBlocking && config.geoDeniedStates.size > 0) {
      requireCondition(geoState !== "UNKNOWN" && !config.geoDeniedStates.has(geoState),403,"Checkout location is not allowed");
    }
    const binding = await checkouts.updateOne({_id:checkout._id,$or:[
      {deviceFingerprint:fingerprint},{deviceFingerprint:{$exists:false}}
    ]},{$set:{deviceFingerprint:fingerprint}});
    if (!binding.matchedCount) {
      await store.audit(merchant._id,"DEVICE_FINGERPRINT_REJECTED",req,{orderId:checkout.orderId,reason:"DEVICE_CHANGED"});
      throw new HttpError(403,"Checkout belongs to another device");
    }
    return {merchant,checkout,fingerprint,geoState};
  }

  app.head("/api/upi/next", (_req,res) => { res.set("Allow","GET").sendStatus(405); });
  app.get("/api/upi/next", async (req,res) => {
    const {merchant,checkout,fingerprint,geoState} = await player(req,"allocate");
    const filter = {merchantId:merchant._id,orderId:checkout.orderId};
    const txnRef = "SB" + checkout._id.slice(0,32).toUpperCase();
    let tx = await store.transactions.findOne(filter);
    if (!tx) {
      const eligible = merchant.upiIds.filter(route => config.approvedUpiOwners.get(route.upiId) === merchant.email);
      const reservation = await engine.allocate(eligible,merchant._id.toHexString(),txnRef,checkout.amountPaise,geoState);
      if (!reservation) {
        res.set("Retry-After","60").status(503).json({error:"No eligible UPI route"});
        return;
      }
      const route = eligible.find(item => item.id === reservation.id);
      requireCondition(route,409,"UPI route changed before checkout was created");
      const finalAmount = checkout.amountPaise + reservation.offsetPaise;
      const record: Transaction = {
        _id:new ObjectId(),merchantId:merchant._id,orderId:checkout.orderId,amountPaise:finalAmount,
        baseAmount:checkout.amountPaise,offsetPaise:reservation.offsetPaise,upiIdUsed:route.upiId,txnRef,
        paymentUri:buildUri(route.upiId,route.name,finalAmount,txnRef,checkout.orderId),merchantName:route.name,
        status:"pending",deviceFingerprint:fingerprint,playerIp:req.ip || "",geoState,tokenIssued:false,
        createdAt:new Date(reservation.createdAt),expiresAt:new Date(reservation.createdAt + 900_000)
      };
      try {
        await store.client.withSession(session => session.withTransaction(async () => {
          // Serialize final allocation with merchant route toggles and emergency shutdown.
          const routeGuard = await store.merchants.updateOne({
            _id:merchant._id,authVersion:merchant.authVersion,deletedAt:{$exists:false},
            upiIds:{$elemMatch:{id:route.id,isActive:true,deletedAt:{$exists:false}}}
          },{$inc:{allocationVersion:1}},{session});
          requireCondition(routeGuard.matchedCount === 1,409,"UPI route changed before checkout was created");
          await store.transactions.insertOne(record,{session});
        }));
        tx = record;
      } catch (error) {
        if (!duplicate(error)) throw error;
        tx = await store.transactions.findOne(filter);
      }
    }
    requireCondition(tx && tx.deviceFingerprint === fingerprint,409,"Order belongs to another checkout");
    requireCondition(tx.status === "pending" && tx.expiresAt.getTime() > Date.now(),409,"Order is no longer payable");
    requireCondition(config.approvedUpiOwners.get(tx.upiIdUsed) === merchant.email && merchant.upiIds.some(route =>
      route.upiId === tx!.upiIdUsed && route.isActive && !route.deletedAt),409,"UPI route is disabled");
    res.json({orderId:tx.orderId,amountPaise:tx.amountPaise,upiId:tx.upiIdUsed,merchantName:tx.merchantName,txnRef:tx.txnRef,paymentUri:tx.paymentUri});
  });

  app.post("/api/transactions/verify", async (req,res) => {
    const {merchant,checkout,fingerprint} = await player(req,"verify");
    const filter = {merchantId:merchant._id,orderId:checkout.orderId,deviceFingerprint:fingerprint};
    let tx = await store.transactions.findOne(filter);
    requireCondition(tx?.status === "confirmed",402,"Payment not yet confirmed");
    if (!tx.grantIssuedAt) {
      tx = await store.transactions.findOneAndUpdate({
        ...filter,status:"confirmed",tokenIssued:false,redeemedAt:{$exists:false}
      },{$set:{tokenIssued:true,grantIssuedAt:Date.now()}},{returnDocument:"after"})
        ?? await store.transactions.findOne(filter);
    }
    requireCondition(tx?.grantIssuedAt && !tx.redeemedAt && Date.now() - tx.grantIssuedAt < 300_000,409,"Payment grant is unavailable");
    const token = mintGrant(config.tokenSecret,{
      merchantId:merchant._id.toHexString(),orderId:tx.orderId,amountPaise:tx.amountPaise,issuedAt:tx.grantIssuedAt
    });
    res.json({token,orderId:tx.orderId,amountPaise:tx.amountPaise});
  });

  app.post("/api/transactions/redeem", async (req,res) => {
    const {merchant} = await merchantFor(req,"key");
    const {token} = z.object({token:z.string().min(1).max(4096)}).parse(req.body);
    const grant = readGrant(config.tokenSecret,token);
    requireCondition(grant && grant.merchantId === merchant._id.toHexString(),401,"Invalid or expired payment grant");
    const redeemed = await store.transactions.updateOne({
      merchantId:merchant._id,orderId:grant.orderId,amountPaise:grant.amountPaise,
      grantIssuedAt:grant.issuedAt,status:"confirmed",redeemedAt:{$exists:false}
    },{$set:{redeemedAt:new Date()}});
    requireCondition(redeemed.modifiedCount === 1,409,"Payment grant already redeemed");
    res.json({orderId:grant.orderId,amountPaise:grant.amountPaise});
  });

  app.get("/api/transactions/:orderId", async (req,res) => {
    const {merchant} = await merchantFor(req,"key");
    const id = orderId.parse(req.params.orderId);
    const tx = await store.transactions.findOne({merchantId:merchant._id,orderId:id});
    requireCondition(tx,404,"Order not found");
    const status = tx.status === "pending" && tx.expiresAt.getTime() <= Date.now() ? "expired" : tx.status;
    res.json({orderId:id,amountPaise:tx.amountPaise,status,verifiedAt:tx.verifiedAt ?? null,redeemedAt:tx.redeemedAt ?? null});
  });

  app.get("/api/dashboard/stats", admin(async (_req,res,merchant) => {
    const today = inrDay(new Date());
    const todayStart = new Date(today + "T00:00:00+05:30");
    const rangeStart = new Date(todayStart.getTime() - 6 * 86_400_000);
    const [status, revenueByDay, routes] = await Promise.all([
      store.transactions.aggregate<{_id:Transaction["status"];count:number}>([
        {$match:{merchantId:merchant._id}},{$group:{_id:"$status",count:{$sum:1}}}
      ]).toArray(),
      store.transactions.aggregate<{_id:string;amountPaise:number}>([
        {$match:{merchantId:merchant._id,status:"confirmed",verifiedAt:{$gte:rangeStart}}},
        {$group:{_id:{$dateToString:{format:"%Y-%m-%d",date:"$verifiedAt",timezone:"Asia/Kolkata"}},amountPaise:{$sum:"$amountPaise"}}}
      ]).toArray(),
      metrics(merchant)
    ]);
    const amounts = new Map(revenueByDay.map(item => [item._id,item.amountPaise]));
    const revenue = Array.from({length:7},(_,index) => {
      const date = inrDay(new Date(rangeStart.getTime() + index * 86_400_000));
      return {date,amountPaise:amounts.get(date) || 0};
    });
    const totalTxns = status.reduce((sum,item) => sum + item.count,0);
    const confirmed = status.find(item => item._id === "confirmed")?.count || 0;
    const active = routes.filter(route => route.isActive && !route.disabledUntil && config.approvedUpiOwners.get(route.upiId) === merchant.email);
    res.json({totalTxns,revenueToday:amounts.get(today) || 0,activeUpis:active.length,
      successRate:totalTxns ? confirmed / totalTxns * 100 : 0,
      poolHealthScore:active.length ? Math.round(active.reduce((sum,item) => sum + item.healthScore,0) / active.length) : 0,
      revenue
    });
  }));

  app.get("/api/dashboard/recent-txns", admin(async (_req,res,merchant) => {
    const transactions = await store.transactions.find({merchantId:merchant._id},{projection:{
      orderId:1,amountPaise:1,baseAmount:1,offsetPaise:1,upiIdUsed:1,txnRef:1,status:1,verifiedAt:1,createdAt:1,expiresAt:1
    }}).sort({createdAt:-1}).limit(50).toArray();
    res.json({transactions:transactions.map(tx => ({...tx,
      status:tx.status === "pending" && tx.expiresAt.getTime() <= Date.now() ? "expired" : tx.status
    }))});
  }));

  app.get("/api/dashboard/throttle", admin(async (_req,res,merchant) => {
    const routes = await metrics(merchant);
    const since = new Date(Date.now() - 3_600_000);
    const records = await store.transactions.find({merchantId:merchant._id,createdAt:{$gte:since}},
      {projection:{upiIdUsed:1,baseAmount:1,geoState:1,status:1,createdAt:1,bankEventAt:1,bankErrorCode:1}})
      .sort({createdAt:-1}).limit(10_000).toArray();
    const bank = new Map<string,number>(), amount = new Map<number,number>(), geo = new Map<string,number>();
    const add = <K,>(map: Map<K,number>,key: K) => map.set(key,(map.get(key) || 0) + 1);
    for (const record of records) {
      add(bank,record.upiIdUsed.split("@")[1]);
      add(amount,record.baseAmount);
      add(geo,record.geoState);
    }
    res.json({routes,bankVelocity:[...bank].map(([bank,count]) => ({bank,count})),
      amountDistribution:[...amount].map(([amountPaise,count]) => ({amountPaise,count})),
      geoDistribution:[...geo].map(([state,count]) => ({state,count})),
      errors:records.filter(item => item.status === "failed").slice(0,50).map(item => ({
        timestamp:item.bankEventAt ?? item.createdAt,upiId:item.upiIdUsed,reason:item.bankErrorCode ?? "Bank rejected payment"
      }))
    });
  }));

  app.get("/api/audit-log", admin(async (req,res,merchant) => {
    const input = z.object({
      action:z.string().regex(/^[A-Z0-9_]+$/).max(60).optional(),
      from:z.iso.date().optional(),to:z.iso.date().optional(),
      limit:z.coerce.number().int().min(1).max(200).default(100)
    }).parse(req.query);
    const filter: Filter<Parameters<typeof store.auditLog.insertOne>[0]> = {merchantId:merchant._id};
    if (input.action) filter.action = input.action;
    if (input.from || input.to) filter.timestamp = {
      ...(input.from ? {$gte:new Date(input.from)} : {}),
      ...(input.to ? {$lt:new Date(new Date(input.to).getTime() + 86_400_000)} : {})
    };
    const logs = await store.auditLog.find(filter).sort({timestamp:-1}).limit(input.limit).toArray();
    res.json({logs});
  }));

  app.get("/api/settings", admin(async (_req,res,merchant) => {
    const {email,gameName,securityConfig,apiKeyPrefix,appSignatures} = merchant;
    res.json({email,gameName,securityConfig,apiKeyPrefix,appSignatures});
  }));

  app.patch("/api/settings", admin(async (req,res,merchant) => {
    const input = z.object({
      adminIpWhitelist:ipRules.optional(),webhookSourceIps:ipRules.or(z.tuple([])).optional(),
      playerRateLimitPerMin:z.number().int().min(1).max(config.rateMax).optional(),
      enableGeoBlocking:z.boolean().optional(),appSignatures:z.array(appSignature).max(30).optional(),
      gameName:z.string().trim().min(1).max(100).optional()
    }).strict().parse(req.body);
    const {appSignatures,gameName,...security} = input;
    const updates = {...merchant.securityConfig,...security};
    requireCondition(ipAllowed(req.ip || "",updates.adminIpWhitelist),400,"Keep the current administrator IP allowed");
    await withAudit(req,merchant._id,"SECURITY_SETTINGS_UPDATED",{fields:Object.keys(input)}, session =>
      store.merchants.updateOne({_id:merchant._id,deletedAt:{$exists:false}},
        {$set:{securityConfig:updates,...(appSignatures !== undefined ? {appSignatures} : {}),...(gameName ? {gameName} : {})}},
        {session}));
    res.sendStatus(204);
  }));

  app.post("/api/settings/password", limit("password",5), admin(async (req,res,merchant) => {
    const input = z.object({currentPassword:password,newPassword:password}).parse(req.body);
    requireCondition(await bcrypt.compare(input.currentPassword,merchant.password),401,"Invalid password");
    const replacement = await bcrypt.hash(input.newPassword,12);
    await withAudit(req,merchant._id,"PASSWORD_CHANGED",{},async session => {
      const updated = await store.merchants.updateOne({_id:merchant._id,authVersion:merchant.authVersion,deletedAt:{$exists:false}},
        {$set:{password:replacement},$inc:{authVersion:1}},{session});
      requireCondition(updated.matchedCount === 1,409,"Merchant credentials changed");
    });
    res.sendStatus(204);
  }));

  app.delete("/api/settings", limit("delete-account",5), admin(async (req,res,merchant) => {
    const input = z.object({password}).parse(req.body);
    requireCondition(await bcrypt.compare(input.password,merchant.password),401,"Invalid password");
    await withAudit(req,merchant._id,"MERCHANT_DISABLED",{},async session => {
      const updated = await store.merchants.updateOne({_id:merchant._id,authVersion:merchant.authVersion,deletedAt:{$exists:false}},
        {$set:{deletedAt:new Date(),"upiIds.$[].isActive":false},$inc:{authVersion:1}},{session});
      requireCondition(updated.matchedCount === 1,409,"Merchant credentials changed");
    });
    res.sendStatus(204);
  }));

  const errorHandler: ErrorRequestHandler = (error, _req,res,_next) => {
    if (error instanceof HttpError) {
      if (error.status === 429) res.set("Retry-After",String(Math.ceil(config.rateWindowMs / 1000)));
      res.status(error.status).json({error:error.message});
    } else if (error instanceof z.ZodError) {
      res.status(400).json({error:"Invalid request",fields:error.issues.map(issue => ({field:issue.path.join("."),message:issue.message}))});
    } else if (error?.type === "entity.parse.failed" || error?.type === "entity.too.large") {
      res.status(error.status).json({error:"Invalid request body"});
    } else {
      console.error("Request failed:",error instanceof Error ? error.name : "UnknownError");
      res.status(503).json({error:"Payment service unavailable"});
    }
  };
  app.use(errorHandler);
  return app;
}
