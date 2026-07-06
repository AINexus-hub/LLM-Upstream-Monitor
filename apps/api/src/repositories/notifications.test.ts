import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

async function loadRepositories() {
  vi.resetModules()
  const dir = mkdtempSync(join(tmpdir(), "llm-upstream-monitor-notifications-"))
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`

  const db = await import("../db.js")
  await db.initDatabase()

  return import("./notifications.js")
}

describe("notifications repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("supports pagination, read, archive and delete", async () => {
    const notifications = await loadRepositories()
    const first = await notifications.createNotification({
      type: "balance_alert",
      title: "余额告警",
      body: "余额低于阈值",
      severity: "warning",
    })
    const second = await notifications.createNotification({
      type: "check_failed",
      title: "检测失败",
      body: "HTTP 500",
      severity: "error",
    })

    expect(await notifications.listNotifications({ limit: 1, offset: 0 })).toHaveLength(1)
    expect(await notifications.markNotificationRead(first.id)).toBe(true)
    expect((await notifications.listNotifications({ limit: 10 })).find((item) => item.id === first.id)?.readAt).toBeTruthy()

    expect(await notifications.archiveNotification(first.id)).toBe(true)
    expect((await notifications.listNotifications({ limit: 10 })).map((item) => item.id)).toEqual([second.id])
    expect((await notifications.listNotifications({ includeArchived: true, limit: 10 })).map((item) => item.id)).toContain(first.id)

    expect(await notifications.deleteNotification(second.id)).toBe(true)
    expect(await notifications.listNotifications({ includeArchived: true, limit: 10 })).toHaveLength(1)
  })

  it("marks all visible notifications read and archives read notifications", async () => {
    const notifications = await loadRepositories()
    const unread = await notifications.createNotification({
      type: "balance_alert",
      title: "余额告警",
      body: "余额低于阈值",
      severity: "warning",
    })
    const read = await notifications.createNotification({
      type: "check_failed",
      title: "检测失败",
      body: "HTTP 500",
      severity: "error",
    })

    await notifications.markNotificationRead(read.id)
    await notifications.markAllNotificationsRead()
    const visible = await notifications.listNotifications({ limit: 10 })
    expect(visible.every((notification) => notification.readAt)).toBe(true)

    await notifications.archiveReadNotifications()
    expect(await notifications.listNotifications({ limit: 10 })).toHaveLength(0)
    expect((await notifications.listNotifications({ includeArchived: true, limit: 10 })).map((item) => item.id)).toEqual([
      read.id,
      unread.id,
    ])
  })

  it("deduplicates equivalent notifications inside a time window", async () => {
    const notifications = await loadRepositories()
    const first = await notifications.createNotification({
      type: "upstream_sync_failed",
      title: "上游同步失败",
      body: "HTTP 500 request 123456 failed",
      severity: "error",
      dedupeWindowMs: 60_000,
    })
    const second = await notifications.createNotification({
      type: "upstream_sync_failed",
      title: "上游同步失败",
      body: "http 500 request 999999 failed",
      severity: "error",
      dedupeWindowMs: 60_000,
    })
    const different = await notifications.createNotification({
      type: "upstream_sync_failed",
      title: "上游同步失败",
      body: "HTTP 401 invalid key",
      severity: "error",
      dedupeWindowMs: 60_000,
    })

    expect(second.id).toBe(first.id)
    expect(different.id).not.toBe(first.id)
    expect(await notifications.listNotifications({ limit: 10 })).toHaveLength(2)
  })
})
