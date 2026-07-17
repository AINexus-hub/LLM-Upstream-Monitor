import puppeteer from "puppeteer-core"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const outDir = path.resolve("docs/images")
const token = process.env.AUTH_TOKEN ?? "IC49xgfi0AGHcE9wzXoPNs4TfbPqvZQG"
const base = process.env.WEB_URL ?? "http://localhost:5300"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

await mkdir(outDir, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=zh-CN"],
})

const page = await browser.newPage()
page.setDefaultTimeout(30_000)

async function shot(name) {
  await sleep(900)
  const file = path.join(outDir, name)
  await page.screenshot({ path: file, fullPage: false, type: "png" })
  console.log("saved", name)
}

async function clickByText(labels) {
  const list = Array.isArray(labels) ? labels : [labels]
  const clicked = await page.evaluate((wanted) => {
    const nodes = Array.from(document.querySelectorAll("button, a, [role='button'], summary"))
    const target = nodes.find((el) => wanted.some((label) => (el.textContent || "").includes(label)))
    if (!target) {
      return false
    }
    target.click()
    return true
  }, list)
  if (!clicked) {
    console.warn("click miss:", list.join("|"))
  }
  await sleep(1100)
  return clicked
}

// Login page
await page.goto(base, { waitUntil: "networkidle0" })
await shot("01-login.png")

// Fill password / token
await page.waitForSelector("input")
const passwordSelector = 'input[type="password"]'
if (await page.$(passwordSelector)) {
  await page.click(passwordSelector, { clickCount: 3 })
  await page.type(passwordSelector, token, { delay: 8 })
} else {
  await page.click("input", { clickCount: 3 })
  await page.type("input", token, { delay: 8 })
}

await clickByText(["登录", "Login"])
await sleep(1800)
await shot("02-monitor.png")

await clickByText(["账号看板"])
await shot("03-upstream.png")

await clickByText(["供应商管理"])
await shot("04-channels.png")

await clickByText(["通知中心"])
await shot("05-notifications.png")

await clickByText(["通知设置"])
await shot("06-notification-settings.png")

await clickByText(["供应商管理"])
await clickByText(["添加供应商", "添加渠道", "新建", "添加"])
await sleep(600)
await shot("07-channel-form.png")

await browser.close()
console.log("screenshots complete ->", outDir)
