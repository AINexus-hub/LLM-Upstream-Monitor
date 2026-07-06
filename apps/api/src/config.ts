import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default("file:./data/llm-upstream-monitor.db"),
  AUTH_TOKEN: z.string().min(1).default("IC49xgfi0AGHcE9wzXoPNs4TfbPqvZQG"),
})

export const config = envSchema.parse(process.env)
