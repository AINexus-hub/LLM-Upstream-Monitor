export type ChannelType = "newapi" | "sub2api"

export type ChannelConfig = {
  id: string
  name: string
  type: ChannelType
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
  hasUpstreamPassword: boolean
  hasUpstreamAccessToken: boolean
  hasUpstreamRefreshToken: boolean
  userId?: string
  lastCheck?: BalanceCheckRecord
  lastTaskRun?: TaskRunRecord
}

export type ChannelPayload = {
  name: string
  type: ChannelType
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

export type UpstreamProvider = "sub2api" | "newapi"

export type UpstreamMetricSummary = {
  balance?: number
  apiKeyCount?: number
  todayRequests?: number
  totalRequests?: number
  todayCost?: number
  todayStandardCost?: number
  totalCost?: number
  totalStandardCost?: number
  todayTokens?: number
  totalTokens?: number
  averageDurationMs?: number
}

export type UpstreamGroupSummary = {
  id: string
  name: string
  platform?: string
  subscriptionType?: string
  rateMultiplier?: number
}

export type UpstreamApiKeySummary = {
  id?: string
  name?: string
  keyPreview?: string
  groupId?: string
  groupName?: string
  status?: string
  quota?: number
  used?: number
  createdAt?: string
}

export type UpstreamUsageItem = {
  name: string
  requests?: number
  tokens?: number
  cost?: number
  actualCost?: number
  standardCost?: number
}

export type UpstreamRecentUsageItem = {
  id?: string
  model?: string
  platform?: string
  apiKeyName?: string
  groupName?: string
  tokens?: number
  cost?: number
  actualCost?: number
  standardCost?: number
  createdAt?: string
}

export type UpstreamSnapshotSummary = {
  provider: UpstreamProvider
  fetchedAt: string
  range?: {
    startDate: string
    endDate: string
    granularity?: string
  }
  metrics: UpstreamMetricSummary
  groups: UpstreamGroupSummary[]
  apiKeys: UpstreamApiKeySummary[]
  platformUsage: UpstreamUsageItem[]
  modelUsage: UpstreamUsageItem[]
  recentUsage: UpstreamRecentUsageItem[]
  errors: Array<{ module: string; message: string }>
}

export type UpstreamSnapshotRecord = {
  id: string
  channelId: string
  provider: UpstreamProvider
  fetchedAt: string
  summary: UpstreamSnapshotSummary
  createdAt: string
}

export type NotificationRecord = {
  id: string
  channelId?: string
  type: string
  title: string
  body: string
  severity: "info" | "warning" | "error"
  createdAt: string
  readAt?: string | null
  archivedAt?: string | null
  deletedAt?: string | null
}

export type NotificationChannel = "telegram" | "smtp"

export type NotificationType =
  | "balance_alert"
  | "balance_recovered"
  | "check_failed"
  | "check_recovered"
  | "upstream_sync_failed"
  | "upstream_sync_recovered"
  | "upstream_group_added"
  | "upstream_group_removed"
  | "upstream_group_rate_changed"

export type PublicNotificationSettings = {
  telegram: {
    enabled: boolean
    botToken?: string
    chatId?: string
    hasBotToken: boolean
  }
  smtp: {
    enabled: boolean
    host?: string
    port?: number
    secure: boolean
    username?: string
    from?: string
    recipients: Array<{
      id: string
      email: string
      enabledTypes: NotificationType[]
    }>
    hasPassword: boolean
  }
  cooldownMinutes: number
  enabledTypes: NotificationType[]
  updatedAt?: string | null
}

export type NotificationSettingsPayload = {
  telegram?: {
    enabled?: boolean
    botToken?: string
    chatId?: string
  }
  smtp?: {
    enabled?: boolean
    host?: string
    port?: number
    secure?: boolean
    username?: string
    password?: string
    from?: string
    recipients?: Array<{
      id?: string
      email: string
      enabledTypes: NotificationType[]
    }>
  }
  cooldownMinutes?: number
  enabledTypes?: NotificationType[]
}

export type TaskRunStatus = "running" | "success" | "failed" | "skipped"

export type TaskRunType = "balance_check" | "upstream_sync" | "upstream_snapshot"

export type TaskRunRecord = {
  id: string
  channelId?: string
  taskType: TaskRunType
  status: TaskRunStatus
  startedAt: string
  finishedAt?: string | null
  durationMs?: number | null
  errorMessage?: string | null
  metadata?: unknown
}
