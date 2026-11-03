import { describe, expect, it } from "vitest"
import { buildSub2ApiKeyName } from "./sub2api-upstream.js"

describe("Sub2API generated key names", () => {
  it("prefixes the group name with the multiplier in hundredths", () => {
    expect(buildSub2ApiKeyName({ id: "1", name: "模型组", rateMultiplier: 0.1 })).toBe("010模型组")
    expect(buildSub2ApiKeyName({ id: "2", name: "快速组", rateMultiplier: 1.25 })).toBe("125快速组")
  })

  it("rejects a group without a known multiplier", () => {
    expect(() => buildSub2ApiKeyName({ id: "3", name: "未知倍率组" })).toThrow("无法读取分组")
  })
})
