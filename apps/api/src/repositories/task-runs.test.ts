import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

async function loadRepositories() {
  vi.resetModules()
  const dir = mkdtempSync(join(tmpdir(), "llm-upstream-monitor-task-runs-"))
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`

  const db = await import("../db.js")
  await db.initDatabase()

  return {
    channels: await import("./channels.js"),
    taskRuns: await import("./task-runs.js"),
  }
}

describe("task runs repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("records running, success, failed and skipped task runs", async () => {
    const { channels, taskRuns } = await loadRepositories()
    const channel = await channels.createChannel({
      name: "Task Channel",
      type: "sub2api",
      requestUrl: "https://example.test",
      apiKey: "test-key",
      timeoutSeconds: 1,
      checkIntervalMinutes: 1,
    })
    const running = await taskRuns.startTaskRun({
      channelId: channel.id,
      taskType: "balance_check",
    })

    expect(await taskRuns.findRunningTaskRun({ channelId: channel.id, taskType: "balance_check" })).toMatchObject({
      id: running.id,
      status: "running",
    })

    await taskRuns.finishTaskRun(running.id, { status: "success" })
    expect(await taskRuns.findRunningTaskRun({ channelId: channel.id, taskType: "balance_check" })).toBeUndefined()

    const failed = await taskRuns.startTaskRun({
      channelId: channel.id,
      taskType: "upstream_snapshot",
    })
    await taskRuns.finishTaskRun(failed.id, {
      status: "failed",
      errorMessage: "timeout",
    })
    await taskRuns.createSkippedTaskRun({
      channelId: channel.id,
      taskType: "upstream_snapshot",
      reason: "已有同类自动任务运行中，跳过本轮",
    })

    const records = await taskRuns.listTaskRuns({ channelId: channel.id, limit: 10 })
    expect(records.map((item) => item.status)).toContain("success")
    expect(records.map((item) => item.status)).toContain("failed")
    expect(records.map((item) => item.status)).toContain("skipped")
  })
})
