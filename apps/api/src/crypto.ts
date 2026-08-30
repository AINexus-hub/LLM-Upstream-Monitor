import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const prefix = "enc:v1:"

function keyFromSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest()
}

export function encryptSecret(value: string | null | undefined, secret: string) {
  if (value == null || value === "" || value.startsWith(prefix)) {
    return value ?? null
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${prefix}${Buffer.concat([iv, tag, ciphertext]).toString("base64url")}`
}

export function decryptSecret(value: string | null | undefined, secret: string) {
  if (value == null || value === "" || !value.startsWith(prefix)) {
    return value ?? null
  }

  const payload = Buffer.from(value.slice(prefix.length), "base64url")
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), payload.subarray(0, 12))
  decipher.setAuthTag(payload.subarray(12, 28))
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8")
}

export function isEncryptedSecret(value: string | null | undefined) {
  return Boolean(value?.startsWith(prefix))
}