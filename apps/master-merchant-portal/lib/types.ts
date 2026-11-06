export type UpiRoute = {
  id?: string
  _id?: string
  upiId: string
  name: string
  type: 'merchant' | 'personal'
  isActive: boolean
  dailyLimit: number
  bank: string
  usageCount: number
  lastUsed?: string
  healthScore: number
  disabledUntil?: string
}

export type Transaction = {
  id?: string
  _id?: string
  orderId: string
  amount?: number
  amountPaise?: number
  upiIdUsed: string
  status: string
  createdAt: string
}

export type AuditEntry = {
  id?: string
  _id?: string
  action: string
  ip: string
  userAgent?: string
  details?: Record<string, unknown>
  timestamp: string
}

export type MerchantSettings = {
  email: string
  gameName: string
  apiKeyPrefix?: string
  appSignatures?: string[]
  securityConfig: {
    adminIpWhitelist: string[]
    webhookSourceIps: string[]
    playerRateLimitPerMin: number
    enableGeoBlocking: boolean
  }
}

export const upiId = (route: UpiRoute) => route.id || route._id || route.upiId
export const scoreTone = (score: number) => score >= 75 ? 'good' : score >= 60 ? 'warn' : 'bad'
