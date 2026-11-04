import { z } from "zod"
import type { FastifyInstance, FastifyReply } from "fastify"
import {
  createChannel,
  deleteChannel,
  getChannel,
  getPublicChannel,
  listChannels,
  listChecks,
  updateChannel,
} from "../repositories/channels.js"
import { checkChannelBalance } from "../services/balance-checker.js"
import {
  createUpstreamApiKeys,
  diagnoseUpstreamProvider,
  listUpstreamGroups,
  syncUpstreamProvider,
} from "../services/upstream-provider-adapters.js"
import {
  archiveNotification,
  archiveReadNotifications,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../repositories/notifications.js"
import {
  getPublicNotificationSettings,
  notificationTypes,
  updateNotificationSettings,
} from "../repositories/notification-settings.js"
import { listTaskRuns } from "../repositories/task-runs.js"
import { sendTestNotification } from "../services/notification-dispatcher.js"
import {
  getLatestUpstreamAccountSnapshot,
  listUpstreamAccountSnapshots,
  refreshUpstreamAccountSnapshot,
} from "../services/upstream-accounts.js"
import { runManualTask, TaskAlreadyRunningError } from "../scheduler.js"
import { readNewApiDirectory } from "../services/newapi-directory.js"

const channelTypeSchema = z.enum(["newapi", "sub2api"])
const optionalDateTimeSchema = z
  .string()
  .trim()
  .nullish()
  .refine((value) => !value || Number.isFinite(new Date(value).getTime()), {
    message: "时间格式无效",
  })

const channelSchema = z.object({
  name: z.string().trim().min(1),
  type: channelTypeSchema,
  accountTemplate: z.enum(["sub2api", "newapi"]).optional(),
  requestUrl: z.string().trim().url(),
  officialUrl: z.string().trim().url().nullish(),
  upstreamLoginUrl: z.string().trim().url().nullish(),
  upstreamUsername: z.string().trim().nullish(),
  upstreamPassword: z.string().trim().optional(),
  upstreamAccessToken: z.string().trim().optional(),
  upstreamRefreshToken: z.string().trim().optional(),
  upstreamTokenExpiresAt: optionalDateTimeSchema,
  clearUpstreamSession: z.boolean().optional(),
  rechargeRate: z.coerce.number().positive().default(1),
  alertThreshold: z.coerce.number().nonnegative().nullish(),
  balanceAlertEnabled: z.boolean().default(true),
  balanceCheckEnabled: z.boolean().default(true),
  groupChangeAlertEnabled: z.boolean().default(true),
  groupRateAlertEnabled: z.boolean().default(true),
  accessToken: z.string().trim().optional(),
  userId: z.string().trim().optional(),
  apiKey: z.string().trim().optional(),
  timeoutSeconds: z.coerce.number().int().min(1).max(300),
  checkIntervalMinutes: z.coerce.number().int().min(1).max(1440),
})

const createChannelSchema = channelSchema.superRefine((value, ctx) => {
  if (value.type === "newapi") {
    if (!value.accessToken) {
      ctx.addIssue({ code: "custom", path: ["accessToken"], message: "NewAPI 需要访问令牌" })
    }
    if (!value.userId) {
      ctx.addIssue({ code: "custom", path: ["userId"], message: "NewAPI 需要用户 ID" })
    }
  }

  if (value.accountTemplate === "newapi" && (!value.accessToken || !value.userId)) {
    ctx.addIssue({
      code: "custom",
      path: ["accessToken"],
      message: "NewAPI 批量创建需要访问令牌和用户 ID",
    })
  }

  if (value.type === "sub2api" && value.accountTemplate !== "newapi" && !value.apiKey) {
    const hasUpstreamCredentials = Boolean(
      value.upstreamRefreshToken || value.upstreamAccessToken || value.upstreamPassword,
    )
    if (!hasUpstreamCredentials) {
      ctx.addIssue({
        code: "custom",
        path: ["apiKey"],
        message: "请填写 API Key（用于余额检测）或上游 Refresh Token / 登录凭证",
      })
    }
  }
})

const updateChannelSchema = channelSchema.partial().superRefine((value, ctx) => {
  if (value.accountTemplate === "newapi" && value.upstreamUsername === "") {
    ctx.addIssue({
      code: "custom",
      path: ["upstreamUsername"],
      message: "NewAPI 管理员用户名不能为空",
    })
  }
  if (value.type === "newapi") {
    if (value.accessToken === "") {
      ctx.addIssue({ code: "custom", path: ["accessToken"], message: "访问令牌为空时会保持原值" })
    }
    if (value.userId === "") {
      ctx.addIssue({ code: "custom", path: ["userId"], message: "NewAPI 需要用户 ID" })
    }
  }
})

const checksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).default(2000),
})

const queryBooleanSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "true") {
    return true
  }
  if (normalized === "false") {
    return false
  }

  return value
}, z.boolean())

