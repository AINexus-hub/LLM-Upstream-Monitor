import type {
  NotificationChannel,
  NotificationSettingsPayload,
  NotificationType,
  PublicNotificationSettings,
} from "@llm-upstream-monitor/shared"
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Mail,
  Plus,
  Save,
  Send,
  Smartphone,
  Trash2,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { CheckboxInput } from "@/components/form-controls"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type NotificationSettingsPageProps = {
  isLoading: boolean
  isSaving: boolean
  testingTarget?: NotificationChannel
  settings?: PublicNotificationSettings
  onLoad: () => void
  onSave: (payload: NotificationSettingsPayload) => Promise<void>
  onTest: (target: NotificationChannel) => Promise<void>
}

type SettingsForm = {
  telegramEnabled: boolean
  telegramBotToken: string
  telegramChatId: string
  smtpEnabled: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUsername: string
  smtpPassword: string
  smtpFrom: string
  smtpRecipients: SmtpRecipientForm[]
  cooldownMinutes: number
  enabledTypes: NotificationType[]
}

type SmtpRecipientForm = {
  id: string
  email: string
  enabledTypes: NotificationType[]
}

const notificationTypeOptions: Array<{ label: string; value: NotificationType }> = [
  { label: "余额告警", value: "balance_alert" },
  { label: "余额恢复", value: "balance_recovered" },
  { label: "检测失败", value: "check_failed" },
  { label: "检测恢复", value: "check_recovered" },
  { label: "上游同步失败", value: "upstream_sync_failed" },
  { label: "上游同步恢复", value: "upstream_sync_recovered" },
  { label: "新增分组", value: "upstream_group_added" },
  { label: "移除分组", value: "upstream_group_removed" },
  { label: "倍率变化", value: "upstream_group_rate_changed" },
]

function createRecipient(): SmtpRecipientForm {
  return {
    id: crypto.randomUUID(),
    email: "",
    enabledTypes: notificationTypeOptions.map((option) => option.value),
  }
}

function formFromSettings(settings?: PublicNotificationSettings): SettingsForm {
  const recipients = settings?.smtp.recipients.map((recipient) => ({
    id: recipient.id,
    email: recipient.email,
    enabledTypes: recipient.enabledTypes,
  }))

  return {
    telegramEnabled: settings?.telegram.enabled ?? false,
    telegramBotToken: "",
    telegramChatId: settings?.telegram.chatId ?? "",
    smtpEnabled: settings?.smtp.enabled ?? false,
    smtpHost: settings?.smtp.host ?? "",
    smtpPort: settings?.smtp.port ?? 465,
    smtpSecure: settings?.smtp.secure ?? true,
    smtpUsername: settings?.smtp.username ?? "",
    smtpPassword: "",
    smtpFrom: settings?.smtp.from ?? "",
    smtpRecipients: recipients && recipients.length > 0 ? recipients : [createRecipient()],
    cooldownMinutes: settings?.cooldownMinutes ?? 30,
    enabledTypes: settings?.enabledTypes ?? notificationTypeOptions.map((option) => option.value),
  }
}

