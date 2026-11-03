import type { PublicChannel, UpstreamSnapshotRecord } from "@llm-upstream-monitor/shared"
import { Check, Copy, Filter, KeyRound, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { EmptyState } from "@/components/common/display"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  formatCompactNumber,
  formatCostPair,
  formatDateTime,
  formatDurationMs,
  formatMaybeAmount,
  formatMaybeNumber,
} from "@/utils/format"
import { hasUpstreamLogin } from "@/utils/notifications"

type AvailableGroup = { id: string; name: string; platform?: string; platforms?: string[]; rateMultiplier?: number }

function platformsForGroup(group: AvailableGroup) {
  return group.platforms?.length ? group.platforms : [group.platform?.trim() || "未知厂商"]
}
type CreatedKeyResult = {
  groupId: string
  groupName: string
  name: string
  success: boolean
  key?: string
  error?: string
}
type UpstreamAccountsPageProps = {
  channels: PublicChannel[]
  refreshingSnapshotId?: string
  selectedChannelId?: string
  snapshots: UpstreamSnapshotRecord[]
  onCreate: () => void
  onCreateKeys: (
    channelId: string,
    payload: { groupIds: string[]; quota?: number; expiresInDays?: number },
  ) => Promise<CreatedKeyResult[]>
  onLoadGroups: (channelId: string) => Promise<AvailableGroup[]>
  onRefresh: (channelId: string) => void
  onSelectChannel: (channelId: string) => void
}

