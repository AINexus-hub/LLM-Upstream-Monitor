import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

async function loadRepository() {
  vi.resetModules()
  const dir = mkdtempSync(join(tmpdir(), "llm-upstream-monitor-notification-settings-"))
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`

  const db = await import("../db.js")
  await db.initDatabase()

  return import("./notification-settings.js")
}

describe("notification settings repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("saves settings and preserves secrets when updates submit empty values", async () => {
    const settings = await loadRepository()
    await settings.updateNotificationSettings({
      telegram: {
        enabled: true,
        botToken: "telegram-token",
        chatId: "chat-a",
      },
      smtp: {
        enabled: true,
        host: "smtp.example.test",
        port: 465,
        secure: true,
        username: "monitor",
        password: "smtp-password",
        from: "monitor@example.test",
        recipients: [
          {
            id: "ops",
            email: "ops@example.test",
            enabledTypes: ["check_failed"],
          },
          {
            id: "finance",
            email: "finance@example.test",
            enabledTypes: ["balance_alert"],
          },
        ],
      },
      cooldownMinutes: 20,
      enabledTypes: ["check_failed"],
    })

    const updated = await settings.updateNotificationSettings({
      telegram: {
        botToken: "",
        chatId: "chat-b",
      },
      smtp: {
        password: "",
      },
    })
    const internal = await settings.getNotificationSettings()

    expect(updated.telegram).toMatchObject({
      enabled: true,
      chatId: "chat-b",
      hasBotToken: true,
    })
    expect(updated.smtp.hasPassword).toBe(true)
    expect(updated.smtp.recipients).toHaveLength(2)
    expect(internal.telegram.botToken).toBe("telegram-token")
    expect(internal.smtp.password).toBe("smtp-password")
    expect(internal.smtp.recipients[0]).toMatchObject({
      id: "ops",
      email: "ops@example.test",
      enabledTypes: ["check_failed"],
    })
    expect(internal.enabledTypes).toEqual(["check_failed"])
  })

  it("tracks cooldown state per channel, type and recipient target", async () => {
    const settings = await loadRepository()
    const input = {
      channelId: "channel-a",
      notificationType: "check_failed",
      target: "smtp" as const,
      targetKey: "ops",
      cooldownMinutes: 30,
    }

    expect(await settings.shouldSendNotification(input)).toBe(true)
    await settings.markNotificationSent(input)
    expect(await settings.shouldSendNotification(input)).toBe(false)
    expect(
      await settings.shouldSendNotification({
        ...input,
        targetKey: "finance",
      }),
    ).toBe(true)
  })
})
