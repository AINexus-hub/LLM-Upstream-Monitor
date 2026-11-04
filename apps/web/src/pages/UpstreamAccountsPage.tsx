import type { PublicChannel, UpstreamSnapshotRecord } from "@llm-upstream-monitor/shared"
import { Check, Copy, Filter, KeyRound, RefreshCw, Search, X } from "lucide-react"
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
  onRevealKey: (channelId: string, tokenId: string) => Promise<{ key: string }>
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
  onRevealKey,
  onLoadGroups,
  onRefresh,
  onSelectChannel,
}: UpstreamAccountsPageProps) {
  const [channelSearch, setChannelSearch] = useState("")
  const accountChannels = channels.filter(hasUpstreamLogin)
  const normalizedSearch = channelSearch.trim().toLocaleLowerCase()
  const visibleChannels = accountChannels.filter((channel) =>
    [channel.name, channel.requestUrl, channel.officialUrl, channel.upstreamLoginUrl].some(
      (value) => value?.toLocaleLowerCase().includes(normalizedSearch),
    ),
  )
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
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({})
  const [revealingKeyId, setRevealingKeyId] = useState<string>()
  const [keyReadError, setKeyReadError] = useState<string>()

  useEffect(() => {
    setRevealedKeys({})
  }, [selectedSnapshot?.fetchedAt])

  useEffect(() => {
    setGroups([])
    setSelectedGroupIds([])
    setSelectedGroupPlatform("all")
    setCreatedKeys([])
    setRevealedKeys({})
    setKeyReadError(undefined)
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

  async function revealKey(tokenId: string) {
    if (!activeChannelId) return
    setRevealingKeyId(tokenId)
    setKeyReadError(undefined)
    try {
      const result = await onRevealKey(activeChannelId, tokenId)
      setRevealedKeys((current) => ({ ...current, [tokenId]: result.key }))
    } catch (error) {
      setKeyReadError(error instanceof Error ? error.message : "读取密钥失败")
    } finally {
      setRevealingKeyId(undefined)
    }
  }

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
    <section className="grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>账号接入供应商</CardTitle>
          <CardDescription>展示已配置上游登录态的供应商。</CardDescription>
          {accountChannels.length > 0 && (
            <div className="mt-3 grid gap-2">
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  aria-label="搜索账号接入供应商"
                  placeholder="搜索供应商名称或地址"
                  className="h-9 w-full min-w-0 appearance-none border border-input bg-background/75 pl-9 pr-9 text-sm outline-none focus:border-primary [&::-webkit-search-cancel-button]:appearance-none"
                  value={channelSearch}
                  onChange={(event) => setChannelSearch(event.target.value)}
                />
                {channelSearch && (
                  <button
                    type="button"
                    aria-label="清空供应商搜索"
                    className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                    onClick={() => setChannelSearch("")}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                )}
              </div>
              <p role="status" className="text-xs text-muted-foreground">
                显示 {visibleChannels.length} / {accountChannels.length} 个供应商
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent className="grid gap-2">
          {accountChannels.length === 0 ? (
            <EmptyState actionLabel="添加账号接入" onAction={onCreate}>
              暂无账号接入供应商。
            </EmptyState>
          ) : visibleChannels.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              没有匹配的供应商，请尝试其他关键词。
            </p>
          ) : (
            visibleChannels.map((channel) => {
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
                  <span className="break-all font-semibold">{channel.name}</span>
                  <span className="break-all text-xs text-muted-foreground">{channel.requestUrl}</span>
                  <span className="text-xs text-muted-foreground">
                    快照 {snapshot ? formatDateTime(snapshot.fetchedAt) : "未刷新"}
                  </span>
                </button>
              )
            })
          )}
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">上游账号看板</h2>
            <p className="text-sm text-muted-foreground">
              {selectedChannel
                ? `${selectedChannel.name} 的分组、倍率、API Key 和用量快照。`
                : "选择一个账号接入供应商查看上游数据。"}
            </p>
            {selectedChannel && (
              <UpstreamApiAddress
                key={`${selectedChannel.id}-${selectedChannel.requestUrl}`}
                address={selectedChannel.requestUrl}
              />
            )}
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
                <section className="grid min-w-0 items-stretch gap-4 2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <div className="order-2 min-w-0 2xl:order-1"><GroupsTable groups={summary.groups} /></div>
                  <div className="order-1 min-w-0 2xl:order-2">
                  <ApiKeysTable
                  apiKeys={summary.apiKeys}
                  groups={summary.groups}
                  canReveal={summary.provider === "newapi" || summary.provider === "sub2api"}
                  revealedKeys={revealedKeys}
                  revealingKeyId={revealingKeyId}
                  readError={keyReadError}
                  onReveal={revealKey}
                    onCopy={async (key) => {
                      await navigator.clipboard.writeText(key)
                    }}
                  />
                  </div>
                </section>
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

            <section className="grid min-w-0 items-stretch gap-4 2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div className="order-2 min-w-0 2xl:order-1"><GroupsTable groups={summary.groups} /></div>
              <div className="order-1 min-w-0 2xl:order-2">
              <ApiKeysTable
                apiKeys={summary.apiKeys}
                groups={summary.groups}
                canReveal={summary.provider === "newapi" || summary.provider === "sub2api"}
                revealedKeys={revealedKeys}
                revealingKeyId={revealingKeyId}
                readError={keyReadError}
                onReveal={revealKey}
                onCopy={async (key) => {
                  await navigator.clipboard.writeText(key)
                }}
              />
              </div>
            </section>
          </>
        )}
      </div>
    </section>
  )
}

