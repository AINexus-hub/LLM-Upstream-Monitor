import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

async function loadApp() {
  vi.resetModules()
  const dir = mkdtempSync(join(tmpdir(), "llm-upstream-monitor-routes-"))
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`

  const db = await import("../db.js")
  await db.initDatabase()

  return {
    app: (await import("../app.js")).createApp(),
    notifications: await import("../repositories/notifications.js"),
  }
}

describe("channel routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("parses includeArchived=false as false", async () => {
    const { app, notifications } = await loadApp()
    const visible = await notifications.createNotification({
      type: "balance_alert",
      title: "余额告警",
      body: "余额低于阈值",
      severity: "warning",
    })
    const archived = await notifications.createNotification({
      type: "check_failed",
      title: "检测失败",
      body: "HTTP 500",
      severity: "error",
    })
    await notifications.archiveNotification(archived.id)

    const response = await app.inject({
      method: "GET",
      url: "/api/notifications?includeArchived=false&limit=10",
      headers: {
        authorization: "Bearer IC49xgfi0AGHcE9wzXoPNs4TfbPqvZQG",
      },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body) as { data: Array<{ id: string }> }
    expect(body.data.map((item) => item.id)).toEqual([visible.id])
  })
})
