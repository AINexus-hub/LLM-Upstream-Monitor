import { createApp } from "./app.js"
import { config } from "./config.js"
import { initDatabase } from "./db.js"
import { startBalanceScheduler } from "./scheduler.js"

const app = createApp()

try {
  await initDatabase()
  startBalanceScheduler()

  await app.listen({
    host: config.API_HOST,
    port: config.API_PORT,
  })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
