import { Activity, Bell, LayoutDashboard, LogOut, Palette, Send, Server, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { themes, type ThemeName } from "@/utils/theme"

export type AppPage = "monitor" | "upstream" | "channels" | "notifications" | "notification-settings"

type AppHeaderProps = {
  activePage: AppPage
  themeName: ThemeName
  onLogout: () => void
  onPageChange: (page: AppPage) => void
  onThemeChange: (themeName: ThemeName) => void
}

export function AppHeader({
  activePage,
  themeName,
  onLogout,
  onPageChange,
  onThemeChange,
}: AppHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border/80 pb-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center border border-primary/40 bg-primary text-primary-foreground shadow-lg shadow-primary/20">
          <Activity aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold sm:whitespace-nowrap">LLM Upstream Monitor</h1>
          <p className="text-sm text-muted-foreground">NewAPI / Sub2API 余额监控</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex border border-border bg-background/65 backdrop-blur">
          <NavButton
            active={activePage === "monitor"}
            icon={LayoutDashboard}
            label="监控大屏"
            onClick={() => onPageChange("monitor")}
          />
          <NavButton
            active={activePage === "upstream"}
            icon={Server}
            label="账号看板"
            onClick={() => onPageChange("upstream")}
          />
          <NavButton
            active={activePage === "channels"}
            icon={Settings2}
            label="供应商管理"
            onClick={() => onPageChange("channels")}
          />
          <NavButton
            active={activePage === "notifications"}
            icon={Bell}
            label="通知中心"
            onClick={() => onPageChange("notifications")}
          />
          <NavButton
            active={activePage === "notification-settings"}
            icon={Send}
            label="通知设置"
            onClick={() => onPageChange("notification-settings")}
          />
        </nav>
        <ThemeSwitcher themeName={themeName} onThemeChange={onThemeChange} />
        <Button variant="outline" onClick={onLogout}>
          <LogOut data-icon="inline-start" aria-hidden="true" />
          退出
        </Button>
      </div>
    </header>
  )
}

type NavButtonProps = {
  active: boolean
  icon: typeof LayoutDashboard
  label: string
  onClick: () => void
}

function NavButton({ active, icon: Icon, label, onClick }: NavButtonProps) {
  return (
    <button
      className={
        active
          ? "flex h-10 items-center gap-2 whitespace-nowrap bg-primary px-4 text-sm font-semibold text-primary-foreground"
          : "flex h-10 items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
      }
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </button>
  )
}

type ThemeSwitcherProps = {
  themeName: ThemeName
  onThemeChange: (themeName: ThemeName) => void
}

function ThemeSwitcher({ themeName, onThemeChange }: ThemeSwitcherProps) {
  return (
    <label className="flex h-10 items-center gap-2 border border-border bg-background/65 px-3 text-sm font-semibold text-muted-foreground backdrop-blur focus-within:border-primary">
      <Palette aria-hidden="true" className="size-4 text-primary" />
      <span className="hidden sm:inline">主题</span>
      <select
        aria-label="选择主题色"
        className="bg-transparent text-foreground outline-none"
        value={themeName}
        onChange={(event) => onThemeChange(event.target.value as ThemeName)}
      >
        {themes.map((theme) => (
          <option key={theme.value} value={theme.value}>
            {theme.label}
          </option>
        ))}
      </select>
    </label>
  )
}
