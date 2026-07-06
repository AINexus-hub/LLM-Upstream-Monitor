import type { BalanceCheckRecord, PublicChannel } from "@llm-upstream-monitor/shared"

export function formatDateTime(value?: string | null) {
  if (!value || value === "local") {
    return "-"
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function formatBalance(record?: BalanceCheckRecord) {
  if (!record || record.remaining === undefined) {
    return "-"
  }

  return `${record.remaining.toFixed(2)} ${record.unit ?? "USD"}`
}

export function formatAmount(value?: number, unit = "USD") {
  if (value === undefined) {
    return "-"
  }

  return `${value.toFixed(2)} ${unit}`
}

export function formatAdjustedBalance(channel: PublicChannel) {
  return formatAmount(getAdjustedRemaining(channel), channel.lastCheck?.unit ?? "USD")
}

export function getAdjustedRemaining(channel: PublicChannel) {
  if (channel.lastCheck?.remaining === undefined) {
    return undefined
  }

  return channel.lastCheck.remaining / (channel.rechargeRate || 1)
}

export function formatMaybeNumber(value?: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return "-"
  }

  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatCompactNumber(value?: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return "-"
  }

  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) {
    return `${trimNumber(value / 1_000_000_000, 2)}B`
  }
  if (abs >= 1_000_000) {
    return `${trimNumber(value / 1_000_000, 2)}M`
  }
  if (abs >= 1_000) {
    return `${trimNumber(value / 1_000, 2)}K`
  }

  return formatMaybeNumber(value)
}

export function formatDurationMs(value?: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return "-"
  }

  if (Math.abs(value) >= 1000) {
    return `${trimNumber(value / 1000, 2)}s`
  }

  return `${Math.round(value)}ms`
}

export function trimNumber(value: number, digits: number) {
  return value.toFixed(digits).replace(/\.?0+$/, "")
}

export function formatMaybeAmount(value?: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return "-"
  }

  const maximumFractionDigits = Math.abs(value) < 0.01 && value !== 0 ? 6 : 4

  return `${new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value)} USD`
}

export function formatCostPair(actual?: number, standard?: number) {
  if (standard === undefined) {
    return formatMaybeAmount(actual)
  }

  return `${formatMaybeAmount(actual)} / ${formatMaybeAmount(standard)}`
}

export function formatTimestamp(value: number) {
  if (!Number.isFinite(value)) {
    return "-"
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function formatTaskRunStatus(taskRun?: PublicChannel["lastTaskRun"]) {
  if (!taskRun) {
    return "暂无"
  }

  const labels = {
    balance_check: "余额",
    upstream_snapshot: "快照",
    upstream_sync: "同步",
  } satisfies Record<NonNullable<PublicChannel["lastTaskRun"]>["taskType"], string>
  const statuses = {
    failed: "失败",
    running: "运行中",
    skipped: "跳过",
    success: "成功",
  } satisfies Record<NonNullable<PublicChannel["lastTaskRun"]>["status"], string>

  return `${labels[taskRun.taskType]}${statuses[taskRun.status]} ${formatDateTime(taskRun.finishedAt ?? taskRun.startedAt)}`
}
