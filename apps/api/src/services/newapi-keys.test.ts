import { describe, expect, it, vi } from "vitest"
import type { ChannelRow } from "../types.js"
import { createNewApiKeys, listNewApiGroups } from "./newapi-keys.js"

const channel = {
  id: "channel-1", name: "NewAPI", type: "sub2api", accountTemplate: "newapi",
  requestUrl: "https://newapi.test", officialUrl: null, upstreamLoginUrl: null,
  upstreamUsername: null, upstreamPassword: null, upstreamAccessToken: null,
  upstreamRefreshToken: null, upstreamTokenExpiresAt: null, upstreamLastSyncAt: null,
  upstreamLastSyncError: null, rechargeRate: 1, alertThreshold: null,
  balanceAlertEnabled: true, balanceCheckEnabled: true, groupChangeAlertEnabled: true,
  groupRateAlertEnabled: true, accessToken: "access-secret", userId: "42", apiKey: null,
  timeoutSeconds: 10, checkIntervalMinutes: 5, createdAt: "", updatedAt: "",
} as ChannelRow

describe("NewAPI key management", () => {
  it("loads groups with the configured access token and user id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === "/api/user/self/groups") {
        return Response.json({ success: true, data: { vip: { ratio: 0.1, desc: "VIP" }, default: { ratio: 1, desc: "Default" } } })
      }
      if (url.pathname === "/api/pricing") {
        return Response.json({ success: true, vendors: [{ id: 1, name: "OpenAI" }], data: [{ vendor_id: 1, enable_groups: ["vip"] }] })
      }
      throw new Error(`unexpected request ${url}`)
    })
    try {
      const groups = await listNewApiGroups(channel)
      expect(groups.map((group) => group.name)).toEqual(["default", "vip"])
      expect(groups).toContainEqual({ id: "vip", name: "vip", platforms: ["OpenAI"], platform: "OpenAI", rateMultiplier: 0.1 })
      const groupCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/api/user/self/groups"))
      expect(String(groupCall?.[0])).toContain("/api/user/self/groups")
      const headers = new Headers(groupCall?.[1]?.headers)
      expect(headers.get("authorization")).toBe("Bearer access-secret")
      expect(headers.get("new-api-user")).toBe("42")
    } finally {
      fetchMock.mockRestore()
    }
  })

  it("creates a token for the selected group and fetches its full key", async () => {
    const createdBodies: Record<string, unknown>[] = []
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input))
      if (url.pathname === "/api/user/self/groups") return Response.json({ success: true, data: { vip: { ratio: 0.1 } } })
      if (url.pathname === "/api/pricing") return Response.json({ success: true, vendors: [{ id: 1, name: "OpenAI" }], data: [{ vendor_id: 1, enable_groups: ["vip"] }] })
      if (url.pathname === "/api/token/" && init?.method === "GET") {
        const items = createdBodies.map((body, index) => ({ id: index + 10, name: body.name, created_time: index + 1 }))
        return Response.json({ success: true, data: { items, total: items.length } })
      }
      if (url.pathname === "/api/token/" && init?.method === "POST") {
        createdBodies.push(JSON.parse(String(init.body)))
        return Response.json({ success: true })
      }
      if (url.pathname === "/api/token/10/key") return Response.json({ success: true, data: { key: "sk-full-secret" } })
      throw new Error(`unexpected request ${url} ${init?.method}`)
    })
    try {
      const result = await createNewApiKeys(channel, { groupIds: ["vip"], quota: 2 })
      expect(createdBodies[0]).toMatchObject({ name: "010vip", group: "vip", remain_quota: 1_000_000, unlimited_quota: false, expired_time: -1 })
      expect(result).toEqual([{ groupId: "vip", groupName: "vip", name: "010vip", success: true, key: "sk-full-secret" }])
    } finally {
      fetchMock.mockRestore()
    }
  })
})
