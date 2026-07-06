import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

async function loadDatabase() {
  vi.resetModules()
  const dir = mkdtempSync(join(tmpdir(), "llm-upstream-monitor-db-"))
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`

  return import("./db.js")
}

describe("database migrations", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("adds raw_json to existing upstream snapshot tables", async () => {
    const db = await loadDatabase()
    await db.db.execute(`create table upstream_snapshots (
      id text primary key,
      channel_id text not null,
      provider text not null,
      fetched_at text not null,
      summary_json text not null,
      created_at text not null
    )`)

    await db.initDatabase()

    const result = await db.db.execute("pragma table_info(upstream_snapshots)")
    const columnNames = result.rows.map((row) => (row as unknown as { name: string }).name)
    expect(columnNames).toContain("raw_json")
  })

  it("adds SMTP recipients JSON to existing notification settings tables", async () => {
    const db = await loadDatabase()
    await db.db.execute(`create table notification_settings (
      id text primary key,
      telegram_enabled integer not null default 0,
      telegram_bot_token text,
      telegram_chat_id text,
      smtp_enabled integer not null default 0,
      smtp_host text,
      smtp_port integer,
      smtp_secure integer not null default 1,
      smtp_username text,
      smtp_password text,
      smtp_from text,
      smtp_to text,
      cooldown_minutes integer not null default 30,
      enabled_types_json text not null,
      created_at text not null,
      updated_at text not null
    )`)

    await db.initDatabase()

    const result = await db.db.execute("pragma table_info(notification_settings)")
    const columnNames = result.rows.map((row) => (row as unknown as { name: string }).name)
    expect(columnNames).toContain("smtp_recipients_json")
  })
})
