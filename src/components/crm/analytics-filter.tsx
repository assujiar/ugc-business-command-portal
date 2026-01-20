// =====================================================
// Analytics Filter Component
// Reusable filter for date range and salesperson selection
// Mobile-optimized compact design
// =====================================================

'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar, Users, Filter, X, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, subDays, subMonths } from 'date-fns'

interface SalesProfile {
  user_id: string
  name: string
  email: string
  role: string
}

interface AnalyticsFilterProps {
  salesProfiles: SalesProfile[]
  showSalespersonFilter?: boolean // Hide for salesperson role
  className?: string
}

// Quick date range presets
const DATE_PRESETS = [
  { label: 'This Week', value: 'this_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last 7 Days', value: 'last_7_days' },
  { label: 'Last 30 Days', value: 'last_30_days' },
  { label: 'Last 3 Months', value: 'last_3_months' },
  { label: 'This Year', value: 'this_year' },
  { label: 'All Time', value: 'all_time' },
]

function getDateRangeFromPreset(preset: string): { startDate: string; endDate: string } {
  const today = new Date()
  let startDate: Date
  let endDate: Date = today

  switch (preset) {
    case 'this_week':
      startDate = startOfWeek(today, { weekStartsOn: 1 }) // Monday
      endDate = endOfWeek(today, { weekStartsOn: 1 })
      break
    case 'this_month':
      startDate = startOfMonth(today)
      endDate = endOfMonth(today)
      break
    case 'last_7_days':
      startDate = subDays(today, 6)
      break
    case 'last_30_days':
      startDate = subDays(today, 29)
      break
    case 'last_3_months':
      startDate = subMonths(today, 3)
      break
    case 'this_year':
      startDate = startOfYear(today)
      break
    case 'all_time':
    default:
      return { startDate: '', endDate: '' }
  }

  return {
    startDate: format(startDate, 'yyyy-MM-dd'),
    endDate: format(endDate, 'yyyy-MM-dd'),
  }
}

