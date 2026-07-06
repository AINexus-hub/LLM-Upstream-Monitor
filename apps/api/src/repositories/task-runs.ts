import type { TaskRunRecord, TaskRunStatus, TaskRunType } from "@llm-upstream-monitor/shared"
import { randomUUID } from "node:crypto"
import { db } from "../db.js"

type DbTaskRunRow = {
  id: string
  channel_id: string | null
  task_type: string
  status: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  error_message: string | null
  metadata_json: string | null
}

type StartTaskRunInput = {
  channelId?: string
  taskType: TaskRunType
  metadata?: unknown
}

type FinishTaskRunInput = {
  errorMessage?: string | null
  metadata?: unknown
  status: Exclude<TaskRunStatus, "running">
}

type ListTaskRunsInput = {
  channelId?: string
  limit?: number
}

const staleRunningTaskMs = 30 * 60 * 1000

function parseMetadata(value: string | null) {
  if (!value) {
    return undefined
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function isTaskRunStatus(value: string): value is TaskRunStatus {
  return value === "running" || value === "success" || value === "failed" || value === "skipped"
}

function isTaskRunType(value: string): value is TaskRunType {
  return value === "balance_check" || value === "upstream_sync" || value === "upstream_snapshot"
}

function mapTaskRun(row: DbTaskRunRow): TaskRunRecord {
  return {
    id: row.id,
    channelId: row.channel_id ?? undefined,
    taskType: isTaskRunType(row.task_type) ? row.task_type : "balance_check",
    status: isTaskRunStatus(row.status) ? row.status : "failed",
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
    metadata: parseMetadata(row.metadata_json),
  }
}

export async function startTaskRun(input: StartTaskRunInput) {
  const now = new Date().toISOString()
  const taskRun: TaskRunRecord = {
    id: randomUUID(),
    channelId: input.channelId,
    taskType: input.taskType,
    status: "running",
    startedAt: now,
    finishedAt: null,
    durationMs: null,
    errorMessage: null,
    metadata: input.metadata,
  }

  await db.execute({
    sql: `insert into task_runs (
      id, channel_id, task_type, status, started_at, finished_at,
      duration_ms, error_message, metadata_json
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      taskRun.id,
      input.channelId ?? null,
      input.taskType,
      "running",
      now,
      null,
      null,
      null,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
    ],
  })

  return taskRun
}

export async function finishTaskRun(id: string, input: FinishTaskRunInput) {
  const now = new Date().toISOString()
  await db.execute({
    sql: `update task_runs
      set status = ?,
        finished_at = ?,
        duration_ms = max(0, cast((julianday(?) - julianday(started_at)) * 86400000 as integer)),
        error_message = ?,
        metadata_json = coalesce(?, metadata_json)
      where id = ?`,
    args: [
      input.status,
      now,
      now,
      input.errorMessage ?? null,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
      id,
    ],
  })
}

export async function createSkippedTaskRun(input: StartTaskRunInput & { reason: string }) {
  const run = await startTaskRun({
    channelId: input.channelId,
    taskType: input.taskType,
    metadata: input.metadata,
  })
  await finishTaskRun(run.id, {
    status: "skipped",
    errorMessage: input.reason,
  })
  return run
}

export async function findRunningTaskRun(input: {
  channelId?: string
  taskType: TaskRunType
}) {
  await markStaleRunningTaskRuns()

  const result = await db.execute({
    sql: `select id, channel_id, task_type, status, started_at, finished_at,
        duration_ms, error_message, metadata_json
      from task_runs
      where status = 'running'
        and task_type = ?
        and coalesce(channel_id, '') = coalesce(?, '')
      order by started_at desc
      limit 1`,
    args: [input.taskType, input.channelId ?? null],
  })

  const row = result.rows[0]
  return row ? mapTaskRun(row as unknown as DbTaskRunRow) : undefined
}

export async function markStaleRunningTaskRuns() {
  const staleBefore = new Date(Date.now() - staleRunningTaskMs).toISOString()
  await db.execute({
    sql: `update task_runs
      set status = 'failed',
        finished_at = ?,
        duration_ms = max(0, cast((julianday(?) - julianday(started_at)) * 86400000 as integer)),
        error_message = coalesce(error_message, '任务运行超时，已自动标记失败')
      where status = 'running'
        and started_at < ?`,
    args: [new Date().toISOString(), new Date().toISOString(), staleBefore],
  })
}

export async function listTaskRuns(input: ListTaskRunsInput = {}) {
  const limit = input.limit ?? 100
  const result = await db.execute({
    sql: input.channelId
      ? `select id, channel_id, task_type, status, started_at, finished_at,
          duration_ms, error_message, metadata_json
        from task_runs
        where channel_id = ?
        order by started_at desc
        limit ?`
      : `select id, channel_id, task_type, status, started_at, finished_at,
          duration_ms, error_message, metadata_json
        from task_runs
        order by started_at desc
        limit ?`,
    args: input.channelId ? [input.channelId, limit] : [limit],
  })

  return result.rows.map((row) => mapTaskRun(row as unknown as DbTaskRunRow))
}

export async function getLatestTaskRun(input: {
  channelId?: string
  taskType: TaskRunType
}) {
  const result = await db.execute({
    sql: `select id, channel_id, task_type, status, started_at, finished_at,
        duration_ms, error_message, metadata_json
      from task_runs
      where task_type = ?
        and coalesce(channel_id, '') = coalesce(?, '')
      order by started_at desc
      limit 1`,
    args: [input.taskType, input.channelId ?? null],
  })

  const row = result.rows[0]
  return row ? mapTaskRun(row as unknown as DbTaskRunRow) : undefined
}

export async function getLatestTaskRunsByChannel(channelIds: string[]) {
  if (channelIds.length === 0) {
    return {}
  }

  const placeholders = channelIds.map(() => "?").join(", ")
  const result = await db.execute({
    sql: `select tr.id, tr.channel_id, tr.task_type, tr.status, tr.started_at,
        tr.finished_at, tr.duration_ms, tr.error_message, tr.metadata_json
      from task_runs tr
      join (
        select channel_id, max(started_at) as started_at
        from task_runs
        where channel_id in (${placeholders})
        group by channel_id
      ) latest
        on latest.channel_id = tr.channel_id
        and latest.started_at = tr.started_at`,
    args: channelIds,
  })

  return Object.fromEntries(
    result.rows.map((row) => {
      const taskRun = mapTaskRun(row as unknown as DbTaskRunRow)
      return [taskRun.channelId, taskRun]
    }),
  )
}
