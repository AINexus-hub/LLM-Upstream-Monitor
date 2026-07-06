import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

async function loadModules() {
  vi.resetModules()
  const dir = mkdtempSync(join(tmpdir(), "llm-upstream-monitor-balance-checker-"))
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`

  const db = await import("../db.js")
  await db.initDatabase()

  return {
    channels: await import("../repositories/channels.js"),
    balanceChecker: await import("./balance-checker.js"),
  }
}

describe("balance checker", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("does not treat a NewAPI success envelope without data as a zero balance", async () => {
    const { balanceChecker, channels } = await loadModules()
    const channel = await channels.createChannel({
      name: "NewAPI Missing Data",
      type: "newapi",
      requestUrl: "https://example.test",
      accessToken: "test-token",
      userId: "test-user",
      timeoutSeconds: 1,
      checkIntervalMinutes: 1,
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    )

    const record = await balanceChecker.checkChannelBalance(channel.id)

    expect(record).toMatchObject({
      success: false,
      isValid: false,
      errorMessage: "查询失败",
    })
    expect(record?.remaining).toBeUndefined()
  })
})