export function AnalyticsFilter({
  salesProfiles,
  showSalespersonFilter = true,
  className,
}: AnalyticsFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Get current filter values from URL
  const startDate = searchParams.get('startDate') || ''
  const endDate = searchParams.get('endDate') || ''
  const salespersonId = searchParams.get('salespersonId') || 'all'

  // Detect current preset based on dates
  const currentPreset = useMemo(() => {
    if (!startDate && !endDate) return 'all_time'
    for (const preset of DATE_PRESETS) {
      const range = getDateRangeFromPreset(preset.value)
      if (range.startDate === startDate && range.endDate === endDate) {
        return preset.value
      }
    }
    return 'custom'
  }, [startDate, endDate])

  // Update URL with new filter params
  const updateFilters = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === '' || value === 'all' || value === 'all_time') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      })

      const queryString = params.toString()
      router.push(`${pathname}${queryString ? `?${queryString}` : ''}`)
    },
    [pathname, router, searchParams]
  )

  // Handle preset change
  const handlePresetChange = (preset: string) => {
    const range = getDateRangeFromPreset(preset)
    updateFilters({
      startDate: range.startDate || null,
      endDate: range.endDate || null,
    })
  }

  // Handle date change
  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    updateFilters({ [field]: value || null })
  }

  // Handle salesperson change
  const handleSalespersonChange = (value: string) => {
    updateFilters({ salespersonId: value === 'all' ? null : value })
  }

  // Reset all filters
  const resetFilters = () => {
    router.push(pathname)
  }

  // Check if any filters are active
  const hasActiveFilters = startDate || endDate || (salespersonId && salespersonId !== 'all')

  // State for showing custom date inputs on mobile
  const [showCustomDates, setShowCustomDates] = useState(currentPreset === 'custom')

  // Get display label for current filter
  const getFilterSummary = () => {
    const parts: string[] = []
    if (currentPreset !== 'all_time' && currentPreset !== 'custom') {
      parts.push(DATE_PRESETS.find(p => p.value === currentPreset)?.label || '')
    } else if (startDate || endDate) {
      if (startDate && endDate) {
        parts.push(`${format(new Date(startDate), 'd MMM')} - ${format(new Date(endDate), 'd MMM')}`)
      } else if (startDate) {
        parts.push(`From ${format(new Date(startDate), 'd MMM')}`)
      } else if (endDate) {
        parts.push(`Until ${format(new Date(endDate), 'd MMM')}`)
      }
    }
    if (salespersonId && salespersonId !== 'all') {
      const name = salesProfiles.find(p => p.user_id === salespersonId)?.name
      if (name) parts.push(name)
    }
    return parts.join(' | ')
  }

  return (
    <Card className={className}>
      <CardContent className="p-2 sm:p-3 lg:p-4">
        {/* Compact Mobile Layout */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Period Dropdown */}
          <Select value={currentPreset} onValueChange={(value) => {
            handlePresetChange(value)
            setShowCustomDates(value === 'custom')
          }}>
            <SelectTrigger className="h-8 w-auto min-w-[110px] text-xs sm:text-sm">
              <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((preset) => (
                <SelectItem key={preset.value} value={preset.value}>
                  {preset.label}
                </SelectItem>
              ))}
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>

          {/* Salesperson Filter */}
          {showSalespersonFilter && (
            <Select value={salespersonId} onValueChange={handleSalespersonChange}>
              <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs sm:text-sm">
                <Users className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Salesperson" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sales</SelectItem>
                {salesProfiles.map((profile) => (
                  <SelectItem key={profile.user_id} value={profile.user_id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Custom Date Toggle (Mobile) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCustomDates(!showCustomDates)}
            className="h-8 px-2 text-xs text-muted-foreground lg:hidden"
          >
            <Calendar className="h-3.5 w-3.5 mr-1" />
            Custom
            {showCustomDates ? (
              <ChevronUp className="h-3 w-3 ml-1" />
            ) : (
              <ChevronDown className="h-3 w-3 ml-1" />
            )}
          </Button>

          {/* Custom Date Inputs - Desktop (always visible) */}
          <div className="hidden lg:flex items-center gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className="h-8 w-[155px] text-sm"
              placeholder="Start"
            />
            <span className="text-muted-foreground text-xs">-</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className="h-8 w-[155px] text-sm"
              placeholder="End"
            />
          </div>

          {/* Reset Button */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-8 px-2 text-xs text-muted-foreground ml-auto"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline ml-1">Reset</span>
            </Button>
          )}
        </div>

        {/* Custom Date Inputs - Mobile (collapsible) */}
        {showCustomDates && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t lg:hidden">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className="h-8 flex-1 text-sm"
              placeholder="Start date"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className="h-8 flex-1 text-sm"
              placeholder="End date"
            />
          </div>
        )}

        {/* Active Filter Tags */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t">
            <Filter className="h-3 w-3 text-muted-foreground" />
            {(startDate || endDate) && (
              <span className="text-[10px] sm:text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                {startDate && endDate
                  ? `${format(new Date(startDate), 'd MMM')} - ${format(new Date(endDate), 'd MMM')}`
                  : startDate
                  ? `From ${format(new Date(startDate), 'd MMM')}`
                  : `Until ${format(new Date(endDate), 'd MMM')}`}
                <button
                  onClick={() => updateFilters({ startDate: null, endDate: null })}
                  className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {salespersonId && salespersonId !== 'all' && (
              <span className="text-[10px] sm:text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                {salesProfiles.find((p) => p.user_id === salespersonId)?.name || 'Unknown'}
                <button
                  onClick={() => updateFilters({ salespersonId: null })}
                  className="hover:bg-green-200 dark:hover:bg-green-800 rounded-full"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Helper function to filter data by date range and salesperson
export function filterByDateAndSalesperson<T extends { created_at?: string; owner_user_id?: string | null }>(
  data: T[],
  startDate: string | null,
  endDate: string | null,
  salespersonId: string | null
): T[] {
  return data.filter((item) => {
    // Date filter
    if (startDate || endDate) {
      const itemDate = item.created_at ? new Date(item.created_at) : null
      if (itemDate) {
        if (startDate && itemDate < new Date(startDate)) return false
        if (endDate) {
          const endOfDay = new Date(endDate)
          endOfDay.setHours(23, 59, 59, 999)
          if (itemDate > endOfDay) return false
        }
      }
    }

    // Salesperson filter
    if (salespersonId && salespersonId !== 'all') {
      if (item.owner_user_id !== salespersonId) return false
    }

    return true
  })
}
