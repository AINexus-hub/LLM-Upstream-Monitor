import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

async function loadModules() {
  vi.resetModules()
  const dir = mkdtempSync(join(tmpdir(), "llm-upstream-monitor-scheduler-"))
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`

  const db = await import("./db.js")
  await db.initDatabase()

  return {
    channels: await import("./repositories/channels.js"),
    scheduler: await import("./scheduler.js"),
    taskRuns: await import("./repositories/task-runs.js"),
  }
}

describe("scheduler task locking", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("records skipped when the same channel task is already running", async () => {
    const { channels, scheduler, taskRuns } = await loadModules()
    const channel = await channels.createChannel({
      name: "Locked Channel",
      type: "sub2api",
      requestUrl: "https://example.test",
      apiKey: "test-key",
      timeoutSeconds: 1,
      checkIntervalMinutes: 1,
    })

    await taskRuns.startTaskRun({
      channelId: channel.id,
      taskType: "balance_check",
    })
    const task = vi.fn()
    await scheduler.runScheduledTask(channel.id, "balance_check", task)

    expect(task).not.toHaveBeenCalled()
    const records = await taskRuns.listTaskRuns({ channelId: channel.id, limit: 10 })
    expect(records.some((record) => record.status === "skipped")).toBe(true)
  })

  it("keeps failed tasks in backoff even after recording a skipped run", async () => {
    const { channels, scheduler, taskRuns } = await loadModules()
    const channel = await channels.createChannel({
      name: "Backoff Channel",
      type: "sub2api",
      requestUrl: "https://example.test",
      apiKey: "test-key",
      timeoutSeconds: 1,
      checkIntervalMinutes: 1,
    })
    const failed = await taskRuns.startTaskRun({
      channelId: channel.id,
      taskType: "balance_check",
    })
    await taskRuns.finishTaskRun(failed.id, {
      status: "failed",
      errorMessage: "timeout",
    })

    const firstAttempt = vi.fn()
    await scheduler.runScheduledTask(channel.id, "balance_check", firstAttempt)
    const secondAttempt = vi.fn()
    await scheduler.runScheduledTask(channel.id, "balance_check", secondAttempt)

    expect(firstAttempt).not.toHaveBeenCalled()
    expect(secondAttempt).not.toHaveBeenCalled()
    const records = await taskRuns.listTaskRuns({ channelId: channel.id, limit: 10 })
    expect(records.filter((record) => record.status === "skipped")).toHaveLength(2)
  })

  it("treats returned failed records as failed task runs", async () => {
    const { channels, scheduler, taskRuns } = await loadModules()
    const channel = await channels.createChannel({
      name: "Returned Failure Channel",
      type: "sub2api",
      requestUrl: "https://example.test",
      apiKey: "test-key",
      timeoutSeconds: 1,
      checkIntervalMinutes: 1,
    })

    const manualResult = await scheduler.runManualTask(
      channel.id,
      "balance_check",
      async () => ({
        id: "check-a",
        channelId: channel.id,
        checkedAt: "2026-01-01T00:00:00.000Z",
        success: false,
        isValid: false,
        errorMessage: "HTTP 500",
      }),
    )

    expect(manualResult?.success).toBe(false)
    let records = await taskRuns.listTaskRuns({ channelId: channel.id, limit: 10 })
    expect(records[0]).toMatchObject({
      status: "failed",
      errorMessage: "HTTP 500",
    })

    const scheduledTask = vi.fn(async () => ({
      success: false,
      errorMessage: "timeout",
    }))
    await scheduler.runScheduledTask(channel.id, "upstream_sync", scheduledTask)
    records = await taskRuns.listTaskRuns({ channelId: channel.id, limit: 10 })
    expect(records.find((record) => record.taskType === "upstream_sync")).toMatchObject({
      status: "failed",
      errorMessage: "timeout",
    })

    const backoffTask = vi.fn()
    await scheduler.runScheduledTask(channel.id, "upstream_sync", backoffTask)
    expect(backoffTask).not.toHaveBeenCalled()
    records = await taskRuns.listTaskRuns({ channelId: channel.id, limit: 10 })
    expect(
      records.some((record) => record.taskType === "upstream_sync" && record.status === "skipped"),
    ).toBe(true)
  })

  it("uses the same lock for manual tasks and records manual runs", async () => {
    const { channels, scheduler, taskRuns } = await loadModules()
    const channel = await channels.createChannel({
      name: "Manual Locked Channel",
      type: "sub2api",
      requestUrl: "https://example.test",
      apiKey: "test-key",
      timeoutSeconds: 1,
      checkIntervalMinutes: 1,
    })

    await taskRuns.startTaskRun({
      channelId: channel.id,
      taskType: "upstream_snapshot",
    })
    await expect(
      scheduler.runManualTask(channel.id, "upstream_snapshot", async () => ({ ok: true })),
    ).rejects.toBeInstanceOf(scheduler.TaskAlreadyRunningError)

    const running = await taskRuns.findRunningTaskRun({
      channelId: channel.id,
      taskType: "upstream_snapshot",
    })
    if (running) {
      await taskRuns.finishTaskRun(running.id, { status: "success" })
    }

    await scheduler.runManualTask(channel.id, "upstream_snapshot", async () => ({ ok: true }))
    const records = await taskRuns.listTaskRuns({ channelId: channel.id, limit: 10 })
    expect(records.some((record) => record.metadata && typeof record.metadata === "object" && "trigger" in record.metadata)).toBe(true)
  })
})
