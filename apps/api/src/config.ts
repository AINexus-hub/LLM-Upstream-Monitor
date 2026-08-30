import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default("file:./data/llm-upstream-monitor.db"),
  // Default is intentional for portable / first-run local use; override via AUTH_TOKEN in production.
  AUTH_TOKEN: z.string().min(1).default("llm-monitor"),
  ENCRYPTION_KEY: z.string().min(16).default("change-this-encryption-key"),
})

export const config = envSchema.parse(process.env)
