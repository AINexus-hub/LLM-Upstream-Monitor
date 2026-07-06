import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

async function loadModules() {
  vi.resetModules()
  const dir = mkdtempSync(join(tmpdir(), "llm-upstream-monitor-adapters-"))
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`

  const db = await import("../db.js")
  await db.initDatabase()

  return {
    channels: await import("../repositories/channels.js"),
    adapters: await import("./upstream-provider-adapters.js"),
  }
}

describe("upstream provider adapters", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("keeps Sub2API supported and falls back safely for NewAPI account access", async () => {
    const { adapters, channels } = await loadModules()
    const sub2api = await channels.createChannel({
      name: "Sub2API",
      type: "sub2api",
      requestUrl: "https://example.test",
      apiKey: "test-key",
      timeoutSeconds: 1,
      checkIntervalMinutes: 1,
    })
    const sub2apiRow = await channels.getChannel(sub2api.id)
    expect(sub2apiRow && adapters.getUpstreamProviderAdapter(sub2apiRow)?.provider).toBe("sub2api")

    const newapi = await channels.createChannel({
      name: "NewAPI",
      type: "newapi",
      requestUrl: "https://example.test",
      accessToken: "test-token",
      userId: "test-user",
      upstreamAccessToken: "test-upstream-token",
      timeoutSeconds: 1,
      checkIntervalMinutes: 1,
    })
    const record = await adapters.syncUpstreamProvider(newapi.id)

    expect(record?.success).toBe(false)
    expect(record?.errorMessage).toContain("暂不支持 NEWAPI")
  })
})