export default function UpstreamAccountsPage({
  channels,
  refreshingSnapshotId,
  selectedChannelId,
  snapshots,
  onCreate,
  onCreateKeys,
  onLoadGroups,
  onRefresh,
  onSelectChannel,
}: UpstreamAccountsPageProps) {
  const accountChannels = channels.filter(hasUpstreamLogin)
  const selectedChannel =
    accountChannels.find((channel) => channel.id === selectedChannelId) ?? accountChannels[0]
  const activeChannelId = selectedChannel?.id
  const activeChannelType = selectedChannel?.accountTemplate
  const selectedSnapshot = selectedChannel
    ? snapshots.find((snapshot) => snapshot.channelId === selectedChannel.id)
    : undefined
  const summary = selectedSnapshot?.summary
  const [groups, setGroups] = useState<AvailableGroup[]>([])
  const [groupError, setGroupError] = useState<string>()
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [selectedGroupPlatform, setSelectedGroupPlatform] = useState("all")
  const [quota, setQuota] = useState("0")
  const [expiresInDays, setExpiresInDays] = useState("")
  const [isLoadingGroups, setIsLoadingGroups] = useState(false)
  const [isCreatingKeys, setIsCreatingKeys] = useState(false)
  const [createdKeys, setCreatedKeys] = useState<CreatedKeyResult[]>([])
  const [keyError, setKeyError] = useState<string>()
  const [copiedGroupId, setCopiedGroupId] = useState<string>()
  const [copiedAll, setCopiedAll] = useState(false)

  useEffect(() => {
    setGroups([])
    setSelectedGroupIds([])
    setSelectedGroupPlatform("all")
    setCreatedKeys([])
    setGroupError(undefined)
    if (!activeChannelId) return
    if (activeChannelType === "newapi") {
      setIsLoadingGroups(true)
      onLoadGroups(activeChannelId)
        .then((items) => {
          setGroups(items)
          setSelectedGroupIds([])
        })
        .catch((error: unknown) => setGroupError(error instanceof Error ? error.message : "读取 NewAPI 分组失败"))
        .finally(() => setIsLoadingGroups(false))
      return
    }
    setIsLoadingGroups(true)
    onLoadGroups(activeChannelId)
      .then((items) => {
        setGroups(items)
        setSelectedGroupIds([])
      })
      .catch((error: unknown) =>
        setGroupError(error instanceof Error ? error.message : "读取分组失败"),
      )
      .finally(() => setIsLoadingGroups(false))
  }, [activeChannelId, activeChannelType, onLoadGroups])

  function generatedName(group: AvailableGroup) {
    return group.rateMultiplier === undefined
      ? `${group.name}（倍率未知）`
      : `${String(Math.round(group.rateMultiplier * 100)).padStart(3, "0")}${group.name}`
  }

  const groupPlatforms = [
    ...new Set(groups.flatMap(platformsForGroup)),
  ].sort((left, right) => left.localeCompare(right, "zh-CN"))
  const visibleGroups =
    selectedGroupPlatform === "all"
      ? groups
      : groups.filter((group) => platformsForGroup(group).includes(selectedGroupPlatform))
  const allVisibleGroupsSelected =
    visibleGroups.length > 0 && visibleGroups.every((group) => selectedGroupIds.includes(group.id))

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    )
  }

  function toggleVisibleGroups() {
    const visibleIds = new Set(visibleGroups.map((group) => group.id))
    setSelectedGroupIds((current) => {
      if (allVisibleGroupsSelected) return current.filter((id) => !visibleIds.has(id))
      return [...new Set([...current, ...visibleIds])]
    })
  }

  async function submitKeys(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedChannel || selectedGroupIds.length === 0) return
    setIsCreatingKeys(true)
    setKeyError(undefined)
    setCreatedKeys([])
    try {
      const results = await onCreateKeys(selectedChannel.id, {
        groupIds: selectedGroupIds,
        quota: Number(quota),
        ...(expiresInDays ? { expiresInDays: Number(expiresInDays) } : {}),
      })
      setCreatedKeys(results)
      if (!results.some((item) => item.success))
        setKeyError("所选分组均未创建成功，请查看各项错误信息。")
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : "批量创建失败")
    } finally {
      setIsCreatingKeys(false)
    }
  }

  async function copyKey(groupId: string, key?: string) {
    if (!key) return
    await navigator.clipboard.writeText(key)
    setCopiedGroupId(groupId)
    window.setTimeout(() => setCopiedGroupId(undefined), 1500)
  }

  async function copyAllKeys() {
    const successful = createdKeys.filter((item) => item.success && item.key)
    if (!successful.length) return
    await navigator.clipboard.writeText(
      successful.map((item) => `${item.name}\t${item.key}`).join("\n"),
    )
    setCopiedAll(true)
    window.setTimeout(() => setCopiedAll(false), 1500)
  }

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
        ) : selectedChannel.accountTemplate === "newapi" ? (
          <>
            <NewApiKeyManager
              channelName={selectedChannel.name}
              groups={groups}
              selectedGroupPlatform={selectedGroupPlatform}
              visibleGroups={visibleGroups}
              groupPlatforms={groupPlatforms}
              onSetGroupPlatform={setSelectedGroupPlatform}
              isLoadingGroups={isLoadingGroups}
              groupError={groupError}
              selectedGroupIds={selectedGroupIds}
              createdKeys={createdKeys}
              keyError={keyError}
              isCreatingKeys={isCreatingKeys}
              quota={quota}
              expiresInDays={expiresInDays}
              onToggleGroup={toggleGroup}
              onToggleVisibleGroups={toggleVisibleGroups}
              onSetQuota={setQuota}
              onSetExpiresInDays={setExpiresInDays}
              onSubmit={submitKeys}
              copiedAll={copiedAll}
              onCopyAll={() => void copyAllKeys()}
            />
            <section className="grid gap-4 md:grid-cols-3">
              <AccountMetricCard
                label="余额"
                value={formatMaybeAmount(summary?.metrics.balance ?? selectedChannel.lastCheck?.remaining)}
              />
              <AccountMetricCard label="当前分组" value={selectedChannel.lastCheck?.planName ?? "-"} />
              <AccountMetricCard label="可用分组" value={formatMaybeNumber(groups.length)} />
            </section>
            {summary && (
              <>
                {summary.errors.length > 0 && (
                  <Card><CardContent className="grid gap-2 p-4">
                    {summary.errors.map((item) => <p key={`${item.module}-${item.message}`} className="text-sm text-destructive">{item.module}: {item.message}</p>)}
                  </CardContent></Card>
                )}
                <GroupsTable groups={summary.groups} />
              </>
            )}
          </>
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
            {selectedChannel.type === "sub2api" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound aria-hidden="true" />
                    批量创建上游密钥
                  </CardTitle>
                  <CardDescription>
                    密钥名称自动按“倍率百分位 + 分组名”生成，例如倍率 0.1 对应 010。
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                      {isLoadingGroups
                        ? "读取分组中..."
                        : `已选 ${selectedGroupIds.length} 个 · 当前显示 ${visibleGroups.length} / ${groups.length} 个分组`}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <Filter aria-hidden="true" className="size-4 text-muted-foreground" />
                        <span className="text-muted-foreground">厂商</span>
                        <select
                          className="h-9 min-w-36 border border-border bg-background px-3"
                          value={selectedGroupPlatform}
                          onChange={(event) => setSelectedGroupPlatform(event.target.value)}
                          aria-label="按厂商筛选分组"
                        >
                          <option value="all">全部厂商 ({groups.length})</option>
                          {groupPlatforms.map((platform) => (
                            <option key={platform} value={platform}>
                              {platform} (
                              {
                                groups.filter((group) => platformsForGroup(group).includes(platform)).length
                              }
                              )
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!visibleGroups.length}
                        onClick={toggleVisibleGroups}
                      >
                        {allVisibleGroupsSelected ? "取消当前全选" : "全选当前厂商"}
                      </Button>
                    </div>
                  </div>
                  {visibleGroups.length > 0 && (
                    <div className="grid max-h-64 gap-2 overflow-y-auto border border-border p-3 sm:grid-cols-2 xl:grid-cols-3">
                      {visibleGroups.map((group) => (
                        <label
                          key={group.id}
                          className="flex min-w-0 items-start gap-2 border border-border/70 p-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedGroupIds.includes(group.id)}
                            onChange={() => toggleGroup(group.id)}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{group.name}</span>
                            <span className="block break-all text-xs text-muted-foreground">
                              倍率 {formatMaybeNumber(group.rateMultiplier)} ·{" "}
                              {generatedName(group)}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {groups.length > 0 && visibleGroups.length === 0 && (
                    <p className="border border-border p-4 text-sm text-muted-foreground">
                      当前厂商下没有分组
                    </p>
                  )}
                  <form
                    className="grid gap-3 md:grid-cols-3"
                    onSubmit={(event) => void submitKeys(event)}
                  >
                    <input
                      className="h-10 border border-border bg-background px-3 text-sm"
                      type="number"
                      min="0"
                      step="any"
                      aria-label="额度（0 为不限）"
                      placeholder="额度（0 为不限）"
                      value={quota}
                      onChange={(event) => setQuota(event.target.value)}
                    />
                    <input
                      className="h-10 border border-border bg-background px-3 text-sm"
                      type="number"
                      min="1"
                      step="1"
                      aria-label="有效期天数（留空为不限）"
                      placeholder="有效期天数"
                      value={expiresInDays}
                      onChange={(event) => setExpiresInDays(event.target.value)}
                    />
                    <Button
                      type="submit"
                      disabled={
                        isCreatingKeys ||
                        !selectedGroupIds.length ||
                        selectedGroupIds.some(
                          (id) =>
                            groups.find((group) => group.id === id)?.rateMultiplier === undefined,
                        )
                      }
                    >
                      {isCreatingKeys ? "批量创建中..." : `创建 ${selectedGroupIds.length} 个密钥`}
                    </Button>
                  </form>
                  {groupError && (
                    <p className="text-sm text-destructive">分组读取失败：{groupError}</p>
                  )}
                  {keyError && <p className="text-sm text-destructive">{keyError}</p>}
                  {createdKeys.length > 0 && (
                    <div className="grid gap-3 border-t border-border pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold">
                          创建结果：成功 {createdKeys.filter((item) => item.success).length} /{" "}
                          {createdKeys.length}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!createdKeys.some((item) => item.success)}
                          onClick={() => void copyAllKeys()}
                        >
                          {copiedAll ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                          {copiedAll ? "已复制全部" : "复制全部成功密钥"}
                        </Button>
                      </div>
                      {createdKeys.map((item) => (
                        <div
                          key={item.groupId}
                          className="grid gap-2 border border-border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                        >
                          <div className="min-w-0">
                            <p className="break-all text-sm font-medium">
                              {item.name}{" "}
                              <span
                                className={item.success ? "text-green-600" : "text-destructive"}
                              >
                                {item.success ? "创建成功" : "创建失败"}
                              </span>
                            </p>
                            {item.success ? (
                              <code className="block break-all text-xs text-muted-foreground">
                                {item.key}
                              </code>
                            ) : (
                              <p className="text-xs text-destructive">{item.error}</p>
                            )}
                          </div>
                          {item.success && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void copyKey(item.groupId, item.key)}
                            >
                              {copiedGroupId === item.groupId ? (
                                <Check aria-hidden="true" />
                              ) : (
                                <Copy aria-hidden="true" />
                              )}
                              {copiedGroupId === item.groupId ? "已复制" : "复制"}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <section className="grid gap-4 md:grid-cols-4">
              <AccountMetricCard label="余额" value={formatMaybeAmount(summary.metrics.balance)} />
              <AccountMetricCard
                label="API Key"
                value={formatMaybeNumber(summary.metrics.apiKeyCount)}
              />
              <AccountMetricCard
                label="请求量"
                value={formatMaybeNumber(summary.metrics.todayRequests)}
                secondaryLabel="总请求"
                secondaryValue={formatMaybeNumber(summary.metrics.totalRequests)}
              />
              <AccountMetricCard
                label="累计 Token"
                value={formatCompactNumber(summary.metrics.totalTokens)}
              />
              <AccountMetricCard
                label="今日消费"
                value={formatCostPair(summary.metrics.todayCost, summary.metrics.todayStandardCost)}
              />
              <AccountMetricCard
                label="总消费"
                value={formatCostPair(summary.metrics.totalCost, summary.metrics.totalStandardCost)}
              />
              <AccountMetricCard
                label="今日 Token"
                value={formatCompactNumber(summary.metrics.todayTokens)}
              />
              <AccountMetricCard
                label="平均响应"
                value={formatDurationMs(summary.metrics.averageDurationMs)}
              />
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
              <ApiKeysTable apiKeys={summary.apiKeys} groups={summary.groups} />
            </section>

            <RecentUsageTable items={summary.recentUsage} />
          </>
        )}
      </div>
    </section>
  )
}

type NewApiKeyManagerProps = {
  channelName: string
  groups: AvailableGroup[]
  selectedGroupPlatform: string
  visibleGroups: AvailableGroup[]
  groupPlatforms: string[]
  onSetGroupPlatform: (platform: string) => void
  isLoadingGroups: boolean
  groupError?: string
  selectedGroupIds: string[]
  createdKeys: CreatedKeyResult[]
  keyError?: string
  isCreatingKeys: boolean
  quota: string
  expiresInDays: string
  copiedAll: boolean
  onToggleGroup: (id: string) => void
  onToggleVisibleGroups: () => void
  onSetQuota: (value: string) => void
  onSetExpiresInDays: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCopyAll: () => void
}

function NewApiKeyManager(props: NewApiKeyManagerProps) {
  const allSelected = props.visibleGroups.length > 0 && props.visibleGroups.every((group) => props.selectedGroupIds.includes(group.id))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound aria-hidden="true" />NewAPI 分组批量创建密钥</CardTitle>
        <CardDescription>{props.channelName} · 每个选中分组创建一个 API Key</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {props.isLoadingGroups ? "读取分组中..." : `已选 ${props.selectedGroupIds.length} 个 · 当前显示 ${props.visibleGroups.length} / ${props.groups.length} 个分组`}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Filter aria-hidden="true" className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">厂商</span>
              <select className="h-9 min-w-36 border border-border bg-background px-3" value={props.selectedGroupPlatform} onChange={(event) => props.onSetGroupPlatform(event.target.value)} aria-label="按厂商筛选 NewAPI 分组">
                <option value="all">全部厂商 ({props.groups.length})</option>
                {props.groupPlatforms.map((platform) => <option key={platform} value={platform}>{platform} ({props.groups.filter((group) => platformsForGroup(group).includes(platform)).length})</option>)}
              </select>
            </label>
            <Button type="button" variant="outline" size="sm" disabled={!props.visibleGroups.length} onClick={props.onToggleVisibleGroups}>
              {allSelected ? "取消当前全选" : "全选当前厂商"}
            </Button>
          </div>
        </div>
        {props.groupError && <p className="text-sm text-destructive">分组读取失败：{props.groupError}</p>}
        {props.groups.length > 0 ? (
          <div className="grid max-h-64 gap-2 overflow-y-auto border border-border p-3 sm:grid-cols-2 xl:grid-cols-3">
            {props.visibleGroups.map((group) => (
              <label key={group.id} className="flex min-w-0 items-start gap-2 border border-border/70 p-2 text-sm">
                <input type="checkbox" checked={props.selectedGroupIds.includes(group.id)} onChange={() => props.onToggleGroup(group.id)} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{group.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{group.platform} · 倍率 {formatMaybeNumber(group.rateMultiplier)}</span>
                </span>
              </label>
            ))}
          </div>
        ) : !props.isLoadingGroups && !props.groupError ? (
          <p className="border border-border p-4 text-sm text-muted-foreground">NewAPI 没有返回可用分组</p>
        ) : null}
        {props.groups.length > 0 && props.visibleGroups.length === 0 && <p className="border border-border p-4 text-sm text-muted-foreground">当前厂商下没有分组</p>}
        <form className="grid gap-3 md:grid-cols-3" onSubmit={props.onSubmit}>
          <input className="h-10 border border-border bg-background px-3 text-sm" type="number" min="0" step="any" aria-label="额度 USD（0 为不限）" placeholder="额度 USD（0 为不限）" value={props.quota} onChange={(event) => props.onSetQuota(event.target.value)} />
          <input className="h-10 border border-border bg-background px-3 text-sm" type="number" min="1" step="1" aria-label="有效期天数（留空为不限）" placeholder="有效期天数（留空为不限）" value={props.expiresInDays} onChange={(event) => props.onSetExpiresInDays(event.target.value)} />
          <Button type="submit" disabled={props.isCreatingKeys || !props.selectedGroupIds.length}>
            {props.isCreatingKeys ? "批量创建中..." : `创建 ${props.selectedGroupIds.length} 个密钥`}
          </Button>
        </form>
        {props.keyError && <p className="text-sm text-destructive">{props.keyError}</p>}
        {props.createdKeys.length > 0 && <div className="grid gap-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">创建结果：成功 {props.createdKeys.filter((item) => item.success).length} / {props.createdKeys.length}</span>
            <Button type="button" variant="outline" size="sm" disabled={!props.createdKeys.some((item) => item.success)} onClick={props.onCopyAll}>
              {props.copiedAll ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {props.copiedAll ? "已复制全部" : "复制全部成功密钥"}
            </Button>
          </div>
          {props.createdKeys.map((item) => <div key={item.groupId} className="grid gap-2 border border-border p-3">
            <p className="break-all text-sm font-medium">{item.groupName} · {item.name} · <span className={item.success ? "text-green-600" : "text-destructive"}>{item.success ? "创建成功" : "创建失败"}</span></p>
            {item.success ? <code className="break-all text-xs text-muted-foreground">{item.key}</code> : <p className="text-xs text-destructive">{item.error}</p>}
          </div>)}
        </div>}
      </CardContent>
    </Card>
  )
}

type AccountMetricCardProps = {
  label: string
  secondaryLabel?: string
  secondaryValue?: string
  value: string
}

function AccountMetricCard({
  label,
  secondaryLabel,
  secondaryValue,
  value,
}: AccountMetricCardProps) {
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
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3">分组</th>
              <th className="px-4 py-3">平台</th>
              <th className="px-4 py-3">订阅</th>
              <th className="px-4 py-3">倍率</th>
              <th className="px-4 py-3">密钥名称前缀</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td className="px-4 py-5 text-muted-foreground" colSpan={5}>
                  暂无分组数据
                </td>
              </tr>
            ) : (
              groups.map((group) => (
                <tr key={group.id} className="border-b border-border/70">
                  <td className="px-4 py-3 font-semibold">{group.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{group.platform ?? "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {group.subscriptionType ?? "-"}
                  </td>
                  <td className="px-4 py-3">{formatMaybeNumber(group.rateMultiplier)}</td>
                  <td className="px-4 py-3">
                    {group.rateMultiplier === undefined
                      ? "-"
                      : String(Math.round(group.rateMultiplier * 100)).padStart(3, "0")}
                  </td>
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

function ApiKeysTable({
  apiKeys,
  groups,
}: {
  apiKeys: UpstreamSnapshotRecord["summary"]["apiKeys"]
  groups: UpstreamSnapshotRecord["summary"]["groups"]
}) {
  const [selectedPlatform, setSelectedPlatform] = useState("all")
  const platformByGroup = new Map<string, string>()
  groups.forEach((group) => {
    if (!group.platform) return
    platformByGroup.set(group.id, group.platform)
    platformByGroup.set(group.name, group.platform)
  })
  const platformForKey = (apiKey: (typeof apiKeys)[number]) =>
    apiKey.platform ??
    (apiKey.groupId ? platformByGroup.get(apiKey.groupId) : undefined) ??
    (apiKey.groupName ? platformByGroup.get(apiKey.groupName) : undefined) ??
    "未知厂商"
  const platforms = [...new Set(apiKeys.map(platformForKey))].sort((left, right) =>
    left.localeCompare(right, "zh-CN"),
  )
  const visibleKeys =
    selectedPlatform === "all"
      ? apiKeys
      : apiKeys.filter((apiKey) => platformForKey(apiKey) === selectedPlatform)

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Key</CardTitle>
        <CardDescription>Key 默认脱敏展示。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <Filter aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">厂商</span>
          <select
            className="h-9 min-w-40 border border-border bg-background px-3"
            value={selectedPlatform}
            onChange={(event) => setSelectedPlatform(event.target.value)}
            aria-label="按厂商筛选 API Key"
          >
            <option value="all">全部厂商 ({apiKeys.length})</option>
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform} ({apiKeys.filter((apiKey) => platformForKey(apiKey) === platform).length}
                )
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            显示 {visibleKeys.length} / {apiKeys.length}
          </span>
        </label>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">分组</th>
                <th className="px-4 py-3">厂商</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">额度</th>
                <th className="px-4 py-3">已用</th>
              </tr>
            </thead>
            <tbody>
              {visibleKeys.length === 0 ? (
                <tr>
                  <td className="px-4 py-5 text-muted-foreground" colSpan={7}>
                    {apiKeys.length === 0 ? "暂无 API Key 数据" : "该厂商下暂无 API Key"}
                  </td>
                </tr>
              ) : (
                visibleKeys.map((apiKey, index) => (
                  <tr
                    key={apiKey.id ?? `${apiKey.name}-${index}`}
                    className="border-b border-border/70"
                  >
                    <td className="px-4 py-3 font-semibold">{apiKey.name ?? "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{apiKey.keyPreview ?? "-"}</td>
                    <td className="px-4 py-3">{apiKey.groupName ?? apiKey.groupId ?? "-"}</td>
                    <td className="px-4 py-3">{platformForKey(apiKey)}</td>
                    <td className="px-4 py-3">{apiKey.status ?? "-"}</td>
                    <td className="px-4 py-3">{formatMaybeNumber(apiKey.quota)}</td>
                    <td className="px-4 py-3">{formatMaybeNumber(apiKey.used)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function RecentUsageTable({ items }: { items: UpstreamSnapshotRecord["summary"]["recentUsage"] }) {
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