const notificationsQuerySchema = z.object({
  includeArchived: queryBooleanSchema.default(false),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const notificationTypeSchema = z.enum(notificationTypes)

const notificationSettingsSchema = z.object({
  telegram: z
    .object({
      enabled: z.boolean().optional(),
      botToken: z.string().trim().optional(),
      chatId: z.string().trim().optional(),
    })
    .optional(),
  smtp: z
    .object({
      enabled: z.boolean().optional(),
      host: z.string().trim().optional(),
      port: z.coerce.number().int().min(1).max(65535).optional(),
      secure: z.boolean().optional(),
      username: z.string().trim().optional(),
      password: z.string().trim().optional(),
      from: z.string().trim().email().or(z.literal("")).optional(),
      recipients: z
        .array(
          z.object({
            id: z.string().trim().optional(),
            email: z.string().trim().email(),
            enabledTypes: z.array(notificationTypeSchema).min(1),
          }),
        )
        .optional(),
    })
    .optional(),
  cooldownMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  enabledTypes: z.array(notificationTypeSchema).optional(),
})

const notificationTestSchema = z.object({
  target: z.enum(["telegram", "smtp"]),
})

const taskRunsQuerySchema = z.object({
  channelId: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

const createUpstreamKeysSchema = z.object({
  groupIds: z.array(z.string().trim().min(1)).min(1).max(100),
  quota: z.coerce.number().nonnegative().optional(),
  expiresInDays: z.coerce.number().int().positive().optional(),
})

function sendTaskError(reply: FastifyReply, error: unknown, fallbackMessage: string) {
  if (error instanceof TaskAlreadyRunningError) {
    return reply.code(409).send({
      message: "已有同类任务运行中，请稍后再试",
      runningTaskId: error.runningTaskId,
    })
  }

  return reply.code(400).send({
    message: error instanceof Error ? error.message : fallbackMessage,
  })
}

export async function registerChannelRoutes(app: FastifyInstance) {
  app.get("/api/channels", async () => ({
    data: await listChannels(),
  }))

  app.get("/api/notifications", async (request, reply) => {
    const parsed = notificationsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ message: "通知查询参数无效", issues: parsed.error.issues })
    }

    return {
      data: await listNotifications(parsed.data),
    }
  })

  app.get("/api/notification-settings", async () => ({
    data: await getPublicNotificationSettings(),
  }))

  app.put("/api/notification-settings", async (request, reply) => {
    const parsed = notificationSettingsSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ message: "通知配置无效", issues: parsed.error.issues })
    }

    return {
      data: await updateNotificationSettings(parsed.data),
    }
  })

  app.post("/api/notification-settings/test", async (request, reply) => {
    const parsed = notificationTestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ message: "测试参数无效", issues: parsed.error.issues })
    }

    try {
      await sendTestNotification({ target: parsed.data.target })
      return { data: { ok: true } }
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "测试通知发送失败",
      })
    }
  })

  app.post("/api/notifications/read-all", async () => {
    await markAllNotificationsRead()
    return { data: { ok: true } }
  })

  app.patch<{ Params: { id: string } }>("/api/notifications/:id/read", async (request, reply) => {
    const didUpdate = await markNotificationRead(request.params.id)
    if (!didUpdate) {
      return reply.code(404).send({ message: "通知不存在" })
    }

    return { data: { ok: true } }
  })

  app.post("/api/notifications/archive-read", async () => {
    await archiveReadNotifications()
    return { data: { ok: true } }
  })

  app.patch<{ Params: { id: string } }>(
    "/api/notifications/:id/archive",
    async (request, reply) => {
      const didUpdate = await archiveNotification(request.params.id)
      if (!didUpdate) {
        return reply.code(404).send({ message: "通知不存在" })
      }

      return { data: { ok: true } }
    },
  )

  app.delete<{ Params: { id: string } }>("/api/notifications/:id", async (request, reply) => {
    const didUpdate = await deleteNotification(request.params.id)
    if (!didUpdate) {
      return reply.code(404).send({ message: "通知不存在" })
    }

    return { data: { ok: true } }
  })

  app.get("/api/task-runs", async (request, reply) => {
    const parsed = taskRunsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ message: "任务记录查询参数无效", issues: parsed.error.issues })
    }

    return {
      data: await listTaskRuns(parsed.data),
    }
  })

  app.get("/api/upstream-accounts/snapshots", async () => ({
    data: await listUpstreamAccountSnapshots(),
  }))

  app.post("/api/channels", async (request, reply) => {
    const parsed = createChannelSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ message: "渠道配置无效", issues: parsed.error.issues })
    }

    return {
      data: await createChannel(parsed.data),
    }
  })

  app.get<{ Params: { id: string } }>("/api/channels/:id", async (request, reply) => {
    const channel = await getPublicChannel(request.params.id)
    if (!channel) {
      return reply.code(404).send({ message: "渠道不存在" })
    }

    return { data: channel }
  })

  app.patch<{ Params: { id: string } }>("/api/channels/:id", async (request, reply) => {
    const parsed = updateChannelSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ message: "渠道配置无效", issues: parsed.error.issues })
    }

    const channel = await updateChannel(request.params.id, parsed.data)
    if (!channel) {
      return reply.code(404).send({ message: "渠道不存在" })
    }

    return { data: channel }
  })

  app.delete<{ Params: { id: string } }>("/api/channels/:id", async (request, reply) => {
    const didDelete = await deleteChannel(request.params.id)
    if (!didDelete) {
      return reply.code(404).send({ message: "渠道不存在" })
    }

    return { data: { ok: true } }
  })

  app.post<{ Params: { id: string } }>("/api/channels/:id/check", async (request, reply) => {
    try {
      const record = await runManualTask(request.params.id, "balance_check", () =>
        checkChannelBalance(request.params.id),
      )
      if (!record) {
        return reply.code(404).send({ message: "渠道不存在" })
      }

      return { data: record }
    } catch (error) {
      return sendTaskError(reply, error, "余额检测失败")
    }
  })

  app.get<{ Params: { id: string } }>(
    "/api/channels/:id/newapi-directory",
    async (request, reply) => {
      const channel = await getChannel(request.params.id)
      if (!channel) return reply.code(404).send({ message: "渠道不存在" })
      try {
        return { data: await readNewApiDirectory(channel) }
      } catch (error) {
        return reply
          .code(400)
          .send({ message: error instanceof Error ? error.message : "NewAPI 目录读取失败" })
      }
    },
  )

  app.get<{ Params: { id: string } }>(
    "/api/channels/:id/upstream-groups",
    async (request, reply) => {
      try {
        const groups = await listUpstreamGroups(request.params.id)
        if (!groups) {
          return reply.code(404).send({ message: "渠道不存在" })
        }
        return { data: groups }
      } catch (error) {
        return reply.code(400).send({
          message: error instanceof Error ? error.message : "上游分组读取失败",
        })
      }
    },
  )

  app.post<{ Params: { id: string } }>(
    "/api/channels/:id/upstream-keys",
    async (request, reply) => {
      const parsed = createUpstreamKeysSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ message: "密钥参数无效", issues: parsed.error.issues })
      }

      try {
        const results = await createUpstreamApiKeys(request.params.id, parsed.data)
        if (!results) {
          return reply.code(404).send({ message: "渠道不存在" })
        }
        return { data: results }
      } catch (error) {
        return reply.code(400).send({
          message: error instanceof Error ? error.message : "上游密钥创建失败",
        })
      }
    },
  )

  app.post<{ Params: { id: string } }>(
    "/api/channels/:id/sync-upstream",
    async (request, reply) => {
      try {
        const record = await runManualTask(request.params.id, "upstream_sync", () =>
          syncUpstreamProvider(request.params.id),
        )
        if (!record) {
          return reply.code(404).send({ message: "渠道不存在" })
        }

        return { data: record }
      } catch (error) {
        return sendTaskError(reply, error, "上游同步失败")
      }
    },
  )

  app.get<{ Params: { id: string } }>(
    "/api/channels/:id/upstream-account",
    async (request, reply) => {
      const snapshot = await getLatestUpstreamAccountSnapshot(request.params.id)
      if (!snapshot) {
        return reply.code(404).send({ message: "暂无上游账号快照" })
      }

      return { data: snapshot }
    },
  )

  app.post<{ Params: { id: string } }>(
    "/api/channels/:id/upstream-account/refresh",
    async (request, reply) => {
      try {
        const snapshot = await runManualTask(request.params.id, "upstream_snapshot", () =>
          refreshUpstreamAccountSnapshot(request.params.id),
        )
        if (!snapshot) {
          return reply.code(404).send({ message: "渠道不存在" })
        }

        return { data: snapshot }
      } catch (error) {
        return sendTaskError(reply, error, "上游账号快照刷新失败")
      }
    },
  )

  app.post<{ Params: { id: string } }>(
    "/api/channels/:id/sync-upstream/diagnose",
    async (request, reply) => {
      try {
        const snapshot = await diagnoseUpstreamProvider(request.params.id)
        if (!snapshot) {
          return reply.code(404).send({ message: "渠道不存在" })
        }

        return { data: snapshot }
      } catch (error) {
        return reply.code(400).send({
          message: error instanceof Error ? error.message : "上游数据诊断失败",
        })
      }
    },
  )

  app.get<{ Params: { id: string } }>("/api/channels/:id/checks", async (request, reply) => {
    const parsed = checksQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ message: "检测记录查询参数无效", issues: parsed.error.issues })
    }

    return {
      data: await listChecks(request.params.id, parsed.data.limit),
    }
  })
}
