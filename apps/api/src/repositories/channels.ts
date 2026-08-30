import type { BalanceCheckRecord } from "@llm-upstream-monitor/shared"
import { randomUUID } from "node:crypto"
import { db } from "../db.js"
import { config } from "../config.js"
import { decryptSecret, encryptSecret } from "../crypto.js"
import type { ChannelRow, CreateChannelInput, PublicChannel, UpdateChannelInput } from "../types.js"
import { createNotification } from "./notifications.js"
import { getLatestTaskRunsByChannel } from "./task-runs.js"

type DbChannelRow = {
  id: string
  name: string
  type: string
  request_url: string
  official_url: string | null
  upstream_login_url: string | null
  upstream_username: string | null
  upstream_password: string | null
  upstream_access_token: string | null
  upstream_refresh_token: string | null
  upstream_token_expires_at: string | null
  upstream_last_sync_at: string | null
  upstream_last_sync_error: string | null
  recharge_rate: number | null
  alert_threshold: number | null
  balance_alert_enabled: number | null
  balance_check_enabled: number | null
  group_change_alert_enabled: number | null
  group_rate_alert_enabled: number | null
  access_token: string | null
  user_id: string | null
  api_key: string | null
  timeout_seconds: number
  check_interval_minutes: number
  created_at: string
  updated_at: string
}

type DbCheckRow = {
  id: string
  channel_id: string
  checked_at: string
  success: number
  is_valid: number
  plan_name: string | null
  remaining: number | null
  used: number | null
  total: number | null
  unit: string | null
  error_message: string | null
}

