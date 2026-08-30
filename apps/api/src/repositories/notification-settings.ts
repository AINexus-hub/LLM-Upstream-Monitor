import type {
  NotificationChannel,
  NotificationSettingsPayload,
  NotificationType,
  PublicNotificationSettings,
} from "@llm-upstream-monitor/shared"
import { randomUUID } from "node:crypto"
import { db } from "../db.js"
import { config } from "../config.js"
import { decryptSecret, encryptSecret } from "../crypto.js"

export const notificationTypes = [
  "balance_alert",
  "balance_recovered",
  "check_failed",
  "check_recovered",
  "upstream_sync_failed",
  "upstream_sync_recovered",
  "upstream_group_added",
  "upstream_group_removed",
  "upstream_group_rate_changed",
] as const satisfies NotificationType[]

const defaultSettingsId = "default"

type SmtpRecipient = {
  id: string
  email: string
  enabledTypes: NotificationType[]
}

type SmtpRecipientPayload = {
  id?: string
  email: string
  enabledTypes: NotificationType[]
}

type DbNotificationSettingsRow = {
  id: string
  telegram_enabled: number
  telegram_bot_token: string | null
  telegram_chat_id: string | null
  smtp_enabled: number
  smtp_host: string | null
  smtp_port: number | null
  smtp_secure: number
  smtp_username: string | null
  smtp_password: string | null
  smtp_from: string | null
  smtp_to: string | null
  smtp_recipients_json: string | null
  cooldown_minutes: number
  enabled_types_json: string
  created_at: string
  updated_at: string
}

export type NotificationSettings = {
  id: string
  telegram: {
    enabled: boolean
    botToken?: string
    chatId?: string
  }
  smtp: {
    enabled: boolean
    host?: string
    port?: number
    secure: boolean
    username?: string
    password?: string
    from?: string
    recipients: SmtpRecipient[]
  }
  cooldownMinutes: number
  enabledTypes: NotificationType[]
  createdAt: string
  updatedAt: string
}

function parseEnabledTypes(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return [...notificationTypes]
    }

    const validTypes = new Set(notificationTypes)
    return parsed.filter((item): item is NotificationType => validTypes.has(item as NotificationType))
  } catch {
    return [...notificationTypes]
  }
}

function parseRecipients(value: string | null, fallbackEmail?: string | null): SmtpRecipient[] {
  try {
    const parsed = value ? (JSON.parse(value) as unknown) : []
    if (Array.isArray(parsed)) {
      const recipients = parsed
        .map((item, index) => {
          if (!item || typeof item !== "object") {
            return null
          }

          const record = item as { id?: unknown; email?: unknown; enabledTypes?: unknown }
          if (typeof record.email !== "string" || !record.email.trim()) {
            return null
          }

          return {
            id:
              typeof record.id === "string" && record.id.trim()
                ? record.id.trim()
                : `recipient-${index + 1}`,
            email: record.email.trim(),
            enabledTypes: Array.isArray(record.enabledTypes)
              ? normalizeEnabledTypes(record.enabledTypes as NotificationType[]) ?? [...notificationTypes]
              : [...notificationTypes],
          }
        })
        .filter((item): item is SmtpRecipient => Boolean(item))

      if (recipients.length > 0) {
        return recipients
      }
    }
  } catch {
    // Keep supporting the legacy single-recipient field below.
  }

  if (fallbackEmail?.trim()) {
    return [
      {
        id: "recipient-1",
        email: fallbackEmail.trim(),
        enabledTypes: [...notificationTypes],
      },
    ]
  }

  return []
}

