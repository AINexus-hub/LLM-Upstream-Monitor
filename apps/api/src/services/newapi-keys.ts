import type { ChannelRow } from "../types.js"

export type NewApiGroup = { id: string; name: string; platform: string; platforms: string[]; rateMultiplier?: number }
export type NewApiToken = {
  id: string
  name: string
  keyPreview?: string
  groupName?: string
  status?: string
  quota?: number
  used?: number
  createdAt?: string
}
type CreatedKey = { groupId: string; groupName: string; name: string; success: boolean; key?: string; error?: string }

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function string(value: unknown) {
  return typeof value === "string" ? value : ""
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function unwrap(payload: unknown, response: Response, preserveEnvelope = false) {
  const envelope = record(payload)
  const code = envelope.code
  if (!response.ok || envelope.success === false || (code !== undefined && code !== 0 && code !== true)) {
    throw new Error(string(envelope.message) || string(envelope.msg) || `HTTP ${response.status}`)
  }
  return preserveEnvelope ? payload : envelope.data ?? payload
}

async function request(channel: ChannelRow, path: string, method = "GET", body?: unknown, preserveEnvelope = false) {
  if (!channel.accessToken) throw new Error("缺少 NewAPI 访问令牌")
  if (!channel.userId) throw new Error("缺少 NewAPI 用户 ID")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), channel.timeoutSeconds * 1000)
  try {
    const baseUrl = channel.upstreamLoginUrl || channel.requestUrl
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${channel.accessToken}`,
        "New-Api-User": channel.userId,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    })
    const raw = await response.text()
    let payload: unknown
    try {
      payload = raw ? JSON.parse(raw) : null
    } catch {
      throw new Error(`NewAPI 返回了无效 JSON（HTTP ${response.status}）`)
    }
    return unwrap(payload, response, preserveEnvelope)
  } finally {
    clearTimeout(timeout)
  }
}

export async function readNewApiEndpoint(channel: ChannelRow, path: string, preserveEnvelope = false) {
  return request(channel, path, "GET", undefined, preserveEnvelope)
}

export async function listNewApiGroups(
  channel: ChannelRow,
  suppliedGroupData?: unknown,
  suppliedPricingData?: unknown,
): Promise<NewApiGroup[]> {
  // /api/group/ is administrator-only; regular users can see their usable groups here.
  const [groupData, pricingData] = await Promise.all([
    suppliedGroupData === undefined
      ? request(channel, "/api/user/self/groups")
      : Promise.resolve(suppliedGroupData),
    suppliedPricingData === undefined
      ? request(channel, "/api/pricing", "GET", undefined, true).catch(() => null)
      : Promise.resolve(suppliedPricingData),
  ])
  const groupRatios = record(groupData)
  const groups = Object.keys(groupRatios)
  if (!groupData || typeof groupData !== "object" || Array.isArray(groupData)) {
    throw new Error("NewAPI 分组列表格式无效")
  }

  const pricing = record(pricingData)
  const vendors = Array.isArray(pricing.vendors) ? pricing.vendors.map(record) : []
  const vendorNames = new Map(vendors.map((vendor) => [number(vendor.id), string(vendor.name)]))
  const vendorGroups = new Map<string, Set<string>>()
  for (const item of Array.isArray(pricing.data) ? pricing.data : []) {
    const model = record(item)
    const vendorName = vendorNames.get(number(model.vendor_id))
    if (!vendorName || !Array.isArray(model.enable_groups)) continue
    for (const group of model.enable_groups) {
      if (typeof group !== "string") continue
      const names = vendorGroups.get(group) ?? new Set<string>()
      names.add(vendorName)
      vendorGroups.set(group, names)
    }
  }

  return [...new Set(groups.map((item) => item.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .map((name) => ({
      id: name,
      name,
      platforms: [...(vendorGroups.get(name) ?? [])].sort((a, b) => a.localeCompare(b, "zh-CN")),
      platform: [...(vendorGroups.get(name) ?? [])].sort((a, b) => a.localeCompare(b, "zh-CN")).join(" / ") || "未知厂商",
      rateMultiplier: typeof record(groupRatios[name]).ratio === "number"
        ? number(record(groupRatios[name]).ratio)
        : undefined,
    }))
}

export async function listNewApiTokens(channel: ChannelRow): Promise<NewApiToken[]> {
  const tokens: NewApiToken[] = []
  for (let page = 1; page <= 100; page++) {
    const data = record(await request(channel, `/api/token/?p=${page}&page_size=100`))
    if (!Array.isArray(data.items)) throw new Error("NewAPI 令牌列表格式无效")
    const items = data.items.map(record)
    tokens.push(...items.flatMap((item) => {
      const id = number(item.id)
      if (!Number.isSafeInteger(id) || id < 1) return []
      const key = string(item.key)
      return [{
        id: String(id),
        name: string(item.name) || `Token ${id}`,
        keyPreview: key ? key.includes("*") ? key : `${key.slice(0, 4)}...${key.slice(-4)}` : undefined,
        groupName: string(item.group),
        status: item.status === undefined ? undefined : String(item.status),
        quota: Number.isFinite(Number(item.remain_quota)) ? Number(item.remain_quota) : undefined,
        used: Number.isFinite(Number(item.used_quota)) ? Number(item.used_quota) : undefined,
        createdAt: item.created_time === undefined ? undefined : String(item.created_time),
      }]
    }))
    if (items.length < 100 || tokens.length >= number(data.total)) break
  }
  return tokens
}

export async function revealNewApiToken(channel: ChannelRow, tokenId: string) {
  if (!/^\d+$/.test(tokenId) || !Number.isSafeInteger(Number(tokenId)) || Number(tokenId) < 1) {
    throw new Error("NewAPI 令牌 ID 无效")
  }
  const data = record(await request(channel, `/api/token/${Number(tokenId)}/key`, "POST", {}))
  const key = string(data.key)
  if (!key) throw new Error("NewAPI 未返回完整密钥，请检查 api_key:reveal 权限")
  return key
}

async function findCreatedTokenId(channel: ChannelRow, name: string, beforeIds: Set<number>) {
  const data = record(await request(channel, "/api/token/?p=1&page_size=100"))
  const items = Array.isArray(data.items) ? data.items.map(record) : []
  const created = items
    .filter((item) => string(item.name) === name && !beforeIds.has(number(item.id)))
    .sort((a, b) => number(b.created_time) - number(a.created_time))[0]
  const id = number(created?.id)
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("令牌已创建，但无法从令牌列表定位记录；请检查 api_key:read 权限或刷新令牌列表")
  }
  return id
}

async function createForGroup(
  channel: ChannelRow,
  group: NewApiGroup,
  input: { quota?: number; expiresInDays?: number },
): Promise<CreatedKey> {
  const name = group.rateMultiplier === undefined
    ? group.name
    : `${String(Math.round(group.rateMultiplier * 100)).padStart(3, "0")}${group.name}`
  try {
    const beforeData = record(await request(channel, "/api/token/?p=1&page_size=100"))
    const beforeIds = new Set((Array.isArray(beforeData.items) ? beforeData.items : []).map((item) => number(record(item).id)))
    const quota = Math.max(0, Math.floor((input.quota ?? 0) * 500000))
    const expiredTime = input.expiresInDays === undefined
      ? -1
      : Math.floor(Date.now() / 1000) + input.expiresInDays * 86400
    await request(channel, "/api/token/", "POST", {
      name,
      group: group.name,
      remain_quota: quota,
      unlimited_quota: quota === 0,
      expired_time: expiredTime,
    })
    const id = await findCreatedTokenId(channel, name, beforeIds)
    const key = await revealNewApiToken(channel, String(id))
    return { groupId: group.id, groupName: group.name, name, success: true, key }
  } catch (error) {
    return { groupId: group.id, groupName: group.name, name, success: false, error: error instanceof Error ? error.message : "创建失败" }
  }
}

export async function createNewApiKeys(
  channel: ChannelRow,
  input: { groupIds: string[]; quota?: number; expiresInDays?: number },
): Promise<CreatedKey[]> {
  const groups = await listNewApiGroups(channel)
  const results: CreatedKey[] = []
  for (const groupId of input.groupIds) {
    const group = groups.find((item) => item.id === groupId)
    if (!group) {
      results.push({ groupId, groupName: groupId, name: groupId, success: false, error: "分组已不可用，请重新加载" })
      continue
    }
    results.push(await createForGroup(channel, group, input))
  }
  return results
}
