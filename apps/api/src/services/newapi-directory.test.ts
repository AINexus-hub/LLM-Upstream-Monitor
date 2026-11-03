import { generateKeyPairSync, privateDecrypt } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import type { ChannelRow } from "../types.js"
import { encryptNewApiPassword, readNewApiDirectory } from "./newapi-directory.js"

function channel(overrides: Partial<ChannelRow> = {}): ChannelRow {
  return {
    id: "channel-1", name: "NewAPI", type: "sub2api", accountTemplate: "newapi",
    requestUrl: "https://newapi.test", officialUrl: null, upstreamLoginUrl: null,
    upstreamUsername: "root", upstreamPassword: "test-password", upstreamAccessToken: null,
    upstreamRefreshToken: null, upstreamTokenExpiresAt: null, upstreamLastSyncAt: null,
    upstreamLastSyncError: null, rechargeRate: 1, alertThreshold: null,
    balanceAlertEnabled: true, balanceCheckEnabled: true, groupChangeAlertEnabled: true,
    groupRateAlertEnabled: true, accessToken: null, userId: null, apiKey: null,
    timeoutSeconds: 10, checkIntervalMinutes: 5, createdAt: "", updatedAt: "", ...overrides,
  }
}

describe("NewAPI account directory", () => {
  it("encrypts login password and returns only read-only directory data", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
    const publicPEM = publicKey.export({ type: "spki", format: "pem" }).toString()
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/encryption-key")) {
        return Response.json({ enabled: true, kid: "kid-1", public_key: publicPEM })
      }
      if (url.pathname.endsWith("/login")) {
        const body = JSON.parse(String(init?.body))
        expect(body.username).toBe("root")
        expect(body.password).toBeUndefined()
        expect(privateDecrypt({ key: privateKey, oaepHash: "sha256" }, Buffer.from(body.password_encrypted, "base64")).toString()).toBe("test-password")
        return Response.json({ success: true, data: { access_token: "secret-session", user: { role: 100 } } })
      }
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret-session")
      if (url.pathname === "/api/group/") return Response.json({ success: true, data: ["default", "vip"] })
      if (url.pathname === "/api/user/") return Response.json({ success: true, data: { items: [
        { id: 3, username: "alice", display_name: "Alice", group: "vip", status: 1, role: 1 },
      ], total: 1 } })
      if (url.pathname === "/api/token/") return Response.json({ success: true, data: { items: [
        { id: 8, name: "admin key", key: "abcd********wxyz", status: 1, expired_time: -1 },
      ] } })
      throw new Error(`unexpected request ${url}`)
    })
    try {
      const result = await readNewApiDirectory(channel())
      expect(result.groups.map((item) => item.name)).toEqual(["default", "vip"])
      expect(result.accounts[0]).toMatchObject({ username: "alice", group: "vip", status: "active", role: 1 })
      expect(result.tokenStatus.scope).toBe("current_admin_only")
      expect(result.tokenStatus.items[0]?.maskedKey).toBe("abcd********wxyz")
      expect(JSON.stringify(result)).not.toContain("secret-session")
    } finally {
      fetchMock.mockRestore()
    }
  })

  it("refreshes a NewAPI session cookie and sends the rotated session id", async () => {
    const db = await import("../db.js")
    await db.initDatabase()
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input))
      const headers = new Headers(init?.headers)
      if (url.pathname.endsWith("/auth/refresh")) {
        expect(headers.get("cookie")).toBe("new_api_refresh=session-id.old-secret")
        expect(headers.get("x-auth-session")).toBe("session-id")
        expect(headers.get("origin")).toBe("https://newapi.test")
        return Response.json(
          { success: true, data: { access_token: "refreshed-access", user: { role: 100 } } },
          { headers: { "set-cookie": "new_api_refresh=session-id.next-secret; Path=/api/user/auth; HttpOnly" } },
        )
      }
      expect(headers.get("authorization")).toBe("Bearer refreshed-access")
      if (url.pathname === "/api/group/") return Response.json({ success: true, data: [] })
      if (url.pathname === "/api/user/") return Response.json({ success: true, data: { items: [], total: 0 } })
      if (url.pathname === "/api/token/") return Response.json({ success: true, data: { items: [] } })
      throw new Error(`unexpected request ${url}`)
    })
    try {
      await readNewApiDirectory(channel({ upstreamRefreshToken: "new_api_refresh=session-id.old-secret; Path=/api/user/auth; HttpOnly" }))
      expect(fetchMock).toHaveBeenCalledTimes(4)
    } finally {
      fetchMock.mockRestore()
    }
  })

  it("supports the long-password v2 envelope", () => {
    const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
    const encrypted = encryptNewApiPassword("very-long-password-".repeat(20), publicKey.export({ type: "spki", format: "pem" }).toString(), "kid")
    expect(encrypted.split(".")[0]).toBe("v2")
  })
})
