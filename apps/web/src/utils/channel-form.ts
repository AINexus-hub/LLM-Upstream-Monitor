import type { ChannelPayload, PublicChannel } from "@llm-upstream-monitor/shared"
import type { ChannelFormState, OptionalRead, Sub2ApiUpstreamSnapshot } from "@/types/app"

export const emptyForm: ChannelFormState = {
  setupMode: "simple",
  accountTemplate: "sub2api",
  name: "",
  type: "sub2api",
  requestUrl: "",
  officialUrl: "",
  upstreamLoginUrl: "",
  upstreamUsername: "",
  upstreamPassword: "",
  upstreamAccessToken: "",
  upstreamRefreshToken: "",
  upstreamTokenExpiresAt: "",
  rechargeRate: "",
  alertThreshold: "10",
  balanceAlertEnabled: true,
  groupChangeAlertEnabled: true,
  groupRateAlertEnabled: true,
  accessToken: "",
  userId: "",
  apiKey: "",
  timeoutSeconds: 30,
  checkIntervalMinutes: 5,
}

export function channelToForm(channel: PublicChannel): ChannelFormState {
  return {
    id: channel.id,
    setupMode:
      channel.hasUpstreamAccessToken || channel.hasUpstreamRefreshToken || channel.hasUpstreamPassword
        ? "account"
        : "simple",
    accountTemplate: "sub2api",
    name: channel.name,
    type: channel.type,
    requestUrl: channel.requestUrl,
    officialUrl: channel.officialUrl ?? "",
    upstreamLoginUrl: channel.upstreamLoginUrl ?? "",
    upstreamUsername: channel.upstreamUsername ?? "",
    upstreamPassword: "",
    upstreamAccessToken: "",
    upstreamRefreshToken: "",
    upstreamTokenExpiresAt: channel.upstreamTokenExpiresAt ?? "",
    rechargeRate: String(channel.rechargeRate ?? 1),
    alertThreshold: channel.alertThreshold === undefined ? "" : String(channel.alertThreshold),
    balanceAlertEnabled: channel.balanceAlertEnabled,
    groupChangeAlertEnabled: channel.groupChangeAlertEnabled,
    groupRateAlertEnabled: channel.groupRateAlertEnabled,
    accessToken: "",
    userId: channel.userId ?? "",
    apiKey: "",
    timeoutSeconds: channel.timeoutSeconds,
    checkIntervalMinutes: channel.checkIntervalMinutes,
  }
}

function isReadOk(read: OptionalRead) {
  return read.data !== null
}

export function summarizeSub2ApiSnapshot(snapshot: Sub2ApiUpstreamSnapshot) {
  const reads = [
    { label: "账号", read: snapshot.account.me.data ? snapshot.account.me : snapshot.account.profile },
    { label: "统计", read: snapshot.dashboard.stats },
    { label: "趋势", read: snapshot.dashboard.trend },
    { label: "模型分布", read: snapshot.dashboard.models },
    { label: "最近使用", read: snapshot.dashboard.recentUsage },
    { label: "平台拆分", read: snapshot.dashboard.platformQuotas },
    { label: "API密钥", read: snapshot.keys.list },
    { label: "可选分组", read: snapshot.keys.availableGroups },
    { label: "分组倍率", read: snapshot.keys.groupRates },
    { label: "可用渠道", read: snapshot.keys.availableChannels },
  ]
  const okBlocks = [
    isReadOk(snapshot.account.me) || isReadOk(snapshot.account.profile) ? "账号" : undefined,
    isReadOk(snapshot.dashboard.stats) ? "统计" : undefined,
    isReadOk(snapshot.dashboard.trend) ? "趋势" : undefined,
    isReadOk(snapshot.dashboard.models) ? "模型分布" : undefined,
    isReadOk(snapshot.dashboard.recentUsage) ? "最近使用" : undefined,
    isReadOk(snapshot.dashboard.platformQuotas) ? "平台拆分" : undefined,
    isReadOk(snapshot.keys.list) ? "API密钥" : undefined,
    isReadOk(snapshot.keys.availableGroups) ? "可选分组" : undefined,
    isReadOk(snapshot.keys.groupRates) ? "分组倍率" : undefined,
    isReadOk(snapshot.keys.availableChannels) ? "可用渠道" : undefined,
  ].filter(Boolean)

  const refreshText = snapshot.refreshedByRefreshToken
    ? "refresh token 刷新成功"
    : "未使用 refresh token"
  const failedBlocks = reads
    .filter(({ read }) => read.error)
    .map(({ label, read }) => `${label}: ${read.error}`)

  return [
    `上游诊断完成：${refreshText}`,
    `已读取 ${okBlocks.join("、") || "暂无模块"}`,
    failedBlocks.length > 0 ? `失败 ${failedBlocks.join("；")}` : undefined,
  ]
    .filter(Boolean)
    .join("；")
}

export function formToPayload(form: ChannelFormState): ChannelPayload {
  const payload: ChannelPayload = {
    name: form.name.trim(),
    type: form.type,
    requestUrl: form.requestUrl.trim(),
    timeoutSeconds: form.timeoutSeconds,
    checkIntervalMinutes: form.checkIntervalMinutes,
  }

  const officialUrl = form.officialUrl.trim()
  payload.officialUrl = officialUrl || null

  const upstreamLoginUrl = form.upstreamLoginUrl.trim()
  payload.upstreamLoginUrl = upstreamLoginUrl || null

  const upstreamUsername = form.upstreamUsername.trim()
  payload.upstreamUsername = upstreamUsername || null

  const upstreamPassword = form.upstreamPassword.trim()
  if (upstreamPassword) {
    payload.upstreamPassword = upstreamPassword
  }

  const upstreamAccessToken = form.upstreamAccessToken.trim()
  if (upstreamAccessToken) {
    payload.upstreamAccessToken = upstreamAccessToken
  }

  const upstreamRefreshToken = form.upstreamRefreshToken.trim()
  if (upstreamRefreshToken) {
    payload.upstreamRefreshToken = upstreamRefreshToken
  }

  const upstreamTokenExpiresAt = form.upstreamTokenExpiresAt.trim()
  payload.upstreamTokenExpiresAt = upstreamTokenExpiresAt || null
  payload.clearUpstreamSession = form.setupMode === "simple"

  const rechargeRate = form.rechargeRate.trim()
  if (rechargeRate) {
    payload.rechargeRate = Number(rechargeRate)
  }

  const alertThreshold = form.alertThreshold.trim()
  payload.alertThreshold = alertThreshold ? Number(alertThreshold) : null
  payload.balanceAlertEnabled = form.balanceAlertEnabled
  payload.groupChangeAlertEnabled = form.groupChangeAlertEnabled
  payload.groupRateAlertEnabled = form.groupRateAlertEnabled

  if (form.type === "newapi") {
    payload.accessToken = form.accessToken.trim() || undefined
    payload.userId = form.userId.trim()
  }

  if (form.type === "sub2api") {
    payload.apiKey = form.apiKey.trim() || undefined
  }

  return payload
}
