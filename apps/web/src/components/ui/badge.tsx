import * as React from "react"

import { cn } from "@/lib/utils"

type BadgeVariant = "default" | "secondary" | "outline" | "destructive"

const variantClass: Record<BadgeVariant, string> = {
  default: "border-primary bg-primary text-primary-foreground",
  secondary: "border-border bg-muted text-foreground",
  outline: "border-border bg-background text-foreground",
  destructive: "border-destructive bg-background text-destructive",
}

function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit items-center border px-2 text-xs font-semibold uppercase leading-none",
        variantClass[variant],
        className,
      )}
      {...props}
    />
  )
}

export { Badge }
