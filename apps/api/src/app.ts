import cors from "@fastify/cors"
import Fastify from "fastify"
import { z } from "zod"
import { config } from "./config.js"
import { registerChannelRoutes } from "./routes/channels.js"

const loginSchema = z.object({
  password: z.string().min(1),
})

export function createApp() {
  const app = Fastify({
    logger: true,
  })

  app.register(cors, {
    allowedHeaders: ["Authorization", "Content-Type"],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    origin: true,
  })

  app.get("/health", async () => ({
    status: "ok",
    service: "llm-upstream-monitor-api",
  }))

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success || parsed.data.password !== config.AUTH_TOKEN) {
      return reply.code(401).send({ message: "登录凭据无效" })
    }

    return {
      data: {
        token: config.AUTH_TOKEN,
      },
    }
  })

  app.addHook("preHandler", async (request, reply) => {
    if (
      request.method === "OPTIONS" ||
      request.url === "/health" ||
      request.url === "/api/auth/login"
    ) {
      return
    }

    const authorization = request.headers.authorization
    const expected = `Bearer ${config.AUTH_TOKEN}`

    if (authorization !== expected) {
      return reply.code(401).send({ message: "请先登录" })
    }
  })

  app.register(registerChannelRoutes)

  return app
}