export default function NotificationSettingsPage({
  isLoading,
  isSaving,
  testingTarget,
  settings,
  onLoad,
  onSave,
  onTest,
}: NotificationSettingsPageProps) {
  const [form, setForm] = useState<SettingsForm>(() => formFromSettings(settings))
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string }>()
  const [showTelegramToken, setShowTelegramToken] = useState(false)
  const [showSmtpPassword, setShowSmtpPassword] = useState(false)
  const [expandedRecipientIds, setExpandedRecipientIds] = useState<string[]>([])

  useEffect(() => {
    onLoad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setForm(formFromSettings(settings))
  }, [settings])

  const telegramEnabledTypeSet = useMemo(() => new Set(form.enabledTypes), [form.enabledTypes])

  function validate(target?: NotificationChannel) {
    if (target === "telegram" || form.telegramEnabled) {
      if (!form.telegramBotToken && !settings?.telegram.hasBotToken) {
        return "请填写 Telegram Bot Token"
      }
      if (!form.telegramChatId.trim()) {
        return "请填写 Telegram Chat ID"
      }
    }

    if (target === "smtp" || form.smtpEnabled) {
      if (!form.smtpHost.trim()) {
        return "请填写 SMTP Host"
      }
      if (!Number.isInteger(form.smtpPort) || form.smtpPort < 1 || form.smtpPort > 65535) {
        return "SMTP 端口必须在 1-65535 之间"
      }
      if (!form.smtpFrom.trim()) {
        return "请填写发件人邮箱"
      }
      if (!form.smtpFrom.includes("@")) {
        return "发件人邮箱格式不正确"
      }
      const recipients = form.smtpRecipients.filter((recipient) => recipient.email.trim())
      if (recipients.length === 0) {
        return "请至少添加一个收件人邮箱"
      }
      const invalidRecipient = recipients.find((recipient) => !recipient.email.includes("@"))
      if (invalidRecipient) {
        return `收件人邮箱格式不正确：${invalidRecipient.email}`
      }
      const recipientWithoutTypes = recipients.find((recipient) => recipient.enabledTypes.length === 0)
      if (recipientWithoutTypes) {
        return `请为 ${recipientWithoutTypes.email} 至少选择一种告警分类`
      }
      if (form.smtpUsername.trim() && !form.smtpPassword && !settings?.smtp.hasPassword) {
        return "使用 SMTP 账号时需要填写密码"
      }
    }

    if (!Number.isInteger(form.cooldownMinutes) || form.cooldownMinutes < 0 || form.cooldownMinutes > 1440) {
      return "通知冷却时间必须在 0-1440 分钟之间"
    }

    if (form.enabledTypes.length === 0) {
      return "请至少选择一种告警分类"
    }

    return undefined
  }

  function toPayload(): NotificationSettingsPayload {
    return {
      telegram: {
        enabled: form.telegramEnabled,
        botToken: form.telegramBotToken.trim(),
        chatId: form.telegramChatId.trim(),
      },
      smtp: {
        enabled: form.smtpEnabled,
        host: form.smtpHost.trim(),
        port: form.smtpPort,
        secure: form.smtpSecure,
        username: form.smtpUsername.trim(),
        password: form.smtpPassword,
        from: form.smtpFrom.trim(),
        recipients: form.smtpRecipients
          .filter((recipient) => recipient.email.trim())
          .map((recipient) => ({
            id: recipient.id,
            email: recipient.email.trim(),
            enabledTypes: recipient.enabledTypes,
          })),
      },
      cooldownMinutes: form.cooldownMinutes,
      enabledTypes: form.enabledTypes,
    }
  }

  async function handleSave() {
    const error = validate()
    if (error) {
      setToast({ type: "error", message: error })
      return
    }

    try {
      await onSave(toPayload())
      setToast({ type: "success", message: "通知配置已保存，新的告警会立即使用该配置。" })
    } catch (caught) {
      setToast({ type: "error", message: caught instanceof Error ? caught.message : "保存失败" })
    }
  }

  async function handleTest(target: NotificationChannel) {
    const error = validate(target)
    if (error) {
      setToast({ type: "error", message: error })
      return
    }

    try {
      await onSave(toPayload())
      await onTest(target)
      setToast({
        type: "success",
        message: target === "telegram" ? "Telegram 测试消息已发送" : "测试邮件已发送",
      })
    } catch (caught) {
      setToast({ type: "error", message: caught instanceof Error ? caught.message : "测试失败" })
    }
  }

  function toggleNotificationType(type: NotificationType, checked: boolean) {
    setForm((current) => ({
      ...current,
      enabledTypes: checked
        ? Array.from(new Set([...current.enabledTypes, type]))
        : current.enabledTypes.filter((item) => item !== type),
    }))
  }

  function addRecipient() {
    const recipient = createRecipient()
    setForm((current) => ({
      ...current,
      smtpRecipients: [...current.smtpRecipients, recipient],
    }))
    setExpandedRecipientIds((current) => [...current, recipient.id])
  }

  function updateRecipientEmail(id: string, email: string) {
    setForm((current) => ({
      ...current,
      smtpRecipients: current.smtpRecipients.map((recipient) =>
        recipient.id === id ? { ...recipient, email } : recipient,
      ),
    }))
  }

  function removeRecipient(id: string) {
    setForm((current) => ({
      ...current,
      smtpRecipients:
        current.smtpRecipients.length === 1
          ? [{ ...(current.smtpRecipients[0] ?? createRecipient()), email: "" }]
          : current.smtpRecipients.filter((recipient) => recipient.id !== id),
    }))
  }

  function toggleRecipientType(id: string, type: NotificationType, checked: boolean) {
    setForm((current) => ({
      ...current,
      smtpRecipients: current.smtpRecipients.map((recipient) => {
        if (recipient.id !== id) {
          return recipient
        }

        return {
          ...recipient,
          enabledTypes: checked
            ? Array.from(new Set([...recipient.enabledTypes, type]))
            : recipient.enabledTypes.filter((item) => item !== type),
        }
      }),
    }))
  }

  function toggleRecipientExpanded(id: string) {
    setExpandedRecipientIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">通知设置</h2>
          <p className="text-sm text-muted-foreground">
            配置 Telegram、SMTP 邮件、告警分类和邮件冷却时间。
          </p>
        </div>
        <Button onClick={() => void handleSave()} disabled={isSaving || isLoading}>
          <Save data-icon="inline-start" aria-hidden="true" />
          {isSaving ? "保存中" : "保存配置"}
        </Button>
      </div>

      {toast && (
        <div
          className={
            toast.type === "error"
              ? "border border-destructive bg-background p-3 text-sm font-medium text-destructive"
              : "border border-primary/40 bg-muted p-3 text-sm font-medium"
          }
        >
          {toast.message}
        </div>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">正在加载通知配置...</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Smartphone aria-hidden="true" className="size-4 text-primary" />
                  Telegram Bot
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <CheckboxInput
                  label="启用 Telegram 通知"
                  checked={form.telegramEnabled}
                  onChange={(telegramEnabled) => setForm({ ...form, telegramEnabled })}
                />
                <SecretInput
                  label={settings?.telegram.hasBotToken ? "Bot Token，留空则保持原值" : "Bot Token"}
                  value={form.telegramBotToken}
                  visible={showTelegramToken}
                  onChange={(telegramBotToken) => setForm({ ...form, telegramBotToken })}
                  onToggleVisible={() => setShowTelegramToken((current) => !current)}
                />
                <TextInput
                  label="Chat ID"
                  value={form.telegramChatId}
                  onChange={(telegramChatId) => setForm({ ...form, telegramChatId })}
                  placeholder="-1001234567890"
                />
                <Button
                  variant="outline"
                  onClick={() => void handleTest("telegram")}
                  disabled={isSaving || testingTarget === "telegram"}
                >
                  <Send data-icon="inline-start" aria-hidden="true" />
                  {testingTarget === "telegram" ? "测试中" : "测试连接"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail aria-hidden="true" className="size-4 text-primary" />
                  SMTP 邮件
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <CheckboxInput
                  label="启用 SMTP 邮件通知"
                  checked={form.smtpEnabled}
                  onChange={(smtpEnabled) => setForm({ ...form, smtpEnabled })}
                />
                <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                  <TextInput
                    label="SMTP Host"
                    value={form.smtpHost}
                    onChange={(smtpHost) => setForm({ ...form, smtpHost })}
                    placeholder="smtp.example.com"
                  />
                  <NumberInput
                    label="端口"
                    value={form.smtpPort}
                    onChange={(smtpPort) => setForm({ ...form, smtpPort })}
                    min={1}
                    max={65535}
                  />
                </div>
                <CheckboxInput
                  label="使用 SSL / TLS"
                  checked={form.smtpSecure}
                  onChange={(smtpSecure) => setForm({ ...form, smtpSecure })}
                />
                <TextInput
                  label="SMTP 用户名"
                  value={form.smtpUsername}
                  onChange={(smtpUsername) => setForm({ ...form, smtpUsername })}
                  placeholder="name@example.com"
                />
                <SecretInput
                  label={settings?.smtp.hasPassword ? "SMTP 密码，留空则保持原值" : "SMTP 密码"}
                  value={form.smtpPassword}
                  visible={showSmtpPassword}
                  onChange={(smtpPassword) => setForm({ ...form, smtpPassword })}
                  onToggleVisible={() => setShowSmtpPassword((current) => !current)}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput
                    label="发件人"
                    value={form.smtpFrom}
                    onChange={(smtpFrom) => setForm({ ...form, smtpFrom })}
                    placeholder="monitor@example.com"
                  />
                </div>
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">收件人与告警分类</h3>
                      <p className="text-xs text-muted-foreground">
                        每个邮箱可独立选择需要接收的告警信息。
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={addRecipient}>
                      <Plus data-icon="inline-start" aria-hidden="true" />
                      添加收件人
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    {form.smtpRecipients.map((recipient, index) => {
                      const recipientTypeSet = new Set(recipient.enabledTypes)
                      const isExpanded = expandedRecipientIds.includes(recipient.id)

                      return (
                        <div
                          key={recipient.id}
                          className="grid gap-3 border border-border bg-background/35 p-3"
                        >
                          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                            <TextInput
                              label={`收件人 ${index + 1}`}
                              value={recipient.email}
                              onChange={(email) => updateRecipientEmail(recipient.id, email)}
                              placeholder="ops@example.com"
                            />
                            <Button
                              className="h-10"
                              size="sm"
                              variant="outline"
                              onClick={() => removeRecipient(recipient.id)}
                            >
                              <Trash2 data-icon="inline-start" aria-hidden="true" />
                              删除
                            </Button>
                          </div>
                          <button
                            className="flex h-9 items-center justify-between border border-border bg-background/60 px-3 text-left text-sm font-semibold hover:border-primary"
                            onClick={() => toggleRecipientExpanded(recipient.id)}
                            type="button"
                          >
                            <span>
                              告警分类{" "}
                              <span className="text-xs text-muted-foreground">
                                已选 {recipient.enabledTypes.length}/{notificationTypeOptions.length}
                              </span>
                            </span>
                            {isExpanded ? (
                              <ChevronDown aria-hidden="true" className="size-4" />
                            ) : (
                              <ChevronRight aria-hidden="true" className="size-4" />
                            )}
                          </button>
                          {isExpanded && (
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                              {notificationTypeOptions.map((option) => (
                                <CheckboxInput
                                  key={option.value}
                                  label={option.label}
                                  checked={recipientTypeSet.has(option.value)}
                                  onChange={(checked) =>
                                    toggleRecipientType(recipient.id, option.value, checked)
                                  }
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => void handleTest("smtp")}
                  disabled={isSaving || testingTarget === "smtp"}
                >
                  <Send data-icon="inline-start" aria-hidden="true" />
                  {testingTarget === "smtp" ? "测试中" : "测试发送邮件"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Telegram 分类与邮件冷却</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <NumberInput
                label="邮件通知冷却时间，分钟"
                value={form.cooldownMinutes}
                onChange={(cooldownMinutes) => setForm({ ...form, cooldownMinutes })}
                min={0}
                max={1440}
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {notificationTypeOptions.map((option) => (
                  <CheckboxInput
                    key={option.value}
                    label={option.label}
                    checked={telegramEnabledTypeSet.has(option.value)}
                    onChange={(checked) => toggleNotificationType(option.value, checked)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  )
}

type TextInputProps = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function TextInput({ label, value, onChange, placeholder }: TextInputProps) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 border border-input bg-background/75 px-3 text-sm outline-none focus:border-primary"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

type SecretInputProps = TextInputProps & {
  visible: boolean
  onToggleVisible: () => void
}

function SecretInput({
  label,
  value,
  visible,
  onChange,
  onToggleVisible,
}: SecretInputProps) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <span className="flex h-10 border border-input bg-background/75 focus-within:border-primary">
        <input
          className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? "text" : "password"}
        />
        <button
          aria-label={visible ? "隐藏密码" : "显示密码"}
          className="flex h-full w-10 items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={onToggleVisible}
          type="button"
        >
          {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        </button>
      </span>
    </label>
  )
}

type NumberInputProps = {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
}

function NumberInput({ label, value, onChange, min, max }: NumberInputProps) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 border border-input bg-background/75 px-3 text-sm outline-none focus:border-primary"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        min={min}
        max={max}
      />
    </label>
  )
}
