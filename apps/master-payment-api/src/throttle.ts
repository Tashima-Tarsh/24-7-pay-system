import { randomInt } from "node:crypto";
import type { Redis } from "ioredis";
import { hash } from "./payment.ts";
import type { UpiRoute } from "./store.ts";

interface Health {
  hourly: number; daily: number; dailyLimit: number; recentErrors: number;
  recentFailure: boolean; bankShare: number; hour: number;
}

export function healthScore(input: Health): number {
  const {hourly, daily, dailyLimit, recentErrors, recentFailure, bankShare, hour} = input;
  return Math.max(0, 100
    - (hourly > 8 ? 30 : hourly > 5 ? 10 : 0)
    - (daily > dailyLimit * .9 ? 40 : daily > dailyLimit * .7 ? 15 : 0)
    - 20 * recentErrors - (recentFailure ? 25 : 0) - (bankShare > .3 ? 20 : 0)
    - (hour >= 23 || hour < 6 ? 15 : 0));
}

interface Reservation { id: string; offsetPaise: number; createdAt: number }
export interface RouteMetrics {
  id: string; usageCount: number; hourly: number; healthScore: number;
  disabledUntil?: number; lastUsed?: number;
}

// Evaluate and reserve in one Redis operation so concurrent checkouts cannot exceed the same quota.
const ROUTE_SCRIPT = String.raw`
local routes = cjson.decode(ARGV[1])
local now, localHour = tonumber(ARGV[2]), tonumber(ARGV[3])
local merchant, reference, mode = ARGV[4], ARGV[5], ARGV[6]
local base, geo, random = tonumber(ARGV[7]), ARGV[8], tonumber(ARGV[9])
local key = 'master:reservation:' .. reference
if mode == 'allocate' then
  local existing = redis.call('GET', key)
  if existing then return existing end
end

local hour = now - 3600000
local day = now - 86400000
local merchantKey = 'master:merchant:' .. merchant
local total = redis.call('ZCOUNT', merchantKey, '(' .. hour, '+inf')
local banks, candidates, metrics, weight = {}, {}, {}, 0
for _, route in ipairs(routes) do
  local id = route.id
  local prefix = 'master:upi:' .. route.key
  local traffic = prefix .. ':traffic'
  local failures = prefix .. ':failures'
  local daily = redis.call('ZCOUNT', traffic, '(' .. day, '+inf')
  local recent = redis.call('ZRANGEBYSCORE', traffic, '(' .. hour, '+inf')
  local hourly = #recent
  local last = redis.call('ZREVRANGE', traffic, 0, 0, 'WITHSCORES')
  local errors = redis.call('ZCOUNT', failures, '(' .. (now - 7200000), '+inf')
  local recentError = redis.call('ZCOUNT', failures, '(' .. (now - 14400000), '+inf') > 0
  local bankKey = merchantKey .. ':bank:' .. route.bank
  if banks[route.bank] == nil then
    banks[route.bank] = redis.call('ZCOUNT', bankKey, '(' .. hour, '+inf')
  end
  local score = 100
  if hourly > 8 then score = score - 30 elseif hourly > 5 then score = score - 10 end
  if daily > route.dailyLimit * .9 then score = score - 40
  elseif daily > route.dailyLimit * .7 then score = score - 15 end
  score = score - errors * 20
  if recentError then score = score - 25 end
  if total > 0 and banks[route.bank] / total > .3 then score = score - 20 end
  if localHour >= 23 or localHour < 6 then score = score - 15 end
  score = math.max(score, 0)
  local cooldownKey = prefix .. ':cooldown'
  local cooldown = tonumber(redis.call('GET', cooldownKey))
  if mode == 'allocate' and route.isActive and score < 30 and not cooldown then
    cooldown = now + 14400000
    redis.call('SET', cooldownKey, cooldown, 'PX', 14400000)
  end
  metrics[#metrics+1] = {id=id, usageCount=daily, hourly=hourly, healthScore=score, disabledUntil=cooldown, lastUsed=tonumber(last[2])}
  if mode == 'allocate' and route.isActive and not cooldown and score >= 60 and daily < route.dailyLimit then
    local sameAmount, sameState, knownState = 0, 0, 0
    for _, record in ipairs(recent) do
      local fields = cjson.decode(record)
      if fields.base == base then sameAmount = sameAmount + 1 end
      if fields.geo ~= 'UNKNOWN' then knownState = knownState + 1 end
      if fields.geo == geo then sameState = sameState + 1 end
    end
    -- Require five known samples before applying the distribution rule to avoid deadlocking a new route.
    if sameAmount < 3 and (geo == 'UNKNOWN' or knownState < 5 or (sameState + 1) / (knownState + 1) <= .4) then
      candidates[#candidates+1] = {id=id, score=score, prefix=prefix, bankKey=bankKey, traffic=traffic}
      weight = weight + score
    end
  end
end
if mode ~= 'allocate' then return cjson.encode(metrics) end

while weight > 0 do
  local selected = random * weight
  local position = 1
  for index, candidate in ipairs(candidates) do
    selected = selected - candidate.score
    if selected < 0 then position = index; break end
  end
  local candidate = table.remove(candidates, position)
  weight = weight - candidate.score
  for offset = 1, 99 do
    local amountKey = candidate.prefix .. ':amount:' .. (base + offset)
    if redis.call('SET', amountKey, reference, 'NX', 'PX', 900000) then
      local reservation = cjson.encode({id=candidate.id, offsetPaise=offset, createdAt=now})
      redis.call('SET', key, reservation, 'PX', 900000)
      local record = cjson.encode({reference=reference, base=base, geo=geo})
      redis.call('ZADD', candidate.traffic, now, record)
      redis.call('ZREMRANGEBYSCORE', candidate.traffic, '-inf', day)
      redis.call('PEXPIRE', candidate.traffic, 86400000)
      for _, counter in ipairs({merchantKey, candidate.bankKey}) do
        redis.call('ZADD', counter, now, reference)
        redis.call('ZREMRANGEBYSCORE', counter, '-inf', hour)
        redis.call('PEXPIRE', counter, 3600000)
      end
      return reservation
    end
  end
end
return ''
`;

