import type { NotificationRecord } from "@llm-upstream-monitor/shared"
import { randomUUID } from "node:crypto"
import { db } from "../db.js"
import { deliverNotification } from "../services/notification-dispatcher.js"

type DbNotificationRow = {
  id: string
  channel_id: string | null
  type: string
  title: string
  body: string
  severity: string
  read_at: string | null
  archived_at: string | null
  deleted_at: string | null
  created_at: string
}

export type ListNotificationsInput = {
  includeArchived?: boolean
  limit?: number
  offset?: number
}

function mapNotification(row: DbNotificationRow): NotificationRecord {
  return {
    id: row.id,
    channelId: row.channel_id ?? undefined,
    type: row.type,
    title: row.title,
    body: row.body,
    severity:
      row.severity === "error" || row.severity === "warning" || row.severity === "info"
        ? row.severity
        : "info",
    readAt: row.read_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  }
}

function normalizeDedupeContent(value: string) {
  return value
    .toLowerCase()
    .replace(/\b[0-9a-f]{8,}\b/g, "<id>")
    .replace(/\d{2,}/g, "<number>")
    .replace(/\s+/g, " ")
    .trim()
}

export async function createNotification(input: {
  channelId?: string
  type: string
  title: string
  body: string
  severity: "info" | "warning" | "error"
  metadata?: unknown
  dedupeUnread?: boolean
  dedupeWindowMs?: number
}) {
  const now = new Date().toISOString()
  const dedupeWindowMs = input.dedupeWindowMs ?? 10 * 60 * 1000

  if (input.dedupeUnread || dedupeWindowMs > 0) {
    const since = new Date(Date.now() - dedupeWindowMs).toISOString()
    const normalizedBody = normalizeDedupeContent(input.body)
    const existing = await db.execute({
      sql: `select id, channel_id, type, title, body, severity, read_at,
          archived_at, deleted_at, created_at
        from notifications
        where type = ?
          and severity = ?
          and coalesce(channel_id, '') = coalesce(?, '')
          and deleted_at is null
          and (
            read_at is null
            or created_at >= ?
          )
        order by created_at desc
        limit 10`,
      args: [input.type, input.severity, input.channelId ?? null, since],
    })
    const row = existing.rows.find((item) => {
      const notification = mapNotification(item as unknown as DbNotificationRow)
      return normalizeDedupeContent(notification.body) === normalizedBody
    })
    if (row) {
      return mapNotification(row as unknown as DbNotificationRow)
    }
  }

  const notification: NotificationRecord = {
    id: randomUUID(),
    channelId: input.channelId,
    type: input.type,
    title: input.title,
    body: input.body,
    severity: input.severity,
    createdAt: now,
    readAt: null,
    archivedAt: null,
    deletedAt: null,
  }

  await db.execute({
    sql: `insert into notifications (
      id, channel_id, type, title, body, severity, metadata_json,
      read_at, archived_at, deleted_at, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      notification.id,
      input.channelId ?? null,
      input.type,
      input.title,
      input.body,
      input.severity,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
      null,
      null,
      null,
      now,
    ],
  })

  await deliverNotification(notification)

  return notification
}

export async function listNotifications(input: ListNotificationsInput = {}) {
  const limit = input.limit ?? 50
  const offset = input.offset ?? 0
  const includeArchived = input.includeArchived ?? false
  const result = await db.execute({
    sql: includeArchived
      ? `select id, channel_id, type, title, body, severity, read_at,
          archived_at, deleted_at, created_at
        from notifications
        where deleted_at is null
        order by created_at desc
        limit ? offset ?`
      : `select id, channel_id, type, title, body, severity, read_at,
          archived_at, deleted_at, created_at
        from notifications
        where deleted_at is null
          and archived_at is null
        order by created_at desc
        limit ? offset ?`,
    args: [limit, offset],
  })

  return result.rows.map((row) => mapNotification(row as unknown as DbNotificationRow))
}

export async function markNotificationRead(id: string) {
  const now = new Date().toISOString()
  const result = await db.execute({
    sql: `update notifications
      set read_at = coalesce(read_at, ?)
      where id = ?
        and deleted_at is null`,
    args: [now, id],
  })

  return result.rowsAffected > 0
}

export async function markAllNotificationsRead() {
  const now = new Date().toISOString()
  await db.execute({
    sql: `update notifications
      set read_at = coalesce(read_at, ?)
      where deleted_at is null
        and archived_at is null`,
    args: [now],
  })
}

export async function archiveNotification(id: string) {
  const now = new Date().toISOString()
  const result = await db.execute({
    sql: `update notifications
      set archived_at = coalesce(archived_at, ?)
      where id = ?
        and deleted_at is null`,
    args: [now, id],
  })

  return result.rowsAffected > 0
}

export async function archiveReadNotifications() {
  const now = new Date().toISOString()
  await db.execute({
    sql: `update notifications
      set archived_at = coalesce(archived_at, ?)
      where read_at is not null
        and archived_at is null
        and deleted_at is null`,
    args: [now],
  })
}

export async function deleteNotification(id: string) {
  const now = new Date().toISOString()
  const result = await db.execute({
    sql: `update notifications
      set deleted_at = coalesce(deleted_at, ?)
      where id = ?`,
    args: [now, id],
  })

  return result.rowsAffected > 0
}
