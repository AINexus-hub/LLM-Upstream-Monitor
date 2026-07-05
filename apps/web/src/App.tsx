import type {
  BalanceCheckRecord,
  ChannelPayload,
  ChannelType,
  PublicChannel,
} from "@llm-balance-monitor/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, LineChartIcon, Plus, RefreshCw, Save, Server } from "lucide-react"
import type { FormEvent } from "react"
import { useEffect, useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"

type ApiResponse<T> = {
  data: T
}

type ChannelFormState = {
  id?: string
  name: string
  type: ChannelType
  requestUrl: string
  accessToken: string
  userId: string
  apiKey: string
  timeoutSeconds: number
  checkIntervalMinutes: number
}

const emptyForm: ChannelFormState = {
  name: "",
  type: "newapi",
  requestUrl: "",
  accessToken: "",
  userId: "",
  apiKey: "",
  timeoutSeconds: 30,
  checkIntervalMinutes: 60,
}

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  })

  const body = (await response.json().catch(() => null)) as
    ApiResponse<T> | { message?: string } | null

  if (!response.ok) {
    throw new Error((body && "message" in body && body.message) || `请求失败：${response.status}`)
  }

  return (body as ApiResponse<T>).data
}

function channelToForm(channel: PublicChannel): ChannelFormState {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    requestUrl: channel.requestUrl,
    accessToken: "",
    userId: channel.userId ?? "",
    apiKey: "",
    timeoutSeconds: channel.timeoutSeconds,
    checkIntervalMinutes: channel.checkIntervalMinutes,
  }
}

