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
    upstreamAccounts: await import("./upstream-accounts.js"),
  }
}

describe("upstream provider adapters", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("reads an existing Sub2API key from its paginated key list", async () => {
    const { adapters, channels } = await loadModules()
    const sub2api = await channels.createChannel({
      name: "Sub2API",
      type: "sub2api",
      accountTemplate: "sub2api",
      requestUrl: "https://example.test",
      upstreamAccessToken: "session-token",
      upstreamTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      timeoutSeconds: 10,
      checkIntervalMinutes: 5,
    })
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      data: {
        items: [
          { id: 23, name: "existing key", key: "sk-sub2api-existing-secret" },
        ],
        total: 1,
      },
    }))
    try {
      await expect(adapters.revealUpstreamApiKey(sub2api.id, "23")).resolves.toBe("sk-sub2api-existing-secret")
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://example.test/api/v1/keys?page=1&page_size=100")
      expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer session-token")
    } finally {
      fetchMock.mockRestore()
    }
  })

  it("supports Sub2API and validates NewAPI administrator login during sync", async () => {
    const { adapters, channels, upstreamAccounts } = await loadModules()
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
      type: "sub2api",
      accountTemplate: "newapi",
      requestUrl: "https://example.test",
      accessToken: "newapi-token",
      userId: "1",
      timeoutSeconds: 1,
      checkIntervalMinutes: 1,
    })
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === "/api/user/self") {
        return Response.json({ success: true, data: { quota: 1_000_000, used_quota: 250_000, group: "default" } })
      }
      if (url.pathname === "/api/user/self/groups") return Response.json({ success: true, data: { default: { ratio: 1 } } })
      if (url.pathname === "/api/pricing") {
        return Response.json({
          success: true,
          vendors: [{ id: 6, name: "DeepSeek" }],
          data: [{ vendor_id: 6, enable_groups: ["default"] }],
        })
      }
      if (url.pathname === "/api/token/") return Response.json({ success: true, data: { items: [
        { id: 17, name: "existing key", key: "sk-test********abcd", group: "default", status: 1 },
      ], total: 1 } })
      throw new Error(`unexpected request ${url}`)
    })
    const record = await adapters.syncUpstreamProvider(newapi.id)
    expect(record?.success, record?.errorMessage).toBe(true)
    expect(record).toMatchObject({ remaining: 2, used: 0.5, total: 2.5, unit: "USD" })

    const snapshot = await upstreamAccounts.refreshUpstreamAccountSnapshot(newapi.id)
    expect(snapshot?.summary.metrics.balance).toBe(2)
    expect(snapshot?.summary.metrics.apiKeyCount).toBe(1)
    expect(snapshot?.summary.apiKeys).toContainEqual(expect.objectContaining({
      id: "17", name: "existing key", keyPreview: "sk-test********abcd", groupName: "default",
    }))
    expect(JSON.stringify(snapshot?.summary)).not.toContain("sk-test-full-secret")
    expect(snapshot?.summary.groups).toContainEqual({
      id: "default",
      name: "default",
      platform: "DeepSeek",
      platforms: ["DeepSeek"],
      rateMultiplier: 1,
    })

    fetchMock.mockResolvedValue(Response.json({ success: false, message: "invalid token" }, { status: 401 }))
    const failed = await adapters.syncUpstreamProvider(newapi.id)
    expect(failed?.success).toBe(false)
    expect(failed?.errorMessage).toContain("invalid token")
  })
})
