import type { AccountTemplate, BalanceCheckRecord, ChannelType, TaskRunRecord } from "@llm-upstream-monitor/shared"

export type ChannelRow = {
  id: string
  name: string
  type: ChannelType
  accountTemplate: AccountTemplate
  requestUrl: string
  officialUrl: string | null
  upstreamLoginUrl: string | null
  upstreamUsername: string | null
  upstreamPassword: string | null
  upstreamAccessToken: string | null
  upstreamRefreshToken: string | null
  upstreamTokenExpiresAt: string | null
  upstreamLastSyncAt: string | null
  upstreamLastSyncError: string | null
  rechargeRate: number
  alertThreshold: number | null
  balanceAlertEnabled: boolean
  balanceCheckEnabled: boolean
  groupChangeAlertEnabled: boolean
  groupRateAlertEnabled: boolean
  accessToken: string | null
  userId: string | null
  apiKey: string | null
  timeoutSeconds: number
  checkIntervalMinutes: number
  createdAt: string
  updatedAt: string
}

export type PublicChannel = {
  id: string
  name: string
  type: ChannelType
  accountTemplate: AccountTemplate
  requestUrl: string
  officialUrl?: string | null
  upstreamLoginUrl?: string | null
  upstreamUsername?: string | null
  upstreamTokenExpiresAt?: string | null
  upstreamLastSyncAt?: string | null
  upstreamLastSyncError?: string | null
  rechargeRate: number
  alertThreshold?: number | null
  balanceAlertEnabled: boolean
  balanceCheckEnabled: boolean
  groupChangeAlertEnabled: boolean
  groupRateAlertEnabled: boolean
  timeoutSeconds: number
  checkIntervalMinutes: number
  createdAt: string
  updatedAt: string
  hasAccessToken: boolean
  hasApiKey: boolean
  hasUpstreamPassword: boolean
  hasUpstreamAccessToken: boolean
  hasUpstreamRefreshToken: boolean
  userId?: string
  lastCheck?: BalanceCheckRecord
  lastTaskRun?: TaskRunRecord
}

export type CreateChannelInput = {
  name: string
  type: ChannelType
  accountTemplate?: AccountTemplate
  requestUrl: string
  officialUrl?: string | null
  upstreamLoginUrl?: string | null
  upstreamUsername?: string | null
  upstreamPassword?: string
  upstreamAccessToken?: string
  upstreamRefreshToken?: string
  upstreamTokenExpiresAt?: string | null
  clearUpstreamSession?: boolean
  rechargeRate?: number
  alertThreshold?: number | null
  balanceAlertEnabled?: boolean
  balanceCheckEnabled?: boolean
  groupChangeAlertEnabled?: boolean
  groupRateAlertEnabled?: boolean
  accessToken?: string
  userId?: string
  apiKey?: string
  timeoutSeconds: number
  checkIntervalMinutes: number
}

export type UpdateChannelInput = Partial<CreateChannelInput>
