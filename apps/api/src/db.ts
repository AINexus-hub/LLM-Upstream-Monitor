import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@libsql/client"
import { config } from "./config.js"

function resolveDatabasePath(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    return null
  }

  const path = databaseUrl.slice("file:".length)
  return resolve(path)
}

const databasePath = resolveDatabasePath(config.DATABASE_URL)

if (databasePath) {
  await mkdir(dirname(databasePath), { recursive: true })
}

export const db = createClient({
  url: databasePath ? `file:${databasePath}` : config.DATABASE_URL,
})

export async function initDatabase() {
  await db.batch(
    [
      `create table if not exists channels (
        id text primary key,
        name text not null,
        type text not null check (type in ('newapi', 'sub2api')),
        request_url text not null,
        access_token text,
        user_id text,
        api_key text,
        timeout_seconds integer not null,
        check_interval_minutes integer not null,
        created_at text not null,
        updated_at text not null
      )`,
      `create table if not exists balance_checks (
        id text primary key,
        channel_id text not null references channels(id) on delete cascade,
        checked_at text not null,
        success integer not null,
        is_valid integer not null,
        plan_name text,
        remaining real,
        used real,
        total real,
        unit text,
        error_message text
      )`,
      `create index if not exists balance_checks_channel_checked_at_idx
        on balance_checks(channel_id, checked_at desc)`,
    ],
    "write",
  )
}

export function currentModulePath(metaUrl: string) {
  return fileURLToPath(metaUrl)
}
