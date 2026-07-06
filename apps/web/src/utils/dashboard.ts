import type { PublicChannel } from "@llm-upstream-monitor/shared"
import type { ChecksByChannel } from "@/types/app"
import { formatAdjustedBalance, getAdjustedRemaining } from "./format"
import { isBalanceAlerting } from "./notifications"

export function buildInsights(channels: PublicChannel[], checksByChannel: ChecksByChannel) {
  const alertingChannels = channels.filter(isBalanceAlerting)
  const healthyChannels = channels.filter((channel) => channel.lastCheck?.success)
  const channelsWithChecks = channels.filter((channel) => (checksByChannel[channel.id] ?? []).length > 0)
  const lowestChannel = channels
    .filter((channel) => getAdjustedRemaining(channel) !== undefined)
    .sort((left, right) => (getAdjustedRemaining(left) ?? 0) - (getAdjustedRemaining(right) ?? 0))[0]

  const recentCutoff = Date.now() - 24 * 60 * 60 * 1000
  const recentChecks = Object.values(checksByChannel)
    .flat()
    .filter((check) => new Date(check.checkedAt).getTime() >= recentCutoff)

  const failedChecks = recentChecks.filter((check) => !check.success)

  return {
    alertCount: alertingChannels.length,
    healthyCount: healthyChannels.length,
    coverageText: `${channelsWithChecks.length}/${channels.length}`,
    failedChecks24h: failedChecks.length,
    lowestBalanceText: lowestChannel
      ? `${lowestChannel.name} ${formatAdjustedBalance(lowestChannel)}`
      : "-",
    recentChecksCount: recentChecks.length,
  }
}

export type DashboardInsights = ReturnType<typeof buildInsights>

export function statusLabel(channel: PublicChannel) {
  if (!channel.lastCheck) {
    return "未检测"
  }

  return channel.lastCheck.success ? "正常" : "失败"
}
