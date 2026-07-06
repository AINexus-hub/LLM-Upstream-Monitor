import type { BalanceCheckRecord, NotificationRecord, PublicChannel } from "@llm-upstream-monitor/shared"
import { Activity, Lightbulb, LineChartIcon, RefreshCw, Server, TrendingDown } from "lucide-react"
import { useMemo } from "react"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { DetailRow, EmptyState, SummaryCard } from "@/components/common/display"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ChecksByChannel, TimeRange } from "@/types/app"
import type { DashboardInsights } from "@/utils/dashboard"
import { statusLabel } from "@/utils/dashboard"
import { formatAdjustedBalance, formatAmount, formatBalance, formatDateTime, formatTimestamp } from "@/utils/format"

const balanceChartPointLimit = 360
const unifiedChartPointLimitPerChannel = 240

const timeRanges: Array<{ label: string; value: TimeRange }> = [
  { label: "24h内", value: "24h" },
  { label: "1d", value: "1d" },
  { label: "3d", value: "3d" },
  { label: "7d", value: "7d" },
]

const channelColors = [
  "#22d3ee",
  "#a78bfa",
  "#34d399",
  "#f59e0b",
  "#fb7185",
  "#60a5fa",
  "#c084fc",
  "#2dd4bf",
  "#f472b6",
  "#fde047",
]

function sampleEvenly<T>(items: T[], maxPoints: number) {
  if (items.length <= maxPoints) {
    return items
  }

  if (maxPoints <= 1) {
    return items.slice(-1)
  }

  const lastIndex = items.length - 1
  return Array.from({ length: maxPoints }, (_, index) => {
    const sourceIndex = Math.round((index * lastIndex) / (maxPoints - 1))
    return items[sourceIndex]
  })
}

type MonitorPageProps = {
  channels: PublicChannel[]
  checks: BalanceCheckRecord[]
  checksByChannel: ChecksByChannel
  checkingId?: string
  hiddenChannelIds: string[]
  insights: DashboardInsights
  isLoading: boolean
  notifications: NotificationRecord[]
  selectedChannel?: PublicChannel
  selectedChannelId?: string
  timeRange: TimeRange
  totalCheckCount: number
  totalRemaining: number
  onCheck: (channelId: string) => void
  onCreate: () => void
  onHiddenChannelIdsChange: (channelIds: string[]) => void
  onSelectChannel: (channelId: string) => void
  onTimeRangeChange: (range: TimeRange) => void
}

