import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { toBnDigits } from '@/lib/bn'

// ─── Column definition ────────────────────────────────────────────────────────
export interface AppDataTableColumn<T> {
  key: string
  header: string
  headerClassName?: string
  cellClassName?: string
  /** Render a cell value. Receives the row item. */
  render: (item: T) => React.ReactNode
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface AppDataTableProps<T> {
  /** Data rows */
  data: T[]
  /** Column definitions */
  columns: AppDataTableColumn<T>[]
  /** Whether data is loading */
  isLoading?: boolean
  /** Number of skeleton rows to show while loading */
  skeletonRows?: number
  /** Controlled search query value */
  searchQuery?: string
  /** Called when search changes */
  onSearchChange?: (value: string) => void
  /** Placeholder text for the search input */
  searchPlaceholder?: string
  /** Extra filter/action slots rendered right of the search bar */
  filterSlots?: React.ReactNode
  /** Count label suffix, e.g. "টি প্রশ্নসেট" */
  countLabel?: string
  /** Total count (defaults to data.length) */
  totalCount?: number
  /** Shown count after filtering (defaults to data.length) */
  filteredCount?: number
  /** Empty state icon component */
  emptyIcon?: LucideIcon
  /** Empty state title */
  emptyTitle?: string
  /** Empty state description */
  emptyDescription?: string
  /** Empty state action label */
  emptyActionLabel?: string
  /** Empty state action callback */
  onEmptyAction?: () => void
  /** Row key extractor */
  getRowKey: (item: T) => string
  /** Optional extra classes on the Card wrapper */
  className?: string
  /** Optional callback when row is clicked */
  onRowClick?: (item: T) => void
}

// ─── Debounced search input ───────────────────────────────────────────────────
function DebouncedSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [localValue, setLocalValue] = React.useState(value)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setLocalValue(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onChange(v), 300)
  }

  return (
    <div className="relative flex items-center">
      <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder || 'অনুসন্ধান করুন...'}
        className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
      />
      {localValue && (
        <button
          onClick={() => {
            setLocalValue('')
            onChange('')
          }}
          className="absolute right-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AppDataTable<T>({
  data,
  columns,
  isLoading = false,
  skeletonRows = 4,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  filterSlots,
  countLabel = 'টি রেকর্ড',
  totalCount,
  filteredCount,
  emptyIcon,
  emptyTitle = 'কোনো তথ্য পাওয়া যায়নি',
  emptyDescription = 'আপনার অনুসন্ধানের সাথে মেলে এমন কোনো তথ্য পাওয়া যায়নি।',
  emptyActionLabel,
  onEmptyAction,
  getRowKey,
  className,
  onRowClick,
}: AppDataTableProps<T>) {
  const displayed = filteredCount ?? data.length
  const total = totalCount ?? data.length

  return (
    <Card className={cn('border-border', className)}>
      {/* Toolbar */}
      {(onSearchChange !== undefined || filterSlots !== undefined) && (
        <CardHeader className="border-b border-border pb-3 pt-4 px-4">
          <div className="flex flex-wrap items-center gap-3">
            {onSearchChange !== undefined && (
              <DebouncedSearch
                value={searchQuery ?? ''}
                onChange={onSearchChange}
                placeholder={searchPlaceholder}
              />
            )}
            {filterSlots && (
              <div className="flex items-center gap-2 flex-wrap">{filterSlots}</div>
            )}
            <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{toBnDigits(displayed)}</span>
              {total !== displayed && (
                <>
                  <span>/</span>
                  <span>{toBnDigits(total)}</span>
                </>
              )}
              <span>{countLabel}</span>
            </div>
          </div>
        </CardHeader>
      )}

      {/* Table */}
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-2.5">
            {Array.from({ length: skeletonRows }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                {columns.map((col) => (
                  <Skeleton
                    key={col.key}
                    className={cn(
                      'h-8 rounded-md bg-muted/60',
                      col.key === columns[0].key ? 'flex-[2]' : 'flex-1'
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={emptyIcon}
              title={emptyTitle}
              description={emptyDescription}
              actionLabel={emptyActionLabel}
              onAction={onEmptyAction}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  {columns.map((col) => (
                    <TableHead
                      key={col.key}
                      className={cn('text-xs font-semibold text-muted-foreground', col.headerClassName)}
                    >
                      {col.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item) => (
                  <TableRow
                    key={getRowKey(item)}
                    className={cn(
                      'hover:bg-muted/30 transition-colors',
                      onRowClick && 'cursor-pointer'
                    )}
                    onClick={() => onRowClick?.(item)}
                  >
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn('text-sm', col.cellClassName)}
                      >
                        {col.render(item)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
