import cors from "@fastify/cors"
import Fastify from "fastify"
import { registerChannelRoutes } from "./routes/channels.js"

export function createApp() {
  const app = Fastify({
    logger: true,
  })

  app.register(cors, {
    origin: true,
  })

  app.get("/health", async () => ({
    status: "ok",
    service: "llm-balance-monitor-api",
  }))

  app.register(registerChannelRoutes)

  return app
}
