'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import {
  Search,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Hash,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KeywordEntry {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  positionChange: number | null
  is_branded: boolean
}

interface KeywordMover {
  query: string
  positionChange: number
  clicks: number
  position: number
}

interface KeywordDistribution {
  top3: number
  top10: number
  top20: number
  top50: number
  beyond50: number
}

interface KeywordFilters {
  device: string
  branded: string
  search: string
  minImpressions: number
  page: number
  sort: string
  dir: string
}

interface KeywordPerformanceData {
  keywords: KeywordEntry[]
  total: number
  page: number
  distribution: KeywordDistribution
  gaining: KeywordMover[]
  losing: KeywordMover[]
}

interface KeywordPerformanceProps {
  data: KeywordPerformanceData | null
  loading: boolean
  filters: KeywordFilters
  onFilterChange: (filters: any) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toLocaleString('id-ID')
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

const DEVICE_OPTIONS = [
  { value: 'all', label: 'All Devices' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'tablet', label: 'Tablet' },
] as const

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'branded', label: 'Branded' },
  { value: 'non-branded', label: 'Non-Branded' },
] as const

const DISTRIBUTION_COLORS: Record<string, string> = {
  'Top 3': '#22c55e',
  'Top 4-10': '#3b82f6',
  'Top 11-20': '#eab308',
  'Top 21-50': '#f97316',
  '>50': '#ef4444',
}

const SORTABLE_COLUMNS = [
  { key: 'query', label: 'Keyword' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'ctr', label: 'CTR' },
  { key: 'position', label: 'Avg Position' },
  { key: 'positionChange', label: 'Position Change' },
] as const

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PositionChangeBadge({ change }: { change: number | null }) {
  if (change === null || change === 0) {
    return <span className="text-muted-foreground text-sm">--</span>
  }

  // Positive change = position improved (went up in rank = number decreased)
  // Convention: positive positionChange means improvement
  const improved = change > 0

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-sm font-medium',
        improved ? 'text-green-600' : 'text-red-600'
      )}
    >
      {improved ? (
        <ArrowUp className="h-3.5 w-3.5" />
      ) : (
        <ArrowDown className="h-3.5 w-3.5" />
      )}
      {Math.abs(change).toFixed(1)}
    </span>
  )
}

