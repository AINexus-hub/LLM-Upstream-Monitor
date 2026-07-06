import type {
  BalanceCheckRecord,
  UpstreamProvider,
} from "@llm-upstream-monitor/shared"
import { getChannel, saveCheck } from "../repositories/channels.js"
import type { ChannelRow } from "../types.js"
import {
  getSub2ApiUpstreamSnapshot,
  syncSub2ApiUpstream,
  type Sub2ApiUpstreamSnapshot,
} from "./sub2api-upstream.js"

export type { Sub2ApiUpstreamSnapshot } from "./sub2api-upstream.js"

export type UpstreamRawSnapshot = Sub2ApiUpstreamSnapshot

export type UpstreamProviderAdapter = {
  provider: UpstreamProvider
  supports: (channel: ChannelRow) => boolean
  captureSnapshot: (channelId: string) => Promise<UpstreamRawSnapshot | null>
  diagnose: (channelId: string) => Promise<UpstreamRawSnapshot | null>
  syncBalance: (channelId: string) => Promise<BalanceCheckRecord | null>
}

const sub2ApiAdapter: UpstreamProviderAdapter = {
  provider: "sub2api",
  supports: (channel) => channel.type === "sub2api",
  captureSnapshot: getSub2ApiUpstreamSnapshot,
  diagnose: getSub2ApiUpstreamSnapshot,
  syncBalance: syncSub2ApiUpstream,
}

const upstreamProviderAdapters: UpstreamProviderAdapter[] = [sub2ApiAdapter]

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

export async function diagnoseUpstreamProvider(channelId: string) {
  const channel = await getChannel(channelId)
  if (!channel) {
    return null
  }

  const adapter = getUpstreamProviderAdapter(channel)
  if (!adapter) {
    throw new Error(`暂不支持 ${channel.type.toUpperCase()} 账号接入诊断`)
  }

  return adapter.diagnose(channel.id)
}
