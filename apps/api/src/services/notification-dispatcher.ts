import type { NotificationChannel, NotificationRecord } from "@llm-upstream-monitor/shared"
import nodemailer from "nodemailer"
import {
  getNotificationSettings,
  markNotificationSent,
  shouldSendNotification,
  type NotificationSettings,
} from "../repositories/notification-settings.js"

type TestNotificationInput = {
  target: NotificationChannel
  settings?: NotificationSettings
}

const serviceName = "LLM Upstream Monitor"

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value))
}

function statusText(notification: NotificationRecord) {
  if (notification.severity === "error") {
    return "异常"
  }
  if (notification.severity === "warning") {
    return "警告"
  }

  return notification.type.includes("recovered") ? "已恢复" : "信息"
}

function escapeMarkdown(value: string) {
  return value.replace(/([*_`[\]])/g, "\\$1")
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function buildTelegramMessage(notification: NotificationRecord) {
  const lines = [
    `*${escapeMarkdown(serviceName)}*`,
    `*标题*: ${escapeMarkdown(notification.title)}`,
    `*状态*: ${escapeMarkdown(statusText(notification))}`,
    `*时间*: ${escapeMarkdown(formatDateTime(notification.createdAt))}`,
    notification.body ? `*错误信息*: ${escapeMarkdown(notification.body)}` : undefined,
  ]

  return lines.filter(Boolean).join("\n")
}

function buildEmailHtml(notification: NotificationRecord) {
  const status = statusText(notification)
  const accent =
    notification.severity === "error"
      ? "#ef4444"
      : notification.severity === "warning"
        ? "#f59e0b"
        : "#22c55e"

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;background:#0f172a;padding:24px;font-family:Arial,'Microsoft YaHei',sans-serif;color:#e5e7eb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;">
      <tr>
        <td style="border:1px solid #334155;background:#111827;padding:0;">
          <div style="height:5px;background:${accent};"></div>
          <div style="padding:24px;">
            <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;">${escapeHtml(serviceName)}</p>
            <h1 style="margin:0 0 18px;color:#f8fafc;font-size:22px;line-height:1.3;">${escapeHtml(notification.title)}</h1>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr>
                <td style="padding:10px 0;border-top:1px solid #334155;color:#94a3b8;width:96px;">状态</td>
                <td style="padding:10px 0;border-top:1px solid #334155;color:#f8fafc;font-weight:700;">${escapeHtml(status)}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-top:1px solid #334155;color:#94a3b8;">时间</td>
                <td style="padding:10px 0;border-top:1px solid #334155;color:#f8fafc;">${escapeHtml(formatDateTime(notification.createdAt))}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-top:1px solid #334155;color:#94a3b8;vertical-align:top;">详细信息</td>
                <td style="padding:10px 0;border-top:1px solid #334155;color:#f8fafc;line-height:1.6;">${escapeHtml(notification.body || "-")}</td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function buildTransport(settings: NotificationSettings) {
  if (!settings.smtp.host || !settings.smtp.port || !settings.smtp.from) {
    throw new Error("SMTP 配置不完整")
  }

  return nodemailer.createTransport({
    host: settings.smtp.host,
    port: settings.smtp.port,
    secure: settings.smtp.secure,
    auth: settings.smtp.username
      ? {
          user: settings.smtp.username,
          pass: settings.smtp.password ?? "",
        }
      : undefined,
  })
}

async function sendTelegram(notification: NotificationRecord, settings: NotificationSettings) {
  if (!settings.telegram.botToken || !settings.telegram.chatId) {
    throw new Error("Telegram 配置不完整")
  }

  const response = await fetch(
    `https://api.telegram.org/bot${settings.telegram.botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: settings.telegram.chatId,
        text: buildTelegramMessage(notification),
        parse_mode: "Markdown",
      }),
    },
  )

  const body = (await response.json().catch(() => null)) as { description?: string } | null
  if (!response.ok) {
    throw new Error(body?.description ?? `Telegram HTTP ${response.status}`)
  }
}

async function sendEmail(
  notification: NotificationRecord,
  settings: NotificationSettings,
  recipientEmail: string,
) {
  const transport = buildTransport(settings)
  await transport.sendMail({
    from: settings.smtp.from,
    to: recipientEmail,
    subject: `[${serviceName}] ${notification.title}`,
    html: buildEmailHtml(notification),
  })
}

function telegramNotificationTypeEnabled(settings: NotificationSettings, notification: NotificationRecord) {
  return settings.enabledTypes.some((type) => type === notification.type)
}

async function deliverTelegram(notification: NotificationRecord, settings: NotificationSettings) {
  if (!settings.telegram.enabled || !telegramNotificationTypeEnabled(settings, notification)) {
    return
  }

  await sendTelegram(notification, settings)
  await markNotificationSent({
    channelId: notification.channelId,
    notificationType: notification.type,
    target: "telegram",
  })
}

async function deliverEmail(notification: NotificationRecord, settings: NotificationSettings) {
  if (!settings.smtp.enabled) {
    return
  }

  await Promise.all(
    settings.smtp.recipients.map(async (recipient) => {
      if (!recipient.enabledTypes.some((type) => type === notification.type)) {
        return
      }

      const canSend = await shouldSendNotification({
        channelId: notification.channelId,
        notificationType: notification.type,
        target: "smtp",
        targetKey: recipient.id,
        cooldownMinutes: settings.cooldownMinutes,
      })
      if (!canSend) {
        return
      }

      await sendEmail(notification, settings, recipient.email)

      await markNotificationSent({
        channelId: notification.channelId,
        notificationType: notification.type,
        target: "smtp",
        targetKey: recipient.id,
      })
    }),
  )
}

export async function deliverNotification(notification: NotificationRecord) {
  const settings = await getNotificationSettings()
  const results = await Promise.allSettled([
    deliverTelegram(notification, settings),
    deliverEmail(notification, settings),
  ])

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("外部通知发送失败", result.reason)
    }
  })
}

export async function sendTestNotification(input: TestNotificationInput) {
  const settings = input.settings ?? (await getNotificationSettings())
  const notification: NotificationRecord = {
    id: "test",
    type: "check_recovered",
    title: "通知测试",
    body: "这是一条测试消息，用于验证外部通知配置是否可用。",
    severity: "info",
    createdAt: new Date().toISOString(),
    readAt: null,
    archivedAt: null,
    deletedAt: null,
  }

  if (input.target === "telegram") {
    await sendTelegram(notification, settings)
  } else {
    if (settings.smtp.recipients.length === 0) {
      throw new Error("请至少配置一个邮件收件人")
    }

    await Promise.all(
      settings.smtp.recipients.map((recipient) => sendEmail(notification, settings, recipient.email)),
    )
  }
}
