import cron from "node-cron"
import { db } from "./db.js"
import {
  createSkippedTaskRun,
  findRunningTaskRun,
  finishTaskRun,
  listTaskRuns,
  startTaskRun,
} from "./repositories/task-runs.js"
import { checkChannelBalance } from "./services/balance-checker.js"
import { refreshUpstreamAccountSnapshot } from "./services/upstream-accounts.js"
import type { TaskRunType } from "@llm-upstream-monitor/shared"

type DueChannelRow = {
  id: string
  has_upstream_login: number
  balance_check_enabled: number
}

type TaskResultWithSuccess = {
  success: boolean
  errorMessage?: string
}

const failedTaskBackoffMs = 5 * 60 * 1000

export class TaskAlreadyRunningError extends Error {
  runningTaskId: string

  constructor(runningTaskId: string) {
    super("已有同类任务运行中")
    this.runningTaskId = runningTaskId
  }
}

async function shouldSkipForBackoff(channelId: string, taskType: TaskRunType) {
  const latestNonSkipped = (await listTaskRuns({ channelId, limit: 100 })).find(
    (run) => run.taskType === taskType && run.status !== "skipped",
  )
  if (!latestNonSkipped || latestNonSkipped.status !== "failed") {
    return false
  }

  const finishedAt = latestNonSkipped.finishedAt ?? latestNonSkipped.startedAt
  return Date.now() - new Date(finishedAt).getTime() < failedTaskBackoffMs
}

function isTaskResultWithSuccess(value: unknown): value is TaskResultWithSuccess {
  return Boolean(value && typeof value === "object" && "success" in value)
}

function getTaskOutcome(result: unknown) {
  if (result === null) {
    return {
      status: "failed" as const,
      errorMessage: "渠道不存在",
    }
  }

  if (isTaskResultWithSuccess(result) && !result.success) {
    return {
      status: "failed" as const,
      errorMessage: result.errorMessage ?? "任务返回失败",
    }
  }

  return {
    status: "success" as const,
    errorMessage: null,
  }
}

export async function runManualTask<T>(
  channelId: string,
  taskType: TaskRunType,
  task: () => Promise<T | null>,
) {
  if (taskType === "balance_check") {
    const channel = await db.execute({
      sql: "select balance_check_enabled from channels where id = ?",
      args: [channelId],
    })
    if (channel.rows.length === 0) return null
    if (Number((channel.rows[0] as { balance_check_enabled?: number }).balance_check_enabled) === 0) {
      throw new Error("余额检测已关闭")
    }
  }

  const running = await findRunningTaskRun({ channelId, taskType })
  if (running) {
    throw new TaskAlreadyRunningError(running.id)
  }

  const taskRun = await startTaskRun({
    channelId,
    taskType,
    metadata: { trigger: "manual" },
  })

  try {
    const result = await task()
    const outcome = getTaskOutcome(result)
    await finishTaskRun(taskRun.id, {
      status: outcome.status,
      errorMessage: outcome.errorMessage,
    })
    return result
  } catch (error) {
    await finishTaskRun(taskRun.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "手动任务失败",
    })
    throw error
  }
}

export async function runScheduledTask(
  channelId: string,
  taskType: TaskRunType,
  task: () => Promise<unknown>,
) {
  if (taskType === "balance_check") {
    const channel = await db.execute({
      sql: "select balance_check_enabled from channels where id = ?",
      args: [channelId],
    })
    if (channel.rows.length === 0 || Number((channel.rows[0] as { balance_check_enabled?: number }).balance_check_enabled) === 0) {
      if (channel.rows.length > 0) {
        await createSkippedTaskRun({
          channelId,
          taskType,
          reason: "余额检测已关闭",
        })
      }
      return
    }
  }

  const running = await findRunningTaskRun({ channelId, taskType })
  if (running) {
    await createSkippedTaskRun({
      channelId,
      taskType,
      reason: "已有同类自动任务运行中，跳过本轮",
      metadata: { runningTaskId: running.id },
    })
    return
  }

  if (await shouldSkipForBackoff(channelId, taskType)) {
    await createSkippedTaskRun({
      channelId,
      taskType,
      reason: "上一轮任务失败，处于退避窗口内",
      metadata: { backoffMs: failedTaskBackoffMs },
    })
    return
  }

  const taskRun = await startTaskRun({ channelId, taskType })
  try {
    const result = await task()
    const outcome = getTaskOutcome(result)
    await finishTaskRun(taskRun.id, {
      status: outcome.status,
      errorMessage: outcome.errorMessage,
    })
  } catch (error) {
    await finishTaskRun(taskRun.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "自动任务失败",
    })
  }
}

export function startBalanceScheduler() {
  cron.schedule("* * * * *", async () => {
    const result = await db.execute({
      sql: `select c.id,
          case
            when c.upstream_password is not null
              or c.upstream_access_token is not null
              or c.upstream_refresh_token is not null
            then 1
            else 0
          end as has_upstream_login
        from channels c
        left join (
          select channel_id, max(checked_at) as last_checked_at
          from balance_checks
          group by channel_id
        ) latest on latest.channel_id = c.id
        where latest.last_checked_at is null
          or datetime(latest.last_checked_at, '+' || c.check_interval_minutes || ' minutes') <= datetime('now')`,
      args: [],
    })

    const channels = result.rows.map((row) => row as unknown as DueChannelRow)

    await Promise.all(
      channels.map(async (channel) => {
        await runScheduledTask(
          channel.id,
          channel.has_upstream_login ? "upstream_sync" : "balance_check",
          () => checkChannelBalance(channel.id),
        )

        if (channel.has_upstream_login) {
          await runScheduledTask(channel.id, "upstream_snapshot", () =>
            refreshUpstreamAccountSnapshot(channel.id),
          )
        }
      }),
    )
  })
}
