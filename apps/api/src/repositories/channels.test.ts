import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

async function loadRepositories() {
  vi.resetModules()
  const dir = mkdtempSync(join(tmpdir(), "llm-upstream-monitor-channels-"))
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`

  const db = await import("../db.js")
  await db.initDatabase()

  return import("./channels.js")
}

describe("channels repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("persists alert toggles and reloads them with public channel data", async () => {
    const channels = await loadRepositories()
    const channel = await channels.createChannel({
      name: "Alert Toggle Channel",
      type: "sub2api",
      requestUrl: "https://example.test",
      apiKey: "test-key",
      timeoutSeconds: 1,
      checkIntervalMinutes: 1,
      balanceAlertEnabled: false,
      groupChangeAlertEnabled: false,
      groupRateAlertEnabled: true,
    })

    expect(channel.balanceAlertEnabled).toBe(false)
    expect(channel.groupChangeAlertEnabled).toBe(false)
    expect(channel.groupRateAlertEnabled).toBe(true)

    await channels.updateChannel(channel.id, {
      balanceAlertEnabled: true,
      groupChangeAlertEnabled: true,
      groupRateAlertEnabled: false,
    })

    const reloaded = await channels.getPublicChannel(channel.id)
    expect(reloaded).toMatchObject({
      balanceAlertEnabled: true,
      groupChangeAlertEnabled: true,
      groupRateAlertEnabled: false,
    })
  })
})
