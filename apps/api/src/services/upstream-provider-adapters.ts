import type { BalanceCheckRecord, UpstreamProvider } from "@llm-upstream-monitor/shared"
import { getChannel, saveCheck, updateUpstreamSession } from "../repositories/channels.js"
import type { ChannelRow } from "../types.js"
import { createNewApiKeys, listNewApiGroups, readNewApiEndpoint } from "./newapi-keys.js"
import {
  createSub2ApiKeys,
  getSub2ApiUpstreamSnapshot,
  listSub2ApiGroups,
  syncSub2ApiUpstream,
  type Sub2ApiUpstreamSnapshot,
} from "./sub2api-upstream.js"

export type { Sub2ApiAvailableGroup, Sub2ApiUpstreamSnapshot } from "./sub2api-upstream.js"

export type NewApiUpstreamSnapshot = {
  fetchedAt: string
  profile: Record<string, unknown>
  groups: Awaited<ReturnType<typeof listNewApiGroups>>
  pricing: Record<string, unknown>
}

export type UpstreamRawSnapshot = Sub2ApiUpstreamSnapshot | NewApiUpstreamSnapshot

export type UpstreamProviderAdapter = {
  provider: UpstreamProvider
  supports: (channel: ChannelRow) => boolean
  captureSnapshot: (channelId: string) => Promise<UpstreamRawSnapshot | null>
  diagnose: (channelId: string) => Promise<UpstreamRawSnapshot | null>
  syncBalance: (channelId: string) => Promise<BalanceCheckRecord | null>
}

const sub2ApiAdapter: UpstreamProviderAdapter = {
  provider: "sub2api",
  supports: (channel) => channel.type === "sub2api" && channel.accountTemplate === "sub2api",
  captureSnapshot: getSub2ApiUpstreamSnapshot,
  diagnose: getSub2ApiUpstreamSnapshot,
  syncBalance: syncSub2ApiUpstream,
}

const newApiAdapter: UpstreamProviderAdapter = {
  provider: "newapi",
  supports: (channel) => channel.accountTemplate === "newapi",
  captureSnapshot: async (channelId) => {
    const channel = await getChannel(channelId)
    if (!channel) return null
    const [profile, groupResponse, pricing] = await Promise.all([
      readNewApiEndpoint(channel, "/api/user/self"),
      readNewApiEndpoint(channel, "/api/user/self/groups"),
      readNewApiEndpoint(channel, "/api/pricing", true).catch(() => ({})),
    ])
    const groups = await listNewApiGroups(channel, groupResponse, pricing)
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      throw new Error("NewAPI 用户资料格式无效")
    }
    return { fetchedAt: new Date().toISOString(), profile: profile as Record<string, unknown>, groups, pricing: pricing as Record<string, unknown> }
  },
  diagnose: async (channelId) => newApiAdapter.captureSnapshot(channelId),
  syncBalance: async (channelId) => {
    const channel = await getChannel(channelId)
    if (!channel) return null
    try {
      const profile = await readNewApiEndpoint(channel, "/api/user/self")
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
        throw new Error("NewAPI 用户资料格式无效")
      }
      const data = profile as Record<string, unknown>
      const quota = Number(data.quota)
      const usedQuota = Number(data.used_quota)
      if (!Number.isFinite(quota) || !Number.isFinite(usedQuota)) {
        throw new Error("NewAPI 用户资料缺少余额字段")
      }
      const check = await saveCheck(channelId, {
        success: true,
        isValid: true,
        planName: typeof data.group === "string" ? data.group : undefined,
        remaining: quota / 500000,
        used: usedQuota / 500000,
        total: (quota + usedQuota) / 500000,
        unit: "USD",
      })
      await updateUpstreamSession(channelId, {
        lastSyncAt: check.checkedAt,
        lastSyncError: null,
      })
      return check
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "NewAPI 余额读取失败"
      const check = await saveCheck(channelId, {
        success: false,
        isValid: false,
        errorMessage,
      })
      await updateUpstreamSession(channelId, {
        lastSyncAt: check.checkedAt,
        lastSyncError: errorMessage,
      })
      return check
    }
  },
}

const upstreamProviderAdapters: UpstreamProviderAdapter[] = [sub2ApiAdapter, newApiAdapter]

export function getUpstreamProviderAdapter(channel: ChannelRow) {
  return upstreamProviderAdapters.find((adapter) => adapter.supports(channel))
}

async function saveUnsupportedProviderCheck(channel: ChannelRow) {
  return saveCheck(channel.id, {
    success: false,
    isValid: false,
    errorMessage: `暂不支持 ${channel.type.toUpperCase()} 账号接入自动同步`,
  })
}

export async function syncUpstreamProvider(channelId: string) {
  const channel = await getChannel(channelId)
  if (!channel) {
    return null
  }

  const adapter = getUpstreamProviderAdapter(channel)
  return adapter ? adapter.syncBalance(channel.id) : saveUnsupportedProviderCheck(channel)
}

export async function listUpstreamGroups(channelId: string) {
  const channel = await getChannel(channelId)
  if (!channel) {
    return null
  }
  if (channel.accountTemplate === "newapi") {
    return listNewApiGroups(channel)
  }
  if (channel.type !== "sub2api") {
    throw new Error("目前仅支持 Sub2API 或 NewAPI 获取分组")
  }
  return listSub2ApiGroups(channel.id)
}

export async function createUpstreamApiKeys(
  channelId: string,
  input: { groupIds: string[]; quota?: number; expiresInDays?: number },
) {
  const channel = await getChannel(channelId)
  if (!channel) {
    return null
  }
  if (channel.accountTemplate === "newapi") {
    return createNewApiKeys(channel, input)
  }
  if (channel.type !== "sub2api") {
    throw new Error("目前仅支持 Sub2API 或 NewAPI 创建密钥")
  }
  return createSub2ApiKeys(channel.id, input)
}

export async function diagnoseUpstreamProvider(channelId: string) {
  const channel = await getChannel(channelId)
  if (!channel) {
    return null
  }

  if (channel.accountTemplate === "newapi") {
    return newApiAdapter.syncBalance(channel.id)
  }

  const adapter = getUpstreamProviderAdapter(channel)
  if (!adapter) {
    throw new Error(`暂不支持 ${channel.type.toUpperCase()} 账号接入诊断`)
  }

  return adapter.diagnose(channel.id)
}
