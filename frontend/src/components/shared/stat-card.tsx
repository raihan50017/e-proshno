import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatBn, toBnDigits } from "@/lib/bn"
import { cn } from "@/lib/utils"

export interface StatCardProps {
  title: string
  value: number | string
  subtitle?: string
  icon?: LucideIcon
  change?: {
    value: number
    isPositive?: boolean
    label?: string
  }
  loading?: boolean
  className?: string
  iconClassName?: string
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  change,
  loading = false,
  className,
  iconClassName,
}: StatCardProps) {
  const displayValue =
    typeof value === "number" ? formatBn(value) : toBnDigits(value)

  return (
    <Card className={cn("overflow-hidden border border-border/80 shadow-sm transition-all hover:shadow", className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {Icon && (
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary",
                iconClassName
              )}
            >
              <Icon className="size-5" />
            </div>
          )}
        </div>

        <div className="mt-3">
          {loading ? (
            <Skeleton className="h-9 w-24" />
          ) : (
            <div className="text-3xl font-bold tracking-tight text-foreground font-sans">
              {displayValue}
            </div>
          )}

          {(subtitle || change) && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {change && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-medium leading-normal",
                    change.isPositive !== false
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                      : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
                  )}
                >
                  {change.isPositive !== false ? (
                    <TrendingUp className="size-3" />
                  ) : (
                    <TrendingDown className="size-3" />
                  )}
                  {toBnDigits(Math.abs(change.value))}%
                </span>
              )}
              {subtitle && <span>{subtitle}</span>}
              {change?.label && <span>{change.label}</span>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
