import { describe, expect, it } from "vitest"
import { decryptSecret, encryptSecret, isEncryptedSecret } from "./crypto.js"

describe("secret encryption", () => {
  it("round trips values with randomized authenticated encryption", () => {
    const first = encryptSecret("refresh-token-value", "test-encryption-key")
    const second = encryptSecret("refresh-token-value", "test-encryption-key")

    expect(first).not.toBe(second)
    expect(isEncryptedSecret(first)).toBe(true)
    expect(decryptSecret(first, "test-encryption-key")).toBe("refresh-token-value")
    expect(() => decryptSecret(first, "wrong-encryption-key")).toThrow()
  })

  it("keeps empty values and does not double encrypt ciphertext", () => {
    expect(encryptSecret(null, "test-encryption-key")).toBeNull()
    expect(encryptSecret("", "test-encryption-key")).toBe("")
    const encrypted = encryptSecret("secret", "test-encryption-key")
    expect(encryptSecret(encrypted, "test-encryption-key")).toBe(encrypted)
  })
})