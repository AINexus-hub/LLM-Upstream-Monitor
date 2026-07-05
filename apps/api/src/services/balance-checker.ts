import type { BalanceResult } from "@llm-balance-monitor/shared"
import { getChannel, saveCheck } from "../repositories/channels.js"
import type { ChannelRow } from "../types.js"

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}${path}`
}

async function requestJson(channel: ChannelRow, path: string, headers: Record<string, string>) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), channel.timeoutSeconds * 1000)

  try {
    const response = await fetch(joinUrl(channel.requestUrl, path), {
      method: "GET",
      headers,
      signal: controller.signal,
    })

    const text = await response.text()
    const body = text ? (JSON.parse(text) as unknown) : null

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`)
    }

    return body
  } finally {
    clearTimeout(timeout)
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

async function checkNewApi(channel: ChannelRow): Promise<BalanceResult> {
  if (!channel.accessToken || !channel.userId) {
    return {
      isValid: false,
      invalidMessage: "NewAPI 渠道缺少访问令牌或用户 ID",
    }
  }

  const response = asRecord(
    await requestJson(channel, "/api/user/self", {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channel.accessToken}`,
      "User-Agent": "cc-switch/1.0",
      "New-Api-User": channel.userId,
    }),
  )

  const data = asRecord(response.data)

  if (response.success && data) {
    const quota = asNumber(data.quota) ?? 0
    const usedQuota = asNumber(data.used_quota) ?? 0

    return {
      isValid: true,
      planName: asString(data.group) ?? "默认套餐",
      remaining: quota / 500000,
      used: usedQuota / 500000,
      total: (quota + usedQuota) / 500000,
      unit: "USD",
    }
  }

  return {
    isValid: false,
    invalidMessage: asString(response.message) ?? "查询失败",
  }
}

async function checkSub2Api(channel: ChannelRow): Promise<BalanceResult> {
  if (!channel.apiKey) {
    return {
      isValid: false,
      invalidMessage: "Sub2API 渠道缺少 API Key",
    }
  }

  const response = asRecord(
    await requestJson(channel, "/v1/usage", {
      Authorization: `Bearer ${channel.apiKey}`,
    }),
  )
  const quota = asRecord(response.quota)

  return {
    isValid: Boolean(response.is_active ?? response.isValid ?? true),
    remaining:
      asNumber(response.remaining) ?? asNumber(quota.remaining) ?? asNumber(response.balance),
    unit: asString(response.unit) ?? asString(quota.unit) ?? "USD",
  }
}

export async function checkChannelBalance(channelId: string) {
  const channel = await getChannel(channelId)
  if (!channel) {
    return null
  }

  try {
    const result =
      channel.type === "newapi" ? await checkNewApi(channel) : await checkSub2Api(channel)

    return saveCheck(channel.id, {
      success: result.isValid,
      isValid: result.isValid,
      planName: result.planName,
      remaining: result.remaining,
      used: result.used,
      total: result.total,
      unit: result.unit,
      errorMessage: result.invalidMessage,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "查询失败"

    return saveCheck(channel.id, {
      success: false,
      isValid: false,
      errorMessage: message,
    })
  }
}
