/**
 * Trim Electron runtime files that are not required for this desktop app.
 * Saves unpacked size and slightly reduces the portable archive.
 */
const fs = require("node:fs")
const path = require("node:path")

/** @param {import('electron-builder').AfterPackContext} context */
exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir
  const removable = [
    "LICENSES.chromium.html",
    "vk_swiftshader_icd.json",
    "vk_swiftshader.dll",
    "vulkan-1.dll",
  ]

  for (const name of removable) {
    const target = path.join(appOutDir, name)
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true })
      console.log(`[after-pack] removed ${name}`)
    }
  }
}
