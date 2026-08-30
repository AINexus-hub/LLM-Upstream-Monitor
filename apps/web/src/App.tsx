import type {
  BalanceCheckRecord,
  NotificationChannel,
  NotificationRecord,
  NotificationSettingsPayload,
  PublicChannel,
  PublicNotificationSettings,
  UpstreamSnapshotRecord,
} from "@llm-upstream-monitor/shared"
import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { ChannelModal } from "@/components/channel/ChannelModal"
import { AppHeader } from "@/components/layout/AppHeader"
import type { ChannelFormState, ChecksByChannel, Page, Sub2ApiUpstreamSnapshot, TimeRange } from "@/types/app"
import { channelToForm, emptyForm, formToPayload, summarizeSub2ApiSnapshot } from "@/utils/channel-form"
import { buildInsights } from "@/utils/dashboard"
import { getAdjustedRemaining } from "@/utils/format"
import { isThemeName, type ThemeName } from "@/utils/theme"
import { buildNotifications, hasUpstreamLogin, mergeNotifications } from "@/utils/notifications"

const LoginPage = lazy(() => import("@/pages/LoginPage"))
const MonitorPage = lazy(() => import("@/pages/MonitorPage"))
const UpstreamAccountsPage = lazy(() => import("@/pages/UpstreamAccountsPage"))
const ChannelsPage = lazy(() => import("@/pages/ChannelsPage"))
const NotificationCenterPage = lazy(() => import("@/pages/NotificationCenterPage"))
const NotificationSettingsPage = lazy(() => import("@/pages/NotificationSettingsPage"))

const configuredApiBaseUrl =
  new URLSearchParams(window.location.search).get("apiBaseUrl") ?? import.meta.env.VITE_API_BASE_URL
const API_BASE_URL =
  configuredApiBaseUrl ??
  (window.location.hostname === "localhost" && window.location.port === "5300"
    ? "http://localhost:3000"
    : window.location.origin)
const authStorageKey = "llm-upstream-monitor-token"
const themeStorageKey = "llm-upstream-monitor-theme"
const localNotificationReadStorageKey = "llm-upstream-monitor-local-notification-read"
const localNotificationArchivedStorageKey = "llm-upstream-monitor-local-notification-archived"
const localNotificationDeletedStorageKey = "llm-upstream-monitor-local-notification-deleted"
const checksPerChannelLimit = 2000
const notificationPageSize = 50
const upstreamSnapshotPollMs = 60_000

type ApiResponse<T> = {
  data: T
}

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function readLocalNotificationIds() {
  return readStoredStringArray(localNotificationReadStorageKey)
}

