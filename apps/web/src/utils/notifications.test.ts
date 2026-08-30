import type { NotificationRecord, PublicChannel } from "@llm-upstream-monitor/shared"
import { describe, expect, it } from "vitest"
import {
  buildNotifications,
  isBalanceAlerting,
  mergeNotifications,
  notificationMatchesType,
} from "./notifications"

function channel(overrides: Partial<PublicChannel>): PublicChannel {
  return {
    id: "channel-a",
    name: "Channel A",
    type: "sub2api",
    requestUrl: "https://example.test",
    rechargeRate: 1,
    balanceAlertEnabled: true,
    balanceCheckEnabled: true,
    groupChangeAlertEnabled: true,
    groupRateAlertEnabled: true,
    timeoutSeconds: 1,
    checkIntervalMinutes: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    hasAccessToken: false,
    hasApiKey: true,
    hasUpstreamPassword: false,
    hasUpstreamAccessToken: false,
    hasUpstreamRefreshToken: false,
    ...overrides,
  }
}

describe("notification utilities", () => {
  it("builds balance alerts only when enabled and under threshold", () => {
    const alerting = channel({
      alertThreshold: 10,
      lastCheck: {
        id: "check-a",
        channelId: "channel-a",
        checkedAt: "2026-01-01T00:00:00.000Z",
        success: true,
        isValid: true,
        remaining: 5,
        unit: "USD",
      },
    })

    expect(isBalanceAlerting(alerting)).toBe(true)
    expect(buildNotifications([alerting])).toHaveLength(1)
    expect(buildNotifications([channel({ ...alerting, balanceAlertEnabled: false })])).toHaveLength(0)
  })

  it("merges station and local notifications without duplicated channel/type/body", () => {
    const station: NotificationRecord = {
      id: "station",
      channelId: "channel-a",
      type: "upstream_sync_failed",
      title: "上游同步失败",
      body: "timeout",
      severity: "error",
      createdAt: "2026-01-01T00:00:00.000Z",
      readAt: null,
    }
    const merged = mergeNotifications(
      [station],
      [
        {
          ...station,
          id: "local",
          channelId: "channel-a",
          readAt: null,
          archivedAt: null,
          deletedAt: null,
        },
      ],
    )

    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe("station")
  })

  it("matches grouped notification type filters", () => {
    expect(notificationMatchesType("upstream_group_added", "group_change")).toBe(true)
    expect(notificationMatchesType("upstream_group_removed", "group_change")).toBe(true)
    expect(notificationMatchesType("upstream_group_rate_changed", "group_rate")).toBe(true)
    expect(notificationMatchesType("check_failed", "group_rate")).toBe(false)
  })
})
