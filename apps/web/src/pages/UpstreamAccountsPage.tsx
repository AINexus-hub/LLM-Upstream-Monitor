import type { PublicChannel, UpstreamSnapshotRecord } from "@llm-upstream-monitor/shared"
import { RefreshCw } from "lucide-react"
import { EmptyState } from "@/components/common/display"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCompactNumber, formatCostPair, formatDateTime, formatDurationMs, formatMaybeAmount, formatMaybeNumber } from "@/utils/format"
import { hasUpstreamLogin } from "@/utils/notifications"

type UpstreamAccountsPageProps = {
  channels: PublicChannel[]
  refreshingSnapshotId?: string
  selectedChannelId?: string
  snapshots: UpstreamSnapshotRecord[]
  onCreate: () => void
  onRefresh: (channelId: string) => void
  onSelectChannel: (channelId: string) => void
}

export default function UpstreamAccountsPage({
  channels,
  refreshingSnapshotId,
  selectedChannelId,
  snapshots,
  onCreate,
  onRefresh,
  onSelectChannel,
}: UpstreamAccountsPageProps) {
  const accountChannels = channels.filter(hasUpstreamLogin)
  const selectedChannel =
    accountChannels.find((channel) => channel.id === selectedChannelId) ?? accountChannels[0]
  const selectedSnapshot = selectedChannel
    ? snapshots.find((snapshot) => snapshot.channelId === selectedChannel.id)
    : undefined
  const summary = selectedSnapshot?.summary

  return (
    <section className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>账号接入供应商</CardTitle>
          <CardDescription>展示已配置上游登录态的供应商。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {accountChannels.length === 0 ? (
            <EmptyState actionLabel="添加账号接入" onAction={onCreate}>
              暂无账号接入供应商。
            </EmptyState>
          ) : (
            accountChannels.map((channel) => {
              const snapshot = snapshots.find((item) => item.channelId === channel.id)
              const isSelected = selectedChannel?.id === channel.id

              return (
                <button
                  key={channel.id}
                  className={
                    isSelected
                      ? "grid gap-1 border border-primary bg-primary/10 p-3 text-left"
                      : "grid gap-1 border border-border bg-background/50 p-3 text-left hover:border-primary"
                  }
                  onClick={() => onSelectChannel(channel.id)}
                  type="button"
                >
                  <span className="font-semibold">{channel.name}</span>
                  <span className="text-xs text-muted-foreground">{channel.requestUrl}</span>
                  <span className="text-xs text-muted-foreground">
                    快照 {snapshot ? formatDateTime(snapshot.fetchedAt) : "未刷新"}
                  </span>
                </button>
              )
            })
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">上游账号看板</h2>
            <p className="text-sm text-muted-foreground">
              {selectedChannel
                ? `${selectedChannel.name} 的分组、倍率、API Key 和用量快照。`
                : "选择一个账号接入供应商查看上游数据。"}
            </p>
          </div>
          {selectedChannel && (
            <Button
              onClick={() => onRefresh(selectedChannel.id)}
              disabled={refreshingSnapshotId === selectedChannel.id}
            >
              <RefreshCw data-icon="inline-start" aria-hidden="true" />
              {refreshingSnapshotId === selectedChannel.id ? "刷新中" : "刷新上游快照"}
            </Button>
          )}
        </div>

        {!selectedChannel ? (
          <Card>
            <CardContent className="p-5">
              <EmptyState actionLabel="添加供应商" onAction={onCreate}>
                需要先在供应商管理中配置账号接入。
              </EmptyState>
            </CardContent>
          </Card>
        ) : !summary ? (
          <Card>
            <CardContent className="grid gap-4 p-5">
              <div className="border border-dashed border-border p-5 text-sm text-muted-foreground">
                当前供应商还没有持久化快照，点击“刷新上游快照”后会保存最近一次数据。
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <AccountMetricCard label="余额" value={formatMaybeAmount(summary.metrics.balance)} />
              <AccountMetricCard label="API Key" value={formatMaybeNumber(summary.metrics.apiKeyCount)} />
              <AccountMetricCard
                label="请求量"
                value={formatMaybeNumber(summary.metrics.todayRequests)}
                secondaryLabel="总请求"
                secondaryValue={formatMaybeNumber(summary.metrics.totalRequests)}
              />
              <AccountMetricCard label="累计 Token" value={formatCompactNumber(summary.metrics.totalTokens)} />
              <AccountMetricCard label="今日消费" value={formatCostPair(summary.metrics.todayCost, summary.metrics.todayStandardCost)} />
              <AccountMetricCard label="总消费" value={formatCostPair(summary.metrics.totalCost, summary.metrics.totalStandardCost)} />
              <AccountMetricCard label="今日 Token" value={formatCompactNumber(summary.metrics.todayTokens)} />
              <AccountMetricCard label="平均响应" value={formatDurationMs(summary.metrics.averageDurationMs)} />
            </section>

            {summary.errors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>采集错误</CardTitle>
                  <CardDescription>部分上游模块读取失败，先保留错误用于排查。</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {summary.errors.map((item) => (
                    <div
                      key={`${item.module}-${item.message}`}
                      className="border border-destructive/50 bg-background p-3 text-sm text-destructive"
                    >
                      {item.module}: {item.message}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <section className="grid gap-6 2xl:grid-cols-2">
              <GroupsTable groups={summary.groups} />
              <UsageTable title="平台拆分" items={summary.platformUsage} range={summary.range} />
            </section>

            <section className="grid gap-6 2xl:grid-cols-2">
              <UsageTable title="模型分布" items={summary.modelUsage} range={summary.range} />
              <ApiKeysTable apiKeys={summary.apiKeys} />
            </section>

            <RecentUsageTable items={summary.recentUsage} />
          </>
        )}
      </div>
    </section>
  )
}

type AccountMetricCardProps = {
  label: string
  secondaryLabel?: string
  secondaryValue?: string
  value: string
}

function AccountMetricCard({ label, secondaryLabel, secondaryValue, value }: AccountMetricCardProps) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {secondaryLabel && secondaryValue && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs">
          <span className="text-muted-foreground">{secondaryLabel}</span>
          <span className="font-semibold">{secondaryValue}</span>
        </div>
      )}
    </div>
  )
}

function GroupsTable({ groups }: { groups: UpstreamSnapshotRecord["summary"]["groups"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>分组 / 倍率</CardTitle>
        <CardDescription>新增、删除、倍率变化会进入站内通知。</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3">分组</th>
              <th className="px-4 py-3">平台</th>
              <th className="px-4 py-3">订阅</th>
              <th className="px-4 py-3">倍率</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td className="px-4 py-5 text-muted-foreground" colSpan={4}>
                  暂无分组数据
                </td>
              </tr>
            ) : (
              groups.map((group) => (
                <tr key={group.id} className="border-b border-border/70">
                  <td className="px-4 py-3 font-semibold">{group.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{group.platform ?? "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{group.subscriptionType ?? "-"}</td>
                  <td className="px-4 py-3">{formatMaybeNumber(group.rateMultiplier)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

function UsageTable({
  title,
  items,
  range,
}: {
  title: string
  items: UpstreamSnapshotRecord["summary"]["platformUsage"]
  range?: UpstreamSnapshotRecord["summary"]["range"]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          请求、Token、实际消费和标准消费维度
          {range ? `，范围 ${range.startDate} 至 ${range.endDate}` : ""}。
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3">名称</th>
              <th className="px-4 py-3">请求</th>
              <th className="px-4 py-3">Token</th>
              <th className="px-4 py-3">实际</th>
              <th className="px-4 py-3">标准</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-5 text-muted-foreground" colSpan={5}>
                  暂无数据
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.name} className="border-b border-border/70">
                  <td className="px-4 py-3 font-semibold">{item.name}</td>
                  <td className="px-4 py-3">{formatMaybeNumber(item.requests)}</td>
                  <td className="px-4 py-3">{formatCompactNumber(item.tokens)}</td>
                  <td className="px-4 py-3">{formatMaybeAmount(item.actualCost ?? item.cost)}</td>
                  <td className="px-4 py-3">{formatMaybeAmount(item.standardCost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

function ApiKeysTable({ apiKeys }: { apiKeys: UpstreamSnapshotRecord["summary"]["apiKeys"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>API Key</CardTitle>
        <CardDescription>Key 默认脱敏展示。</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3">名称</th>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">分组</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">额度</th>
              <th className="px-4 py-3">已用</th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.length === 0 ? (
              <tr>
                <td className="px-4 py-5 text-muted-foreground" colSpan={6}>
                  暂无 API Key 数据
                </td>
              </tr>
            ) : (
              apiKeys.map((apiKey, index) => (
                <tr key={apiKey.id ?? `${apiKey.name}-${index}`} className="border-b border-border/70">
                  <td className="px-4 py-3 font-semibold">{apiKey.name ?? "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{apiKey.keyPreview ?? "-"}</td>
                  <td className="px-4 py-3">{apiKey.groupName ?? apiKey.groupId ?? "-"}</td>
                  <td className="px-4 py-3">{apiKey.status ?? "-"}</td>
                  <td className="px-4 py-3">{formatMaybeNumber(apiKey.quota)}</td>
                  <td className="px-4 py-3">{formatMaybeNumber(apiKey.used)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

function RecentUsageTable({
  items,
}: {
  items: UpstreamSnapshotRecord["summary"]["recentUsage"]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>最近使用记录</CardTitle>
        <CardDescription>展示最近一次快照内可解析的使用记录。</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3">时间</th>
              <th className="px-4 py-3">模型</th>
              <th className="px-4 py-3">平台</th>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">分组</th>
              <th className="px-4 py-3">Token</th>
              <th className="px-4 py-3">实际</th>
              <th className="px-4 py-3">标准</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-5 text-muted-foreground" colSpan={8}>
                  暂无最近使用记录
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr key={item.id ?? index} className="border-b border-border/70">
                  <td className="px-4 py-3">{formatDateTime(item.createdAt)}</td>
                  <td className="px-4 py-3 font-semibold">{item.model ?? "-"}</td>
                  <td className="px-4 py-3">{item.platform ?? "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.apiKeyName ?? "-"}</td>
                  <td className="px-4 py-3">{item.groupName ?? "-"}</td>
                  <td className="px-4 py-3">{formatCompactNumber(item.tokens)}</td>
                  <td className="px-4 py-3">{formatMaybeAmount(item.actualCost ?? item.cost)}</td>
                  <td className="px-4 py-3">{formatMaybeAmount(item.standardCost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
