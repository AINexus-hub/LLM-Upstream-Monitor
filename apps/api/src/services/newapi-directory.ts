import { createHash, createPublicKey, createCipheriv, publicEncrypt, randomBytes } from "node:crypto"
import type { ChannelRow } from "../types.js"
import { updateUpstreamSession } from "../repositories/channels.js"

type NewApiGroup = { id: number; name: string; platform: "newapi"; status: "active" }
type NewApiAccount = {
  id: number
  name: string
  username: string
  group: string
  groupId: number
  status: "active" | "disabled" | `unknown:${number}`
  role: number
  createdAt: number
}
type NewApiToken = {
  id: number
  name: string
  status: number
  expiredTime: number
  maskedKey: string
}
export type NewApiDirectory = {
  groups: NewApiGroup[]
  accounts: NewApiAccount[]
  tokenStatus: {
    scope: "current_admin_only"
    available: boolean
    items: NewApiToken[]
    note: string
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

function maskToken(value: unknown) {
  const token = text(value)
  if (!token) return ""
  if (/[*•]/.test(token)) return token
  if (token.length <= 8) return `${token.slice(0, 2)}****`
  return `${token.slice(0, 4)}${"*".repeat(Math.min(token.length - 8, 16))}${token.slice(-4)}`
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function apiUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}${path}`
}

function normalizeRefreshCookie(value: string) {
  const cookie = value.trim().replace(/^Cookie:\s*/i, "")
  const match = cookie.match(/(?:^|;\s*)new_api_refresh=([^;]+)/i)
  return (match?.[1] ?? cookie).trim().replace(/^"|"$/g, "")
}

export function encryptNewApiPassword(password: string, publicKeyPEM: string, keyID: string) {
  const publicKey = createPublicKey(publicKeyPEM)
  const plaintext = Buffer.from(password, "utf8")
  const maxLength = (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) / 8 - 66
  if (plaintext.length <= maxLength) {
    return publicEncrypt({ key: publicKey, oaepHash: "sha256" }, plaintext).toString("base64")
  }

  const secret = randomBytes(32)
  const nonce = randomBytes(12)
  const wrapped = publicEncrypt(
    { key: publicKey, oaepHash: "sha256", oaepLabel: Buffer.from("password-v2") },
    secret,
  )
  const cipher = createCipheriv("aes-256-gcm", secret, nonce)
  cipher.setAAD(Buffer.from(`password-v2:${keyID}`))
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
  return ["v2", wrapped.toString("base64"), nonce.toString("base64"), encrypted.toString("base64")].join(".")
}

function normalizeGroups(values: unknown[]): NewApiGroup[] {
  const names = [...new Set(values.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
  const used = new Set<number>()
  return names.map((name) => {
    let id = createHash("sha256").update(name).digest().readUInt32BE(0) & 0x7fffffff
    if (!id) id = 1
    while (used.has(id)) id = id === 0x7fffffff ? 1 : id + 1
    used.add(id)
    return { id, name, platform: "newapi", status: "active" }
  })
}

export async function readNewApiDirectory(channel: ChannelRow): Promise<NewApiDirectory> {
  if (channel.accountTemplate !== "newapi") throw new Error("该账号未使用 NewAPI 管理员模板")
  const storedRefreshCookie = channel.upstreamRefreshToken
    ? normalizeRefreshCookie(channel.upstreamRefreshToken)
    : ""
  if (!storedRefreshCookie && (!channel.upstreamUsername || !channel.upstreamPassword)) {
    throw new Error("缺少 NewAPI refresh cookie 或管理员用户名和密码")
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), channel.timeoutSeconds * 1000)
  const request = async (path: string, body?: unknown, token = "", cookie = "") => {
    const response = await fetch(apiUrl(channel.upstreamLoginUrl || channel.requestUrl, path), {
      method: body === undefined && path !== "/api/user/auth/refresh" ? "GET" : "POST",
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { Cookie: `new_api_refresh=${cookie}` } : {}),
        ...(path === "/api/user/auth/refresh" ? { Origin: new URL(channel.upstreamLoginUrl || channel.requestUrl).origin } : {}),
        ...(path === "/api/user/auth/refresh" && cookie.includes(".") ? { "X-Auth-Session": cookie.split(".", 1)[0] } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const refreshCookie = response.headers.getSetCookie?.()
      .map((item) => item.match(/(?:^|,\s*)new_api_refresh=([^;]+)/)?.[1])
      .find(Boolean)
    if (refreshCookie) {
      channel.upstreamRefreshToken = decodeURIComponent(refreshCookie)
      await updateUpstreamSession(channel.id, { refreshToken: channel.upstreamRefreshToken })
    }

    const rawText = await response.text()
    let payload: unknown
    try {
      payload = JSON.parse(rawText)
    } catch {
      throw new Error(`NewAPI 返回了无效 JSON（HTTP ${response.status}）`)
    }
    const envelope = record(payload)
    if (!response.ok || envelope.success === false || (envelope.code !== undefined && number(envelope.code) !== 0)) {
      const message = text(envelope.message) || text(envelope.msg)
      throw new Error(message ? `NewAPI 请求失败（HTTP ${response.status}）：${message}` : `NewAPI 请求失败（HTTP ${response.status}）`)
    }
    return envelope.data ?? payload
  }

  try {
    let auth: Record<string, unknown> = {}
    let accessToken = ""
    let refreshError: unknown
    if (storedRefreshCookie) {
      try {
        auth = record(await request("/api/user/auth/refresh", undefined, "", storedRefreshCookie))
        accessToken = text(auth.access_token)
      } catch (error) {
        refreshError = error
      }
    }

    let loginError: unknown
    if (!accessToken && channel.upstreamUsername && channel.upstreamPassword) {
      const login: Record<string, unknown> = {
        username: channel.upstreamUsername,
        password: channel.upstreamPassword,
      }
      const encryption = await request("/api/user/login/encryption-key").catch(() => null)
      const encryptionRecord = record(encryption)
      if (encryptionRecord.enabled) {
        const kid = text(encryptionRecord.kid)
        const publicKey = text(encryptionRecord.public_key)
        if (!kid || !publicKey) throw new Error("NewAPI 密码加密公钥无效")
        login.password_encrypted = encryptNewApiPassword(channel.upstreamPassword, publicKey, kid)
        login.encryption_key_id = kid
        delete login.password
      }

      try {
        auth = record(await request("/api/user/login", login))
        accessToken = text(auth.access_token) || text(auth.token)
        if (!accessToken && (auth.require_verification || auth.flow_token || auth.require_2fa)) {
          throw new Error("NewAPI 登录需要 2FA/Passkey 验证；请先在浏览器完成验证后配置会话 Cookie")
        }
      } catch (error) {
        loginError = error
      }
    }

    if (!accessToken) {
      const errors = [refreshError, loginError].filter((error): error is Error => error instanceof Error)
      if (errors.length > 1) {
        throw new Error(`Refresh Cookie 刷新失败：${errors[0]?.message}；密码登录失败：${errors[1]?.message}`)
      }
      if (errors.length === 1) throw errors[0]
    }

    const admin = record(auth.user)
    if (!accessToken || !Object.keys(admin).length || number(admin.role) < 10) {
      throw new Error("NewAPI 登录未返回管理员会话，可能需要 2FA、Passkey 或额外验证")
    }

    const rawGroups = await request("/api/group/", undefined, accessToken)
    if (!Array.isArray(rawGroups)) throw new Error("NewAPI 分组列表格式无效")
    const groups = normalizeGroups(rawGroups)
    const groupIds = new Map(groups.map((group) => [group.name, group.id]))
    const users: Record<string, unknown>[] = []
    for (let page = 1; page <= 1000; page++) {
      const result = record(await request(`/api/user/?p=${page}&page_size=100`, undefined, accessToken))
      if (!Array.isArray(result.items)) throw new Error("NewAPI 用户分页数据格式无效")
      users.push(...result.items.map(record))
      if (users.length >= number(result.total) || result.items.length < 100) break
    }

    const tokenData = await request("/api/token/?p=1&size=100", undefined, accessToken).catch(() => null)
    const tokenItems = record(tokenData).items
    return {
      groups,
      accounts: users.map((user) => {
        const group = text(user.group)
        const statusCode = number(user.status)
        const status: NewApiAccount["status"] = statusCode === 1 ? "active" : statusCode === 2 ? "disabled" : `unknown:${statusCode}`
        const id = number(user.id)
        return {
          id,
          name: text(user.display_name) || text(user.username) || `User ${id}`,
          username: text(user.username),
          group,
          groupId: groupIds.get(group) ?? 0,
          status,
          role: number(user.role),
          createdAt: number(user.created_at),
        }
      }).filter((user) => Number.isSafeInteger(user.id) && user.id > 0),
      tokenStatus: {
        scope: "current_admin_only",
        available: Array.isArray(tokenItems),
        items: Array.isArray(tokenItems) ? tokenItems.map((item) => {
          const token = record(item)
          return {
            id: number(token.id),
            name: text(token.name),
            status: number(token.status),
            expiredTime: number(token.expired_time),
            maskedKey: maskToken(token.key),
          }
        }) : [],
        note: "NewAPI 仅在此接口提供当前登录管理员自己的令牌（脱敏）；其他用户令牌不可读取。",
      },
    }
  } finally {
    clearTimeout(timeout)
  }
}
