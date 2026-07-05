import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default("file:./data/llm-balance-monitor.db"),
})

export const config = envSchema.parse(process.env)
