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

  const authHeaders = {
    authorization: "Bearer llm-monitor",
  }

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
      headers: authHeaders,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body) as { data: Array<{ id: string }> }
    expect(body.data.map((item) => item.id)).toEqual([visible.id])
  })

  it("clears upstream login state when switching back to simple setup", async () => {
    const { app } = await loadApp()
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/channels",
      headers: authHeaders,
      payload: {
        name: "Sub2API",
        type: "sub2api",
        requestUrl: "https://api.example.com",
        upstreamLoginUrl: "https://api.example.com/login",
        upstreamUsername: "user@example.com",
        upstreamPassword: "password",
        upstreamAccessToken: "access-token",
        upstreamRefreshToken: "refresh-token",
        upstreamTokenExpiresAt: "2026-07-08T12:00:00.000Z",
        apiKey: "sk-test",
        timeoutSeconds: 30,
        checkIntervalMinutes: 60,
      },
    })

    expect(createResponse.statusCode).toBe(200)
    const created = JSON.parse(createResponse.body) as { data: { id: string } }

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/channels/${created.data.id}`,
      headers: authHeaders,
      payload: {
        name: "Sub2API",
        type: "sub2api",
        requestUrl: "https://api.example.com",
        upstreamLoginUrl: null,
        upstreamUsername: null,
        upstreamTokenExpiresAt: null,
        clearUpstreamSession: true,
        timeoutSeconds: 30,
        checkIntervalMinutes: 60,
      },
    })

    expect(updateResponse.statusCode).toBe(200)
    const updated = JSON.parse(updateResponse.body) as {
      data: {
        hasUpstreamAccessToken: boolean
        hasUpstreamPassword: boolean
        hasUpstreamRefreshToken: boolean
        upstreamLoginUrl?: string
        upstreamUsername?: string
        upstreamTokenExpiresAt?: string
      }
    }
    expect(updated.data.hasUpstreamAccessToken).toBe(false)
    expect(updated.data.hasUpstreamPassword).toBe(false)
    expect(updated.data.hasUpstreamRefreshToken).toBe(false)
    expect(updated.data.upstreamLoginUrl).toBeUndefined()
    expect(updated.data.upstreamUsername).toBeUndefined()
    expect(updated.data.upstreamTokenExpiresAt).toBeUndefined()
  })

  it("allows a Sub2API account with only a refresh token", async () => {
    const { app } = await loadApp()
    const response = await app.inject({
      method: "POST",
      url: "/api/channels",
      headers: authHeaders,
      payload: {
        name: "Sub2API account",
        type: "sub2api",
        accountTemplate: "sub2api",
        requestUrl: "https://sub2api.example.com",
        upstreamRefreshToken: "refresh-token",
        timeoutSeconds: 30,
        checkIntervalMinutes: 60,
      },
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body).data.hasUpstreamRefreshToken).toBe(true)
  })

  it("still requires credentials for a Sub2API channel", async () => {
    const { app } = await loadApp()
    const response = await app.inject({
      method: "POST",
      url: "/api/channels",
      headers: authHeaders,
      payload: {
        name: "Sub2API account",
        type: "sub2api",
        accountTemplate: "sub2api",
        requestUrl: "https://sub2api.example.com",
        timeoutSeconds: 30,
        checkIntervalMinutes: 60,
      },
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ["apiKey"] })]),
    )
  })

  it("persists the independent NewAPI account template", async () => {
    const { app } = await loadApp()
    const response = await app.inject({
      method: "POST",
      url: "/api/channels",
      headers: authHeaders,
      payload: {
        name: "NewAPI Admin",
        type: "sub2api",
        accountTemplate: "newapi",
        requestUrl: "https://newapi.example.com",
        accessToken: "api-access-token",
        userId: "1",
        timeoutSeconds: 30,
        checkIntervalMinutes: 60,
      },
    })
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body).data.accountTemplate).toBe("newapi")
  })

  it("reveals an existing NewAPI token only through the authenticated key endpoint", async () => {
    const { app } = await loadApp()
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/channels",
      headers: authHeaders,
      payload: {
        name: "NewAPI Admin",
        type: "sub2api",
        accountTemplate: "newapi",
        requestUrl: "https://newapi.example.com",
        accessToken: "access-token",
        userId: "42",
        timeoutSeconds: 30,
        checkIntervalMinutes: 60,
      },
    })
    const channelId = JSON.parse(createResponse.body).data.id as string
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true, data: { key: "sk-existing-secret" } }),
    )
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/channels/${channelId}/upstream-keys/123`,
        headers: authHeaders,
      })
      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual({ data: { key: "sk-existing-secret" } })
      expect(fetchMock).toHaveBeenCalledWith(
        "https://newapi.example.com/api/token/123/key",
        expect.objectContaining({ method: "POST" }),
      )
      const unauthorized = await app.inject({ method: "GET", url: `/api/channels/${channelId}/upstream-keys/123` })
      expect(unauthorized.statusCode).toBe(401)
    } finally {
      fetchMock.mockRestore()
    }
  })

  it("rejects invalid upstream key payloads before calling upstream", async () => {
    const { app } = await loadApp()
    const response = await app.inject({
      method: "POST",
      url: "/api/channels/missing/upstream-keys",
      headers: authHeaders,
      payload: { groupIds: [] },
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).message).toBe("密钥参数无效")
  })

  it("deletes a channel", async () => {
    const { app } = await loadApp()
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/channels",
      headers: authHeaders,
      payload: {
        name: "NewAPI",
        type: "newapi",
        requestUrl: "https://newapi.example.com",
        accessToken: "token",
        userId: "1",
        timeoutSeconds: 30,
        checkIntervalMinutes: 60,
      },
    })

    expect(createResponse.statusCode).toBe(200)
    const created = JSON.parse(createResponse.body) as { data: { id: string } }

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/channels/${created.data.id}`,
      headers: authHeaders,
    })

    expect(deleteResponse.statusCode).toBe(200)
    expect(JSON.parse(deleteResponse.body)).toEqual({ data: { ok: true } })

    const getResponse = await app.inject({
      method: "GET",
      url: `/api/channels/${created.data.id}`,
      headers: authHeaders,
    })
    expect(getResponse.statusCode).toBe(404)

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/channels",
      headers: authHeaders,
    })
    const body = JSON.parse(listResponse.body) as { data: Array<{ id: string }> }
    expect(body.data).toEqual([])
  })

  it("persists a disabled balance check flag", async () => {
    const { app } = await loadApp()
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/channels",
      headers: authHeaders,
      payload: {
        name: "Toggle Test",
        type: "sub2api",
        requestUrl: "https://example.com",
        apiKey: "test-key",
        timeoutSeconds: 30,
        checkIntervalMinutes: 5,
      },
    })
    const created = JSON.parse(createResponse.body) as { data: { id: string } }

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/channels/${created.data.id}`,
      headers: authHeaders,
      payload: { balanceCheckEnabled: false },
    })

    expect(updateResponse.statusCode).toBe(200)
    expect(JSON.parse(updateResponse.body).data.balanceCheckEnabled).toBe(false)
  })
})
