import { z } from "zod"
import type { FastifyInstance } from "fastify"
import {
  createChannel,
  getPublicChannel,
  listChannels,
  listChecks,
  updateChannel,
} from "../repositories/channels.js"
import { checkChannelBalance } from "../services/balance-checker.js"

const channelTypeSchema = z.enum(["newapi", "sub2api"])

const channelSchema = z.object({
  name: z.string().trim().min(1),
  type: channelTypeSchema,
  requestUrl: z.string().trim().url(),
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

  if (value.type === "sub2api" && !value.apiKey) {
    ctx.addIssue({ code: "custom", path: ["apiKey"], message: "Sub2API 需要 API Key" })
  }
})

const updateChannelSchema = channelSchema.partial().superRefine((value, ctx) => {
  if (value.type === "newapi") {
    if (value.accessToken === "") {
      ctx.addIssue({ code: "custom", path: ["accessToken"], message: "访问令牌为空时会保持原值" })
    }
    if (value.userId === "") {
      ctx.addIssue({ code: "custom", path: ["userId"], message: "NewAPI 需要用户 ID" })
    }
  }
})

export async function registerChannelRoutes(app: FastifyInstance) {
  app.get("/api/channels", async () => ({
    data: await listChannels(),
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

  app.post<{ Params: { id: string } }>("/api/channels/:id/check", async (request, reply) => {
    const record = await checkChannelBalance(request.params.id)
    if (!record) {
      return reply.code(404).send({ message: "渠道不存在" })
    }

    return { data: record }
  })

  app.get<{ Params: { id: string } }>("/api/channels/:id/checks", async (request) => ({
    data: await listChecks(request.params.id),
  }))
}
