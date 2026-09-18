import { Inbox, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center animate-in fade-in-50",
        className
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-7" />
      </div>

      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>

      {description && (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}

      {action ? (
        <div className="mt-6">{action}</div>
      ) : actionLabel && onAction ? (
        <Button onClick={onAction} className="mt-6">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
