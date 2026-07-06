import type { BalanceResult } from "@llm-upstream-monitor/shared"
import { getChannel, saveCheck, updateUpstreamSession } from "../repositories/channels.js"
import type { ChannelRow } from "../types.js"

type Sub2ApiEnvelope<T> = {
  code?: number
  data?: T
  message?: string
}

type Sub2ApiSession = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  requires_2fa?: boolean
  temp_token?: string
  user?: Record<string, unknown>
}

type OptionalRead<T> = {
  data: T | null
  error: string | null
}

type Sub2ApiDashboardSnapshot = {
  stats: OptionalRead<unknown>
  trend: OptionalRead<unknown>
  models: OptionalRead<unknown>
  recentUsage: OptionalRead<unknown>
  platformQuotas: OptionalRead<unknown>
  snapshotV2: OptionalRead<unknown>
}

type Sub2ApiKeysSnapshot = {
  list: OptionalRead<unknown>
  availableGroups: OptionalRead<unknown>
  groupRates: OptionalRead<unknown>
  availableChannels: OptionalRead<unknown>
}

export type Sub2ApiUpstreamSnapshot = {
  refreshedByRefreshToken: boolean
  fetchedAt: string
  range: {
    startDate: string
    endDate: string
    granularity: "day"
  }
  tokenExpiresAt?: string | null
  account: {
    me: OptionalRead<unknown>
    profile: OptionalRead<unknown>
  }
  dashboard: Sub2ApiDashboardSnapshot
  keys: Sub2ApiKeysSnapshot
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}${path}`
}

function apiBaseUrl(channel: ChannelRow) {
  return joinUrl(channel.requestUrl, "/api/v1")
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function buildRange(days: number) {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - Math.max(days - 1, 0))

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
    granularity: "day" as const,
  }
}

function expiresAtFromSeconds(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) {
    return null
  }

  return new Date(Date.now() + seconds * 1000).toISOString()
}

function shouldRefresh(channel: ChannelRow) {
  if (!channel.upstreamAccessToken) {
    return true
  }

  if (!channel.upstreamTokenExpiresAt) {
    return false
  }

  return new Date(channel.upstreamTokenExpiresAt).getTime() - Date.now() < 120_000
}

async function requestSub2Api<T>(
  channel: ChannelRow,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), channel.timeoutSeconds * 1000)
  const headers = new Headers(init.headers)

  headers.set("Accept", "application/json")
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json")
  }

  try {
    const response = await fetch(joinUrl(apiBaseUrl(channel), path), {
      ...init,
      headers,
      signal: controller.signal,
    })
    const text = await response.text()
    const raw = text ? (JSON.parse(text) as Sub2ApiEnvelope<T> | T) : null

    if (!response.ok) {
      const message = asString(asRecord(raw).message) ?? (text || response.statusText)
      throw new Error(`上游 HTTP ${response.status}: ${message}`)
    }

    const envelope = asRecord(raw)
    if ("code" in envelope && envelope.code !== 0) {
      throw new Error(asString(envelope.message) ?? "上游接口返回失败")
    }

    return ("data" in envelope ? envelope.data : raw) as T
  } finally {
    clearTimeout(timeout)
  }
}

async function refreshSession(channel: ChannelRow): Promise<Sub2ApiSession> {
  if (!channel.upstreamRefreshToken) {
    throw new Error("缺少上游 refresh token")
  }

  return requestSub2Api<Sub2ApiSession>(channel, "/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: channel.upstreamRefreshToken }),
  })
}

async function loginWithPassword(channel: ChannelRow): Promise<Sub2ApiSession> {
  if (!channel.upstreamUsername || !channel.upstreamPassword) {
    throw new Error("缺少上游账号密码或 refresh token")
  }

  const session = await requestSub2Api<Sub2ApiSession>(channel, "/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: channel.upstreamUsername,
      password: channel.upstreamPassword,
    }),
  })

  if (session.requires_2fa) {
    throw new Error("上游账号启用了 2FA，需要先人工导入登录态")
  }

  return session
}

async function ensureSession(channel: ChannelRow) {
  if (channel.upstreamRefreshToken && shouldRefresh(channel)) {
    try {
      const session = await refreshSession(channel)
      await persistSession(channel.id, session)
      return session.access_token ?? channel.upstreamAccessToken
    } catch (error) {
      if (!channel.upstreamUsername || !channel.upstreamPassword) {
        throw error
      }
    }
  }

  if (channel.upstreamAccessToken && !shouldRefresh(channel)) {
    return channel.upstreamAccessToken
  }

  const session = await loginWithPassword(channel)
  await persistSession(channel.id, session)
  return session.access_token
}

async function persistSession(channelId: string, session: Sub2ApiSession) {
  await updateUpstreamSession(channelId, {
    accessToken: session.access_token ?? undefined,
    refreshToken: session.refresh_token ?? undefined,
    tokenExpiresAt: expiresAtFromSeconds(session.expires_in),
    lastSyncError: null,
  })
}

async function refreshSessionForProbe(channel: ChannelRow) {
  if (!channel.upstreamRefreshToken) {
    const accessToken = await ensureSession(channel)
    if (!accessToken) {
      throw new Error("上游登录未返回 access token")
    }

    return {
      accessToken,
      refreshedByRefreshToken: false,
    }
  }

  const session = await refreshSession(channel)
  await persistSession(channel.id, session)
  const accessToken = session.access_token ?? channel.upstreamAccessToken
  if (!accessToken) {
    throw new Error("上游 refresh 未返回 access token")
  }

  return {
    accessToken,
    refreshedByRefreshToken: true,
  }
}

async function getAuthorized<T>(channel: ChannelRow, path: string, accessToken: string) {
  return requestSub2Api<T>(channel, path, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
}

async function getAuthorizedOptional<T>(channel: ChannelRow, path: string, accessToken: string) {
  try {
    return {
      data: await getAuthorized<T>(channel, path, accessToken),
      error: null,
    }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "读取失败",
    }
  }
}

function buildQuery(path: string, params: Record<string, string | number>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    search.set(key, String(value))
  }

  return `${path}?${search.toString()}`
}

function extractBalance(...sources: unknown[]) {
  for (const source of sources) {
    const record = asRecord(source)
    const direct =
      asNumber(record.balance) ??
      asNumber(record.quota) ??
      asNumber(record.remaining) ??
      asNumber(record.available_balance)

    if (direct !== undefined) {
      return direct
    }

    const user = asRecord(record.user)
    const userBalance = asNumber(user.balance) ?? asNumber(user.quota)
    if (userBalance !== undefined) {
      return userBalance
    }
  }

  return undefined
}

function extractPlanName(...sources: unknown[]) {
  for (const source of sources) {
    const record = asRecord(source)
    const direct = asString(record.group) ?? asString(record.plan) ?? asString(record.role)
    if (direct) {
      return direct
    }

    const user = asRecord(record.user)
    const userPlan = asString(user.group) ?? asString(user.plan) ?? asString(user.role)
    if (userPlan) {
      return userPlan
    }
  }

  return undefined
}

function assertSub2ApiChannel(channel: ChannelRow) {
  if (channel.type !== "sub2api") {
    throw new Error("当前仅 Sub2API 支持上游登录态同步")
  }
}

async function readUpstreamBalance(channel: ChannelRow, accessToken: string): Promise<BalanceResult> {
  const [me, profile, stats] = await Promise.all([
    getAuthorizedOptional<Record<string, unknown>>(channel, "/auth/me", accessToken),
    getAuthorizedOptional<Record<string, unknown>>(channel, "/user/profile", accessToken),
    getAuthorizedOptional<Record<string, unknown>>(
      channel,
      "/usage/dashboard/stats",
      accessToken,
    ),
  ])

  if (!me.data && !profile.data) {
    throw new Error(`上游账号数据读取失败：${me.error ?? profile.error ?? "无可用账号数据"}`)
  }

  const remaining = extractBalance(me.data, profile.data)

  return {
    isValid: true,
    planName: extractPlanName(me.data, profile.data) ?? "Sub2API",
    remaining,
    used: asNumber(asRecord(stats.data).total_actual_cost),
    unit: "USD",
  }
}

export async function getSub2ApiUpstreamSnapshot(channelId: string) {
  const channel = await getChannel(channelId)
  if (!channel) {
    return null
  }

  assertSub2ApiChannel(channel)

  const range = buildRange(7)

  try {
    const { accessToken, refreshedByRefreshToken } = await refreshSessionForProbe(channel)
    const latestChannel = (await getChannel(channel.id)) ?? channel
    const trendPath = buildQuery("/usage/dashboard/trend", {
      start_date: range.startDate,
      end_date: range.endDate,
      granularity: range.granularity,
    })
    const modelsPath = buildQuery("/usage/dashboard/models", {
      start_date: range.startDate,
      end_date: range.endDate,
    })
    const usagePath = buildQuery("/usage", {
      start_date: range.startDate,
      end_date: range.endDate,
      page: 1,
      page_size: 20,
    })
    const keysPath = buildQuery("/keys", {
      page: 1,
      page_size: 100,
    })

    const [
      me,
      profile,
      stats,
      trend,
      models,
      recentUsage,
      platformQuotas,
      snapshotV2,
      keys,
      availableGroups,
      groupRates,
      availableChannels,
    ] = await Promise.all([
      getAuthorizedOptional(latestChannel, "/auth/me", accessToken),
      getAuthorizedOptional(latestChannel, "/user/profile", accessToken),
      getAuthorizedOptional(latestChannel, "/usage/dashboard/stats", accessToken),
      getAuthorizedOptional(latestChannel, trendPath, accessToken),
      getAuthorizedOptional(latestChannel, modelsPath, accessToken),
      getAuthorizedOptional(latestChannel, usagePath, accessToken),
      getAuthorizedOptional(latestChannel, "/user/platform-quotas", accessToken),
      getAuthorizedOptional(latestChannel, "/usage/dashboard/snapshot-v2", accessToken),
      getAuthorizedOptional(latestChannel, keysPath, accessToken),
      getAuthorizedOptional(latestChannel, "/groups/available", accessToken),
      getAuthorizedOptional(latestChannel, "/groups/rates", accessToken),
      getAuthorizedOptional(latestChannel, "/channels/available", accessToken),
    ])

    if (!me.data && !profile.data) {
      throw new Error(`上游账号数据读取失败：${me.error ?? profile.error ?? "无可用账号数据"}`)
    }

    const refreshedChannel = await getChannel(channel.id)
    await updateUpstreamSession(channel.id, {
      lastSyncAt: new Date().toISOString(),
      lastSyncError: null,
    })

    return {
      refreshedByRefreshToken,
      fetchedAt: new Date().toISOString(),
      range,
      tokenExpiresAt:
        refreshedChannel?.upstreamTokenExpiresAt ?? latestChannel.upstreamTokenExpiresAt ?? null,
      account: {
        me,
        profile,
      },
      dashboard: {
        stats,
        trend,
        models,
        recentUsage,
        platformQuotas,
        snapshotV2,
      },
      keys: {
        list: keys,
        availableGroups,
        groupRates,
        availableChannels,
      },
    } satisfies Sub2ApiUpstreamSnapshot
  } catch (error) {
    const message = error instanceof Error ? error.message : "上游数据抓取失败"
    await updateUpstreamSession(channel.id, {
      lastSyncAt: new Date().toISOString(),
      lastSyncError: message,
    })
    throw error
  }
}

export async function syncSub2ApiUpstream(channelId: string) {
  const channel = await getChannel(channelId)
  if (!channel) {
    return null
  }

  if (channel.type !== "sub2api") {
    return saveCheck(channel.id, {
      success: false,
      isValid: false,
      errorMessage: "当前仅 Sub2API 支持上游登录态同步",
    })
  }

  try {
    let accessToken = await ensureSession(channel)
    if (!accessToken) {
      throw new Error("上游登录未返回 access token")
    }

    let latestChannel = await getChannel(channel.id)
    let result: BalanceResult
    try {
      result = await readUpstreamBalance(latestChannel ?? channel, accessToken)
    } catch (error) {
      if (!channel.upstreamRefreshToken) {
        throw error
      }

      const refreshed = await refreshSession(latestChannel ?? channel)
      await persistSession(channel.id, refreshed)
      accessToken = refreshed.access_token
      if (!accessToken) {
        throw new Error("上游 refresh 未返回 access token")
      }
      latestChannel = await getChannel(channel.id)
      result = await readUpstreamBalance(latestChannel ?? channel, accessToken)
    }

    await updateUpstreamSession(channel.id, {
      lastSyncAt: new Date().toISOString(),
      lastSyncError: null,
    })

    return saveCheck(channel.id, {
      success: true,
      isValid: true,
      planName: result.planName,
      remaining: result.remaining,
      used: result.used,
      total: result.total,
      unit: result.unit,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "上游登录态同步失败"
    await updateUpstreamSession(channel.id, {
      lastSyncAt: new Date().toISOString(),
      lastSyncError: message,
    })

    return saveCheck(channel.id, {
      success: false,
      isValid: false,
      errorMessage: message,
    })
  }
}