function readStoredStringArray(key: string) {
  try {
    const value = localStorage.getItem(key)
    const parsed = value ? (JSON.parse(value) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

async function request<T>(path: string, init?: RequestInit, authToken?: string) {
  const headers = new Headers(init?.headers)

  if (init?.body !== undefined) {
    headers.set("Content-Type", "application/json")
  }

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers,
    ...init,
  })

  const body = (await response.json().catch(() => null)) as
    ApiResponse<T> | { message?: string } | null

  if (!response.ok) {
    throw new ApiError(
      (body && "message" in body && body.message) || `请求失败：${response.status}`,
      response.status,
    )
  }

  return (body as ApiResponse<T>).data
}

function App() {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(authStorageKey) ?? "")
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const storedTheme = localStorage.getItem(themeStorageKey)
    return isThemeName(storedTheme) ? storedTheme : "aurora"
  })
  const [localReadNotificationIds, setLocalReadNotificationIds] = useState<string[]>(
    readLocalNotificationIds,
  )
  const [localArchivedNotificationIds, setLocalArchivedNotificationIds] = useState<string[]>(() =>
    readStoredStringArray(localNotificationArchivedStorageKey),
  )
  const [localDeletedNotificationIds, setLocalDeletedNotificationIds] = useState<string[]>(() =>
    readStoredStringArray(localNotificationDeletedStorageKey),
  )
  const [activePage, setActivePage] = useState<Page>("monitor")
  const [channels, setChannels] = useState<PublicChannel[]>([])
  const [checksByChannel, setChecksByChannel] = useState<ChecksByChannel>({})
  const [upstreamSnapshots, setUpstreamSnapshots] = useState<UpstreamSnapshotRecord[]>([])
  const [stationNotifications, setStationNotifications] = useState<NotificationRecord[]>([])
  const [notificationSettings, setNotificationSettings] = useState<PublicNotificationSettings>()
  const [selectedChannelId, setSelectedChannelId] = useState<string>()
  const [selectedUpstreamChannelId, setSelectedUpstreamChannelId] = useState<string>()
  const [timeRange, setTimeRange] = useState<TimeRange>("24h")
  const [hiddenChannelIds, setHiddenChannelIds] = useState<string[]>([])
  const [form, setForm] = useState<ChannelFormState>(emptyForm)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [checkingId, setCheckingId] = useState<string>()
  const [deletingId, setDeletingId] = useState<string>()
  const [syncingId, setSyncingId] = useState<string>()
  const [diagnosingId, setDiagnosingId] = useState<string>()
  const [refreshingSnapshotId, setRefreshingSnapshotId] = useState<string>()
  const [isNotificationSettingsLoading, setIsNotificationSettingsLoading] = useState(false)
  const [isNotificationSettingsSaving, setIsNotificationSettingsSaving] = useState(false)
  const [testingNotificationTarget, setTestingNotificationTarget] = useState<NotificationChannel>()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [includeArchivedNotifications, setIncludeArchivedNotifications] = useState(false)
  const [notificationLimit, setNotificationLimit] = useState(notificationPageSize)

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId),
    [channels, selectedChannelId],
  )

  const checks = selectedChannelId ? (checksByChannel[selectedChannelId] ?? []) : []

  const totalCheckCount = useMemo(
    () => Object.values(checksByChannel).reduce((sum, channelChecks) => sum + channelChecks.length, 0),
    [checksByChannel],
  )

  const notifications = useMemo(() => buildNotifications(channels), [channels])
  const mergedNotifications = useMemo(
    () =>
      mergeNotifications(stationNotifications, notifications).map((notification) =>
        !notification.readAt && localReadNotificationIds.includes(notification.id)
          ? { ...notification, readAt: "local" }
          : notification,
      ).filter((notification) => {
        if (localDeletedNotificationIds.includes(notification.id)) {
          return false
        }

        if (!includeArchivedNotifications && localArchivedNotificationIds.includes(notification.id)) {
          return false
        }

        return includeArchivedNotifications || !notification.archivedAt
      }),
    [
      stationNotifications,
      notifications,
      localReadNotificationIds,
      localDeletedNotificationIds,
      localArchivedNotificationIds,
      includeArchivedNotifications,
    ],
  )
  const notificationSummary = useMemo(
    () => mergedNotifications.filter((notification) => notification.severity !== "info").slice(0, 3),
    [mergedNotifications],
  )
  const insights = useMemo(() => buildInsights(channels, checksByChannel), [channels, checksByChannel])

  const totalRemaining = useMemo(
    () =>
      channels.reduce((sum, channel) => {
        return sum + (getAdjustedRemaining(channel) ?? 0)
      }, 0),
    [channels],
  )

  async function loadChannels(nextSelectedId?: string) {
    if (!authToken) {
      return
    }

    setIsLoading(true)
    setError(undefined)

    try {
      const data = await request<PublicChannel[]>("/api/channels", undefined, authToken)
      setChannels(data)

      const fallbackId = data[0]?.id
      const targetId =
        nextSelectedId ??
        (selectedChannelId && data.some((channel) => channel.id === selectedChannelId)
          ? selectedChannelId
          : fallbackId)

      setSelectedChannelId(targetId)
      setSelectedUpstreamChannelId((current) => {
        const accountChannels = data.filter(hasUpstreamLogin)
        if (current && accountChannels.some((channel) => channel.id === current)) {
          return current
        }

        return accountChannels[0]?.id
      })

      await Promise.all([loadAllChecks(data), loadUpstreamSnapshots(), loadStationNotifications()])
    } catch (caught) {
      handleRequestError(caught, "加载供应商失败")
    } finally {
      setIsLoading(false)
    }
  }

  async function loadAllChecks(nextChannels: PublicChannel[]) {
    const entries = await Promise.all(
      nextChannels.map(async (channel) => {
        const data = await request<BalanceCheckRecord[]>(
          `/api/channels/${channel.id}/checks?limit=${checksPerChannelLimit}`,
          undefined,
          authToken,
        )
        return [channel.id, data] as const
      }),
    )

    setChecksByChannel(Object.fromEntries(entries))
  }

  async function loadUpstreamSnapshots() {
    const data = await request<UpstreamSnapshotRecord[]>(
      "/api/upstream-accounts/snapshots",
      undefined,
      authToken,
    )
    setUpstreamSnapshots(data)
  }

  async function loadStationNotifications() {
    const params = new URLSearchParams({
      includeArchived: String(includeArchivedNotifications),
      limit: String(notificationLimit),
      offset: "0",
    })
    const data = await request<NotificationRecord[]>(
      `/api/notifications?${params.toString()}`,
      undefined,
      authToken,
    )
    setStationNotifications(data)
  }

  async function loadNotificationSettings() {
    if (!authToken) {
      return
    }

    setIsNotificationSettingsLoading(true)
    setError(undefined)

    try {
      const data = await request<PublicNotificationSettings>(
        "/api/notification-settings",
        undefined,
        authToken,
      )
      setNotificationSettings(data)
    } catch (caught) {
      handleRequestError(caught, "加载通知配置失败")
    } finally {
      setIsNotificationSettingsLoading(false)
    }
  }

  function updateLocalReadNotificationIds(nextIds: string[]) {
    const uniqueIds = Array.from(new Set(nextIds))
    setLocalReadNotificationIds(uniqueIds)
    localStorage.setItem(localNotificationReadStorageKey, JSON.stringify(uniqueIds))
  }

  function updateLocalArchivedNotificationIds(nextIds: string[]) {
    const uniqueIds = Array.from(new Set(nextIds))
    setLocalArchivedNotificationIds(uniqueIds)
    localStorage.setItem(localNotificationArchivedStorageKey, JSON.stringify(uniqueIds))
  }

  function updateLocalDeletedNotificationIds(nextIds: string[]) {
    const uniqueIds = Array.from(new Set(nextIds))
    setLocalDeletedNotificationIds(uniqueIds)
    localStorage.setItem(localNotificationDeletedStorageKey, JSON.stringify(uniqueIds))
  }

  async function handleMarkNotificationRead(notification: NotificationRecord) {
    updateLocalReadNotificationIds([...localReadNotificationIds, notification.id])

    if (stationNotifications.some((item) => item.id === notification.id)) {
      await request<{ ok: boolean }>(
        `/api/notifications/${notification.id}/read`,
        { method: "PATCH" },
        authToken,
      )
      await loadStationNotifications()
    }
  }

  async function handleMarkAllNotificationsRead() {
    updateLocalReadNotificationIds(mergedNotifications.map((notification) => notification.id))
    await request<{ ok: boolean }>("/api/notifications/read-all", { method: "POST" }, authToken)
    await loadStationNotifications()
  }

  async function handleArchiveNotification(notification: NotificationRecord) {
    updateLocalArchivedNotificationIds([...localArchivedNotificationIds, notification.id])

    if (stationNotifications.some((item) => item.id === notification.id)) {
      await request<{ ok: boolean }>(
        `/api/notifications/${notification.id}/archive`,
        { method: "PATCH" },
        authToken,
      )
      await loadStationNotifications()
    }
  }

  async function handleDeleteNotification(notification: NotificationRecord) {
    updateLocalDeletedNotificationIds([...localDeletedNotificationIds, notification.id])

    if (stationNotifications.some((item) => item.id === notification.id)) {
      await request<{ ok: boolean }>(
        `/api/notifications/${notification.id}`,
        { method: "DELETE" },
        authToken,
      )
      await loadStationNotifications()
    }
  }

  async function handleArchiveReadNotifications() {
    const readIds = mergedNotifications
      .filter((notification) => notification.readAt)
      .map((notification) => notification.id)
    updateLocalArchivedNotificationIds([...localArchivedNotificationIds, ...readIds])
    await request<{ ok: boolean }>("/api/notifications/archive-read", { method: "POST" }, authToken)
    await loadStationNotifications()
  }

  function handleLoadMoreNotifications() {
    setNotificationLimit((current) => current + notificationPageSize)
  }

  useEffect(() => {
    if (authToken) {
      void loadChannels()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])

  useEffect(() => {
    if (!authToken || activePage !== "upstream") {
      return
    }

    const timer = window.setInterval(() => {
      void Promise.all([loadUpstreamSnapshots(), loadStationNotifications()])
    }, upstreamSnapshotPollMs)

    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, authToken])

  useEffect(() => {
    if (!authToken || activePage !== "notifications") {
      return
    }

    void loadStationNotifications()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, authToken, includeArchivedNotifications, notificationLimit])

  useEffect(() => {
    if (!authToken || activePage !== "notification-settings") {
      return
    }

    void loadNotificationSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, authToken])

  useEffect(() => {
    document.documentElement.dataset.theme = themeName
    localStorage.setItem(themeStorageKey, themeName)
  }, [themeName])

  function handleRequestError(caught: unknown, fallbackMessage: string) {
    if (caught instanceof ApiError && caught.status === 401) {
      localStorage.removeItem(authStorageKey)
      setAuthToken("")
      setError("登录已失效，请重新登录")
      return
    }

    setError(caught instanceof Error ? caught.message : fallbackMessage)
  }

  async function handleLogin(password: string) {
    setIsLoggingIn(true)
    setError(undefined)

    try {
      const data = await request<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      })

      localStorage.setItem(authStorageKey, data.token)
      setAuthToken(data.token)
      setMessage(undefined)
      setError(undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败")
    } finally {
      setIsLoggingIn(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem(authStorageKey)
    setAuthToken("")
    setChannels([])
    setChecksByChannel({})
    setUpstreamSnapshots([])
    setStationNotifications([])
    setNotificationSettings(undefined)
    setSelectedChannelId(undefined)
    setSelectedUpstreamChannelId(undefined)
    setMessage(undefined)
    setError(undefined)
  }

  function openCreateModal() {
    setActivePage("channels")
    setForm(emptyForm)
    setIsModalOpen(true)
    setMessage(undefined)
    setError(undefined)
  }

  function openEditModal(channel: PublicChannel) {
    setActivePage("channels")
    setSelectedChannelId(channel.id)
    setForm(channelToForm(channel))
    setIsModalOpen(true)
    setMessage(undefined)
    setError(undefined)
  }

  function closeModal() {
    setIsModalOpen(false)
    setForm(emptyForm)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError(undefined)
    setMessage(undefined)

    try {
      const payload = formToPayload(form)
      const saved = form.id
        ? await request<PublicChannel>(
            `/api/channels/${form.id}`,
            {
              method: "PATCH",
              body: JSON.stringify(payload),
            },
            authToken,
          )
        : await request<PublicChannel>(
            "/api/channels",
            {
              method: "POST",
              body: JSON.stringify(payload),
            },
            authToken,
          )

      setMessage(form.id ? "供应商配置已保存" : "供应商已添加")
      closeModal()
      await loadChannels(saved.id)
    } catch (caught) {
      handleRequestError(caught, "保存供应商失败")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteChannel(channel: PublicChannel) {
    if (!window.confirm(`确定删除供应商“${channel.name}”吗？相关检测记录和上游快照也会一起删除。`)) {
      return
    }

    setDeletingId(channel.id)
    setError(undefined)
    setMessage(undefined)

    try {
      await request<{ ok: boolean }>(
        `/api/channels/${channel.id}`,
        {
          method: "DELETE",
        },
        authToken,
      )
      setMessage("供应商已删除")
      setChecksByChannel((current) => {
        const next = { ...current }
        delete next[channel.id]
        return next
      })
      setUpstreamSnapshots((current) =>
        current.filter((snapshot) => snapshot.channelId !== channel.id),
      )
      await loadChannels()
    } catch (caught) {
      handleRequestError(caught, "删除供应商失败")
    } finally {
      setDeletingId(undefined)
    }
  }

  async function handleCheck(channelId: string) {
    setCheckingId(channelId)
    setError(undefined)
    setMessage(undefined)

    try {
      const record = await request<BalanceCheckRecord>(
        `/api/channels/${channelId}/check`,
        {
          method: "POST",
        },
        authToken,
      )
      if (record.success) {
        setMessage("余额检测完成")
      } else {
        setError(record.errorMessage || "余额检测失败")
      }
      await loadChannels(channelId)
    } catch (caught) {
      handleRequestError(caught, "余额检测失败")
    } finally {
      setCheckingId(undefined)
    }
  }

  async function handleSyncCheck(channel: PublicChannel) {
    if (hasUpstreamLogin(channel)) {
      await handleSyncUpstream(channel.id)
      return
    }

    await handleCheck(channel.id)
  }

  async function handleSyncUpstream(channelId: string) {
    setSyncingId(channelId)
    setError(undefined)
    setMessage(undefined)

    try {
      const record = await request<BalanceCheckRecord>(
        `/api/channels/${channelId}/sync-upstream`,
        {
          method: "POST",
        },
        authToken,
      )
      if (record.success) {
        setMessage("上游登录态同步完成")
      } else {
        setError(record.errorMessage || "上游同步失败")
      }
      await loadChannels(channelId)
    } catch (caught) {
      handleRequestError(caught, "上游同步失败")
    } finally {
      setSyncingId(undefined)
    }
  }

  async function handleDiagnoseChannel(channel: PublicChannel) {
    if (hasUpstreamLogin(channel)) {
      await handleDiagnoseUpstream(channel.id)
      return
    }

    setDiagnosingId(channel.id)
    setError(undefined)
    setMessage(undefined)

    try {
      const record = await request<BalanceCheckRecord>(
        `/api/channels/${channel.id}/check`,
        {
          method: "POST",
        },
        authToken,
      )

      if (record.success) {
        setMessage("诊断完成：基础检测接口可用")
      } else {
        setError(record.errorMessage || "诊断失败")
      }
      await loadChannels(channel.id)
    } catch (caught) {
      handleRequestError(caught, "诊断失败")
    } finally {
      setDiagnosingId(undefined)
    }
  }

  async function handleDiagnoseUpstream(channelId: string) {
    setDiagnosingId(channelId)
    setError(undefined)
    setMessage(undefined)

    try {
      const snapshot = await request<Sub2ApiUpstreamSnapshot>(
        `/api/channels/${channelId}/sync-upstream/diagnose`,
        {
          method: "POST",
        },
        authToken,
      )
      setMessage(summarizeSub2ApiSnapshot(snapshot))
      await loadChannels(channelId)
    } catch (caught) {
      handleRequestError(caught, "上游诊断失败")
    } finally {
      setDiagnosingId(undefined)
    }
  }

  async function handleRefreshUpstreamSnapshot(channelId: string) {
    setRefreshingSnapshotId(channelId)
    setError(undefined)
    setMessage(undefined)

    try {
      await request<UpstreamSnapshotRecord>(
        `/api/channels/${channelId}/upstream-account/refresh`,
        {
          method: "POST",
        },
        authToken,
      )
      setMessage("账号看板快照已刷新")
      await Promise.all([loadChannels(channelId), loadUpstreamSnapshots(), loadStationNotifications()])
      setSelectedUpstreamChannelId(channelId)
    } catch (caught) {
      handleRequestError(caught, "账号看板刷新失败")
    } finally {
      setRefreshingSnapshotId(undefined)
    }
  }

  async function handleSaveNotificationSettings(payload: NotificationSettingsPayload) {
    setIsNotificationSettingsSaving(true)
    setError(undefined)

    try {
      const data = await request<PublicNotificationSettings>(
        "/api/notification-settings",
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
        authToken,
      )
      setNotificationSettings(data)
    } catch (caught) {
      handleRequestError(caught, "保存通知配置失败")
      throw caught
    } finally {
      setIsNotificationSettingsSaving(false)
    }
  }

  async function handleTestNotification(target: NotificationChannel) {
    setTestingNotificationTarget(target)
    setError(undefined)

    try {
      await request<{ ok: boolean }>(
        "/api/notification-settings/test",
        {
          method: "POST",
          body: JSON.stringify({ target }),
        },
        authToken,
      )
    } catch (caught) {
      handleRequestError(caught, "测试通知发送失败")
      throw caught
    } finally {
      setTestingNotificationTarget(undefined)
    }
  }

  if (!authToken) {
    return (
      <LoginPage
        error={error}
        isLoggingIn={isLoggingIn}
        onLogin={(password) => void handleLogin(password)}
      />
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6 px-3 py-5 sm:px-4 xl:px-5">
        <AppHeader
          activePage={activePage}
          themeName={themeName}
          onLogout={handleLogout}
          onPageChange={setActivePage}
          onThemeChange={setThemeName}
        />

        {(message || error) && (
          <div
            className={
              error
                ? "border border-destructive bg-background p-3 text-sm font-medium text-destructive"
                : "border border-border bg-muted p-3 text-sm font-medium"
            }
          >
            {error ?? message}
          </div>
        )}

        {activePage === "monitor" ? (
          <MonitorPage
            channels={channels}
            checks={checks}
            checksByChannel={checksByChannel}
            checkingId={checkingId}
            hiddenChannelIds={hiddenChannelIds}
            insights={insights}
            isLoading={isLoading}
            notifications={notificationSummary}
            selectedChannel={selectedChannel}
            selectedChannelId={selectedChannelId}
            timeRange={timeRange}
            totalCheckCount={totalCheckCount}
            totalRemaining={totalRemaining}
            onCheck={handleCheck}
            onCreate={openCreateModal}
            onHiddenChannelIdsChange={setHiddenChannelIds}
            onSelectChannel={setSelectedChannelId}
            onTimeRangeChange={setTimeRange}
          />
        ) : activePage === "upstream" ? (
          <UpstreamAccountsPage
            channels={channels}
            refreshingSnapshotId={refreshingSnapshotId}
            selectedChannelId={selectedUpstreamChannelId}
            snapshots={upstreamSnapshots}
            onCreate={openCreateModal}
            onRefresh={handleRefreshUpstreamSnapshot}
            onSelectChannel={setSelectedUpstreamChannelId}
          />
        ) : activePage === "notifications" ? (
          <Suspense fallback={<div className="border border-border bg-card p-4 text-sm text-muted-foreground">正在加载通知中心...</div>}>
            <NotificationCenterPage
              channels={channels}
              includeArchived={includeArchivedNotifications}
              notifications={mergedNotifications}
              onArchive={(notification) => void handleArchiveNotification(notification)}
              onArchiveRead={() => void handleArchiveReadNotifications()}
              onDelete={(notification) => void handleDeleteNotification(notification)}
              onIncludeArchivedChange={setIncludeArchivedNotifications}
              onLoadMore={handleLoadMoreNotifications}
              onMarkAllRead={() => void handleMarkAllNotificationsRead()}
              onMarkRead={(notification) => void handleMarkNotificationRead(notification)}
              onSelectChannel={(channelId) => {
                setSelectedChannelId(channelId)
                setActivePage("channels")
              }}
            />
          </Suspense>
        ) : activePage === "notification-settings" ? (
          <Suspense fallback={<div className="border border-border bg-card p-4 text-sm text-muted-foreground">正在加载通知设置...</div>}>
            <NotificationSettingsPage
              isLoading={isNotificationSettingsLoading}
              isSaving={isNotificationSettingsSaving}
              settings={notificationSettings}
              testingTarget={testingNotificationTarget}
              onLoad={() => void loadNotificationSettings()}
              onSave={handleSaveNotificationSettings}
              onTest={handleTestNotification}
            />
          </Suspense>
        ) : (
          <ChannelsPage
            channels={channels}
            checkingId={checkingId}
            deletingId={deletingId}
            diagnosingId={diagnosingId}
            syncingId={syncingId}
            isLoading={isLoading}
            selectedChannelId={selectedChannelId}
            onCreate={openCreateModal}
            onDiagnose={handleDiagnoseChannel}
            onDelete={handleDeleteChannel}
            onEdit={openEditModal}
            onSelectChannel={setSelectedChannelId}
            onSyncCheck={handleSyncCheck}
          />
        )}
      </div>

      {isModalOpen && (
        <ChannelModal
          form={form}
          isSaving={isSaving}
          onClose={closeModal}
          onSubmit={handleSubmit}
          setForm={setForm}
        />
      )}
    </main>
  )
}

export default App
