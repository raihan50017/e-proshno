"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface ComboboxOption {
  value: string
  label: string
  description?: string
  badge?: string
  disabled?: boolean
}

export interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  loading?: boolean
  clearable?: boolean
  className?: string
  popoverClassName?: string
  triggerClassName?: string
  renderOption?: (option: ComboboxOption, selected: boolean) => React.ReactNode
}

export function Combobox({
  options = [],
  value,
  onChange,
  placeholder = "নির্বাচন করুন...",
  searchPlaceholder = "খুঁজুন...",
  emptyText = "কোনো তথ্য পাওয়া যায়নি।",
  disabled = false,
  loading = false,
  clearable = false,
  className,
  popoverClassName,
  triggerClassName,
  renderOption,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")

  // Reset search query when popover closes
  React.useEffect(() => {
    if (!open) {
      setSearchQuery("")
    }
  }, [open])

  const safeOptions = React.useMemo(() => (Array.isArray(options) ? options : []), [options])

  const selectedOption = React.useMemo(
    () => safeOptions.find((opt) => String(opt.value) === String(value)),
    [safeOptions, value]
  )

  const filteredOptions = React.useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase()
    if (!trimmed) return safeOptions
    return safeOptions.filter((opt) => {
      const labelMatch = (opt.label || "").toLowerCase().includes(trimmed)
      const descMatch = (opt.description || "").toLowerCase().includes(trimmed)
      return labelMatch || descMatch
    })
  }, [safeOptions, searchQuery])

  const handleSelect = (currentValue: string) => {
    if (clearable && currentValue === value) {
      onChange("")
    } else {
      onChange(currentValue)
    }
    setOpen(false)
  }

  return (
    <div className={cn("relative w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || loading}
            className={cn(
              "w-full justify-between font-normal text-left px-3 h-10 border-input bg-background hover:bg-muted/50 transition-colors",
              !selectedOption && "text-muted-foreground",
              triggerClassName
            )}
          >
            <span className="truncate flex-1">
              {loading ? (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>লোড হচ্ছে...</span>
                </span>
              ) : selectedOption ? (
                selectedOption.label
              ) : (
                placeholder
              )}
            </span>
            <div className="flex items-center gap-1 ml-2 shrink-0">
              {clearable && selectedOption && !disabled && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange("")
                  }}
                  className="rounded-full p-0.5 hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <X className="size-3" />
                </span>
              )}
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn(
            "w-[var(--radix-popover-trigger-width)] min-w-[220px] p-0 shadow-lg border-border bg-popover text-popover-foreground z-50",
            popoverClassName
          )}
          align="start"
        >
          <div className="flex flex-col max-h-[300px]">
            {/* Search Box */}
            <div className="flex items-center border-b border-border px-3 py-2">
              <Search className="mr-2 size-3.5 shrink-0 opacity-50 text-muted-foreground" />
              <input
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex h-6 w-full rounded-md bg-transparent text-xs outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {/* Options List */}
            <div className="max-h-56 overflow-y-auto p-1 space-y-0.5">
              {filteredOptions.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  {emptyText}
                </div>
              ) : (
                filteredOptions.map((option) => {
                  const isSelected = String(option.value) === String(value)
                  return (
                    <div
                      key={option.value}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        if (!option.disabled) {
                          handleSelect(option.value)
                        }
                      }}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center justify-between rounded-sm px-2.5 py-2 text-xs outline-none transition-colors",
                        isSelected
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-accent hover:text-accent-foreground text-foreground",
                        option.disabled && "pointer-events-none opacity-50"
                      )}
                    >
                      {renderOption ? (
                        renderOption(option, isSelected)
                      ) : (
                        <div className="flex flex-col min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "truncate font-medium",
                                isSelected && "text-primary font-semibold"
                              )}
                            >
                              {option.label}
                            </span>
                            {option.badge && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground shrink-0">
                                {option.badge}
                              </span>
                            )}
                          </div>
                          {option.description && (
                            <span className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {option.description}
                            </span>
                          )}
                        </div>
                      )}
                      <Check
                        className={cn(
                          "size-3.5 shrink-0 text-primary transition-opacity",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
