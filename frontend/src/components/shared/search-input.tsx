import * as React from "react"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value?: string
  onChange?: (value: string) => void
  onClear?: () => void
  containerClassName?: string
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onChange,
      onClear,
      placeholder = "অনুসন্ধান করুন...",
      className,
      containerClassName,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState(value ?? "")

    React.useEffect(() => {
      if (value !== undefined) {
        setInternalValue(value)
      }
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setInternalValue(val)
      onChange?.(val)
    }

    const handleClear = () => {
      setInternalValue("")
      onChange?.("")
      onClear?.()
    }

    return (
      <div className={cn("relative flex items-center w-full max-w-sm", containerClassName)}>
        <Search className="absolute left-3 size-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={ref}
          type="search"
          value={internalValue}
          onChange={handleChange}
          placeholder={placeholder}
          className={cn("pl-9 pr-9 h-10 leading-relaxed", className)}
          {...props}
        />
        {internalValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            title="মুছে ফেলুন"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    )
  }
)
SearchInput.displayName = "SearchInput"