const ERROR_SCRIPT = String.raw`
local failures = KEYS[1] .. ':failures'
local now, observed = tonumber(ARGV[1]), tonumber(ARGV[4])
if observed <= now - 14400000 then return 0 end
redis.call('ZADD', failures, 'NX', observed, ARGV[2])
redis.call('ZREMRANGEBYSCORE', failures, '-inf', now - 14400000)
redis.call('PEXPIRE', failures, 14400000)
if ARGV[3] == '1' then
  local key = KEYS[1] .. ':cooldown'
  local deadline = observed + 14400000
  if deadline > (tonumber(redis.call('GET', key)) or 0) then
    redis.call('SET', key, deadline, 'PX', deadline - now)
  end
end
return 1
`;

export class AIThrottleEngine {
  private readonly redis: Redis;
  constructor(redis: Redis) { this.redis = redis; }

  private async run(routes: UpiRoute[], merchantId: string, mode: string, txnRef = "", base = 0, geo = "UNKNOWN") {
    const now = Date.now();
    const localHour = new Date(now + 330 * 60_000).getUTCHours();
    const payload = routes.filter(route => !route.deletedAt).map(route => ({...route, key:hash(route.upiId)}));
    return await this.redis.eval(ROUTE_SCRIPT, 0, JSON.stringify(payload), now, localHour, merchantId, txnRef, mode, base, geo, randomInt(1_000_000) / 1_000_000) as string;
  }

  async allocate(routes: UpiRoute[], merchantId: string, txnRef: string, base: number, geo: string): Promise<Reservation | null> {
    const result = await this.run(routes, merchantId, "allocate", txnRef, base, geo);
    return result ? JSON.parse(result) as Reservation : null;
  }

  async metrics(routes: UpiRoute[], merchantId: string): Promise<RouteMetrics[]> {
    if (!routes.some(route => !route.deletedAt)) return [];
    return JSON.parse(await this.run(routes, merchantId, "metrics")) as RouteMetrics[];
  }

  async recordFailure(upiId: string, eventId: string, observedAt: number, errorCode?: string) {
    const disable = ["LIMIT_EXCEEDED", "ACCOUNT_BLOCKED", "FRAUD_SUSPECTED"].includes(errorCode || "");
    await this.redis.eval(ERROR_SCRIPT, 1, "master:upi:" + hash(upiId), Date.now(), eventId, disable ? "1" : "0", observedAt);
  }
}

const RATE_SCRIPT = String.raw`
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count
`;

export async function rateAllowed(redis: Redis, key: string, limit: number, windowMs = 60000): Promise<boolean> {
  const count = await redis.eval(RATE_SCRIPT, 1, "master:rate:" + hash(key), windowMs);
  return Number(count) <= limit;
}
