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

async function readUpstreamBalance(
  channel: ChannelRow,
  accessToken: string,
): Promise<BalanceResult> {
  const [me, profile, stats] = await Promise.all([
    getAuthorizedOptional<Record<string, unknown>>(channel, "/auth/me", accessToken),
    getAuthorizedOptional<Record<string, unknown>>(channel, "/user/profile", accessToken),
    getAuthorizedOptional<Record<string, unknown>>(channel, "/usage/dashboard/stats", accessToken),
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

export type Sub2ApiAvailableGroup = {
  id: string
  name: string
  platform?: string
  rateMultiplier?: number
}

function extractGroupRates(value: unknown) {
  const rates = new Map<string, number>()
  const record = asRecord(value)
  const entries = Array.isArray(value)
    ? value.map((item) => {
        const group = asRecord(item)
        return [
          asString(group.id) ?? asString(group.group_id) ?? asString(group.name) ?? "",
          asNumber(group.rate_multiplier) ?? asNumber(group.rate) ?? asNumber(group.multiplier),
        ] as const
      })
    : Object.entries(record).map(([id, item]) => {
        const group = asRecord(item)
        return [
          id,
          asNumber(item) ??
            asNumber(group.rate_multiplier) ??
            asNumber(group.rate) ??
            asNumber(group.multiplier),
        ] as const
      })

  entries.forEach(([id, rate]) => {
    if (id && rate !== undefined) rates.set(id, rate)
  })
  return rates
}

function extractAvailableGroups(
  value: unknown,
  rates: Map<string, number>,
): Sub2ApiAvailableGroup[] {
  const record = asRecord(value)
  const groups = Array.isArray(value)
    ? value
    : ([record.groups, record.items, record.list, record.data].find(Array.isArray) ?? [])

  return groups.flatMap((item) => {
    const group = asRecord(item)
    const id =
      asString(group.id) ??
      asString(group.group_id) ??
      asString(group.key) ??
      (typeof group.id === "number" ? String(group.id) : undefined) ??
      (typeof group.group_id === "number" ? String(group.group_id) : undefined)
    const name = asString(group.name) ?? asString(group.group_name) ?? asString(group.label) ?? id
    const platform =
      asString(group.platform) ??
      asString(group.provider) ??
      asString(group.vendor) ??
      asString(group.type)
    const rateMultiplier =
      asNumber(group.rate_multiplier) ??
      asNumber(group.rate) ??
      asNumber(group.multiplier) ??
      (id ? rates.get(id) : undefined) ??
      (name ? rates.get(name) : undefined)
    return id && name ? [{ id, name, platform, rateMultiplier }] : []
  })
}

async function withUpstreamSession<T>(
  channelId: string,
  action: (channel: ChannelRow, accessToken: string) => Promise<T>,
) {
  const channel = await getChannel(channelId)
  if (!channel) {
    return null
  }
  assertSub2ApiChannel(channel)

  const accessToken = await ensureSession(channel)
  if (!accessToken) {
    throw new Error("上游登录未返回 access token")
  }
  return action((await getChannel(channel.id)) ?? channel, accessToken)
}

export async function revealSub2ApiKey(channelId: string, keyId: string) {
  if (!/^\d+$/.test(keyId) || !Number.isSafeInteger(Number(keyId)) || Number(keyId) < 1) {
    throw new Error("Sub2API 密钥 ID 无效")
  }
  return withUpstreamSession(channelId, async (channel, accessToken) => {
    for (let page = 1; page <= 100; page++) {
      const data = await getAuthorized<unknown>(
        channel,
        buildQuery("/keys", { page, page_size: 100 }),
        accessToken,
      )
      const record = asRecord(data)
      const items = Array.isArray(data) ? data :
        Array.isArray(record.items) ? record.items :
        Array.isArray(record.keys) ? record.keys :
        Array.isArray(record.records) ? record.records : []
      const keyRecord = items.map(asRecord).find((item) => String(item.id ?? item.key_id ?? item.uuid ?? "") === keyId)
      if (keyRecord) {
        const key = [keyRecord.key, keyRecord.api_key, keyRecord.apiKey, keyRecord.token]
          .find((value): value is string => typeof value === "string" && Boolean(value))
        if (!key || /[*•]/.test(key)) throw new Error("Sub2API 令牌列表未返回完整密钥")
        return key
      }
      const total = asNumber(record.total)
      if (items.length < 100 || (total !== undefined && page * 100 >= total)) break
    }
    throw new Error("Sub2API 密钥不存在或当前账号无权读取")
  })
}

export async function listSub2ApiGroups(channelId: string) {
  return withUpstreamSession(channelId, async (channel, accessToken) => {
    const [data, rates] = await Promise.all([
      getAuthorized<unknown>(channel, "/groups/available", accessToken),
      getAuthorizedOptional<unknown>(channel, "/groups/rates", accessToken),
    ])
    return extractAvailableGroups(data, extractGroupRates(rates.data))
  })
}

export function buildSub2ApiKeyName(group: Sub2ApiAvailableGroup) {
  if (group.rateMultiplier === undefined) {
    throw new Error(`无法读取分组“${group.name}”的倍率`)
  }

  const ratePrefix = String(Math.round(group.rateMultiplier * 100)).padStart(3, "0")
  return `${ratePrefix}${group.name}`
}

async function createKeyForGroup(
  channel: ChannelRow,
  accessToken: string,
  group: Sub2ApiAvailableGroup,
  input: { quota?: number; expiresInDays?: number },
) {
  return requestSub2Api<unknown>(channel, "/keys", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      name: buildSub2ApiKeyName(group),
      group_id: /^\d+$/.test(group.id) ? Number(group.id) : group.id,
      quota: input.quota ?? 0,
      ...(input.expiresInDays === undefined ? {} : { expires_in_days: input.expiresInDays }),
    }),
  })
}

