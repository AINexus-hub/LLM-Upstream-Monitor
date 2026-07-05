export type ChannelType = "newapi" | "sub2api"

export type ChannelConfig = {
  id: string
  name: string
  type: ChannelType
  requestUrl: string
  timeoutSeconds: number
  checkIntervalMinutes: number
  createdAt: string
  updatedAt: string
}

export type NewApiChannelConfig = ChannelConfig & {
  type: "newapi"
  accessToken: string
  userId: string
}

export type Sub2ApiChannelConfig = ChannelConfig & {
  type: "sub2api"
  apiKey: string
}

export type Channel = NewApiChannelConfig | Sub2ApiChannelConfig

export type BalanceResult = {
  isValid: boolean
  planName?: string
  remaining?: number
  used?: number
  total?: number
  unit?: string
  invalidMessage?: string
}

export type BalanceCheckRecord = {
  id: string
  channelId: string
  checkedAt: string
  success: boolean
  isValid: boolean
  planName?: string
  remaining?: number
  used?: number
  total?: number
  unit?: string
  errorMessage?: string
}

export type PublicChannel = ChannelConfig & {
  hasAccessToken: boolean
  hasApiKey: boolean
  userId?: string
  lastCheck?: BalanceCheckRecord
}

export type ChannelPayload = {
  name: string
  type: ChannelType
  requestUrl: string
  accessToken?: string
  userId?: string
  apiKey?: string
  timeoutSeconds: number
  checkIntervalMinutes: number
}
