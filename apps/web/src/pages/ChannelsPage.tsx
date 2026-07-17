import type { PublicChannel } from "@llm-upstream-monitor/shared"
import { Activity, ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"
import { EmptyState } from "@/components/common/display"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatAdjustedBalance, formatAmount, formatDateTime, formatTaskRunStatus } from "@/utils/format"
import { hasUpstreamLogin } from "@/utils/notifications"
import { statusLabel } from "@/utils/dashboard"

type ChannelsPageProps = {
  channels: PublicChannel[]
  checkingId?: string
  deletingId?: string
  diagnosingId?: string
  syncingId?: string
  isLoading: boolean
  selectedChannelId?: string
  onCreate: () => void
  onDiagnose: (channel: PublicChannel) => void
  onDelete: (channel: PublicChannel) => void
  onEdit: (channel: PublicChannel) => void
  onSelectChannel: (channelId: string) => void
  onSyncCheck: (channel: PublicChannel) => void
}

export default function ChannelsPage({
  channels,
  checkingId,
  deletingId,
  diagnosingId,
  syncingId,
  isLoading,
  selectedChannelId,
  onCreate,
  onDiagnose,
  onDelete,
  onEdit,
  onSelectChannel,
  onSyncCheck,
}: ChannelsPageProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">供应商管理</h2>
          <p className="text-sm text-muted-foreground">维护供应商资料、后台入口、检测参数和余额告警。</p>
        </div>
        <Button onClick={onCreate}>
          <Plus data-icon="inline-start" aria-hidden="true" />
          添加供应商
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-10 text-sm text-muted-foreground">正在加载渠道...</div>
          ) : channels.length === 0 ? (
            <div className="px-4 py-8">
              <EmptyState actionLabel="添加供应商" onAction={onCreate}>
                当前没有任何供应商配置。
              </EmptyState>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {channels.map((channel) => {
                const usesUpstreamLogin = hasUpstreamLogin(channel)
                const isSyncing = usesUpstreamLogin
                  ? syncingId === channel.id
                  : checkingId === channel.id
                const syncLabel = usesUpstreamLogin ? "同步上游" : "余额检测"
                const syncingLabel = usesUpstreamLogin ? "同步中" : "检测中"
                const tokenStatus =
                  channel.hasAccessToken || channel.hasApiKey ? "令牌已配" : "令牌缺失"
                const loginStatus =
                  channel.hasUpstreamRefreshToken || channel.hasUpstreamAccessToken
                    ? "登录态已配"
                    : channel.hasUpstreamPassword
                      ? "账号已配"
                      : "未接入账号"
                const runStatusLabel = usesUpstreamLogin ? "同步" : "检测"
                const hasRunError = usesUpstreamLogin
                  ? Boolean(channel.upstreamLastSyncError)
                  : channel.lastCheck?.success === false
                const runStatus = usesUpstreamLogin
                  ? channel.upstreamLastSyncError
                    ? "同步失败"
                    : formatDateTime(channel.upstreamLastSyncAt ?? channel.lastCheck?.checkedAt)
                  : channel.lastCheck?.success === false
                    ? "检测失败"
                    : formatDateTime(channel.lastCheck?.checkedAt)
                const taskStatus = formatTaskRunStatus(channel.lastTaskRun)

                return (
                <article
                  key={channel.id}
                  className={
                    selectedChannelId === channel.id
                      ? "relative grid items-center gap-3 bg-muted px-3 py-2.5 lg:grid-cols-[minmax(260px,1.1fr)_minmax(420px,1.4fr)_auto]"
                      : "relative grid items-center gap-3 px-3 py-2.5 hover:bg-muted/70 lg:grid-cols-[minmax(260px,1.1fr)_minmax(420px,1.4fr)_auto]"
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
                      <h3 className="truncate font-semibold">{channel.name}</h3>
                      <Badge variant="secondary">{channel.type.toUpperCase()}</Badge>
                      <Badge
                        variant={channel.lastCheck?.success === false ? "destructive" : "outline"}
                      >
                        {statusLabel(channel)}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {channel.requestUrl}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {channel.officialUrl ?? "未配置后台链接"}
                    </p>
                  </div>

                  <div className="pointer-events-none relative z-10 flex min-w-0 flex-wrap items-center gap-2 text-xs">
                    <span className="border border-border bg-background/45 px-2 py-1 text-muted-foreground">
                      {tokenStatus}
                    </span>
                    <span className="border border-border bg-background/45 px-2 py-1 text-muted-foreground">
                      {loginStatus}
                    </span>
                    <span className="border border-border bg-background/45 px-2 py-1">
                      折算 <strong>{formatAdjustedBalance(channel)}</strong>
                    </span>
                    <span className="border border-border bg-background/45 px-2 py-1">
                      倍率 <strong>1:{channel.rechargeRate || 1}</strong>
                    </span>
                    <span className="border border-border bg-background/45 px-2 py-1">
                      间隔 <strong>{channel.checkIntervalMinutes} 分</strong>
                    </span>
                    <span className="border border-border bg-background/45 px-2 py-1">
                      告警{" "}
                      <strong>
                        {!channel.balanceAlertEnabled
                          ? "已关"
                          : channel.alertThreshold == null
                          ? "未配"
                          : formatAmount(channel.alertThreshold, channel.lastCheck?.unit ?? "USD")}
                      </strong>
                    </span>
                    <span
                      className={
                        hasRunError
                          ? "border border-destructive/50 bg-destructive/10 px-2 py-1 text-destructive"
                          : "border border-border bg-background/45 px-2 py-1"
                      }
                    >
                      {runStatusLabel} <strong>{runStatus}</strong>
                    </span>
                    <span
                      className={
                        channel.lastTaskRun?.status === "failed"
                          ? "border border-destructive/50 bg-destructive/10 px-2 py-1 text-destructive"
                          : channel.lastTaskRun?.status === "skipped"
                            ? "border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-200"
                            : "border border-border bg-background/45 px-2 py-1"
                      }
                    >
                      任务 <strong>{taskStatus}</strong>
                    </span>
                  </div>

                  <div className="pointer-events-auto relative z-20 flex flex-wrap items-center gap-2 lg:justify-end">
                    {channel.officialUrl && (
                      <a
                        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border border-border bg-background/70 px-2.5 text-xs font-semibold text-foreground hover:border-primary hover:bg-muted"
                        href={channel.officialUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink aria-hidden="true" className="size-4" />
                        后台
                      </a>
                    )}
                    <Button
                      size="sm"
                      onClick={() => onSyncCheck(channel)}
                      disabled={isSyncing}
                    >
                      <RefreshCw data-icon="inline-start" aria-hidden="true" />
                      {isSyncing ? syncingLabel : syncLabel}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDiagnose(channel)}
                      disabled={diagnosingId === channel.id}
                    >
                      <Activity data-icon="inline-start" aria-hidden="true" />
                      {diagnosingId === channel.id ? "诊断中" : "诊断"}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => onEdit(channel)}>
                      <Pencil data-icon="inline-start" aria-hidden="true" />
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onDelete(channel)}
                      disabled={deletingId === channel.id}
                    >
                      <Trash2 data-icon="inline-start" aria-hidden="true" />
                      {deletingId === channel.id ? "删除中" : "删除"}
                    </Button>
                  </div>
                </article>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