export default function MonitorPage({
  channels,
  checks,
  checksByChannel,
  checkingId,
  hiddenChannelIds,
  insights,
  isLoading,
  notifications,
  selectedChannel,
  selectedChannelId,
  timeRange,
  totalCheckCount,
  totalRemaining,
  onCheck,
  onCreate,
  onHiddenChannelIdsChange,
  onSelectChannel,
  onTimeRangeChange,
}: MonitorPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard icon={Server} label="供应商数量" value={String(channels.length)} />
        <SummaryCard icon={LineChartIcon} label="检测记录" value={String(totalCheckCount)} />
        <SummaryCard
          icon={Activity}
          label="总折算余额"
          value={totalRemaining ? totalRemaining.toFixed(2) : "-"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <DataInsightsPanel insights={insights} />
        <NotificationsPanel notifications={notifications} onSelectChannel={onSelectChannel} />
      </section>

      <UnifiedBalanceChart
        channels={channels}
        checksByChannel={checksByChannel}
        hiddenChannelIds={hiddenChannelIds}
        timeRange={timeRange}
        onHiddenChannelIdsChange={onHiddenChannelIdsChange}
        onSelectChannel={onSelectChannel}
        onTimeRangeChange={onTimeRangeChange}
      />

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>监控队列</CardTitle>
            <CardDescription>选择供应商后查看折算余额曲线和最近状态。</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ChannelMonitorList
              channels={channels}
              checkingId={checkingId}
              isLoading={isLoading}
              selectedChannelId={selectedChannelId}
              onCheck={onCheck}
              onCreate={onCreate}
              onSelectChannel={onSelectChannel}
            />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader>
              <CardTitle>当前供应商</CardTitle>
              <CardDescription>
                {selectedChannel ? `${selectedChannel.name} 的近期记录` : "选择一个供应商查看详情"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BalanceChart checks={checks} rechargeRate={selectedChannel?.rechargeRate ?? 1} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>实时详情</CardTitle>
              <CardDescription>最近一次检测结果与配置摘要。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {selectedChannel ? (
                <>
                  <DetailRow label="供应商类型" value={selectedChannel.type.toUpperCase()} />
                  <DetailRow label="后台链接" value={selectedChannel.officialUrl ?? "-"} />
                  <DetailRow label="折算余额" value={formatAdjustedBalance(selectedChannel)} />
                  <DetailRow label="接口余额" value={formatBalance(selectedChannel.lastCheck)} />
                  <DetailRow label="充值倍率" value={`1:${selectedChannel.rechargeRate || 1}`} />
                  <DetailRow
                    label="告警阈值"
                    value={
                      selectedChannel.alertThreshold == null
                        ? "-"
                        : formatAmount(selectedChannel.alertThreshold, selectedChannel.lastCheck?.unit ?? "USD")
                    }
                  />
                  <DetailRow
                    label="最近检测"
                    value={formatDateTime(selectedChannel.lastCheck?.checkedAt)}
                  />
                  <DetailRow label="检测状态" value={statusLabel(selectedChannel)} />
                  <DetailRow
                    label="查询间隔"
                    value={`${selectedChannel.checkIntervalMinutes} 分钟`}
                  />
                  <DetailRow
                    label="错误信息"
                    value={selectedChannel.lastCheck?.errorMessage ?? "-"}
                  />
                </>
              ) : (
                <EmptyState actionLabel="添加供应商" onAction={onCreate}>
                  暂无供应商可监控。
                </EmptyState>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}

type ChannelMonitorListProps = {
  channels: PublicChannel[]
  checkingId?: string
  isLoading: boolean
  selectedChannelId?: string
  onCheck: (channelId: string) => void
  onCreate: () => void
  onSelectChannel: (channelId: string) => void
}

function ChannelMonitorList({
  channels,
  checkingId,
  isLoading,
  selectedChannelId,
  onCheck,
  onCreate,
  onSelectChannel,
}: ChannelMonitorListProps) {
  if (isLoading) {
    return <div className="px-4 py-10 text-sm text-muted-foreground">正在加载渠道...</div>
  }

  if (channels.length === 0) {
    return (
      <div className="px-4 py-6">
        <EmptyState actionLabel="添加供应商" onAction={onCreate}>
          还没有供应商，先创建一个监控目标。
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {channels.map((channel) => (
        <article
          key={channel.id}
          className={
            selectedChannelId === channel.id
              ? "relative grid gap-3 bg-muted px-4 py-4"
              : "relative grid gap-3 px-4 py-4 hover:bg-muted/70"
          }
        >
          <button
            aria-label={`选择供应商 ${channel.name}`}
            className="absolute inset-0 z-0"
            onClick={() => onSelectChannel(channel.id)}
            type="button"
          />
          <div className="pointer-events-none relative z-10 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{channel.name}</h3>
              <Badge variant="secondary">{channel.type.toUpperCase()}</Badge>
              <Badge variant={channel.lastCheck?.success === false ? "destructive" : "outline"}>
                {statusLabel(channel)}
              </Badge>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">{channel.requestUrl}</p>
          </div>
          <div className="pointer-events-none relative z-10 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">折算余额</p>
              <p className="font-semibold">{formatAdjustedBalance(channel)}</p>
            </div>
            <Button
              className="pointer-events-auto relative z-20"
              size="sm"
              variant="outline"
              onClick={() => onCheck(channel.id)}
              disabled={checkingId === channel.id}
            >
              <RefreshCw data-icon="inline-start" aria-hidden="true" />
              {checkingId === channel.id ? "检测中" : "检测"}
            </Button>
          </div>
        </article>
      ))}
    </div>
  )
}

type DataInsightsPanelProps = {
  insights: DashboardInsights
}

function DataInsightsPanel({ insights }: DataInsightsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>数据洞见</CardTitle>
        <CardDescription>检测覆盖、风险和近 24 小时表现。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <InsightTile
          icon={Activity}
          label="告警供应商"
          value={String(insights.alertCount)}
        />
        <InsightTile
          icon={Activity}
          label="正常供应商"
          value={String(insights.healthyCount)}
        />
        <InsightTile
          icon={Server}
          label="检测覆盖"
          value={insights.coverageText}
        />
        <InsightTile
          icon={LineChartIcon}
          label="24h 检测"
          value={String(insights.recentChecksCount)}
        />
        <InsightTile
          icon={TrendingDown}
          label="24h 失败"
          value={String(insights.failedChecks24h)}
        />
        <InsightTile
          icon={Lightbulb}
          label="最低余额"
          value={insights.lowestBalanceText}
        />
      </CardContent>
    </Card>
  )
}

type InsightTileProps = {
  icon: typeof Activity
  label: string
  value: string
}

function InsightTile({ icon: Icon, label, value }: InsightTileProps) {
  return (
    <div className="flex min-h-24 flex-col justify-between border border-border bg-muted p-3">
      <div className="flex items-center justify-between gap-3 text-muted-foreground">
        <span className="text-xs font-semibold">{label}</span>
        <Icon aria-hidden="true" className="size-4" />
      </div>
      <p className="break-words text-xl font-semibold">{value}</p>
    </div>
  )
}

type NotificationsPanelProps = {
  notifications: NotificationRecord[]
  onSelectChannel: (channelId: string) => void
}

function NotificationsPanel({ notifications, onSelectChannel }: NotificationsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>站内通知</CardTitle>
        <CardDescription>余额阈值和检测异常会在这里聚合。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {notifications.length === 0 ? (
          <div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
            当前没有告警通知
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              className="grid gap-1 border border-border bg-muted p-3 text-left hover:border-primary"
              onClick={() => notification.channelId && onSelectChannel(notification.channelId)}
              type="button"
            >
              <span className="text-sm font-semibold">{notification.title}</span>
              <span className="text-sm text-muted-foreground">{notification.body}</span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(notification.createdAt)}
              </span>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  )
}

type UnifiedBalanceChartProps = {
  channels: PublicChannel[]
  checksByChannel: ChecksByChannel
  hiddenChannelIds: string[]
  timeRange: TimeRange
  onHiddenChannelIdsChange: (channelIds: string[]) => void
  onSelectChannel: (channelId: string) => void
  onTimeRangeChange: (range: TimeRange) => void
}

function UnifiedBalanceChart({
  channels,
  checksByChannel,
  hiddenChannelIds,
  timeRange,
  onHiddenChannelIdsChange,
  onSelectChannel,
  onTimeRangeChange,
}: UnifiedBalanceChartProps) {
  const hiddenChannelSet = useMemo(() => new Set(hiddenChannelIds), [hiddenChannelIds])
  const visibleChannels = channels.filter((channel) => !hiddenChannelSet.has(channel.id))
  const chartData = useMemo(
    () => buildUnifiedChartData(channels, checksByChannel, hiddenChannelSet, timeRange),
    [channels, checksByChannel, hiddenChannelSet, timeRange],
  )

  function toggleChannel(channelId: string) {
    if (hiddenChannelSet.has(channelId)) {
      onHiddenChannelIdsChange(hiddenChannelIds.filter((id) => id !== channelId))
      return
    }

    onHiddenChannelIdsChange([...hiddenChannelIds, channelId])
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>全供应商折算余额</CardTitle>
            <CardDescription>所有渠道按充值倍率折算后统一展示。</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {timeRanges.map((range) => (
              <button
                key={range.value}
                className={
                  timeRange === range.value
                    ? "h-8 border border-primary bg-primary px-3 text-xs font-semibold text-primary-foreground"
                    : "h-8 border border-border bg-background/70 px-3 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-foreground"
                }
                onClick={() => onTimeRangeChange(range.value)}
                type="button"
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {channels.map((channel, index) => {
            const color = channelColors[index % channelColors.length]
            const isHidden = hiddenChannelSet.has(channel.id)

            return (
              <button
                key={channel.id}
                className={
                  isHidden
                    ? "flex h-8 items-center gap-2 border border-border bg-background/70 px-3 text-xs font-semibold text-muted-foreground opacity-60 hover:border-primary"
                    : "flex h-8 items-center gap-2 border border-primary/45 bg-muted px-3 text-xs font-semibold text-foreground hover:border-primary"
                }
                onClick={() => toggleChannel(channel.id)}
                type="button"
              >
                <span className="size-2.5" style={{ backgroundColor: color }} />
                {channel.name}
              </button>
            )
          })}
        </div>

        {channels.length === 0 ? (
          <div className="flex h-[460px] items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
            暂无供应商数据
          </div>
        ) : visibleChannels.length === 0 ? (
          <div className="flex h-[460px] items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
            所有供应商数据线已隐藏
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[460px] items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
            当前时间范围内暂无余额记录
          </div>
        ) : (
          <div className="h-[460px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  domain={["dataMin", "dataMax"]}
                  axisLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  tickFormatter={(value: number) => formatTimestamp(value)}
                  tickLine={false}
                  type="number"
                />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    color: "hsl(var(--foreground))",
                  }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                  labelFormatter={(value) => formatTimestamp(Number(value))}
                  formatter={(value, name) => [
                    formatAmount(typeof value === "number" ? value : Number(value)),
                    name,
                  ]}
                />
                {visibleChannels.map((channel) => {
                  const index = channels.findIndex((item) => item.id === channel.id)
                  return (
                    <Line
                      key={channel.id}
                      connectNulls
                      dataKey={channel.id}
                      dot={false}
                      name={channel.name}
                      onClick={() => onSelectChannel(channel.id)}
                      stroke={channelColors[index % channelColors.length]}
                      strokeWidth={2}
                      type="monotone"
                    />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

type UnifiedChartRow = {
  checkedAt: string
  timestamp: number
} & Record<string, number | string>

function buildUnifiedChartData(
  channels: PublicChannel[],
  checksByChannel: ChecksByChannel,
  hiddenChannelSet: Set<string>,
  timeRange: TimeRange,
) {
  const cutoff = getRangeCutoff(timeRange)
  const rows: UnifiedChartRow[] = []

  channels.forEach((channel) => {
    if (hiddenChannelSet.has(channel.id)) {
      return
    }

    const rechargeRate = channel.rechargeRate || 1
    const checks = (checksByChannel[channel.id] ?? [])
      .map((check) => ({
        check,
        timestamp: new Date(check.checkedAt).getTime(),
      }))
      .filter(
        ({ check, timestamp }) =>
          check.remaining !== undefined && Number.isFinite(timestamp) && timestamp >= cutoff,
      )

    sampleEvenly(checks, unifiedChartPointLimitPerChannel).forEach(({ check, timestamp }) => {
      rows.push({
        checkedAt: check.checkedAt,
        timestamp,
        [channel.id]: (check.remaining ?? 0) / rechargeRate,
      })
    })
  })

  return rows.sort((left, right) => left.timestamp - right.timestamp)
}

function getRangeCutoff(range: TimeRange) {
  const now = Date.now()

  if (range === "1d") {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today.getTime()
  }

  const hoursByRange: Record<Exclude<TimeRange, "1d">, number> = {
    "24h": 24,
    "3d": 72,
    "7d": 168,
  }

  return now - hoursByRange[range] * 60 * 60 * 1000
}

type BalanceChartProps = {
  checks: BalanceCheckRecord[]
  rechargeRate: number
}

function BalanceChart({ checks, rechargeRate }: BalanceChartProps) {
  const drawableChecks = checks.filter((check) => check.remaining !== undefined)
  const chartData = sampleEvenly(drawableChecks, balanceChartPointLimit).map((check) => ({
      ...check,
      adjustedRemaining: (check.remaining ?? 0) / (rechargeRate || 1),
    }))
  const isSampled = drawableChecks.length > chartData.length

  if (chartData.length === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
        暂无可绘制的余额记录
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      {isSampled && (
        <p className="text-xs text-muted-foreground">
          为保持页面流畅，已从 {drawableChecks.length} 条记录抽样绘制 {chartData.length} 个点。
        </p>
      )}
      <div className="h-[420px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="checkedAt"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: string) => formatDateTime(value)}
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--foreground))",
              }}
              itemStyle={{ color: "hsl(var(--foreground))" }}
              labelStyle={{ color: "hsl(var(--muted-foreground))" }}
              labelFormatter={(value) => formatDateTime(String(value))}
            />
            <Line
              type="monotone"
              dataKey="adjustedRemaining"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
