// =====================================================
// Analytics Filter Component
// Reusable filter for date range and salesperson selection
// =====================================================

'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar, Users, Filter, X, RotateCcw } from 'lucide-react'
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

  return (
    <Card className={className}>
      <CardContent className="p-3 lg:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
          {/* Date Range Preset */}
          <div className="flex-1 min-w-0">
            <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Period
            </Label>
            <Select value={currentPreset} onValueChange={handlePresetChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
                {currentPreset === 'custom' && (
                  <SelectItem value="custom">Custom Range</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Date Range */}
          <div className="flex gap-2 flex-1 min-w-0">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1.5">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1.5">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          {/* Salesperson Filter */}
          {showSalespersonFilter && (
            <div className="flex-1 min-w-0">
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <Users className="h-3 w-3" />
                Salesperson
              </Label>
              <Select value={salespersonId} onValueChange={handleSalespersonChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Salesperson" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Salesperson</SelectItem>
                  {salesProfiles.map((profile) => (
                    <SelectItem key={profile.user_id} value={profile.user_id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Reset Button */}
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              className="h-9 px-3"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Reset
            </Button>
          )}
        </div>

        {/* Active Filters Summary */}
        {hasActiveFilters && (
          <div className="mt-2 pt-2 border-t flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Filter className="h-3 w-3" />
              Active filters:
            </span>
            {(startDate || endDate) && (
              <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                {startDate && endDate
                  ? `${format(new Date(startDate), 'd MMM yyyy')} - ${format(new Date(endDate), 'd MMM yyyy')}`
                  : startDate
                  ? `From ${format(new Date(startDate), 'd MMM yyyy')}`
                  : `Until ${format(new Date(endDate), 'd MMM yyyy')}`}
                <button
                  onClick={() => updateFilters({ startDate: null, endDate: null })}
                  className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {salespersonId && salespersonId !== 'all' && (
              <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                {salesProfiles.find((p) => p.user_id === salespersonId)?.name || 'Unknown'}
                <button
                  onClick={() => updateFilters({ salespersonId: null })}
                  className="hover:bg-green-200 dark:hover:bg-green-800 rounded-full p-0.5"
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
