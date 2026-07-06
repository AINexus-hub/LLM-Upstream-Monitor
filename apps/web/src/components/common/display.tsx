import type { LucideIcon } from "lucide-react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type SummaryCardProps = {
  icon: LucideIcon
  label: string
  value: string
}

export function SummaryCard({ icon: Icon, label, value }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold">{value}</p>
        </div>
        <Icon aria-hidden="true" className="text-muted-foreground" />
      </CardContent>
    </Card>
  )
}

type DetailRowProps = {
  compact?: boolean
  label: string
  value: string
}

export function DetailRow({ compact, label, value }: DetailRowProps) {
  return (
    <div className={compact ? "min-w-0" : "grid grid-cols-[92px_1fr] gap-3"}>
      <span className="block text-muted-foreground">{label}</span>
      <span className="block min-w-0 break-words font-medium">{value}</span>
    </div>
  )
}

type EmptyStateProps = {
  actionLabel: string
  children: string
  onAction: () => void
}

export function EmptyState({ actionLabel, children, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 border border-dashed border-border p-5">
      <p className="text-sm text-muted-foreground">{children}</p>
      <Button size="sm" onClick={onAction}>
        <Plus data-icon="inline-start" aria-hidden="true" />
        {actionLabel}
      </Button>
    </div>
  )
}
