import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { createClient } from "@libsql/client"
import { config } from "./config.js"
import { encryptSecret, isEncryptedSecret } from "./crypto.js"

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
        official_url text,
        upstream_login_url text,
        upstream_username text,
        upstream_password text,
        upstream_access_token text,
        upstream_refresh_token text,
        upstream_token_expires_at text,
        upstream_last_sync_at text,
        upstream_last_sync_error text,
        recharge_rate real not null default 1,
        alert_threshold real,
        balance_alert_enabled integer not null default 1,
        balance_check_enabled integer not null default 1,
        group_change_alert_enabled integer not null default 1,
        group_rate_alert_enabled integer not null default 1,
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
      `create table if not exists upstream_snapshots (
        id text primary key,
        channel_id text not null references channels(id) on delete cascade,
        provider text not null,
        fetched_at text not null,
        summary_json text not null,
        raw_json text not null,
        created_at text not null
      )`,
      `create index if not exists upstream_snapshots_channel_fetched_at_idx
        on upstream_snapshots(channel_id, fetched_at desc)`,
      `create table if not exists notifications (
        id text primary key,
        channel_id text references channels(id) on delete cascade,
        type text not null,
        title text not null,
        body text not null,
        severity text not null,
        metadata_json text,
        read_at text,
        archived_at text,
        deleted_at text,
        created_at text not null
      )`,
      `create index if not exists notifications_created_at_idx
        on notifications(created_at desc)`,
      `create table if not exists task_runs (
        id text primary key,
        channel_id text references channels(id) on delete cascade,
        task_type text not null,
        status text not null,
        started_at text not null,
        finished_at text,
        duration_ms integer,
        error_message text,
        metadata_json text
      )`,
      `create index if not exists task_runs_channel_started_at_idx
        on task_runs(channel_id, started_at desc)`,
      `create index if not exists task_runs_status_idx
        on task_runs(status, task_type, channel_id)`,
      `create table if not exists notification_settings (
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
        smtp_recipients_json text not null default '[]',
        cooldown_minutes integer not null default 30,
        enabled_types_json text not null,
        created_at text not null,
        updated_at text not null
      )`,
      `create table if not exists notification_delivery_state (
        id text primary key,
        notification_type text not null,
        channel_id text,
        target text not null,
        last_sent_at text not null,
        unique_key text not null unique
      )`,
    ],
    "write",
  )

  await ensureChannelMetadataColumns()
  await ensureUpstreamSnapshotColumns()
  await ensureNotificationColumns()
  await ensureTaskRunTable()
  await ensureNotificationSettingsTable()
  await migrateSensitiveValues()
}

async function migrateSensitiveValues() {
  const channelColumns = [
    "upstream_password",
    "upstream_access_token",
    "upstream_refresh_token",
    "access_token",
    "api_key",
  ]
  for (const column of channelColumns) {
    const result = await db.execute(`select id, ${column} as value from channels where ${column} is not null`)
    for (const row of result.rows) {
      const value = String(row.value ?? "")
      if (!value || isEncryptedSecret(value)) continue
      await db.execute({
        sql: `update channels set ${column} = ? where id = ?`,
        args: [encryptSecret(value, config.ENCRYPTION_KEY) ?? null, String(row.id)],
      })
    }
  }

  const settings = await db.execute(
    "select id, telegram_bot_token, smtp_password from notification_settings where telegram_bot_token is not null or smtp_password is not null",
  )
  for (const row of settings.rows) {
    const botToken = String(row.telegram_bot_token ?? "")
    const password = String(row.smtp_password ?? "")
    await db.execute({
      sql: "update notification_settings set telegram_bot_token = ?, smtp_password = ? where id = ?",
      args: [
        botToken && !isEncryptedSecret(botToken) ? encryptSecret(botToken, config.ENCRYPTION_KEY) : String(row.telegram_bot_token ?? "") || null,
        password && !isEncryptedSecret(password) ? encryptSecret(password, config.ENCRYPTION_KEY) : String(row.smtp_password ?? "") || null,
        String(row.id),
      ],
    })
  }

  const snapshots = await db.execute("select id, raw_json from upstream_snapshots")
  for (const row of snapshots.rows) {
    const raw = String(row.raw_json ?? "")
    if (raw && !isEncryptedSecret(raw)) {
      await db.execute({
        sql: "update upstream_snapshots set raw_json = ? where id = ?",
        args: [encryptSecret(raw, config.ENCRYPTION_KEY) ?? null, String(row.id)],
      })
    }
  }
}

