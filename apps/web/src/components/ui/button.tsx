import * as React from "react"

import { cn } from "@/lib/utils"

type ButtonVariant = "default" | "outline" | "secondary" | "destructive" | "ghost"
type ButtonSize = "default" | "sm" | "lg" | "icon"

const variantClass: Record<ButtonVariant, string> = {
  default: "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/85",
  outline: "border-border bg-background/70 text-foreground hover:border-primary hover:bg-muted",
  secondary: "border-border bg-muted text-foreground hover:border-primary",
  destructive: "border-destructive bg-background/70 text-destructive hover:bg-destructive hover:text-background",
  ghost: "border-transparent bg-transparent text-foreground hover:bg-muted",
}

const sizeClass: Record<ButtonSize, string> = {
  default: "h-10 gap-2 px-3",
  sm: "h-8 gap-1.5 px-2.5 text-xs",
  lg: "h-11 gap-2 px-4",
  icon: "size-10",
}

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap border text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  )
}

export { Button }