function rowToSettings(row: DbNotificationSettingsRow): NotificationSettings {
  return {
    id: row.id,
    telegram: {
      enabled: Boolean(row.telegram_enabled),
      botToken: decryptSecret(row.telegram_bot_token, config.ENCRYPTION_KEY) ?? undefined,
      chatId: row.telegram_chat_id ?? undefined,
    },
    smtp: {
      enabled: Boolean(row.smtp_enabled),
      host: row.smtp_host ?? undefined,
      port: row.smtp_port ?? undefined,
      secure: Boolean(row.smtp_secure),
      username: row.smtp_username ?? undefined,
      password: decryptSecret(row.smtp_password, config.ENCRYPTION_KEY) ?? undefined,
      from: row.smtp_from ?? undefined,
      recipients: parseRecipients(row.smtp_recipients_json, row.smtp_to),
    },
    cooldownMinutes: row.cooldown_minutes,
    enabledTypes: parseEnabledTypes(row.enabled_types_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toPublicSettings(settings: NotificationSettings): PublicNotificationSettings {
  return {
    telegram: {
      enabled: settings.telegram.enabled,
      botToken: settings.telegram.botToken ? maskSecret(settings.telegram.botToken) : undefined,
      chatId: settings.telegram.chatId,
      hasBotToken: Boolean(settings.telegram.botToken),
    },
    smtp: {
      enabled: settings.smtp.enabled,
      host: settings.smtp.host,
      port: settings.smtp.port,
      secure: settings.smtp.secure,
      username: settings.smtp.username,
      from: settings.smtp.from,
      recipients: settings.smtp.recipients,
      hasPassword: Boolean(settings.smtp.password),
    },
    cooldownMinutes: settings.cooldownMinutes,
    enabledTypes: settings.enabledTypes,
    updatedAt: settings.updatedAt,
  }
}

function maskSecret(value: string) {
  if (value.length <= 10) {
    return `${value.slice(0, 2)}***`
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function normalizeOptionalString(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeEnabledTypes(value: NotificationType[] | undefined) {
  if (!value) {
    return undefined
  }

  const validTypes = new Set(notificationTypes)
  return Array.from(new Set(value.filter((type) => validTypes.has(type))))
}

function normalizeRecipients(value: SmtpRecipientPayload[] | undefined): SmtpRecipient[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  return value
    .map((recipient, index) => {
      const email = recipient.email.trim()
      if (!email) {
        return null
      }

      return {
        id: recipient.id?.trim() || `recipient-${index + 1}-${randomUUID()}`,
        email,
        enabledTypes: normalizeEnabledTypes(recipient.enabledTypes) ?? [...notificationTypes],
      }
    })
    .filter((recipient): recipient is SmtpRecipient => Boolean(recipient))
}

async function createDefaultSettings() {
  const now = new Date().toISOString()
  await db.execute({
    sql: `insert into notification_settings (
      id, telegram_enabled, telegram_bot_token, telegram_chat_id,
      smtp_enabled, smtp_host, smtp_port, smtp_secure, smtp_username,
      smtp_password, smtp_from, smtp_to, smtp_recipients_json, cooldown_minutes, enabled_types_json,
      created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      defaultSettingsId,
      0,
      null,
      null,
      0,
      null,
      null,
      1,
      null,
      null,
      null,
      null,
      "[]",
      30,
      JSON.stringify(notificationTypes),
      now,
      now,
    ],
  })
}

export async function getNotificationSettings() {
  const result = await db.execute({
    sql: "select * from notification_settings where id = ?",
    args: [defaultSettingsId],
  })

  const row = result.rows[0]
  if (!row) {
    await createDefaultSettings()
    return getNotificationSettings()
  }

  return rowToSettings(row as unknown as DbNotificationSettingsRow)
}

export async function getPublicNotificationSettings() {
  return toPublicSettings(await getNotificationSettings())
}

export async function updateNotificationSettings(input: NotificationSettingsPayload) {
  const current = await getNotificationSettings()
  const enabledTypes = normalizeEnabledTypes(input.enabledTypes) ?? current.enabledTypes
  const now = new Date().toISOString()

  const next: NotificationSettings = {
    ...current,
    telegram: {
      enabled: input.telegram?.enabled ?? current.telegram.enabled,
      botToken:
        input.telegram?.botToken === undefined || input.telegram.botToken === ""
          ? current.telegram.botToken
          : normalizeOptionalString(input.telegram.botToken),
      chatId:
        input.telegram?.chatId === undefined
          ? current.telegram.chatId
          : normalizeOptionalString(input.telegram.chatId),
    },
    smtp: {
      enabled: input.smtp?.enabled ?? current.smtp.enabled,
      host:
        input.smtp?.host === undefined ? current.smtp.host : normalizeOptionalString(input.smtp.host),
      port: input.smtp?.port ?? current.smtp.port,
      secure: input.smtp?.secure ?? current.smtp.secure,
      username:
        input.smtp?.username === undefined
          ? current.smtp.username
          : normalizeOptionalString(input.smtp.username),
      password:
        input.smtp?.password === undefined || input.smtp.password === ""
          ? current.smtp.password
          : normalizeOptionalString(input.smtp.password),
      from:
        input.smtp?.from === undefined ? current.smtp.from : normalizeOptionalString(input.smtp.from),
      recipients: normalizeRecipients(input.smtp?.recipients) ?? current.smtp.recipients,
    },
    cooldownMinutes: input.cooldownMinutes ?? current.cooldownMinutes,
    enabledTypes,
    updatedAt: now,
  }

  await db.execute({
    sql: `update notification_settings set
      telegram_enabled = ?,
      telegram_bot_token = ?,
      telegram_chat_id = ?,
      smtp_enabled = ?,
      smtp_host = ?,
      smtp_port = ?,
      smtp_secure = ?,
      smtp_username = ?,
      smtp_password = ?,
      smtp_from = ?,
      smtp_to = ?,
      smtp_recipients_json = ?,
      cooldown_minutes = ?,
      enabled_types_json = ?,
      updated_at = ?
      where id = ?`,
    args: [
      next.telegram.enabled ? 1 : 0,
      encryptSecret(next.telegram.botToken, config.ENCRYPTION_KEY),
      next.telegram.chatId ?? null,
      next.smtp.enabled ? 1 : 0,
      next.smtp.host ?? null,
      next.smtp.port ?? null,
      next.smtp.secure ? 1 : 0,
      next.smtp.username ?? null,
      encryptSecret(next.smtp.password, config.ENCRYPTION_KEY),
      next.smtp.from ?? null,
      null,
      JSON.stringify(next.smtp.recipients),
      next.cooldownMinutes,
      JSON.stringify(next.enabledTypes),
      next.updatedAt,
      defaultSettingsId,
    ],
  })

  return getPublicNotificationSettings()
}

function buildDeliveryKey(input: {
  channelId?: string
  notificationType: string
  target: NotificationChannel
  targetKey?: string
}) {
  return [
    input.target,
    input.targetKey ?? "default",
    input.channelId ?? "global",
    input.notificationType,
  ].join(":")
}

export async function shouldSendNotification(input: {
  channelId?: string
  notificationType: string
  target: NotificationChannel
  targetKey?: string
  cooldownMinutes: number
}) {
  if (input.cooldownMinutes <= 0) {
    return true
  }

  const key = buildDeliveryKey(input)
  const result = await db.execute({
    sql: "select last_sent_at from notification_delivery_state where unique_key = ?",
    args: [key],
  })
  const row = result.rows[0] as unknown as { last_sent_at?: string } | undefined
  if (!row?.last_sent_at) {
    return true
  }

  const elapsedMs = Date.now() - new Date(row.last_sent_at).getTime()
  return elapsedMs >= input.cooldownMinutes * 60 * 1000
}

export async function markNotificationSent(input: {
  channelId?: string
  notificationType: string
  target: NotificationChannel
  targetKey?: string
}) {
  const key = buildDeliveryKey(input)
  const now = new Date().toISOString()
  await db.execute({
    sql: `insert into notification_delivery_state (
      id, notification_type, channel_id, target, last_sent_at, unique_key
    ) values (?, ?, ?, ?, ?, ?)
    on conflict(unique_key) do update set last_sent_at = excluded.last_sent_at`,
    args: [
      randomUUID(),
      input.notificationType,
      input.channelId ?? null,
      input.target,
      now,
      key,
    ],
  })
}