async function ensureChannelMetadataColumns() {
  const result = await db.execute("pragma table_info(channels)")
  const columnNames = new Set(
    result.rows.map((row) => {
      const column = row as unknown as { name?: string }
      return column.name
    }),
  )

  if (!columnNames.has("recharge_rate")) {
    await db.execute("alter table channels add column recharge_rate real not null default 1")
  }

  if (!columnNames.has("official_url")) {
    await db.execute("alter table channels add column official_url text")
  }

  if (!columnNames.has("upstream_login_url")) {
    await db.execute("alter table channels add column upstream_login_url text")
  }

  if (!columnNames.has("upstream_username")) {
    await db.execute("alter table channels add column upstream_username text")
  }

  if (!columnNames.has("upstream_password")) {
    await db.execute("alter table channels add column upstream_password text")
  }

  if (!columnNames.has("upstream_access_token")) {
    await db.execute("alter table channels add column upstream_access_token text")
  }

  if (!columnNames.has("upstream_refresh_token")) {
    await db.execute("alter table channels add column upstream_refresh_token text")
  }

  if (!columnNames.has("upstream_token_expires_at")) {
    await db.execute("alter table channels add column upstream_token_expires_at text")
  }

  if (!columnNames.has("upstream_last_sync_at")) {
    await db.execute("alter table channels add column upstream_last_sync_at text")
  }

  if (!columnNames.has("upstream_last_sync_error")) {
    await db.execute("alter table channels add column upstream_last_sync_error text")
  }

  if (!columnNames.has("alert_threshold")) {
    await db.execute("alter table channels add column alert_threshold real")
  }

  if (!columnNames.has("balance_alert_enabled")) {
    await db.execute("alter table channels add column balance_alert_enabled integer not null default 1")
  }

  if (!columnNames.has("balance_check_enabled")) {
    await db.execute("alter table channels add column balance_check_enabled integer not null default 1")
  }

  if (!columnNames.has("group_change_alert_enabled")) {
    await db.execute("alter table channels add column group_change_alert_enabled integer not null default 1")
  }

  if (!columnNames.has("group_rate_alert_enabled")) {
    await db.execute("alter table channels add column group_rate_alert_enabled integer not null default 1")
  }
}

async function ensureNotificationColumns() {
  const result = await db.execute("pragma table_info(notifications)")
  const columnNames = new Set(
    result.rows.map((row) => {
      const column = row as unknown as { name?: string }
      return column.name
    }),
  )

  if (!columnNames.has("archived_at")) {
    await db.execute("alter table notifications add column archived_at text")
  }

  if (!columnNames.has("deleted_at")) {
    await db.execute("alter table notifications add column deleted_at text")
  }
}

async function ensureUpstreamSnapshotColumns() {
  const result = await db.execute("pragma table_info(upstream_snapshots)")
  const columnNames = new Set(
    result.rows.map((row) => {
      const column = row as unknown as { name?: string }
      return column.name
    }),
  )

  if (!columnNames.has("raw_json")) {
    await db.execute("alter table upstream_snapshots add column raw_json text not null default '{}'")
  }
}

async function ensureTaskRunTable() {
  await db.execute(`create table if not exists task_runs (
    id text primary key,
    channel_id text references channels(id) on delete cascade,
    task_type text not null,
    status text not null,
    started_at text not null,
    finished_at text,
    duration_ms integer,
    error_message text,
    metadata_json text
  )`)
  await db.execute(`create index if not exists task_runs_channel_started_at_idx
    on task_runs(channel_id, started_at desc)`)
  await db.execute(`create index if not exists task_runs_status_idx
    on task_runs(status, task_type, channel_id)`)
}

async function ensureNotificationSettingsTable() {
  await db.execute(`create table if not exists notification_settings (
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
    smtp_recipients_json text not null default '[]',
    cooldown_minutes integer not null default 30,
    enabled_types_json text not null,
    created_at text not null,
    updated_at text not null
  )`)
  await db.execute(`create table if not exists notification_delivery_state (
    id text primary key,
    notification_type text not null,
    channel_id text,
    target text not null,
    last_sent_at text not null,
    unique_key text not null unique
  )`)

  const result = await db.execute("pragma table_info(notification_settings)")
  const columnNames = new Set(
    result.rows.map((row) => {
      const column = row as unknown as { name?: string }
      return column.name
    }),
  )

  if (!columnNames.has("smtp_recipients_json")) {
    await db.execute("alter table notification_settings add column smtp_recipients_json text not null default '[]'")
  }
}