function UpstreamApiAddress({ address }: { address: string }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle")

  useEffect(() => {
    if (copyStatus !== "copied") return
    const timeout = window.setTimeout(() => setCopyStatus("idle"), 1500)
    return () => window.clearTimeout(timeout)
  }, [copyStatus])

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address)
      setCopyStatus("copied")
    } catch {
      setCopyStatus("error")
    }
  }

  return (
    <div className="mt-3 grid gap-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="shrink-0 text-muted-foreground">上游 API 地址</span>
        <code className="min-w-0 select-text break-all">{address}</code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          aria-label="复制上游 API 地址"
          onClick={() => void copyAddress()}
        >
          {copyStatus === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          <span role="status">{copyStatus === "copied" ? "已复制" : "复制地址"}</span>
        </Button>
      </div>
      {copyStatus === "error" && (
        <p role="alert" className="text-xs text-destructive">
          复制失败，请手动选择上方地址复制。
        </p>
      )}
    </div>
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
  const [search, setSearch] = useState("")
  const [selectedPlatform, setSelectedPlatform] = useState("all")
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const platforms = [...new Set(groups.flatMap((group) => group.platforms?.length ? group.platforms : [group.platform ?? "未知厂商"]))].sort((a, b) => a.localeCompare(b, "zh-CN"))
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredGroups = groups.filter((group) => {
    const groupPlatforms = group.platforms?.length ? group.platforms : [group.platform ?? "未知厂商"]
    const matchesPlatform = selectedPlatform === "all" || groupPlatforms.includes(selectedPlatform)
    const matchesSearch = [group.name, group.id, group.platform, ...(group.platforms ?? [])]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch))
    return matchesPlatform && matchesSearch
  })
  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleGroups = filteredGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader>
        <CardTitle>分组 / 倍率</CardTitle>
        <CardDescription>新增、删除、倍率变化会进入站内通知。</CardDescription>
      </CardHeader>
      <CardContent className="grid flex-1 content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">厂商</span>
            <select className="h-9 min-w-36 border border-border bg-background px-3" value={selectedPlatform} onChange={(event) => { setSelectedPlatform(event.target.value); setPage(1) }} aria-label="按厂商筛选分组">
              <option value="all">全部厂商 ({groups.length})</option>
              {platforms.map((platform) => <option key={platform} value={platform}>{platform} ({groups.filter((group) => (group.platforms?.length ? group.platforms : [group.platform ?? "未知厂商"]).includes(platform)).length})</option>)}
            </select>
          </label>
          <input className="h-9 min-w-48 flex-1 border border-border bg-background px-3 text-sm" type="search" placeholder="搜索分组名称、ID 或厂商" aria-label="搜索分组" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
          <span className="text-xs text-muted-foreground">显示 {filteredGroups.length} / {groups.length}</span>
        </div>
        <div className="min-h-[480px] overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
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
            {visibleGroups.length === 0 ? (
              <tr>
                <td className="px-4 py-5 text-muted-foreground" colSpan={5}>
                  {groups.length === 0 ? "暂无分组数据" : "没有匹配的分组"}
                </td>
              </tr>
            ) : (
              visibleGroups.map((group) => (
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
        </div>
        <TablePagination page={currentPage} pageCount={pageCount} pageSize={pageSize} total={filteredGroups.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
      </CardContent>
    </Card>
  )
}

function TablePagination({ page, pageCount, pageSize, total, onPageChange, onPageSizeChange }: { page: number; pageCount: number; pageSize: number; total: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
    <span className="text-muted-foreground">共 {total} 条 · 第 {page} / {pageCount} 页</span>
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-muted-foreground">每页<select className="h-8 border border-border bg-background px-2 text-foreground" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} aria-label="每页条数"><option value={10}>10</option><option value={20}>20</option></select>条</label>
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</Button>
      <Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>下一页</Button>
    </div>
  </div>
}

function ApiKeysTable({
  apiKeys,
  groups,
  canReveal,
  revealedKeys,
  revealingKeyId,
  readError,
  onReveal,
  onCopy,
}: {
  apiKeys: UpstreamSnapshotRecord["summary"]["apiKeys"]
  groups: UpstreamSnapshotRecord["summary"]["groups"]
  canReveal: boolean
  revealedKeys: Record<string, string>
  revealingKeyId?: string
  readError?: string
  onReveal: (tokenId: string) => void
  onCopy: (key: string) => Promise<void>
}) {
  const [selectedPlatform, setSelectedPlatform] = useState("all")
  const [selectedGroup, setSelectedGroup] = useState("all")
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
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
  const groupByIdOrName = new Map<string, (typeof groups)[number]>()
  groups.forEach((group) => {
    groupByIdOrName.set(group.id, group)
    groupByIdOrName.set(group.name, group)
  })
  const groupForKey = (apiKey: (typeof apiKeys)[number]) =>
    (apiKey.groupId ? groupByIdOrName.get(apiKey.groupId) : undefined) ??
    (apiKey.groupName ? groupByIdOrName.get(apiKey.groupName) : undefined)
  const groupValueForKey = (apiKey: (typeof apiKeys)[number]) =>
    groupForKey(apiKey)?.id ?? apiKey.groupId ?? apiKey.groupName ?? "unassigned"
  const groupLabelForKey = (apiKey: (typeof apiKeys)[number]) =>
    groupForKey(apiKey)?.name ?? apiKey.groupName ?? apiKey.groupId ?? "未分组"
  const groupOptions = [...new Map(apiKeys.map((key) => [
    groupValueForKey(key), groupLabelForKey(key),
  ])).entries()].sort((left, right) => left[1].localeCompare(right[1], "zh-CN"))
  const filteredKeys = apiKeys.filter((apiKey) =>
    (selectedPlatform === "all" || platformForKey(apiKey) === selectedPlatform) &&
    (selectedGroup === "all" || groupValueForKey(apiKey) === selectedGroup),
  )
  const pageCount = Math.max(1, Math.ceil(filteredKeys.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleKeys = filteredKeys.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader>
        <CardTitle>API Key</CardTitle>
        <CardDescription>点击查看时从上游即时读取明文；明文不会保存在快照中。</CardDescription>
      </CardHeader>
      <CardContent className="grid flex-1 content-start gap-3">
        {readError && <p role="alert" className="text-sm text-destructive">读取密钥失败：{readError}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-2"><Filter aria-hidden="true" className="size-4" />厂商</span>
          <select
            className="h-9 w-full min-w-0 border border-border bg-background px-3 text-sm text-foreground"
            value={selectedPlatform}
            onChange={(event) => { setSelectedPlatform(event.target.value); setPage(1) }}
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
          </label>
          <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
            <span>分组</span>
            <select className="h-9 w-full min-w-0 border border-border bg-background px-3 text-sm text-foreground" value={selectedGroup} onChange={(event) => { setSelectedGroup(event.target.value); setPage(1) }} aria-label="按分组筛选 API Key">
              <option value="all">全部分组 ({apiKeys.length})</option>
              {groupOptions.map(([value, label]) => <option key={value} value={value}>{label} ({apiKeys.filter((key) => groupValueForKey(key) === value).length})</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>显示 {filteredKeys.length} / {apiKeys.length}</span>
          <span>第 {currentPage} / {pageCount} 页</span>
        </div>
        <div className="min-h-[480px] min-w-0 flex-1 overflow-x-auto">
          <table className="w-full min-w-[700px] table-fixed text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="w-[21%] px-3 py-3">名称</th>
                <th className="w-[29%] px-3 py-3">Key</th>
                <th className="w-[14%] px-3 py-3">分组</th>
                <th className="w-[12%] px-3 py-3">厂商</th>
                <th className="w-[10%] px-3 py-3">状态</th>
                <th className="w-[7%] px-3 py-3">额度</th>
                <th className="w-[7%] px-3 py-3">已用</th>
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
                    className="h-12 border-b border-border/70"
                  >
                    <td className="px-3 py-3 font-semibold"><span className="block truncate" title={apiKey.name ?? "-"}>{apiKey.name ?? "-"}</span></td>
                    <td className="min-w-0 px-3 py-3">
                      {revealedKeys[apiKey.id ?? ""] ? (
                        <div className="flex min-w-0 items-center gap-1">
                          <code className="block min-w-0 flex-1 truncate text-xs" title={revealedKeys[apiKey.id ?? ""]}>{revealedKeys[apiKey.id ?? ""]}</code>
                          <Button type="button" variant="outline" size="sm" className="shrink-0 px-2" aria-label="复制 API Key" onClick={() => void onCopy(revealedKeys[apiKey.id ?? ""] ?? "")}>
                            <Copy aria-hidden="true" />
                          </Button>
                        </div>
                      ) : canReveal && apiKey.id ? (
                        <div className="flex min-w-0 items-center gap-1">
                          <span className="block min-w-0 flex-1 truncate text-muted-foreground" title={apiKey.keyPreview ?? "未提供掩码"}>{apiKey.keyPreview ?? "未提供掩码"}</span>
                          <Button type="button" variant="outline" size="sm" className="shrink-0 px-2" disabled={revealingKeyId === apiKey.id} onClick={() => onReveal(apiKey.id!)}>
                            {revealingKeyId === apiKey.id ? "读取中..." : "查看"}
                          </Button>
                        </div>
                      ) : <span className="block truncate text-muted-foreground" title={apiKey.keyPreview ?? "-"}>{apiKey.keyPreview ?? "-"}</span>}
                    </td>
                    <td className="px-3 py-3"><span className="block truncate" title={groupLabelForKey(apiKey)}>{groupLabelForKey(apiKey)}</span></td>
                    <td className="px-3 py-3"><span className="block truncate" title={platformForKey(apiKey)}>{platformForKey(apiKey)}</span></td>
                    <td className="px-3 py-3"><span className="block truncate" title={apiKey.status ?? "-"}>{apiKey.status ?? "-"}</span></td>
                    <td className="px-3 py-3">{formatMaybeNumber(apiKey.quota)}</td>
                    <td className="px-3 py-3">{formatMaybeNumber(apiKey.used)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination page={currentPage} pageCount={pageCount} pageSize={pageSize} total={filteredKeys.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
      </CardContent>
    </Card>
  )
}
