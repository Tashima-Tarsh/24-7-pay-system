import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const sign = (secret: string, data: string | Buffer) => createHmac("sha256", secret).update(data).digest("hex");

export function safeSignature(expected: string, supplied: unknown): boolean {
  return typeof supplied === "string" && /^[a-f0-9]{64}$/i.test(supplied)
    && /^[a-f0-9]{64}$/i.test(expected)
    && timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}

interface Grant { merchantId: string; orderId: string; amountPaise: number; issuedAt: number }

export function mintGrant(secret: string, grant: Grant): string {
  const payload = Buffer.from(JSON.stringify(grant)).toString("base64url");
  return payload + "." + sign(secret, payload);
}

export function readGrant(secret: string, token: string, now = Date.now()): Grant | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || extra !== undefined || !safeSignature(sign(secret, payload), signature)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as Grant;
    if (typeof value.merchantId !== "string" || typeof value.orderId !== "string"
      || !Number.isSafeInteger(value.amountPaise) || value.amountPaise <= 0
      || !Number.isSafeInteger(value.issuedAt) || value.issuedAt > now || now - value.issuedAt >= 300_000) return null;
    return value;
  } catch {
    return null;
  }
}

export function buildUri(upiId: string, name: string, paise: number, txnRef: string, orderId: string): string {
  const amount = String(Math.floor(paise / 100)) + "." + String(paise % 100).padStart(2, "0");
  const query = new URLSearchParams({pa:upiId, pn:name, am:amount, cu:"INR", tr:txnRef, tn:orderId});
  return "upi://pay?" + query;
}
