'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { COUNTRIES_BY_CONTINENT } from '@/lib/constants'

interface CountrySelectProps {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}

export function CountrySelect({
  value,
  onValueChange,
  disabled = false,
  placeholder = 'Select country...',
}: CountrySelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  const lowerSearch = search.toLowerCase()

  const filteredGroups = React.useMemo(() => {
    if (!lowerSearch) return COUNTRIES_BY_CONTINENT
    return COUNTRIES_BY_CONTINENT
      .map((group) => ({
        ...group,
        countries: group.countries.filter(
          (c) =>
            c.name.toLowerCase().includes(lowerSearch) ||
            c.code.toLowerCase().includes(lowerSearch)
        ),
      }))
      .filter((group) => group.countries.length > 0)
  }, [lowerSearch])

  const handleSelect = (countryName: string) => {
    onValueChange(countryName)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch('') }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal h-10"
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            ref={inputRef}
            placeholder="Search country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <ScrollArea className="h-[300px]">
          <div className="p-1">
            {filteredGroups.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No country found.
              </p>
            )}
            {filteredGroups.map((group) => (
              <div key={group.continent}>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.continent}
                </div>
                {group.countries.map((country) => (
                  <button
                    key={country.code}
                    onClick={() => handleSelect(country.name)}
                    className={cn(
                      'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                      value === country.name && 'bg-accent'
                    )}
                  >
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      {value === country.name && <Check className="h-4 w-4" />}
                    </span>
                    {country.name}
                    <span className="ml-auto text-xs text-muted-foreground">{country.code}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
