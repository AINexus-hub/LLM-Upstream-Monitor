import type { NotificationRecord, PublicChannel } from "@llm-upstream-monitor/shared"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CheckboxInput, SelectInput } from "@/components/form-controls"
import { formatDateTime } from "@/utils/format"
import {
  notificationMatchesType,
  type NotificationSeverityFilter,
  type NotificationTypeFilter,
} from "@/utils/notifications"

type NotificationCenterPageProps = {
  channels: PublicChannel[]
  includeArchived: boolean
  notifications: NotificationRecord[]
  onArchive: (notification: NotificationRecord) => void
  onArchiveRead: () => void
  onDelete: (notification: NotificationRecord) => void
  onIncludeArchivedChange: (includeArchived: boolean) => void
  onLoadMore: () => void
  onMarkAllRead: () => void
  onMarkRead: (notification: NotificationRecord) => void
  onSelectChannel: (channelId: string) => void
}

export default function NotificationCenterPage({
  channels,
  includeArchived,
  notifications,
  onArchive,
  onArchiveRead,
  onDelete,
  onIncludeArchivedChange,
  onLoadMore,
  onMarkAllRead,
  onMarkRead,
  onSelectChannel,
}: NotificationCenterPageProps) {
  const [severityFilter, setSeverityFilter] = useState<NotificationSeverityFilter>("all")
  const [typeFilter, setTypeFilter] = useState<NotificationTypeFilter>("all")
  const [channelFilter, setChannelFilter] = useState("all")
  const unreadCount = notifications.filter((notification) => !notification.readAt).length
  const filteredNotifications = notifications.filter((notification) => {
    const severityMatched =
      severityFilter === "all" || notification.severity === severityFilter
    const typeMatched =
      typeFilter === "all" || notificationMatchesType(notification.type, typeFilter)
    const channelMatched = channelFilter === "all" || notification.channelId === channelFilter

    return severityMatched && typeMatched && channelMatched
  })

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">通知中心</h2>
          <p className="text-sm text-muted-foreground">
            集中查看余额、检测、上游同步、分组和倍率变化告警。
          </p>
        </div>
        <div className="border border-border bg-card px-3 py-2 text-sm">
          未读 <strong>{unreadCount}</strong> / 全部 <strong>{notifications.length}</strong>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto_auto_auto] xl:items-end">
          <SelectInput
            label="级别"
            value={severityFilter}
            onChange={(value) => setSeverityFilter(value as NotificationSeverityFilter)}
            options={[
              { label: "全部级别", value: "all" },
              { label: "错误", value: "error" },
              { label: "警告", value: "warning" },
              { label: "信息", value: "info" },
            ]}
          />
          <SelectInput
            label="类型"
            value={typeFilter}
            onChange={(value) => setTypeFilter(value as NotificationTypeFilter)}
            options={[
              { label: "全部类型", value: "all" },
              { label: "余额告警", value: "balance_alert" },
              { label: "检测失败", value: "check_failed" },
              { label: "上游同步失败", value: "upstream_sync_failed" },
              { label: "分组变动", value: "group_change" },
              { label: "倍率变化", value: "group_rate" },
            ]}
          />
          <SelectInput
            label="供应商"
            value={channelFilter}
            onChange={setChannelFilter}
            options={[
              { label: "全部供应商", value: "all" },
              ...channels.map((channel) => ({ label: channel.name, value: channel.id })),
            ]}
          />
          <CheckboxInput
            label="显示归档"
            checked={includeArchived}
            onChange={onIncludeArchivedChange}
          />
          <Button
            className="h-10"
            variant="outline"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0}
          >
            全部标记已读
          </Button>
          <Button className="h-10" variant="outline" onClick={onArchiveRead}>
            归档已读
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filteredNotifications.length === 0 ? (
            <div className="border border-dashed border-border p-6 text-sm text-muted-foreground">
              当前筛选条件下没有通知，系统安静得像凌晨三点的数据中心。
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className="grid gap-2 px-4 py-3 hover:bg-muted/70 md:grid-cols-[150px_1fr_auto] md:items-center"
                >
                  <div className="flex items-center gap-2">
                    <span className={notificationSeverityClass(notification.severity)}>
                      {notification.severity === "error"
                        ? "错误"
                        : notification.severity === "warning"
                          ? "警告"
                          : "信息"}
                    </span>
                    {!notification.readAt && (
                      <span className="border border-primary/45 bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                        未读
                      </span>
                    )}
                  </div>
                  <button
                    className="min-w-0 text-left"
                    onClick={() => notification.channelId && onSelectChannel(notification.channelId)}
                    type="button"
                  >
                    <p className="font-semibold">{notification.title}</p>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {notification.body}
                    </p>
                  </button>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(notification.createdAt)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onMarkRead(notification)}
                      disabled={Boolean(notification.readAt)}
                    >
                      {notification.readAt ? "已读" : "标记已读"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onArchive(notification)}
                      disabled={Boolean(notification.archivedAt)}
                    >
                      {notification.archivedAt ? "已归档" : "归档"}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => onDelete(notification)}>
                      删除
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex justify-center p-4">
                <Button variant="outline" onClick={onLoadMore}>
                  加载更多
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function notificationSeverityClass(severity: NotificationRecord["severity"]) {
  if (severity === "error") {
    return "border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive"
  }

  if (severity === "warning") {
    return "border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-200"
  }

  return "border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
}
