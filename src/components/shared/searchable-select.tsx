'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface SelectOption {
  value: string
  label: string
}

interface SelectGroup {
  label: string
  icon?: React.ReactNode
  options: SelectOption[]
}

interface SearchableSelectProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  /** Flat list of options */
  options?: SelectOption[]
  /** Grouped options (takes priority over flat options) */
  groups?: SelectGroup[]
  className?: string
  /** Width of the popover content */
  popoverWidth?: string
}

export function SearchableSelect({
  value,
  onValueChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  disabled = false,
  options,
  groups,
  className,
  popoverWidth = 'w-[280px]',
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const lowerSearch = search.toLowerCase()

  // Find display label for current value
  const displayLabel = React.useMemo(() => {
    if (!value) return ''
    if (groups) {
      for (const group of groups) {
        const found = group.options.find((o) => o.value === value)
        if (found) return found.label
      }
    }
    if (options) {
      const found = options.find((o) => o.value === value)
      if (found) return found.label
    }
    return value
  }, [value, groups, options])

  // Filter options based on search
  const filteredGroups = React.useMemo(() => {
    if (groups) {
      if (!lowerSearch) return groups
      return groups
        .map((group) => ({
          ...group,
          options: group.options.filter(
            (o) =>
              o.label.toLowerCase().includes(lowerSearch) ||
              o.value.toLowerCase().includes(lowerSearch)
          ),
        }))
        .filter((group) => group.options.length > 0)
    }
    return null
  }, [groups, lowerSearch])

  const filteredOptions = React.useMemo(() => {
    if (groups) return null
    if (!options) return []
    if (!lowerSearch) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(lowerSearch) ||
        o.value.toLowerCase().includes(lowerSearch)
    )
  }, [options, groups, lowerSearch])

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue)
    setOpen(false)
    setSearch('')
  }

  const hasResults = filteredGroups
    ? filteredGroups.length > 0
    : (filteredOptions && filteredOptions.length > 0)

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch('') }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal h-10', className)}
        >
          <span className="truncate">{displayLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn(popoverWidth, 'p-0')} align="start">
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <ScrollArea className="h-[300px]">
          <div className="p-1">
            {!hasResults && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No results found.
              </p>
            )}

            {/* Grouped options */}
            {filteredGroups && filteredGroups.map((group) => (
              <div key={group.label}>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  {group.icon}
                  {group.label}
                </div>
                {group.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={cn(
                      'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                      value === option.value && 'bg-accent'
                    )}
                  >
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      {value === option.value && <Check className="h-4 w-4" />}
                    </span>
                    {option.label}
                  </button>
                ))}
              </div>
            ))}

            {/* Flat options */}
            {filteredOptions && filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={cn(
                  'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                  value === option.value && 'bg-accent'
                )}
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  {value === option.value && <Check className="h-4 w-4" />}
                </span>
                {option.label}
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