function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string
  sortKey: string
  currentSort: string
  currentDir: string
  onSort: (key: string) => void
}) {
  const isActive = currentSort === sortKey
  return (
    <TableHead
      className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive && (
          <span className="text-foreground">
            {currentDir === 'asc' ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" />
            )}
          </span>
        )}
      </div>
    </TableHead>
  )
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function KeywordPerformanceSkeleton() {
  return (
    <div className="space-y-6">
      {/* Filter bar skeleton */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-10 w-[160px]" />
            <Skeleton className="h-10 w-[160px]" />
            <Skeleton className="h-10 w-[240px]" />
            <Skeleton className="h-10 w-[140px]" />
          </div>
        </CardContent>
      </Card>

      {/* Distribution chart skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-[200px]" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>

      {/* Table skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-[160px]" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Movers skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-[200px]" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-8 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function KeywordPerformanceSection({
  data,
  loading,
  filters,
  onFilterChange,
}: KeywordPerformanceProps) {
  // Build chart data from distribution
  const distributionChartData = useMemo(() => {
    if (!data?.distribution) return []
    const d = data.distribution
    return [
      { name: 'Top 3', value: d.top3, fill: DISTRIBUTION_COLORS['Top 3'] },
      { name: 'Top 4-10', value: d.top10, fill: DISTRIBUTION_COLORS['Top 4-10'] },
      { name: 'Top 11-20', value: d.top20, fill: DISTRIBUTION_COLORS['Top 11-20'] },
      { name: 'Top 21-50', value: d.top50, fill: DISTRIBUTION_COLORS['Top 21-50'] },
      { name: '>50', value: d.beyond50, fill: DISTRIBUTION_COLORS['>50'] },
    ]
  }, [data?.distribution])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const currentPage = filters.page

  // Handlers
  const handleDeviceChange = (value: string) => {
    onFilterChange({ ...filters, device: value, page: 1 })
  }

  const handleBrandedChange = (value: string) => {
    onFilterChange({ ...filters, branded: value, page: 1 })
  }

  const handleSearchChange = (value: string) => {
    onFilterChange({ ...filters, search: value, page: 1 })
  }

  const handleMinImpressionsChange = (value: string) => {
    const parsed = parseInt(value, 10)
    onFilterChange({
      ...filters,
      minImpressions: isNaN(parsed) ? 0 : Math.max(0, parsed),
      page: 1,
    })
  }

  const handleSort = (key: string) => {
    const newDir = filters.sort === key && filters.dir === 'desc' ? 'asc' : 'desc'
    onFilterChange({ ...filters, sort: key, dir: newDir, page: 1 })
  }

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    onFilterChange({ ...filters, page: newPage })
  }

  // Show skeleton while loading
  if (loading && !data) {
    return <KeywordPerformanceSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Filter Bar                                                        */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            {/* Device select */}
            <Select value={filters.device} onValueChange={handleDeviceChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Device" />
              </SelectTrigger>
              <SelectContent>
                {DEVICE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Branded / Non-Branded select */}
            <Select value={filters.branded} onValueChange={handleBrandedChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Search input */}
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search keywords..."
                value={filters.search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Min Impressions input */}
            <div className="relative min-w-[140px] max-w-[180px]">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                placeholder="Min impressions"
                value={filters.minImpressions || ''}
                onChange={(e) => handleMinImpressionsChange(e.target.value)}
                className="pl-9"
                min={0}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Position Distribution Chart                                       */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Position Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : distributionChartData.length > 0 ? (
            <div className="w-full">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={distributionChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={70}
                    tick={{ fontSize: 13 }}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatNumber(value), 'Keywords']}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--popover))',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={28}>
                    {distributionChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="flex flex-wrap items-center justify-center gap-4 mt-3">
                {distributionChartData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-sm">
                    <span
                      className="inline-block h-3 w-3 rounded-sm"
                      style={{ backgroundColor: entry.fill }}
                    />
                    <span className="text-muted-foreground">{entry.name}</span>
                    <span className="font-medium">{formatNumber(entry.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">
              No distribution data available.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Keywords Data Table                                               */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Keywords
            {data && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({formatNumber(data.total)} total)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data && data.keywords.length > 0 ? (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {SORTABLE_COLUMNS.map((col) => (
                        <SortableHeader
                          key={col.key}
                          label={col.label}
                          sortKey={col.key}
                          currentSort={filters.sort}
                          currentDir={filters.dir}
                          onSort={handleSort}
                        />
                      ))}
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.keywords.map((kw, idx) => (
                      <TableRow
                        key={`${kw.query}-${idx}`}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <TableCell className="font-medium max-w-[280px] truncate">
                          {kw.query}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatNumber(kw.clicks)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatNumber(kw.impressions)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatPercent(kw.ctr)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {kw.position.toFixed(1)}
                        </TableCell>
                        <TableCell>
                          <PositionChangeBadge change={kw.positionChange} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {kw.is_branded ? 'Branded' : 'Non-Branded'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">
              No keywords found matching the current filters.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Top Gaining / Losing Keywords                                     */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Gaining keywords */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ArrowUp className="h-4 w-4 text-green-600" />
              Top 5 Gaining Keywords
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : data && data.gaining.length > 0 ? (
              <div className="space-y-2">
                {data.gaining.map((kw, idx) => (
                  <div
                    key={`gain-${kw.query}-${idx}`}
                    className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-sm font-medium text-muted-foreground w-5 shrink-0">
                        {idx + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{kw.query}</p>
                        <p className="text-xs text-muted-foreground">
                          Pos {kw.position.toFixed(1)} &middot; {formatNumber(kw.clicks)} clicks
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-green-600 shrink-0 ml-3">
                      <ArrowUp className="h-3.5 w-3.5" />
                      {Math.abs(kw.positionChange).toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-6">
                No gaining keywords data available.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Losing keywords */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ArrowDown className="h-4 w-4 text-red-600" />
              Top 5 Losing Keywords
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : data && data.losing.length > 0 ? (
              <div className="space-y-2">
                {data.losing.map((kw, idx) => (
                  <div
                    key={`lose-${kw.query}-${idx}`}
                    className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-sm font-medium text-muted-foreground w-5 shrink-0">
                        {idx + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{kw.query}</p>
                        <p className="text-xs text-muted-foreground">
                          Pos {kw.position.toFixed(1)} &middot; {formatNumber(kw.clicks)} clicks
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-red-600 shrink-0 ml-3">
                      <ArrowDown className="h-3.5 w-3.5" />
                      {Math.abs(kw.positionChange).toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-6">
                No losing keywords data available.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