function formToPayload(form: ChannelFormState): ChannelPayload {
  const payload: ChannelPayload = {
    name: form.name.trim(),
    type: form.type,
    requestUrl: form.requestUrl.trim(),
    timeoutSeconds: form.timeoutSeconds,
    checkIntervalMinutes: form.checkIntervalMinutes,
  }

  if (form.type === "newapi") {
    payload.accessToken = form.accessToken.trim() || undefined
    payload.userId = form.userId.trim()
  }

  if (form.type === "sub2api") {
    payload.apiKey = form.apiKey.trim() || undefined
  }

  return payload
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-"
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatBalance(record?: BalanceCheckRecord) {
  if (!record || record.remaining === undefined) {
    return "-"
  }

  return `${record.remaining.toFixed(2)} ${record.unit ?? "USD"}`
}

function App() {
  const [channels, setChannels] = useState<PublicChannel[]>([])
  const [checks, setChecks] = useState<BalanceCheckRecord[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string>()
  const [form, setForm] = useState<ChannelFormState>(emptyForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [checkingId, setCheckingId] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId),
    [channels, selectedChannelId],
  )

  const totalRemaining = useMemo(
    () =>
      channels.reduce((sum, channel) => {
        return sum + (channel.lastCheck?.remaining ?? 0)
      }, 0),
    [channels],
  )

  async function loadChannels(nextSelectedId?: string) {
    setIsLoading(true)
    setError(undefined)

    try {
      const data = await request<PublicChannel[]>("/api/channels")
      setChannels(data)

      const targetId = nextSelectedId ?? selectedChannelId ?? data[0]?.id
      setSelectedChannelId(targetId)

      if (targetId) {
        await loadChecks(targetId)
      } else {
        setChecks([])
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载渠道失败")
    } finally {
      setIsLoading(false)
    }
  }

  async function loadChecks(channelId: string) {
    const data = await request<BalanceCheckRecord[]>(`/api/channels/${channelId}/checks`)
    setChecks(data)
  }

  useEffect(() => {
    void loadChannels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedChannel) {
      setForm(channelToForm(selectedChannel))
      void loadChecks(selectedChannel.id)
    } else {
      setForm(emptyForm)
      setChecks([])
    }
  }, [selectedChannel])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError(undefined)
    setMessage(undefined)

    try {
      const payload = formToPayload(form)
      const saved = form.id
        ? await request<PublicChannel>(`/api/channels/${form.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await request<PublicChannel>("/api/channels", {
            method: "POST",
            body: JSON.stringify(payload),
          })

      setMessage(form.id ? "渠道配置已保存" : "渠道已添加")
      await loadChannels(saved.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存渠道失败")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleCheck(channelId: string) {
    setCheckingId(channelId)
    setError(undefined)
    setMessage(undefined)

    try {
      const record = await request<BalanceCheckRecord>(`/api/channels/${channelId}/check`, {
        method: "POST",
      })
      setMessage(record.success ? "余额检测完成" : record.errorMessage || "余额检测失败")
      await loadChannels(channelId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "余额检测失败")
    } finally {
      setCheckingId(undefined)
    }
  }

  function handleCreateNew() {
    setSelectedChannelId(undefined)
    setForm(emptyForm)
    setChecks([])
    setMessage(undefined)
    setError(undefined)
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md border bg-card">
              <Activity aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">LLM Balance Monitor</h1>
              <p className="text-sm text-muted-foreground">NewAPI / Sub2API 渠道余额监控</p>
            </div>
          </div>
          <Button size="lg" onClick={handleCreateNew}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            添加渠道
          </Button>
        </header>

        {(message || error) && (
          <div
            className={
              error
                ? "rounded-md border p-3 text-sm text-destructive"
                : "rounded-md border p-3 text-sm"
            }
          >
            {error ?? message}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard icon={Server} label="渠道数量" value={String(channels.length)} />
          <SummaryCard icon={LineChartIcon} label="检测记录" value={String(checks.length)} />
          <SummaryCard
            icon={Activity}
            label="当前总余额"
            value={totalRemaining ? totalRemaining.toFixed(2) : "-"}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>渠道列表</CardTitle>
              <CardDescription>添加渠道后，可手动检测余额并保存历史记录。</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {isLoading ? (
                <div className="px-4 py-8 text-sm text-muted-foreground">正在加载渠道...</div>
              ) : channels.length === 0 ? (
                <div className="px-4 py-8 text-sm text-muted-foreground">
                  还没有渠道，先添加一个 NewAPI 或 Sub2API。
                </div>
              ) : (
                <div className="divide-y">
                  {channels.map((channel) => (
                    <article
                      key={channel.id}
                      className={
                        selectedChannelId === channel.id
                          ? "grid gap-3 bg-muted/50 px-4 py-4 md:grid-cols-[1fr_auto]"
                          : "grid gap-3 px-4 py-4 md:grid-cols-[1fr_auto]"
                      }
                    >
                      <button
                        className="min-w-0 text-left"
                        onClick={() => setSelectedChannelId(channel.id)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium">{channel.name}</h3>
                          <Badge variant="secondary">{channel.type.toUpperCase()}</Badge>
                          <Badge
                            variant={
                              channel.lastCheck?.success === false ? "destructive" : "outline"
                            }
                          >
                            {channel.lastCheck
                              ? channel.lastCheck.success
                                ? "正常"
                                : "失败"
                              : "未检测"}
                          </Badge>
                        </div>
                        <p className="truncate text-sm text-muted-foreground">
                          {channel.requestUrl}
                        </p>
                      </button>
                      <div className="flex flex-wrap items-center gap-4 md:justify-end">
                        <div>
                          <p className="text-sm text-muted-foreground">当前余额</p>
                          <p className="font-semibold">{formatBalance(channel.lastCheck)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">最近检测</p>
                          <p className="font-semibold">
                            {formatDateTime(channel.lastCheck?.checkedAt)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => void handleCheck(channel.id)}
                          disabled={checkingId === channel.id}
                        >
                          <RefreshCw data-icon="inline-start" aria-hidden="true" />
                          {checkingId === channel.id ? "检测中" : "检测"}
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <ChannelForm form={form} setForm={setForm} isSaving={isSaving} onSubmit={handleSubmit} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <Card>
            <CardHeader>
              <CardTitle>余额变化</CardTitle>
              <CardDescription>
                {selectedChannel
                  ? `${selectedChannel.name} 的历史余额变化`
                  : "选择一个渠道查看余额变化"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={checks.filter((check) => check.remaining !== undefined)}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} />
                    <XAxis
                      dataKey="checkedAt"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: string) => formatDateTime(value)}
                    />
                    <YAxis tickLine={false} axisLine={false} width={48} />
                    <Tooltip labelFormatter={(value) => formatDateTime(String(value))} />
                    <Line
                      type="monotone"
                      dataKey="remaining"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>渠道详情</CardTitle>
              <CardDescription>最近一次检测结果与错误信息。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {selectedChannel ? (
                <>
                  <DetailRow label="渠道类型" value={selectedChannel.type.toUpperCase()} />
                  <DetailRow label="请求地址" value={selectedChannel.requestUrl} />
                  <DetailRow label="超时时间" value={`${selectedChannel.timeoutSeconds} 秒`} />
                  <DetailRow
                    label="查询间隔"
                    value={`${selectedChannel.checkIntervalMinutes} 分钟`}
                  />
                  <DetailRow
                    label="访问令牌"
                    value={selectedChannel.hasAccessToken ? "已配置" : "未配置"}
                  />
                  <DetailRow
                    label="API Key"
                    value={selectedChannel.hasApiKey ? "已配置" : "未配置"}
                  />
                  <DetailRow label="余额" value={formatBalance(selectedChannel.lastCheck)} />
                  <DetailRow
                    label="错误信息"
                    value={selectedChannel.lastCheck?.errorMessage ?? "-"}
                  />
                </>
              ) : (
                <p className="text-muted-foreground">当前正在添加新渠道。</p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}

type ChannelFormProps = {
  form: ChannelFormState
  setForm: (form: ChannelFormState) => void
  isSaving: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function ChannelForm({ form, setForm, isSaving, onSubmit }: ChannelFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{form.id ? "编辑渠道" : "添加渠道"}</CardTitle>
        <CardDescription>根据模板填写请求地址和认证信息。</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <label className="flex flex-col gap-2 text-sm font-medium">
            渠道类型
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value as ChannelType })}
            >
              <option value="newapi">NewAPI</option>
              <option value="sub2api">Sub2API</option>
            </select>
          </label>

          <TextInput
            label="渠道名称"
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

          {form.type === "newapi" ? (
            <>
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
            </>
          ) : (
            <TextInput
              label={form.id ? "API Key，留空则保持原值" : "API Key"}
              value={form.apiKey}
              onChange={(apiKey) => setForm({ ...form, apiKey })}
              type="password"
              required={!form.id}
            />
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

          <Button type="submit" disabled={isSaving}>
            <Save data-icon="inline-start" aria-hidden="true" />
            {isSaving ? "保存中" : "保存渠道"}
          </Button>
        </form>
      </CardContent>
    </Card>
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
        className="h-9 rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        required={required}
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
        className="h-9 rounded-md border bg-background px-3 text-sm"
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

type SummaryCardProps = {
  icon: typeof Server
  label: string
  value: string
}

function SummaryCard({ icon: Icon, label, value }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <Icon aria-hidden="true" className="text-muted-foreground" />
      </CardContent>
    </Card>
  )
}

type DetailRowProps = {
  label: string
  value: string
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words font-medium">{value}</span>
    </div>
  )
}

export default App