export async function createSub2ApiKeys(
  channelId: string,
  input: { groupIds: string[]; quota?: number; expiresInDays?: number },
) {
  return withUpstreamSession(channelId, async (channel, accessToken) => {
    const groups = await listSub2ApiGroups(channelId)
    const results = await Promise.all(
      input.groupIds.map(async (groupId) => {
        const group = groups?.find((item) => item.id === groupId)
        if (!group) {
          return {
            groupId,
            groupName: groupId,
            name: groupId,
            success: false,
            error: "分组已不可用，请重新加载",
          }
        }
        let name: string
        try {
          name = buildSub2ApiKeyName(group)
        } catch (error) {
          return {
            groupId,
            groupName: group.name,
            name: group.name,
            success: false,
            error: error instanceof Error ? error.message : "分组倍率无效",
          }
        }
        try {
          const data = await createKeyForGroup(channel, accessToken, group, input)
          const record = asRecord(data)
          const key = [record.key, record.api_key, record.apiKey, record.token].find(
            (value): value is string => typeof value === "string",
          )
          if (!key) {
            return {
              groupId,
              groupName: group.name,
              name,
              success: false,
              error: "上游响应中没有完整密钥",
            }
          }
          return { groupId, groupName: group.name, name, success: true, key }
        } catch (error) {
          return {
            groupId,
            groupName: group.name,
            name,
            success: false,
            error: error instanceof Error ? error.message : "创建失败",
          }
        }
      }),
    )
    return results
  })
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
    const keysPath = buildQuery("/keys", {
      page: 1,
      page_size: 100,
    })

    const [
      me,
      profile,
      stats,
      keys,
      availableGroups,
      groupRates,
      availableChannels,
    ] = await Promise.all([
      getAuthorizedOptional(latestChannel, "/auth/me", accessToken),
      getAuthorizedOptional(latestChannel, "/user/profile", accessToken),
      getAuthorizedOptional(latestChannel, "/usage/dashboard/stats", accessToken),
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
        trend: { data: null, error: null },
        models: { data: null, error: null },
        recentUsage: { data: null, error: null },
        platformQuotas: { data: null, error: null },
        snapshotV2: { data: null, error: null },
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
