import type { NotificationRecord, PublicChannel } from "@llm-upstream-monitor/shared"
import { formatAdjustedBalance, formatAmount, getAdjustedRemaining } from "./format"

export type NotificationSeverityFilter = "all" | NotificationRecord["severity"]
export type NotificationTypeFilter =
  | "all"
  | "balance_alert"
  | "check_failed"
  | "upstream_sync_failed"
  | "group_change"
  | "group_rate"

export type LocalNotification = NotificationRecord & {
  channelId: string
}

export function hasUpstreamLogin(channel: PublicChannel) {
  return (
    channel.accountTemplate === "newapi" ||
    channel.hasUpstreamRefreshToken ||
    channel.hasUpstreamAccessToken ||
    channel.hasUpstreamPassword
  )
}

export function isBalanceAlerting(channel: PublicChannel) {
  const threshold = channel.alertThreshold
  const adjustedRemaining = getAdjustedRemaining(channel)

  return (
    channel.balanceAlertEnabled &&
    threshold != null &&
    adjustedRemaining !== undefined &&
    adjustedRemaining <= threshold
  )
}

export function buildNotifications(channels: PublicChannel[]): LocalNotification[] {
  return channels
    .filter(
      (channel) =>
        isBalanceAlerting(channel) ||
        (hasUpstreamLogin(channel)
          ? Boolean(channel.upstreamLastSyncError)
          : channel.lastCheck?.success === false),
    )
    .map((channel) => {
      if (hasUpstreamLogin(channel) && channel.upstreamLastSyncError) {
        return {
          id: `${channel.id}-upstream-sync-failed`,
          channelId: channel.id,
          title: `${channel.name} 上游同步失败`,
          body: channel.upstreamLastSyncError,
          type: "upstream_sync_failed",
          severity: "error" as const,
          createdAt: channel.upstreamLastSyncAt ?? channel.updatedAt,
          readAt: null,
          archivedAt: null,
          deletedAt: null,
        }
      }

      if (!hasUpstreamLogin(channel) && channel.lastCheck?.success === false) {
        return {
          id: `${channel.id}-check-failed`,
          channelId: channel.id,
          title: `${channel.name} 检测失败`,
          body: channel.lastCheck.errorMessage ?? "最近一次余额检测未成功。",
          type: "check_failed",
          severity: "error" as const,
          createdAt: channel.lastCheck.checkedAt,
          readAt: null,
          archivedAt: null,
          deletedAt: null,
        }
      }

      return {
        id: `${channel.id}-balance-alert`,
        channelId: channel.id,
        title: `${channel.name} 余额告警`,
        body: `折算余额 ${formatAdjustedBalance(channel)}，已低于阈值 ${formatAmount(channel.alertThreshold ?? undefined, channel.lastCheck?.unit ?? "USD")}。`,
        type: "balance_alert",
        severity: "warning" as const,
        createdAt: channel.lastCheck?.checkedAt ?? channel.updatedAt,
        readAt: null,
        archivedAt: null,
        deletedAt: null,
      }
    })
}

export function mergeNotifications(
  stationNotifications: NotificationRecord[],
  localNotifications: LocalNotification[],
): NotificationRecord[] {
  const normalizedStation: NotificationRecord[] = stationNotifications.map((notification) => ({
    id: notification.id,
    channelId: notification.channelId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    severity: notification.severity,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
    archivedAt: notification.archivedAt,
    deletedAt: notification.deletedAt,
  }))

  const dedupedNotifications = new Map<string, NotificationRecord>()
  for (const notification of [...normalizedStation, ...localNotifications]) {
    const key = [
      notification.channelId ?? "",
      notification.type,
      notification.body,
    ].join("|")
    if (!dedupedNotifications.has(key)) {
      dedupedNotifications.set(key, notification)
    }
  }

  return Array.from(dedupedNotifications.values()).sort(
    (left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime(),
  )
}

export function notificationMatchesType(type: string, filter: NotificationTypeFilter) {
  if (filter === "group_change") {
    return type === "upstream_group_added" || type === "upstream_group_removed"
  }

  if (filter === "group_rate") {
    return type === "upstream_group_rate_changed"
  }

  return type === filter
}
