import { app, BrowserWindow, dialog } from "electron"
import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const desktopDir = dirname(fileURLToPath(import.meta.url))
const apiPort = 31978
let mainWindow: BrowserWindow | undefined
let apiApp: { close: () => Promise<unknown> } | undefined

function getWebUrlArg() {
  const prefix = "--web-url="
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

function getDataDir() {
  return (
    process.env.LLM_UPSTREAM_MONITOR_DATA_DIR ??
    process.env.PORTABLE_EXECUTABLE_DIR ??
    app.getPath("userData")
  )
}

async function startApi() {
  const databasePath = join(getDataDir(), "data", "llm-upstream-monitor.db")
  await mkdir(dirname(databasePath), { recursive: true })

  process.env.API_HOST = "127.0.0.1"
  process.env.API_PORT = String(apiPort)
  process.env.DATABASE_URL = `file:${databasePath}`

  const [{ createApp }, { initDatabase }, { startBalanceScheduler }] = await Promise.all([
    import("../../api/dist/app.js"),
    import("../../api/dist/db.js"),
    import("../../api/dist/scheduler.js"),
  ])

  const server = createApp()
  await initDatabase()
  startBalanceScheduler()
  await server.listen({
    host: "127.0.0.1",
    port: apiPort,
  })

  apiApp = server
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    title: "LLM Upstream Monitor",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show()
  })

  const devWebUrl = getWebUrlArg()
  const indexUrl = devWebUrl
    ? new URL(devWebUrl)
    : pathToFileURL(join(desktopDir, "../../web/dist/index.html"))

  indexUrl.searchParams.set("apiBaseUrl", `http://127.0.0.1:${apiPort}`)
  await mainWindow.loadURL(indexUrl.toString())
}

async function bootstrap() {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    return
  }

  app.on("second-instance", () => {
    if (!mainWindow) {
      return
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
  })

  await app.whenReady()

  try {
    await startApi()
    await createWindow()
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      title: "LLM Upstream Monitor 启动失败",
      message: error instanceof Error ? error.message : "应用启动失败",
    })
    app.quit()
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("before-quit", () => {
  if (apiApp) {
    void apiApp.close()
    apiApp = undefined
  }
})

void bootstrap()
