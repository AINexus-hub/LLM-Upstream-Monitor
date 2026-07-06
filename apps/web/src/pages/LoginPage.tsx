import { Activity } from "lucide-react"
import type { FormEvent } from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"

type LoginPageProps = {
  error?: string
  isLoggingIn: boolean
  onLogin: (password: string) => void
}

export default function LoginPage({ error, isLoggingIn, onLogin }: LoginPageProps) {
  const [password, setPassword] = useState("")

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onLogin(password)
  }

  return (
    <main className="grid min-h-screen bg-background text-foreground md:grid-cols-[1fr_440px] xl:grid-cols-[1fr_480px]">
      <section className="relative hidden overflow-hidden border-r border-border bg-[linear-gradient(135deg,hsl(var(--login-a)),hsl(var(--login-b))_52%,hsl(var(--login-c)))] md:flex md:flex-col md:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,hsl(var(--glow-one)/0.34),transparent_22rem),radial-gradient(circle_at_78%_72%,hsl(var(--glow-two)/0.26),transparent_28rem)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--grid)/0.08)_1px,transparent_1px),linear-gradient(180deg,hsl(var(--grid)/0.055)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="relative p-10">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center border border-primary/45 bg-primary text-primary-foreground shadow-xl shadow-primary/25">
              <Activity aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/55">LLM Upstream Monitor</p>
              <h1 className="mt-1 text-4xl font-semibold text-white">供应商余额中枢</h1>
            </div>
          </div>
        </div>
        <div className="relative grid gap-4 p-10">
          <div className="max-w-xl border border-white/12 bg-black/24 p-5 shadow-2xl shadow-black/20 backdrop-blur">
            <p className="text-sm leading-6 text-white/72">
              汇总供应商余额、告警和检测记录，先用单 token 保护本地监控台。
            </p>
          </div>
          <div className="grid max-w-xl grid-cols-3 gap-3">
            <div className="border border-white/12 bg-white/5 p-4">
              <p className="text-xs text-white/48">Scope</p>
              <p className="mt-2 text-lg font-semibold text-white">Balance</p>
            </div>
            <div className="border border-white/12 bg-white/5 p-4">
              <p className="text-xs text-white/48">Alert</p>
              <p className="mt-2 text-lg font-semibold text-white">Local</p>
            </div>
            <div className="border border-white/12 bg-white/5 p-4">
              <p className="text-xs text-white/48">Auth</p>
              <p className="mt-2 text-lg font-semibold text-white">JWT</p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 md:justify-start md:px-8 xl:px-12">
        <div className="grid w-full max-w-md gap-5 border border-border bg-card p-6 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-3 border-b border-border pb-4 md:hidden">
            <div className="flex size-11 items-center justify-center bg-primary text-primary-foreground">
              <Activity aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">LLM Upstream Monitor</h1>
              <p className="text-sm text-muted-foreground">输入访问 token 进入监控台</p>
            </div>
          </div>

          <div className="hidden border-b border-border pb-4 md:block">
            <h2 className="text-2xl font-semibold">登录监控台</h2>
            <p className="mt-2 text-sm text-muted-foreground">输入访问 token 继续。</p>
          </div>

          {error && (
            <div className="border border-destructive bg-background p-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}

          <form className="grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-sm font-medium">
              访问 Token
              <input
                className="h-11 border border-input bg-background/75 px-3 text-sm outline-none focus:border-primary"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                autoFocus
                required
              />
            </label>
            <Button type="submit" disabled={isLoggingIn}>
              {isLoggingIn ? "登录中" : "登录"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  )
}
