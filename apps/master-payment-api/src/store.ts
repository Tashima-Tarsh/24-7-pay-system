import { MongoClient, ObjectId } from "mongodb";
import type { ClientSession } from "mongodb";
import type { Request } from "express";

export interface UpiRoute {
  id: string; upiId: string; name: string; type: "merchant"; bank: string;
  dailyLimit: number; isActive: boolean; deletedAt?: Date;
}

export interface Merchant {
  _id: ObjectId; email: string; password: string; gameName: string;
  apiKeyHash: string; apiKeyPrefix: string; authVersion: number; allocationVersion?: number;
  upiIds: UpiRoute[]; appSignatures: string[];
  securityConfig: { adminIpWhitelist: string[]; webhookSourceIps: string[]; playerRateLimitPerMin: number; enableGeoBlocking: boolean };
  createdAt: Date; deletedAt?: Date;
}

export interface Transaction {
  _id: ObjectId; merchantId: ObjectId; orderId: string;
  amountPaise: number; baseAmount: number; offsetPaise: number; upiIdUsed: string;
  txnRef: string; paymentUri: string; merchantName: string; status: "pending" | "confirmed" | "failed" | "expired";
  deviceFingerprint: string; playerIp: string; geoState: string; verifiedAt?: Date; bankReference?: string;
  bankEventId?: string; bankPayloadHash?: string; bankEventAt?: Date; bankErrorCode?: string; tokenIssued: boolean; grantIssuedAt?: number; redeemedAt?: Date;
  createdAt: Date; expiresAt: Date;
}

interface AuditLog {
  merchantId: ObjectId; action: string; ip: string; userAgent: string;
  details: Record<string, unknown>; timestamp: Date;
}

export async function openStore(uri: string) {
  const client = new MongoClient(uri, {serverSelectionTimeoutMS: 5000});
  await client.connect();
  const database = client.db();
  const merchants = database.collection<Merchant>("master_merchants");
  const transactions = database.collection<Transaction>("master_transactions");
  const auditLog = database.collection<AuditLog>("master_audit_log");
  await Promise.all([
    merchants.createIndex({email:1}, {unique:true}),
    merchants.createIndex({apiKeyHash:1}, {unique:true}),
    transactions.createIndex({merchantId:1,orderId:1}, {unique:true}),
    transactions.createIndex({txnRef:1}, {unique:true}),
    transactions.createIndex({bankReference:1}, {unique:true,sparse:true}),
    transactions.createIndex({bankEventId:1}, {unique:true,sparse:true}),
    transactions.createIndex({merchantId:1,createdAt:-1}),
    transactions.createIndex({merchantId:1,status:1,verifiedAt:-1}),
    auditLog.createIndex({merchantId:1,timestamp:-1})
  ]);
  async function audit(merchantId: ObjectId, action: string, req: Request, details: Record<string,unknown> = {}, session?: ClientSession) {
    await auditLog.insertOne({
      merchantId, action, details, timestamp:new Date(),
      ip:req.ip || "", userAgent:(req.get("user-agent") || "").slice(0, 512)
    }, {session});
  }
  return {client, database, merchants, transactions, auditLog, audit};
}

export type Store = Awaited<ReturnType<typeof openStore>>;
