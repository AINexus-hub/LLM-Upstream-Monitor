import type { BalanceCheckRecord, ChannelType } from "@llm-upstream-monitor/shared"

export type Page = "monitor" | "upstream" | "channels" | "notifications" | "notification-settings"
export type TimeRange = "24h" | "1d" | "3d" | "7d"
export type ChecksByChannel = Record<string, BalanceCheckRecord[]>
export type SetupMode = "simple" | "account"
export type AccountTemplate = "sub2api"
export type OptionalRead<T = unknown> = {
  data: T | null
  error: string | null
}
export type Sub2ApiUpstreamSnapshot = {
  refreshedByRefreshToken: boolean
  account: {
    me: OptionalRead
    profile: OptionalRead
  }
  dashboard: {
    stats: OptionalRead
    trend: OptionalRead
    models: OptionalRead
    recentUsage: OptionalRead
    platformQuotas: OptionalRead
    snapshotV2: OptionalRead
  }
  keys: {
    list: OptionalRead
    availableGroups: OptionalRead
    groupRates: OptionalRead
    availableChannels: OptionalRead
  }
}

export type ChannelFormState = {
  id?: string
  setupMode: SetupMode
  accountTemplate: AccountTemplate
  name: string
  type: ChannelType
  requestUrl: string
  officialUrl: string
  upstreamLoginUrl: string
  upstreamUsername: string
  upstreamPassword: string
  upstreamAccessToken: string
  upstreamRefreshToken: string
  upstreamTokenExpiresAt: string
  rechargeRate: string
  alertThreshold: string
  balanceAlertEnabled: boolean
  groupChangeAlertEnabled: boolean
  groupRateAlertEnabled: boolean
  accessToken: string
  userId: string
  apiKey: string
  timeoutSeconds: number
  checkIntervalMinutes: number
}
