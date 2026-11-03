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

  it("defaults the account template for existing channels", async () => {
    const db = await loadDatabase()
    await db.initDatabase()
    await db.db.execute(`insert into channels (
      id, name, type, request_url, timeout_seconds, check_interval_minutes, created_at, updated_at
    ) values ('old-channel', 'Old', 'sub2api', 'https://example.test', 30, 60, 'now', 'now')`)
    const result = await db.db.execute("select account_template from channels where id = 'old-channel'")
    expect(result.rows[0]?.account_template).toBe("sub2api")
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

  it("encrypts legacy snapshot payloads without loading the full table at once", async () => {
    const db = await loadDatabase()
    await db.initDatabase()
    await db.db.execute({
      sql: `insert into channels (id, name, type, request_url, timeout_seconds, check_interval_minutes, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ["channel-1", "Test", "sub2api", "https://example.com", 30, 60, new Date().toISOString(), new Date().toISOString()],
    })
    await db.db.execute({
      sql: `insert into upstream_snapshots (id, channel_id, provider, fetched_at, summary_json, raw_json, created_at)
        values (?, ?, ?, ?, ?, ?, ?)`,
      args: ["snapshot-1", "channel-1", "sub2api", new Date().toISOString(), "{}", "legacy-payload", new Date().toISOString()],
    })

    await db.db.execute("update upstream_snapshots set raw_json = 'legacy-payload' where id = 'snapshot-1'")
    await db.initDatabase()

    const result = await db.db.execute("select raw_json from upstream_snapshots where id = 'snapshot-1'")
    expect(String(result.rows[0]?.raw_json)).toMatch(/^enc:v1:/)
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
