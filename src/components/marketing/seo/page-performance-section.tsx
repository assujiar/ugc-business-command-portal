'use client'

import { Fragment } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Search,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ChevronLeft,
  Globe,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageData {
  page_url: string
  site: string
  gsc_clicks: number
  gsc_impressions: number
  gsc_ctr: number
  gsc_position: number
  ga_sessions: number
  ga_users: number
  ga_engagement_rate: number
  ga_bounce_rate: number
  ga_avg_session_duration: number
  ga_conversions: number
}

interface KeywordData {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface VitalData {
  strategy: string
  performance_score: number
  lcp_ms: number
  cls: number
  inp_ms: number
}

interface PagePerformanceProps {
  data: {
    pages: PageData[]
    total: number
    page: number
    expandData?: {
      keywords: KeywordData[]
      vitals: VitalData[]
    } | null
  } | null
  loading: boolean
  filters: { search: string; page: number; sort: string; dir: string }
  onFilterChange: (filters: any) => void
  onExpandRow: (url: string | null) => void
  expandedUrl: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ITEMS_PER_PAGE = 15

function extractPath(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname + u.search + u.hash || '/'
  } catch {
    // If the URL is already a relative path or malformed, return as-is
    return url
  }
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString('id-ID')
}

function formatPercent(num: number): string {
  return `${(num * 100).toFixed(1)}%`
}

function formatDecimalPercent(num: number): string {
  return `${num.toFixed(1)}%`
}

function formatPosition(num: number): string {
  return num.toFixed(1)
}

/** LCP thresholds: good <= 2500ms, needs improvement <= 4000ms, poor > 4000ms */
function lcpRating(ms: number): 'good' | 'average' | 'poor' {
  if (ms <= 2500) return 'good'
  if (ms <= 4000) return 'average'
  return 'poor'
}

/** CLS thresholds: good <= 0.1, needs improvement <= 0.25, poor > 0.25 */
function clsRating(val: number): 'good' | 'average' | 'poor' {
  if (val <= 0.1) return 'good'
  if (val <= 0.25) return 'average'
  return 'poor'
}

/** INP thresholds: good <= 200ms, needs improvement <= 500ms, poor > 500ms */
function inpRating(ms: number): 'good' | 'average' | 'poor' {
  if (ms <= 200) return 'good'
  if (ms <= 500) return 'average'
  return 'poor'
}

function ratingColor(rating: 'good' | 'average' | 'poor') {
  switch (rating) {
    case 'good':
      return {
        border: 'border-green-400 dark:border-green-600',
        text: 'text-green-700 dark:text-green-300',
        bg: 'bg-green-50 dark:bg-green-950',
      }
    case 'average':
      return {
        border: 'border-yellow-400 dark:border-yellow-600',
        text: 'text-yellow-700 dark:text-yellow-300',
        bg: 'bg-yellow-50 dark:bg-yellow-950',
      }
    case 'poor':
      return {
        border: 'border-red-400 dark:border-red-600',
        text: 'text-red-700 dark:text-red-300',
        bg: 'bg-red-50 dark:bg-red-950',
      }
  }
}

function performanceScoreColor(score: number): string {
  if (score > 90) return 'text-green-600 dark:text-green-400'
  if (score >= 50) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

// ---------------------------------------------------------------------------
// Sortable column definitions
// ---------------------------------------------------------------------------

interface ColumnDef {
  key: string
  label: string
  className?: string
}

const COLUMNS: ColumnDef[] = [
  { key: 'page_url', label: 'Page URL', className: 'min-w-[220px]' },
  { key: 'gsc_clicks', label: 'Clicks' },
  { key: 'gsc_impressions', label: 'Impressions' },
  { key: 'gsc_ctr', label: 'CTR' },
  { key: 'gsc_position', label: 'Avg Position' },
  { key: 'ga_sessions', label: 'Sessions' },
  { key: 'ga_engagement_rate', label: 'Eng. Rate' },
  { key: 'ga_bounce_rate', label: 'Bounce Rate' },
  { key: 'ga_conversions', label: 'Conversions' },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SortableHeader({
  column,
  currentSort,
  currentDir,
  onSort,
}: {
  column: ColumnDef
  currentSort: string
  currentDir: string
  onSort: (key: string) => void
}) {
  const isActive = currentSort === column.key
  return (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors whitespace-nowrap"
      onClick={() => onSort(column.key)}
    >
      {column.label}
      <span
        className={cn(
          'text-[10px]',
          isActive ? 'text-brand' : 'text-muted-foreground'
        )}
      >
        {isActive ? (currentDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25BC'}
      </span>
    </button>
  )
}

function ExpandedContent({
  expandData,
}: {
  expandData: { keywords: KeywordData[]; vitals: VitalData[] } | null | undefined
}) {
  if (!expandData) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Loading detail data...
      </div>
    )
  }

  const { keywords, vitals } = expandData

  return (
    <div className="px-6 py-4 space-y-4 bg-muted/30">
      {/* Keywords section */}
      <div>
        <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          Top Keywords for This Page
        </h4>
        {keywords.length === 0 ? (
          <p className="text-xs text-muted-foreground">No keyword data available.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] h-8">Keyword</TableHead>
                  <TableHead className="text-[11px] h-8 text-right">Clicks</TableHead>
                  <TableHead className="text-[11px] h-8 text-right">Impressions</TableHead>
                  <TableHead className="text-[11px] h-8 text-right">CTR</TableHead>
                  <TableHead className="text-[11px] h-8 text-right">Position</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keywords.map((kw, idx) => (
                  <TableRow key={`${kw.query}-${idx}`}>
                    <TableCell className="text-xs py-1.5 font-medium">{kw.query}</TableCell>
                    <TableCell className="text-xs py-1.5 text-right tabular-nums">
                      {formatNumber(kw.clicks)}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 text-right tabular-nums">
                      {formatNumber(kw.impressions)}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 text-right tabular-nums">
                      {formatPercent(kw.ctr)}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 text-right tabular-nums">
                      {formatPosition(kw.position)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Web Vitals section */}
      <div>
        <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-muted-foreground" />
          Web Vitals
        </h4>
        {vitals.length === 0 ? (
          <p className="text-xs text-muted-foreground">No web vitals data available.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {vitals.map((vital) => {
              const lcpR = lcpRating(vital.lcp_ms)
              const clsR = clsRating(vital.cls)
              const inpR = inpRating(vital.inp_ms)
              const lcpC = ratingColor(lcpR)
              const clsC = ratingColor(clsR)
              const inpC = ratingColor(inpR)

              return (
                <div
                  key={vital.strategy}
                  className="rounded-lg border bg-background p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {vital.strategy}
                    </Badge>
                    <span
                      className={cn(
                        'text-lg font-bold tabular-nums',
                        performanceScoreColor(vital.performance_score)
                      )}
                    >
                      {vital.performance_score}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {/* LCP */}
                    <div
                      className={cn(
                        'rounded-md border p-2 text-center',
                        lcpC.border,
                        lcpC.bg
                      )}
                    >
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">LCP</p>
                      <p className={cn('text-xs font-semibold tabular-nums', lcpC.text)}>
                        {vital.lcp_ms >= 1000
                          ? `${(vital.lcp_ms / 1000).toFixed(2)}s`
                          : `${vital.lcp_ms.toFixed(0)}ms`}
                      </p>
                    </div>
                    {/* CLS */}
                    <div
                      className={cn(
                        'rounded-md border p-2 text-center',
                        clsC.border,
                        clsC.bg
                      )}
                    >
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">CLS</p>
                      <p className={cn('text-xs font-semibold tabular-nums', clsC.text)}>
                        {vital.cls.toFixed(3)}
                      </p>
                    </div>
                    {/* INP */}
                    <div
                      className={cn(
                        'rounded-md border p-2 text-center',
                        inpC.border,
                        inpC.bg
                      )}
                    >
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">INP</p>
                      <p className={cn('text-xs font-semibold tabular-nums', inpC.text)}>
                        {vital.inp_ms.toFixed(0)}ms
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="p-6 space-y-3">
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="h-8 w-[220px]" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-4 w-[140px]" />
        <div className="flex gap-1">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PagePerformanceSection({
  data,
  loading,
  filters,
  onFilterChange,
  onExpandRow,
  expandedUrl,
}: PagePerformanceProps) {
  const pages = data?.pages ?? []
  const total = data?.total ?? 0
  const currentPage = data?.page ?? filters.page
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE))

  const handleSort = (key: string) => {
    if (filters.sort === key) {
      onFilterChange({ ...filters, dir: filters.dir === 'desc' ? 'asc' : 'desc' })
    } else {
      onFilterChange({ ...filters, sort: key, dir: 'desc' })
    }
  }

  const handleSearchChange = (value: string) => {
    onFilterChange({ ...filters, search: value, page: 1 })
  }

  const handlePageChange = (newPage: number) => {
    onFilterChange({ ...filters, page: newPage })
  }

  const handleRowClick = (url: string) => {
    if (expandedUrl === url) {
      onExpandRow(null)
    } else {
      onExpandRow(url)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            Page Performance
            {!loading && (
              <Badge variant="outline" className="text-[10px] ml-1">
                {total} pages
              </Badge>
            )}
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search URL..."
              className="h-8 pl-7 w-[220px] text-xs"
              value={filters.search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <LoadingSkeleton />
        ) : pages.length === 0 ? (
          <div className="p-8 text-center">
            <Globe className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {filters.search
                ? `No pages found matching "${filters.search}".`
                : 'No page performance data available yet.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Expand toggle column */}
                    <TableHead className="w-[32px] text-xs" />
                    {COLUMNS.map((col) => (
                      <TableHead key={col.key} className={cn('text-xs', col.className)}>
                        <SortableHeader
                          column={col}
                          currentSort={filters.sort}
                          currentDir={filters.dir}
                          onSort={handleSort}
                        />
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((page) => {
                    const isExpanded = expandedUrl === page.page_url
                    const path = extractPath(page.page_url)

                    return (
                      <Fragment key={page.page_url}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => handleRowClick(page.page_url)}
                        >
                          {/* Expand icon */}
                          <TableCell className="py-2 px-2 w-[32px]">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>

                          {/* Page URL */}
                          <TableCell className="py-2">
                            <div className="flex items-center gap-1.5 min-w-[200px]">
                              <span
                                className="text-xs font-medium truncate max-w-[260px]"
                                title={page.page_url}
                              >
                                {path}
                              </span>
                              <a
                                href={page.page_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand hover:text-brand/80 flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </TableCell>

                          {/* Clicks */}
                          <TableCell className="text-xs tabular-nums py-2">
                            {formatNumber(page.gsc_clicks)}
                          </TableCell>

                          {/* Impressions */}
                          <TableCell className="text-xs tabular-nums py-2">
                            {formatNumber(page.gsc_impressions)}
                          </TableCell>

                          {/* CTR */}
                          <TableCell className="py-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] tabular-nums',
                                page.gsc_ctr >= 0.05
                                  ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300'
                                  : page.gsc_ctr >= 0.02
                                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300'
                                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300'
                              )}
                            >
                              {formatPercent(page.gsc_ctr)}
                            </Badge>
                          </TableCell>

                          {/* Avg Position */}
                          <TableCell className="py-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] tabular-nums',
                                page.gsc_position <= 10
                                  ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300'
                                  : page.gsc_position <= 30
                                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300'
                                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300'
                              )}
                            >
                              {formatPosition(page.gsc_position)}
                            </Badge>
                          </TableCell>

                          {/* Sessions */}
                          <TableCell className="text-xs tabular-nums py-2">
                            {formatNumber(page.ga_sessions)}
                          </TableCell>

                          {/* Engagement Rate */}
                          <TableCell className="py-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] tabular-nums',
                                page.ga_engagement_rate >= 60
                                  ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300'
                                  : page.ga_engagement_rate >= 40
                                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300'
                                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300'
                              )}
                            >
                              {formatDecimalPercent(page.ga_engagement_rate)}
                            </Badge>
                          </TableCell>

                          {/* Bounce Rate */}
                          <TableCell className="py-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] tabular-nums',
                                page.ga_bounce_rate <= 40
                                  ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300'
                                  : page.ga_bounce_rate <= 60
                                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300'
                                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300'
                              )}
                            >
                              {formatDecimalPercent(page.ga_bounce_rate)}
                            </Badge>
                          </TableCell>

                          {/* Conversions */}
                          <TableCell className="text-xs font-medium tabular-nums py-2">
                            {formatNumber(page.ga_conversions)}
                          </TableCell>
                        </TableRow>

                        {/* Expanded detail row */}
                        {isExpanded && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell
                              colSpan={COLUMNS.length + 1}
                              className="p-0 border-b"
                            >
                              <ExpandedContent expandData={data?.expandData} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-xs text-muted-foreground">
                  Page {currentPage} of {totalPages} ({total} results)
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
