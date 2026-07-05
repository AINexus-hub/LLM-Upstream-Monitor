import type { BalanceCheckRecord, ChannelType } from "@llm-balance-monitor/shared"

export type ChannelRow = {
  id: string
  name: string
  type: ChannelType
  requestUrl: string
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
  requestUrl: string
  timeoutSeconds: number
  checkIntervalMinutes: number
  createdAt: string
  updatedAt: string
  hasAccessToken: boolean
  hasApiKey: boolean
  userId?: string
  lastCheck?: BalanceCheckRecord
}

export type CreateChannelInput = {
  name: string
  type: ChannelType
  requestUrl: string
  accessToken?: string
  userId?: string
  apiKey?: string
  timeoutSeconds: number
  checkIntervalMinutes: number
}

export type UpdateChannelInput = Partial<CreateChannelInput>
