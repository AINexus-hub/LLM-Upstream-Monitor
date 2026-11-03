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

  it("reads balance for a NewAPI account template stored with the Sub2API channel type", async () => {
    const { balanceChecker, channels } = await loadModules()
    const channel = await channels.createChannel({
      name: "NewAPI account template",
      type: "sub2api",
      accountTemplate: "newapi",
      requestUrl: "https://example.test",
      accessToken: "test-token",
      userId: "703",
      timeoutSeconds: 1,
      checkIntervalMinutes: 1,
    })
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toContain("/api/user/self")
      const headers = new Headers(init?.headers)
      expect(headers.get("authorization")).toBe("Bearer test-token")
      expect(headers.get("new-api-user")).toBe("703")
      return Response.json({ success: true, data: { quota: 3_051_639, used_quota: 379_869, group: "default" } })
    })
    vi.stubGlobal("fetch", fetchMock)

    const record = await balanceChecker.checkChannelBalance(channel.id)

    expect(record).toMatchObject({
      success: true,
      isValid: true,
      planName: "default",
      remaining: 3_051_639 / 500_000,
      used: 379_869 / 500_000,
      total: (3_051_639 + 379_869) / 500_000,
      unit: "USD",
    })
    expect(fetchMock).toHaveBeenCalledOnce()
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
