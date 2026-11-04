import type { ChannelType } from "@llm-upstream-monitor/shared"
import { Save, X } from "lucide-react"
import type { FormEvent } from "react"
import { CheckboxInput } from "@/components/form-controls"
import { Button } from "@/components/ui/button"
import type { ChannelFormState, SetupMode } from "@/types/app"

type ChannelModalProps = {
  form: ChannelFormState
  isSaving: boolean
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  setForm: (form: ChannelFormState) => void
}

export function ChannelModal({ form, isSaving, onClose, onSubmit, setForm }: ChannelModalProps) {
  function changeSetupMode(setupMode: SetupMode) {
    setForm({
      ...form,
      setupMode,
      type: setupMode === "account" ? "sub2api" : form.type,
      accountTemplate: "sub2api",
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto border border-primary/45 bg-card shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{form.id ? "编辑供应商" : "添加供应商"}</h2>
            <p className="text-sm text-muted-foreground">选择简易余额模板，或接入上游后台账号。</p>
          </div>
          <button
            aria-label="关闭弹窗"
            className="flex size-9 items-center justify-center border border-border hover:bg-muted"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <form className="grid gap-4 px-5 py-5" onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className={
                form.setupMode === "simple"
                  ? "border border-primary bg-primary/12 p-4 text-left shadow-lg shadow-primary/10"
                  : "border border-border bg-background/45 p-4 text-left hover:border-primary/60"
              }
              onClick={() => changeSetupMode("simple")}
              type="button"
            >
              <span className="text-sm font-semibold">简易模式</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                使用 NewAPI / Sub2API 余额检测模板，只配置 API 凭证和检测参数。
              </span>
            </button>
            <button
              className={
                form.setupMode === "account"
                  ? "border border-primary bg-primary/12 p-4 text-left shadow-lg shadow-primary/10"
                  : "border border-border bg-background/45 p-4 text-left hover:border-primary/60"
              }
              onClick={() => changeSetupMode("account")}
              type="button"
            >
              <span className="text-sm font-semibold">账号接入</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                配置供应商后台账号或 refresh token，让程序自动刷新登录态并抓取上游数据。
              </span>
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="供应商名称"
              value={form.name}
              onChange={(name) => setForm({ ...form, name })}
              required
            />
            <TextInput
              label="请求地址"
              value={form.requestUrl}
              onChange={(requestUrl) => setForm({ ...form, requestUrl })}
              placeholder="https://example.com"
              required
            />
            <TextInput
              label="官网 / 后台链接"
              value={form.officialUrl}
              onChange={(officialUrl) => setForm({ ...form, officialUrl })}
              placeholder="https://provider.example.com"
            />
            <OptionalNumberInput
              label="充值倍率"
              value={form.rechargeRate}
              onChange={(rechargeRate) => setForm({ ...form, rechargeRate })}
              placeholder="不填默认为 1，例如 1:10 填 10"
              min={0.000001}
            />
            <OptionalNumberInput
              label="余额告警阈值"
              value={form.alertThreshold}
              onChange={(alertThreshold) => setForm({ ...form, alertThreshold })}
              placeholder="折算余额低于该值时提醒"
              min={0}
            />
          </div>

          <div className="grid gap-3 border border-border bg-background/35 p-4">
            <SectionIntro
              title="告警设置"
              description="按供应商控制站内通知；分组类告警会在账号接入快照刷新时对比变化。"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <CheckboxInput
                label="余额阈值告警"
                checked={form.balanceAlertEnabled}
                onChange={(balanceAlertEnabled) => setForm({ ...form, balanceAlertEnabled })}
              />
              <CheckboxInput
                label="余额检测"
                checked={form.balanceCheckEnabled}
                onChange={(balanceCheckEnabled) => setForm({ ...form, balanceCheckEnabled })}
              />
              <CheckboxInput
                label="分组变动告警"
                checked={form.groupChangeAlertEnabled}
                onChange={(groupChangeAlertEnabled) =>
                  setForm({ ...form, groupChangeAlertEnabled })
                }
              />
              <CheckboxInput
                label="倍率调整告警"
                checked={form.groupRateAlertEnabled}
                onChange={(groupRateAlertEnabled) => setForm({ ...form, groupRateAlertEnabled })}
              />
            </div>
          </div>

          {form.setupMode === "simple" ? (
            <div className="grid gap-4 border border-border bg-background/35 p-4">
              <SectionIntro
                title="简易余额模板"
                description="这里保持之前的 NewAPI / Sub2API 添加方式，适合只做余额检测和告警。"
              />
              <label className="flex flex-col gap-2 text-sm font-medium">
                模板
                <select
                  className="h-10 border border-input bg-background/75 px-3 text-sm outline-none focus:border-primary"
                  value={form.type}
                  onChange={(event) =>
                    setForm({ ...form, type: event.target.value as ChannelType })
                  }
                >
                  <option value="newapi">NewAPI 余额检测</option>
                  <option value="sub2api">Sub2API API Key 检测</option>
                </select>
              </label>

              {form.type === "newapi" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput
                    label={form.id ? "访问令牌，留空则保持原值" : "访问令牌"}
                    value={form.accessToken}
                    onChange={(accessToken) => setForm({ ...form, accessToken })}
                    type="password"
                    required={!form.id}
                  />
                  <TextInput
                    label="用户 ID"
                    value={form.userId}
                    onChange={(userId) => setForm({ ...form, userId })}
                    required
                  />
                </div>
              ) : (
                <TextInput
                  label={form.id ? "API Key，留空则保持原值" : "API Key"}
                  value={form.apiKey}
                  onChange={(apiKey) => setForm({ ...form, apiKey })}
                  type="password"
                  required={!form.id}
                />
              )}
            </div>
          ) : (
            <div className="grid gap-4 border border-border bg-background/35 p-4">
              <SectionIntro
                title="账号接入模板"
                description="配置 Sub2API 后台登录或 NewAPI 访问令牌，用于读取分组和批量创建密钥。"
              />
              <label className="flex flex-col gap-2 text-sm font-medium">
                账号模板
                <select
                  className="h-10 border border-input bg-background/75 px-3 text-sm outline-none focus:border-primary"
                  value={form.accountTemplate}
                  onChange={(event) => {
                    const accountTemplate = event.target
                      .value as ChannelFormState["accountTemplate"]
                    setForm({ ...form, accountTemplate, type: "sub2api" })
                  }}
                >
                  <option value="sub2api">Sub2API 后台账号</option>
                  <option value="newapi">NewAPI 批量密钥</option>
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                {form.accountTemplate === "sub2api" && (
                  <TextInput
                    label={
                      form.id
                        ? "Sub2API API Key（余额检测用，可留空保持原值）"
                        : "Sub2API API Key（余额检测用，可选）"
                    }
                    value={form.apiKey}
                    onChange={(apiKey) => setForm({ ...form, apiKey, type: "sub2api" })}
                    type="password"
                  />
                )}
                <TextInput
                  label={form.accountTemplate === "newapi" ? "NewAPI 基础地址" : "上游登录页"}
                  value={form.upstreamLoginUrl}
                  onChange={(upstreamLoginUrl) =>
                    setForm({ ...form, upstreamLoginUrl, type: "sub2api" })
                  }
                  placeholder="https://example.com"
                />
                {form.accountTemplate === "newapi" ? (
                  <>
                    <TextInput
                      label={form.id ? "NewAPI 访问令牌，留空则保持原值" : "NewAPI 访问令牌"}
                      value={form.accessToken}
                      onChange={(accessToken) => setForm({ ...form, accessToken, type: "sub2api" })}
                      type="password"
                      required={!form.id}
                    />
                    <TextInput
                      label="NewAPI 用户 ID"
                      value={form.userId}
                      onChange={(userId) => setForm({ ...form, userId, type: "sub2api" })}
                      required
                    />
                  </>
                ) : (
                  <TextInput
                    label="上游账号邮箱"
                    value={form.upstreamUsername}
                    onChange={(upstreamUsername) =>
                      setForm({ ...form, upstreamUsername, type: "sub2api" })
                    }
                    placeholder="name@example.com"
                  />
                )}
                {form.accountTemplate === "sub2api" && (
                  <TextInput
                    label={form.id ? "上游密码，留空则保持原值" : "上游密码"}
                    value={form.upstreamPassword}
                    onChange={(upstreamPassword) =>
                      setForm({ ...form, upstreamPassword, type: "sub2api" })
                    }
                    type="password"
                  />
                )}
                {form.accountTemplate === "sub2api" && (
                  <TextInput
                    label={form.id ? "Access token，留空则保持原值" : "Access token"}
                    value={form.upstreamAccessToken}
                    onChange={(upstreamAccessToken) =>
                      setForm({ ...form, upstreamAccessToken, type: "sub2api" })
                    }
                    type="password"
                  />
                )}
                {form.accountTemplate === "sub2api" && (
                  <>
                    <TextInput
                      label={form.id ? "Refresh token，留空则保持原值" : "Refresh token"}
                      value={form.upstreamRefreshToken}
                      onChange={(upstreamRefreshToken) =>
                        setForm({ ...form, upstreamRefreshToken, type: "sub2api" })
                      }
                      type="password"
                    />
                    <TextInput
                      label="Token 过期时间"
                      value={form.upstreamTokenExpiresAt}
                      onChange={(upstreamTokenExpiresAt) =>
                        setForm({ ...form, upstreamTokenExpiresAt, type: "sub2api" })
                      }
                      placeholder="2026-07-05T12:00:00.000Z"
                    />
                  </>
                )}
                {form.accountTemplate === "newapi" && (
                  <p className="text-sm text-muted-foreground">
                    需要授予 group:read、api_key:read、api_key:write、api_key:reveal 权限的 NewAPI
                    访问令牌和用户 ID。创建操作会在该用户下按选定分组创建 API Key。
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput
              label="超时时间，秒"
              value={form.timeoutSeconds}
              onChange={(timeoutSeconds) => setForm({ ...form, timeoutSeconds })}
              min={1}
              max={300}
            />
            <NumberInput
              label="查询间隔，分钟"
              value={form.checkIntervalMinutes}
              onChange={(checkIntervalMinutes) => setForm({ ...form, checkIntervalMinutes })}
              min={1}
              max={1440}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={isSaving}>
              <Save data-icon="inline-start" aria-hidden="true" />
              {isSaving ? "保存中" : "保存供应商"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

type SectionIntroProps = {
  title: string
  description: string
}

function SectionIntro({ title, description }: SectionIntroProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

type TextInputProps = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  required?: boolean
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: TextInputProps) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 border border-input bg-background/75 px-3 text-sm outline-none focus:border-primary"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        required={required}
      />
    </label>
  )
}

type OptionalNumberInputProps = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  min: number
}

function OptionalNumberInput({
  label,
  value,
  onChange,
  placeholder,
  min,
}: OptionalNumberInputProps) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 border border-input bg-background/75 px-3 text-sm outline-none focus:border-primary"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="number"
        min={min}
        step="any"
      />
    </label>
  )
}

type NumberInputProps = {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
}

function NumberInput({ label, value, onChange, min, max }: NumberInputProps) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 border border-input bg-background/75 px-3 text-sm outline-none focus:border-primary"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        min={min}
        max={max}
        required
      />
    </label>
  )
}
