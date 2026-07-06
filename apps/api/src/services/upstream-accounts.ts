import type {
  PublicChannel,
  UpstreamApiKeySummary,
  UpstreamGroupSummary,
  UpstreamRecentUsageItem,
  UpstreamSnapshotSummary,
  UpstreamUsageItem,
} from "@llm-upstream-monitor/shared"
import { getChannel, getPublicChannel } from "../repositories/channels.js"
import { createNotification } from "../repositories/notifications.js"
import {
  getLatestUpstreamSnapshot,
  listLatestUpstreamSnapshots,
  saveUpstreamSnapshot,
} from "../repositories/upstream-snapshots.js"
import {
  getUpstreamProviderAdapter,
  type UpstreamRawSnapshot,
  type Sub2ApiUpstreamSnapshot,
} from "./upstream-provider-adapters.js"

type ReadBlock = {
  data: unknown
  error: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string" && value.trim()) {
    const normalized = value.replace(/[$,%\s,]/g, "")
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function asString(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }

  return undefined
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asNumber(record[key])
    if (value !== undefined) {
      return value
    }
  }

  return undefined
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asString(record[key])
    if (value) {
      return value
    }
  }

  return undefined
}

function findArray(value: unknown, preferredKeys: string[] = []): unknown[] {
  if (Array.isArray(value)) {
    return value
  }

  const record = asRecord(value)
  for (const key of preferredKeys) {
    const nested = record[key]
    if (Array.isArray(nested)) {
      return nested
    }
  }

  for (const key of ["items", "list", "rows", "records", "data", "groups", "keys", "models"]) {
    const nested = record[key]
    if (Array.isArray(nested)) {
      return nested
    }
  }

  return []
}

function buildRateMap(value: unknown) {
  const map = new Map<string, number>()

  if (Array.isArray(value)) {
    value.forEach((item) => {
      const record = asRecord(item)
      const id = firstString(record, ["id", "group_id", "name", "group", "group_name"])
      const rate = firstNumber(record, ["rate_multiplier", "rate", "multiplier", "倍率"])
      if (id && rate !== undefined) {
        map.set(id, rate)
      }
    })
    return map
  }

  const record = asRecord(value)
  Object.entries(record).forEach(([key, rawValue]) => {
    const nested = asRecord(rawValue)
    const rate =
      asNumber(rawValue) ??
      firstNumber(nested, ["rate_multiplier", "rate", "multiplier", "倍率"])
    if (rate !== undefined) {
      map.set(key, rate)
    }
  })

  return map
}

