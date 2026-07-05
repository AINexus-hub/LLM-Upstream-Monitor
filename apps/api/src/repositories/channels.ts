import type { BalanceCheckRecord } from "@llm-balance-monitor/shared"
import { randomUUID } from "node:crypto"
import { db } from "../db.js"
import type { ChannelRow, CreateChannelInput, PublicChannel, UpdateChannelInput } from "../types.js"

type DbChannelRow = {
  id: string
  name: string
  type: string
  request_url: string
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
    accessToken: row.access_token,
    userId: row.user_id,
    apiKey: row.api_key,
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

function toPublicChannel(channel: ChannelRow, lastCheck?: BalanceCheckRecord): PublicChannel {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    requestUrl: channel.requestUrl,
    timeoutSeconds: channel.timeoutSeconds,
    checkIntervalMinutes: channel.checkIntervalMinutes,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
    hasAccessToken: Boolean(channel.accessToken),
    hasApiKey: Boolean(channel.apiKey),
    userId: channel.userId ?? undefined,
    lastCheck,
  }
}

export async function listChannels(): Promise<PublicChannel[]> {
  const channelsResult = await db.execute("select * from channels order by created_at desc")
  const channels = channelsResult.rows.map((row) => mapChannel(row as unknown as DbChannelRow))

  const publicChannels = await Promise.all(
    channels.map(async (channel) => toPublicChannel(channel, await getLatestCheck(channel.id))),
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

  return toPublicChannel(channel, await getLatestCheck(id))
}

export async function createChannel(input: CreateChannelInput): Promise<PublicChannel> {
  const id = randomUUID()
  const now = new Date().toISOString()

  await db.execute({
    sql: `insert into channels (
      id, name, type, request_url, access_token, user_id, api_key,
      timeout_seconds, check_interval_minutes, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name,
      input.type,
      input.requestUrl,
      input.accessToken ?? null,
      input.userId ?? null,
      input.apiKey ?? null,
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
      next.accessToken,
      next.userId,
      next.apiKey,
      next.timeoutSeconds,
      next.checkIntervalMinutes,
      next.updatedAt,
      id,
    ],
  })

  return getPublicChannel(id)
}

export async function saveCheck(
  channelId: string,
  record: Omit<BalanceCheckRecord, "id" | "channelId" | "checkedAt">,
): Promise<BalanceCheckRecord> {
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

  return saved
}

export async function listChecks(channelId: string): Promise<BalanceCheckRecord[]> {
  const result = await db.execute({
    sql: "select * from balance_checks where channel_id = ? order by checked_at asc",
    args: [channelId],
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
