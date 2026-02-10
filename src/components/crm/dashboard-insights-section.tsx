'use client'

// =====================================================
// Dashboard Insights Section
// Client wrapper for GrowthInsightsCard with URL filter sync
// and period selection (week/month/YTD)
// =====================================================

import { useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { GrowthInsightsCard } from './growth-insights-card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Calendar, BarChart3 } from 'lucide-react'
import type { InsightFilters } from '@/types/insights'

interface DashboardInsightsSectionProps {
  className?: string
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function getWeekDateRange(year: number, weekNum: number): { start: string; end: string } {
  const jan1 = new Date(year, 0, 1)
  const dayOfWeek = jan1.getDay() || 7
  const firstMonday = new Date(year, 0, 1 + (dayOfWeek <= 4 ? 1 - dayOfWeek : 8 - dayOfWeek))
  const start = new Date(firstMonday)
  start.setDate(start.getDate() + (weekNum - 1) * 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

function getMonthDateRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

function getYTDDateRange(year: number): { start: string; end: string } {
  return {
    start: `${year}-01-01`,
    end: new Date().toISOString().split('T')[0],
  }
}

const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export function DashboardInsightsSection({ className }: DashboardInsightsSectionProps) {
  const searchParams = useSearchParams()
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentWeek = getISOWeekNumber(now)
  const currentMonth = now.getMonth() + 1

  // Period selection state
  const [periodType, setPeriodType] = useState<'default' | 'week' | 'month' | 'ytd'>('default')
  const [selectedWeek, setSelectedWeek] = useState(currentWeek)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [selectedYear, setSelectedYear] = useState(currentYear)

  // Compute filters based on period selection
  const filters: InsightFilters = useMemo(() => {
    const base: InsightFilters = {
      salespersonId: searchParams.get('salespersonId'),
      source: searchParams.get('source') as any,
    }

    if (periodType === 'default') {
      // Use URL search params
      return {
        ...base,
        startDate: searchParams.get('startDate'),
        endDate: searchParams.get('endDate'),
      }
    }

    if (periodType === 'week') {
      const range = getWeekDateRange(selectedYear, selectedWeek)
      return { ...base, startDate: range.start, endDate: range.end }
    }

    if (periodType === 'month') {
      const range = getMonthDateRange(selectedYear, selectedMonth)
      return { ...base, startDate: range.start, endDate: range.end }
    }

    // YTD
    const range = getYTDDateRange(selectedYear)
    return { ...base, startDate: range.start, endDate: range.end }
  }, [periodType, selectedWeek, selectedMonth, selectedYear, searchParams])

  // Period label for display
  const periodLabel = useMemo(() => {
    if (periodType === 'week') return `Week ${selectedWeek}, ${selectedYear}`
    if (periodType === 'month') return `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`
    if (periodType === 'ytd') return `YTD ${selectedYear}`
    return null
  }, [periodType, selectedWeek, selectedMonth, selectedYear])

  // Generate available weeks (1 to current week if current year)
  const maxWeeks = selectedYear === currentYear ? currentWeek : 52

  return (
    <div className={className}>
      {/* Period Selector */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <BarChart3 className="h-4 w-4" />
          <span>Generate berdasarkan:</span>
        </div>
        <div className="flex gap-1">
          {(['default', 'week', 'month', 'ytd'] as const).map(t => (
            <Button key={t} variant={periodType === t ? 'default' : 'outline'} size="sm" className="h-7 text-xs"
              onClick={() => setPeriodType(t)}>
              {t === 'default' ? 'Filter Aktif' : t === 'week' ? 'Mingguan' : t === 'month' ? 'Bulanan' : 'Year-to-Date'}
            </Button>
          ))}
        </div>

        {periodType === 'week' && (
          <div className="flex items-center gap-2">
            <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
              <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(selectedWeek)} onValueChange={v => setSelectedWeek(Number(v))}>
              <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: maxWeeks }, (_, i) => i + 1).reverse().map(w => (
                  <SelectItem key={w} value={String(w)}>Week {w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {periodType === 'month' && (
          <div className="flex items-center gap-2">
            <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
              <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
              <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((m, i) => {
                  const monthNum = i + 1
                  if (selectedYear === currentYear && monthNum > currentMonth) return null
                  return <SelectItem key={monthNum} value={String(monthNum)}>{m}</SelectItem>
                })}
              </SelectContent>
            </Select>
          </div>
        )}

        {periodType === 'ytd' && (
          <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
            <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {periodLabel && (
          <Badge variant="secondary" className="text-xs">
            <Calendar className="h-3 w-3 mr-1" />
            {periodLabel}
          </Badge>
        )}
      </div>

      <GrowthInsightsCard filters={filters} periodLabel={periodLabel} periodType={periodType} />
    </div>
  )
}
