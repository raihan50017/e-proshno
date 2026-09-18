import * as React from "react"
import { ChevronRight } from "lucide-react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: BreadcrumbItem[]
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-2 pb-4 pt-1 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="space-y-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            {breadcrumbs.map((item, idx) => {
              const isLast = idx === breadcrumbs.length - 1
              return (
                <React.Fragment key={idx}>
                  {idx > 0 && <ChevronRight className="size-3 text-muted-foreground/70" />}
                  {item.href && !isLast ? (
                    <Link
                      to={item.href}
                      className="transition-colors hover:text-foreground hover:underline"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className={cn(isLast && "font-medium text-foreground")}>
                      {item.label}
                    </span>
                  )}
                </React.Fragment>
              )
            })}
          </nav>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
          {actions}
        </div>
      )}
    </div>
  )
}
