import cron from "node-cron"
import { db } from "./db.js"
import { checkChannelBalance } from "./services/balance-checker.js"

type DueChannelRow = {
  id: string
}

export function startBalanceScheduler() {
  cron.schedule("* * * * *", async () => {
    const result = await db.execute({
      sql: `select c.id
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

    const channelIds = result.rows.map((row) => (row as unknown as DueChannelRow).id)

    await Promise.all(channelIds.map((channelId) => checkChannelBalance(channelId)))
  })
}
