import ipaddr from "ipaddr.js";

export function list(value = ""): string[] {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

export function validIpRule(rule: string): boolean {
  try {
    if (rule.includes("/")) ipaddr.parseCIDR(rule);
    else ipaddr.parse(rule);
    return true;
  } catch {
    return false;
  }
}

export function ipAllowed(ip: string, rules: string[]): boolean {
  try {
    const address = ipaddr.process(ip);
    return rules.some(rule => {
      if (!rule.includes("/")) return address.toString() === ipaddr.process(rule).toString();
      const [network, bits] = ipaddr.parseCIDR(rule);
      if (address.kind() !== network.kind()) return false;
      return address.kind() === "ipv4"
        ? (address as ipaddr.IPv4).match(network as ipaddr.IPv4, bits)
        : (address as ipaddr.IPv6).match(network as ipaddr.IPv6, bits);
    });
  } catch {
    return false;
  }
}

export function config() {
  const required = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(name + " is required");
    return value;
  };
  const secret = (name: string) => {
    const value = required(name);
    if (Buffer.byteLength(value) < 32) throw new Error(name + " must contain at least 32 bytes");
    return value;
  };
  const ips = (name: string, mandatory = false) => {
    const rules = list(mandatory ? required(name) : process.env[name]);
    if ((mandatory && rules.length === 0) || rules.some(rule => !validIpRule(rule))) throw new Error("Invalid " + name);
    return rules;
  };
  const positiveInt = (name: string, fallback: number, max: number) => {
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error("Invalid " + name);
    return value;
  };
  const entries: unknown = JSON.parse(process.env.MASTER_APPROVED_UPI_OWNERS || "{}");
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) throw new Error("Invalid MASTER_APPROVED_UPI_OWNERS");
  const approvedUpiOwners = new Map<string, string>();
  for (const [upi, email] of Object.entries(entries)) {
    if (!/^[a-z0-9][a-z0-9._-]{1,99}@[a-z0-9][a-z0-9.-]{1,49}$/i.test(upi) ||
      typeof email !== "string" || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error("Invalid MASTER_APPROVED_UPI_OWNERS entry");
    const route = upi.toLowerCase();
    if (approvedUpiOwners.has(route)) throw new Error("Duplicate approved UPI ID");
    approvedUpiOwners.set(route, email.toLowerCase());
  }
  return {
    rateMax: positiveInt("RATE_LIMIT_MAX", 100, 10000),
    rateWindowMs: positiveInt("RATE_LIMIT_WINDOW_MS", 60000, 3600000),
    mongoUri: required("MONGO_URI"),
    redisUrl: required("REDIS_URL"),
    jwtSecret: secret("JWT_SECRET"),
    tokenSecret: secret("TOKEN_SECRET"),
    webhookSecret: secret("BANK_WEBHOOK_SECRET"),
    webhookIps: ips("BANK_WEBHOOK_IPS", true),
    adminIps: ips("ADMIN_IP_WHITELIST", true),
    trustedProxies: ips("TRUST_PROXY_IPS"),
    geoDeniedStates: new Set(list(process.env.GEO_DENIED_STATES).map(state => state.toUpperCase())),
    approvedUpiOwners,
    captchaSecret: process.env.CAPTCHA_SECRET,
    captchaVerifyUrl: process.env.CAPTCHA_VERIFY_URL || "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    corsOrigin: process.env.CORS_ORIGIN,
    port: Number(process.env.PORT || 3000)
  };
}

export type Config = ReturnType<typeof config>;
