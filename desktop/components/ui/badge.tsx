import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Status/label pill (handoff §6 color pairs). Existing variant names are kept so
 * call sites don't change; success/warning are added for stock & status pills.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-pill px-2 py-0.5 text-2xs font-semibold leading-none",
  {
    variants: {
      variant: {
        default: "bg-primary-soft text-primary-ink",
        secondary: "bg-muted text-text-muted",
        destructive: "bg-danger-soft text-danger",
        outline: "border border-border-strong text-ink-2",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