function maskSecret(value?: string) {
  if (!value) {
    return undefined
  }

  if (value.length <= 10) {
    return `${value.slice(0, 2)}***`
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function extractGroups(snapshot: Sub2ApiUpstreamSnapshot): UpstreamGroupSummary[] {
  const groups = findArray(snapshot.keys.availableGroups.data, ["groups"])
  const rateMap = buildRateMap(snapshot.keys.groupRates.data)
  const parsedGroups: UpstreamGroupSummary[] = []

  groups.forEach((item) => {
    const record = asRecord(item)
    const id = firstString(record, ["id", "group_id", "key", "name", "group"])
    const name = firstString(record, ["name", "group_name", "label", "id"]) ?? id
    if (!id || !name) {
      return
    }

    parsedGroups.push({
      id,
      name,
      platform: firstString(record, ["platform", "provider", "type"]),
      subscriptionType: firstString(record, ["subscription_type", "subscriptionType", "plan"]),
      rateMultiplier:
        firstNumber(record, ["rate_multiplier", "rate", "multiplier"]) ??
        rateMap.get(id) ??
        rateMap.get(name),
    })
  })

  return parsedGroups
}

function extractApiKeys(snapshot: Sub2ApiUpstreamSnapshot): UpstreamApiKeySummary[] {
  return findArray(snapshot.keys.list.data, ["items", "keys", "records", "list"]).map((item) => {
    const record = asRecord(item)
    const key = firstString(record, ["key", "api_key", "apiKey", "token"])

    return {
      id: firstString(record, ["id", "key_id", "uuid"]),
      name: firstString(record, ["name", "label", "remark"]),
      keyPreview: maskSecret(key),
      groupId: firstString(record, ["group_id", "groupId"]),
      groupName: firstString(record, ["group_name", "group", "groupName"]),
      status: firstString(record, ["status", "state"]),
      quota: firstNumber(record, ["quota", "limit", "total_quota"]),
      used: firstNumber(record, ["used", "used_quota", "usage"]),
      createdAt: firstString(record, ["created_at", "createdAt", "created_time"]),
    }
  })
}

function extractUsageItems(value: unknown): UpstreamUsageItem[] {
  return findArray(value, ["items", "models", "platforms", "records"]).map((item) => {
    const record = asRecord(item)
    const actualCost = firstNumber(record, ["actual_cost", "total_actual_cost", "actualCost"])
    const standardCost = firstNumber(record, ["cost", "total_cost", "standard_cost", "standardCost"])
    return {
      name: firstString(record, ["name", "model", "platform", "type"]) ?? "unknown",
      requests: firstNumber(record, ["requests", "request_count", "count"]),
      tokens: firstNumber(record, ["tokens", "total_tokens", "token_count"]),
      cost: actualCost ?? standardCost,
      actualCost,
      standardCost,
    }
  })
}

function extractRecentUsage(value: unknown): UpstreamRecentUsageItem[] {
  return findArray(value, ["items", "records", "list"]).slice(0, 20).map((item) => {
    const record = asRecord(item)
    const group = asRecord(record.group)
    const apiKey = asRecord(record.api_key)
    const actualCost = firstNumber(record, ["actual_cost", "actualCost"])
    const standardCost = firstNumber(record, ["total_cost", "cost", "standard_cost", "standardCost"])
    const tokens =
      firstNumber(record, ["tokens", "total_tokens", "token_count"]) ??
      [
        "input_tokens",
        "output_tokens",
        "cache_creation_tokens",
        "cache_read_tokens",
        "image_output_tokens",
      ].reduce((sum, key) => sum + (asNumber(record[key]) ?? 0), 0)

    return {
      id: firstString(record, ["id", "request_id"]),
      model: firstString(record, ["model", "model_name"]),
      platform: firstString(record, ["platform", "provider"]) ?? firstString(group, ["platform"]),
      apiKeyName:
        firstString(record, ["api_key_name", "key_name", "apiKeyName"]) ??
        firstString(apiKey, ["name"]),
      groupName:
        firstString(record, ["group_name", "groupName"]) ??
        firstString(group, ["name"]),
      tokens,
      cost: actualCost ?? standardCost,
      actualCost,
      standardCost,
      createdAt: firstString(record, ["created_at", "createdAt", "time"]),
    }
  })
}

function collectErrors(blocks: Array<{ module: string; read: ReadBlock }>) {
  return blocks
    .filter(({ read }) => read.error)
    .map(({ module, read }) => ({ module, message: read.error ?? "读取失败" }))
}

function buildSub2ApiSummary(snapshot: Sub2ApiUpstreamSnapshot): UpstreamSnapshotSummary {
  const stats = asRecord(snapshot.dashboard.stats.data)
  const profile = asRecord(snapshot.account.profile.data)
  const me = asRecord(snapshot.account.me.data)
  const apiKeys = extractApiKeys(snapshot)

  return {
    provider: "sub2api",
    fetchedAt: snapshot.fetchedAt,
    range: snapshot.range,
    metrics: {
      balance: firstNumber(profile, ["balance", "quota", "remaining", "available_balance"]) ??
        firstNumber(me, ["balance", "quota", "remaining", "available_balance"]),
      apiKeyCount:
        firstNumber(stats, ["api_key_count", "apiKeyCount", "key_count"]) || apiKeys.length,
      todayRequests: firstNumber(stats, ["today_requests", "todayRequests"]),
      totalRequests: firstNumber(stats, ["total_requests", "totalRequests"]),
      todayCost: firstNumber(stats, ["today_actual_cost", "today_cost", "todayCost"]),
      todayStandardCost: firstNumber(stats, ["today_cost", "todayStandardCost"]),
      totalCost: firstNumber(stats, ["total_actual_cost", "total_cost", "totalCost"]),
      totalStandardCost: firstNumber(stats, ["total_cost", "totalStandardCost"]),
      todayTokens: firstNumber(stats, ["today_tokens", "todayTokens"]),
      totalTokens: firstNumber(stats, ["total_tokens", "totalTokens"]),
      averageDurationMs: firstNumber(stats, ["average_duration_ms", "averageDurationMs"]),
    },
    groups: extractGroups(snapshot),
    apiKeys,
    platformUsage: extractUsageItems(stats.by_platform),
    modelUsage: extractUsageItems(snapshot.dashboard.models.data),
    recentUsage: extractRecentUsage(snapshot.dashboard.recentUsage.data),
    errors: collectErrors([
      { module: "账号", read: snapshot.account.me.data ? snapshot.account.me : snapshot.account.profile },
      { module: "统计", read: snapshot.dashboard.stats },
      { module: "趋势", read: snapshot.dashboard.trend },
      { module: "模型分布", read: snapshot.dashboard.models },
      { module: "最近使用", read: snapshot.dashboard.recentUsage },
      { module: "平台拆分", read: snapshot.dashboard.platformQuotas },
      { module: "API密钥", read: snapshot.keys.list },
      { module: "可选分组", read: snapshot.keys.availableGroups },
      { module: "分组倍率", read: snapshot.keys.groupRates },
      { module: "可用渠道", read: snapshot.keys.availableChannels },
    ]),
  }
}

function buildUpstreamSummary(provider: PublicChannel["type"], raw: unknown) {
  if (provider === "sub2api") {
    return buildSub2ApiSummary(raw as Sub2ApiUpstreamSnapshot)
  }

  throw new Error(`暂不支持 ${provider.toUpperCase()} 账号接入快照解析`)
}

async function notifyGroupChanges(
  channel: PublicChannel,
  previous: UpstreamSnapshotSummary | undefined,
  current: UpstreamSnapshotSummary,
) {
  if (!previous) {
    return
  }

  const previousGroups = new Map(previous.groups.map((group) => [group.id, group]))
  const currentGroups = new Map(current.groups.map((group) => [group.id, group]))

  for (const group of current.groups) {
    const oldGroup = previousGroups.get(group.id)
    if (!oldGroup) {
      if (channel.groupChangeAlertEnabled) {
        await createNotification({
          channelId: channel.id,
          type: "upstream_group_added",
          title: `${channel.name} 新增分组`,
          body: `检测到新增分组 ${group.name}，倍率 ${group.rateMultiplier ?? "未知"}。`,
          severity: "info",
          metadata: { group },
        })
      }
      continue
    }

    if (channel.groupRateAlertEnabled && oldGroup.rateMultiplier !== group.rateMultiplier) {
      await createNotification({
        channelId: channel.id,
        type: "upstream_group_rate_changed",
        title: `${channel.name} 分组倍率变化`,
        body: `${group.name} 倍率从 ${oldGroup.rateMultiplier ?? "未知"} 变为 ${group.rateMultiplier ?? "未知"}。`,
        severity: "warning",
        metadata: { before: oldGroup, after: group },
      })
    }
  }

  for (const group of previous.groups) {
    if (channel.groupChangeAlertEnabled && !currentGroups.has(group.id)) {
      await createNotification({
        channelId: channel.id,
        type: "upstream_group_removed",
        title: `${channel.name} 分组被移除`,
        body: `检测到原有分组 ${group.name} 已不存在。`,
        severity: "warning",
        metadata: { group },
      })
    }
  }
}

export async function refreshUpstreamAccountSnapshot(channelId: string) {
  const channel = await getChannel(channelId)
  if (!channel) {
    return null
  }

  const adapter = getUpstreamProviderAdapter(channel)
  if (!adapter) {
    throw new Error(`暂不支持 ${channel.type.toUpperCase()} 账号接入快照`)
  }

  const previous = await getLatestUpstreamSnapshot(channel.id)
  let raw: UpstreamRawSnapshot | null
  try {
    raw = await adapter.captureSnapshot(channel.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : "上游账号快照刷新失败"
    await createNotification({
      channelId: channel.id,
      type: "upstream_sync_failed",
      title: `${channel.name} 上游同步失败`,
      body: message,
      severity: "error",
      metadata: { provider: adapter.provider },
      dedupeUnread: true,
    })
    throw error
  }

  if (!raw) {
    return null
  }

  if (channel.upstreamLastSyncError) {
    await createNotification({
      channelId: channel.id,
      type: "upstream_sync_recovered",
      title: `${channel.name} 上游同步恢复`,
      body: "上游账号快照已恢复正常。",
      severity: "info",
      metadata: { provider: adapter.provider },
      dedupeUnread: true,
    })
  }

  const publicChannel = await getPublicChannel(channel.id)
  const summary = buildUpstreamSummary(adapter.provider, raw)
  if (publicChannel) {
    await notifyGroupChanges(publicChannel, previous?.summary, summary)
  }

  return saveUpstreamSnapshot({
    channelId: channel.id,
    provider: adapter.provider,
    fetchedAt: raw.fetchedAt,
    summary,
    raw,
  })
}

export async function getLatestUpstreamAccountSnapshot(channelId: string) {
  return getLatestUpstreamSnapshot(channelId)
}

export async function listUpstreamAccountSnapshots() {
  return listLatestUpstreamSnapshots()
}
