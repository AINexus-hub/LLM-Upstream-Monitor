import type {
  UpstreamProvider,
  UpstreamSnapshotRecord,
  UpstreamSnapshotSummary,
} from "@llm-upstream-monitor/shared"
import { randomUUID } from "node:crypto"
import { db } from "../db.js"
import { config } from "../config.js"
import { encryptSecret } from "../crypto.js"

type DbSnapshotRow = {
  id: string
  channel_id: string
  provider: string
  fetched_at: string
  summary_json: string
  created_at: string
}

function mapSnapshot(row: DbSnapshotRow): UpstreamSnapshotRecord {
  return {
    id: row.id,
    channelId: row.channel_id,
    provider: row.provider === "newapi" ? "newapi" : "sub2api",
    fetchedAt: row.fetched_at,
    summary: JSON.parse(row.summary_json) as UpstreamSnapshotSummary,
    createdAt: row.created_at,
  }
}

export async function saveUpstreamSnapshot(input: {
  channelId: string
  provider: UpstreamProvider
  fetchedAt: string
  summary: UpstreamSnapshotSummary
  raw: unknown
}) {
  const id = randomUUID()
  const now = new Date().toISOString()

  await db.execute({
    sql: `insert into upstream_snapshots (
      id, channel_id, provider, fetched_at, summary_json, raw_json, created_at
    ) values (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.channelId,
      input.provider,
      input.fetchedAt,
      JSON.stringify(input.summary),
      encryptSecret(JSON.stringify(input.raw), config.ENCRYPTION_KEY),
      now,
    ],
  })

  return {
    id,
    channelId: input.channelId,
    provider: input.provider,
    fetchedAt: input.fetchedAt,
    summary: input.summary,
    createdAt: now,
  } satisfies UpstreamSnapshotRecord
}

export async function getLatestUpstreamSnapshot(channelId: string) {
  const result = await db.execute({
    sql: `select id, channel_id, provider, fetched_at, summary_json, created_at
      from upstream_snapshots
      where channel_id = ?
      order by fetched_at desc
      limit 1`,
    args: [channelId],
  })

  const row = result.rows[0]
  return row ? mapSnapshot(row as unknown as DbSnapshotRow) : null
}

export async function listLatestUpstreamSnapshots() {
  const result = await db.execute({
    sql: `select s.id, s.channel_id, s.provider, s.fetched_at, s.summary_json, s.created_at
      from upstream_snapshots s
      join (
        select channel_id, max(fetched_at) as fetched_at
        from upstream_snapshots
        group by channel_id
      ) latest on latest.channel_id = s.channel_id and latest.fetched_at = s.fetched_at
      order by s.fetched_at desc`,
  })

  return result.rows.map((row) => mapSnapshot(row as unknown as DbSnapshotRow))
}