function mapChannel(row: DbChannelRow): ChannelRow {
  return {
    id: row.id,
    name: row.name,
    type: row.type === "sub2api" ? "sub2api" : "newapi",
    requestUrl: row.request_url,
    officialUrl: row.official_url,
    upstreamLoginUrl: row.upstream_login_url,
    upstreamUsername: row.upstream_username,
    upstreamPassword: decryptSecret(row.upstream_password, config.ENCRYPTION_KEY),
    upstreamAccessToken: decryptSecret(row.upstream_access_token, config.ENCRYPTION_KEY),
    upstreamRefreshToken: decryptSecret(row.upstream_refresh_token, config.ENCRYPTION_KEY),
    upstreamTokenExpiresAt: row.upstream_token_expires_at,
    upstreamLastSyncAt: row.upstream_last_sync_at,
    upstreamLastSyncError: row.upstream_last_sync_error,
    rechargeRate: row.recharge_rate ?? 1,
    alertThreshold: row.alert_threshold,
    balanceAlertEnabled: row.balance_alert_enabled !== 0,
    balanceCheckEnabled: row.balance_check_enabled !== 0,
    groupChangeAlertEnabled: row.group_change_alert_enabled !== 0,
    groupRateAlertEnabled: row.group_rate_alert_enabled !== 0,
    accessToken: decryptSecret(row.access_token, config.ENCRYPTION_KEY),
    userId: row.user_id,
    apiKey: decryptSecret(row.api_key, config.ENCRYPTION_KEY),
    timeoutSeconds: row.timeout_seconds,
    checkIntervalMinutes: row.check_interval_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCheck(row: DbCheckRow): BalanceCheckRecord {
  return {
    id: row.id,
    channelId: row.channel_id,
    checkedAt: row.checked_at,
    success: Boolean(row.success),
    isValid: Boolean(row.is_valid),
    planName: row.plan_name ?? undefined,
    remaining: row.remaining ?? undefined,
    used: row.used ?? undefined,
    total: row.total ?? undefined,
    unit: row.unit ?? undefined,
    errorMessage: row.error_message ?? undefined,
  }
}

function toPublicChannel(
  channel: ChannelRow,
  lastCheck?: BalanceCheckRecord,
  lastTaskRun?: PublicChannel["lastTaskRun"],
): PublicChannel {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    requestUrl: channel.requestUrl,
    officialUrl: channel.officialUrl ?? undefined,
    upstreamLoginUrl: channel.upstreamLoginUrl ?? undefined,
    upstreamUsername: channel.upstreamUsername ?? undefined,
    upstreamTokenExpiresAt: channel.upstreamTokenExpiresAt ?? undefined,
    upstreamLastSyncAt: channel.upstreamLastSyncAt ?? undefined,
    upstreamLastSyncError: channel.upstreamLastSyncError ?? undefined,
    rechargeRate: channel.rechargeRate,
    alertThreshold: channel.alertThreshold ?? undefined,
    balanceAlertEnabled: channel.balanceAlertEnabled,
    balanceCheckEnabled: channel.balanceCheckEnabled,
    groupChangeAlertEnabled: channel.groupChangeAlertEnabled,
    groupRateAlertEnabled: channel.groupRateAlertEnabled,
    timeoutSeconds: channel.timeoutSeconds,
    checkIntervalMinutes: channel.checkIntervalMinutes,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
    hasAccessToken: Boolean(channel.accessToken),
    hasApiKey: Boolean(channel.apiKey),
    hasUpstreamPassword: Boolean(channel.upstreamPassword),
    hasUpstreamAccessToken: Boolean(channel.upstreamAccessToken),
    hasUpstreamRefreshToken: Boolean(channel.upstreamRefreshToken),
    userId: channel.userId ?? undefined,
    lastCheck,
    lastTaskRun,
  }
}

export async function listChannels(): Promise<PublicChannel[]> {
  const channelsResult = await db.execute("select * from channels order by created_at desc")
  const channels = channelsResult.rows.map((row) => mapChannel(row as unknown as DbChannelRow))

  const latestTaskRuns = await getLatestTaskRunsByChannel(channels.map((channel) => channel.id))
  const publicChannels = await Promise.all(
    channels.map(async (channel) =>
      toPublicChannel(channel, await getLatestCheck(channel.id), latestTaskRuns[channel.id]),
    ),
  )

  return publicChannels
}

export async function getChannel(id: string): Promise<ChannelRow | null> {
  const result = await db.execute({
    sql: "select * from channels where id = ?",
    args: [id],
  })

  const row = result.rows[0]
  return row ? mapChannel(row as unknown as DbChannelRow) : null
}

export async function getPublicChannel(id: string): Promise<PublicChannel | null> {
  const channel = await getChannel(id)
  if (!channel) {
    return null
  }

  const latestTaskRuns = await getLatestTaskRunsByChannel([id])
  return toPublicChannel(channel, await getLatestCheck(id), latestTaskRuns[id])
}

export async function createChannel(input: CreateChannelInput): Promise<PublicChannel> {
  const id = randomUUID()
  const now = new Date().toISOString()

  await db.execute({
    sql: `insert into channels (
      id, name, type, request_url, official_url,
      upstream_login_url, upstream_username, upstream_password, upstream_access_token,
      upstream_refresh_token, upstream_token_expires_at,
      recharge_rate, alert_threshold, balance_alert_enabled, balance_check_enabled, group_change_alert_enabled,
      group_rate_alert_enabled, access_token, user_id, api_key,
      timeout_seconds, check_interval_minutes, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name,
      input.type,
      input.requestUrl,
      input.officialUrl ?? null,
      input.upstreamLoginUrl ?? null,
      input.upstreamUsername ?? null,
      encryptSecret(input.upstreamPassword, config.ENCRYPTION_KEY),
      encryptSecret(input.upstreamAccessToken, config.ENCRYPTION_KEY),
      encryptSecret(input.upstreamRefreshToken, config.ENCRYPTION_KEY),
      input.upstreamTokenExpiresAt ?? null,
      input.rechargeRate ?? 1,
      input.alertThreshold ?? null,
      input.balanceAlertEnabled === false ? 0 : 1,
      input.balanceCheckEnabled === false ? 0 : 1,
      input.groupChangeAlertEnabled === false ? 0 : 1,
      input.groupRateAlertEnabled === false ? 0 : 1,
      encryptSecret(input.accessToken, config.ENCRYPTION_KEY),
      input.userId ?? null,
      encryptSecret(input.apiKey, config.ENCRYPTION_KEY),
      input.timeoutSeconds,
      input.checkIntervalMinutes,
      now,
      now,
    ],
  })

  const channel = await getPublicChannel(id)
  if (!channel) {
    throw new Error("渠道创建后读取失败")
  }

  return channel
}

export async function updateChannel(
  id: string,
  input: UpdateChannelInput,
): Promise<PublicChannel | null> {
  const current = await getChannel(id)
  if (!current) {
    return null
  }

  const next = {
    name: input.name ?? current.name,
    type: input.type ?? current.type,
    requestUrl: input.requestUrl ?? current.requestUrl,
    officialUrl: input.officialUrl === undefined ? current.officialUrl : input.officialUrl || null,
    upstreamLoginUrl: nextNullableUpstreamValue(
      input.clearUpstreamSession,
      current.upstreamLoginUrl,
      input.upstreamLoginUrl,
    ),
    upstreamUsername: nextNullableUpstreamValue(
      input.clearUpstreamSession,
      current.upstreamUsername,
      input.upstreamUsername,
    ),
    upstreamPassword: nextSecretUpstreamValue(
      input.clearUpstreamSession,
      current.upstreamPassword,
      input.upstreamPassword,
    ),
    upstreamAccessToken: nextSecretUpstreamValue(
      input.clearUpstreamSession,
      current.upstreamAccessToken,
      input.upstreamAccessToken,
    ),
    upstreamRefreshToken: nextSecretUpstreamValue(
      input.clearUpstreamSession,
      current.upstreamRefreshToken,
      input.upstreamRefreshToken,
    ),
    upstreamTokenExpiresAt: nextNullableUpstreamValue(
      input.clearUpstreamSession,
      current.upstreamTokenExpiresAt,
      input.upstreamTokenExpiresAt,
    ),
    upstreamLastSyncAt: input.clearUpstreamSession ? null : current.upstreamLastSyncAt,
    upstreamLastSyncError: input.clearUpstreamSession ? null : current.upstreamLastSyncError,
    rechargeRate: input.rechargeRate ?? current.rechargeRate,
    alertThreshold: input.alertThreshold === undefined ? current.alertThreshold : input.alertThreshold,
    balanceAlertEnabled: input.balanceAlertEnabled ?? current.balanceAlertEnabled,
    balanceCheckEnabled: input.balanceCheckEnabled ?? current.balanceCheckEnabled,
    groupChangeAlertEnabled: input.groupChangeAlertEnabled ?? current.groupChangeAlertEnabled,
    groupRateAlertEnabled: input.groupRateAlertEnabled ?? current.groupRateAlertEnabled,
    accessToken:
      input.accessToken === undefined || input.accessToken === ""
        ? current.accessToken
        : input.accessToken,
    userId: input.userId === undefined ? current.userId : input.userId,
    apiKey: input.apiKey === undefined || input.apiKey === "" ? current.apiKey : input.apiKey,
    timeoutSeconds: input.timeoutSeconds ?? current.timeoutSeconds,
    checkIntervalMinutes: input.checkIntervalMinutes ?? current.checkIntervalMinutes,
    updatedAt: new Date().toISOString(),
  }

  await db.execute({
    sql: `update channels set
      name = ?,
      type = ?,
      request_url = ?,
      official_url = ?,
      upstream_login_url = ?,
      upstream_username = ?,
      upstream_password = ?,
      upstream_access_token = ?,
      upstream_refresh_token = ?,
      upstream_token_expires_at = ?,
      upstream_last_sync_at = ?,
      upstream_last_sync_error = ?,
      recharge_rate = ?,
      alert_threshold = ?,
      balance_alert_enabled = ?,
      balance_check_enabled = ?,
      group_change_alert_enabled = ?,
      group_rate_alert_enabled = ?,
      access_token = ?,
      user_id = ?,
      api_key = ?,
      timeout_seconds = ?,
      check_interval_minutes = ?,
      updated_at = ?
      where id = ?`,
    args: [
      next.name,
      next.type,
      next.requestUrl,
      next.officialUrl,
      next.upstreamLoginUrl,
      next.upstreamUsername,
      encryptSecret(next.upstreamPassword, config.ENCRYPTION_KEY),
      encryptSecret(next.upstreamAccessToken, config.ENCRYPTION_KEY),
      encryptSecret(next.upstreamRefreshToken, config.ENCRYPTION_KEY),
      next.upstreamTokenExpiresAt,
      next.upstreamLastSyncAt,
      next.upstreamLastSyncError,
      next.rechargeRate,
      next.alertThreshold,
      next.balanceAlertEnabled ? 1 : 0,
      next.balanceCheckEnabled ? 1 : 0,
      next.groupChangeAlertEnabled ? 1 : 0,
      next.groupRateAlertEnabled ? 1 : 0,
      encryptSecret(next.accessToken, config.ENCRYPTION_KEY),
      next.userId,
      encryptSecret(next.apiKey, config.ENCRYPTION_KEY),
      next.timeoutSeconds,
      next.checkIntervalMinutes,
      next.updatedAt,
      id,
    ],
  })

  return getPublicChannel(id)
}

export async function deleteChannel(id: string): Promise<boolean> {
  const current = await getChannel(id)
  if (!current) {
    return false
  }

  await db.batch(
    [
      {
        sql: "delete from balance_checks where channel_id = ?",
        args: [id],
      },
      {
        sql: "delete from upstream_snapshots where channel_id = ?",
        args: [id],
      },
      {
        sql: "delete from notifications where channel_id = ?",
        args: [id],
      },
      {
        sql: "delete from task_runs where channel_id = ?",
        args: [id],
      },
      {
        sql: "delete from notification_delivery_state where channel_id = ?",
        args: [id],
      },
      {
        sql: "delete from channels where id = ?",
        args: [id],
      },
    ],
    "write",
  )

  return true
}

function nextNullableUpstreamValue(
  shouldClear: boolean | undefined,
  current: string | null,
  value: string | null | undefined,
) {
  if (shouldClear) {
    return null
  }

  return value === undefined ? current : value || null
}

function nextSecretUpstreamValue(
  shouldClear: boolean | undefined,
  current: string | null,
  value: string | undefined,
) {
  if (shouldClear) {
    return null
  }

  return value === undefined || value === "" ? current : value
}

export type UpstreamSessionUpdate = {
  accessToken?: string | null
  refreshToken?: string | null
  tokenExpiresAt?: string | null
  lastSyncAt?: string | null
  lastSyncError?: string | null
}

export async function updateUpstreamSession(
  id: string,
  input: UpstreamSessionUpdate,
): Promise<PublicChannel | null> {
  const current = await getChannel(id)
  if (!current) {
    return null
  }

  await db.execute({
    sql: `update channels set
      upstream_access_token = ?,
      upstream_refresh_token = ?,
      upstream_token_expires_at = ?,
      upstream_last_sync_at = ?,
      upstream_last_sync_error = ?,
      updated_at = ?
      where id = ?`,
    args: [
      encryptSecret(input.accessToken === undefined ? current.upstreamAccessToken : input.accessToken, config.ENCRYPTION_KEY),
      encryptSecret(input.refreshToken === undefined ? current.upstreamRefreshToken : input.refreshToken, config.ENCRYPTION_KEY),
      input.tokenExpiresAt === undefined ? current.upstreamTokenExpiresAt : input.tokenExpiresAt,
      input.lastSyncAt === undefined ? current.upstreamLastSyncAt : input.lastSyncAt,
      input.lastSyncError === undefined ? current.upstreamLastSyncError : input.lastSyncError,
      new Date().toISOString(),
      id,
    ],
  })

  return getPublicChannel(id)
}

export async function saveCheck(
  channelId: string,
  record: Omit<BalanceCheckRecord, "id" | "channelId" | "checkedAt">,
): Promise<BalanceCheckRecord> {
  const channel = await getChannel(channelId)
  const previous = await getLatestCheck(channelId)
  const saved: BalanceCheckRecord = {
    id: randomUUID(),
    channelId,
    checkedAt: new Date().toISOString(),
    ...record,
  }

  await db.execute({
    sql: `insert into balance_checks (
      id, channel_id, checked_at, success, is_valid, plan_name,
      remaining, used, total, unit, error_message
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      saved.id,
      saved.channelId,
      saved.checkedAt,
      saved.success ? 1 : 0,
      saved.isValid ? 1 : 0,
      saved.planName ?? null,
      saved.remaining ?? null,
      saved.used ?? null,
      saved.total ?? null,
      saved.unit ?? null,
      saved.errorMessage ?? null,
    ],
  })

  if (channel) {
    await createCheckNotifications(channel, previous, saved)
  }

  return saved
}

function isBalanceAlerting(channel: ChannelRow, check: BalanceCheckRecord | undefined) {
  if (!channel.balanceAlertEnabled || channel.alertThreshold == null || check?.remaining === undefined) {
    return false
  }

  return check.remaining / (channel.rechargeRate || 1) <= channel.alertThreshold
}

async function createCheckNotifications(
  channel: ChannelRow,
  previous: BalanceCheckRecord | undefined,
  current: BalanceCheckRecord,
) {
  if (!current.success) {
    await createNotification({
      channelId: channel.id,
      type: "check_failed",
      title: `${channel.name} 检测失败`,
      body: current.errorMessage ?? "最近一次余额检测未成功。",
      severity: "error",
      metadata: { checkId: current.id },
      dedupeUnread: true,
    })
    return
  }

  if (previous && !previous.success) {
    await createNotification({
      channelId: channel.id,
      type: "check_recovered",
      title: `${channel.name} 检测恢复`,
      body: "余额检测已恢复正常。",
      severity: "info",
      metadata: { checkId: current.id, previousCheckId: previous.id },
      dedupeUnread: true,
    })
  }

  const wasAlerting = isBalanceAlerting(channel, previous)
  const isAlerting = isBalanceAlerting(channel, current)

  if (isAlerting) {
    await createNotification({
      channelId: channel.id,
      type: "balance_alert",
      title: `${channel.name} 余额告警`,
      body: `折算余额 ${(current.remaining ?? 0) / (channel.rechargeRate || 1)}，已低于阈值 ${channel.alertThreshold}。`,
      severity: "warning",
      metadata: { checkId: current.id },
      dedupeUnread: true,
    })
    return
  }

  if (wasAlerting) {
    await createNotification({
      channelId: channel.id,
      type: "balance_recovered",
      title: `${channel.name} 余额恢复`,
      body: `折算余额 ${(current.remaining ?? 0) / (channel.rechargeRate || 1)}，已高于阈值 ${channel.alertThreshold}。`,
      severity: "info",
      metadata: { checkId: current.id, previousCheckId: previous?.id },
      dedupeUnread: true,
    })
  }
}

export async function listChecks(channelId: string, limit = 2000): Promise<BalanceCheckRecord[]> {
  const result = await db.execute({
    sql: `select * from (
      select * from balance_checks
      where channel_id = ?
      order by checked_at desc
      limit ?
    ) order by checked_at asc`,
    args: [channelId, limit],
  })

  return result.rows.map((row) => mapCheck(row as unknown as DbCheckRow))
}

export async function getLatestCheck(channelId: string): Promise<BalanceCheckRecord | undefined> {
  const result = await db.execute({
    sql: "select * from balance_checks where channel_id = ? order by checked_at desc limit 1",
    args: [channelId],
  })

  const row = result.rows[0]
  return row ? mapCheck(row as unknown as DbCheckRow) : undefined
}
