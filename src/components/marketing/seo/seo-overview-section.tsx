'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  MousePointerClick,
  Eye,
  Target,
  TrendingUp,
  Users,
  BarChart3,
  Monitor,
  Smartphone,
  Tablet,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// =====================================================
// Types
// =====================================================

interface SEOOverviewProps {
  kpis: {
    totalClicks: { value: number; change: number }
    totalImpressions: { value: number; change: number }
    avgCtr: { value: number; change: number }
    avgPosition: { value: number; change: number }
    organicSessions: { value: number; change: number }
    conversionRate: { value: number; change: number }
  } | null
  dailyTrend: { date: string; clicks: number; impressions: number; sessions: number }[]
  deviceBreakdown: { desktop: number; mobile: number; tablet: number } | null
  loading: boolean
}

// =====================================================
// Formatting helpers
// =====================================================

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toLocaleString('id-ID')
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

function formatPosition(value: number): string {
  return value.toFixed(1)
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}

// =====================================================
// KPI card definitions
// =====================================================

interface KpiCardDef {
  key: keyof NonNullable<SEOOverviewProps['kpis']>
  label: string
  icon: React.ElementType
  format: (v: number) => string
  invertChange?: boolean
}

const KPI_CARDS: KpiCardDef[] = [
  {
    key: 'totalClicks',
    label: 'Total Organic Clicks',
    icon: MousePointerClick,
    format: formatNumber,
  },
  {
    key: 'totalImpressions',
    label: 'Total Impressions',
    icon: Eye,
    format: formatNumber,
  },
  {
    key: 'avgCtr',
    label: 'Average CTR',
    icon: Target,
    format: formatPercent,
  },
  {
    key: 'avgPosition',
    label: 'Average Position',
    icon: BarChart3,
    format: formatPosition,
    invertChange: true,
  },
  {
    key: 'organicSessions',
    label: 'Organic Sessions',
    icon: Users,
    format: formatNumber,
  },
  {
    key: 'conversionRate',
    label: 'Conversion Rate',
    icon: TrendingUp,
    format: formatPercent,
  },
]

// =====================================================
// Donut chart colors
// =====================================================

const DEVICE_COLORS: Record<string, string> = {
  Desktop: '#3b82f6',
  Mobile: '#10b981',
  Tablet: '#f59e0b',
}

const DEVICE_ICONS: Record<string, React.ElementType> = {
  Desktop: Monitor,
  Mobile: Smartphone,
  Tablet: Tablet,
}

// =====================================================
// Sub-components
// =====================================================

function KpiCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
        <Skeleton className="h-7 w-20 mb-2" />
        <Skeleton className="h-4 w-16" />
      </CardContent>
    </Card>
  )
}

function ChangeIndicator({
  change,
  invertColor = false,
}: {
  change: number
  invertColor?: boolean
}) {
  const isPositive = change > 0
  const isNeutral = change === 0

  // For position: lower is better, so negative change = green
  const isGood = invertColor ? !isPositive : isPositive

  if (isNeutral) {
    return (
      <span className="text-xs text-muted-foreground font-medium">0%</span>
    )
  }

  return (
    <span
      className={cn(
        'flex items-center gap-0.5 text-xs font-medium',
        isGood ? 'text-green-600' : 'text-red-500'
      )}
    >
      {isPositive ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )}
      {isPositive ? '+' : ''}
      {(change * 100).toFixed(1)}%
    </span>
  )
}

function KpiCard({ def, data }: { def: KpiCardDef; data: { value: number; change: number } }) {
  const Icon = def.icon

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground truncate pr-2">
            {def.label}
          </span>
          <div className="flex-shrink-0 rounded-md bg-muted p-1.5">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <div className="text-2xl font-bold tracking-tight mb-1">
          {def.format(data.value)}
        </div>
        <ChangeIndicator change={data.change} invertColor={def.invertChange} />
      </CardContent>
    </Card>
  )
}

// =====================================================
// Custom tooltip for the line chart
// =====================================================

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm">
      <p className="font-medium mb-1.5">
        {new Date(label).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground capitalize">{entry.dataKey}:</span>
          <span className="font-medium">{formatNumber(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

// =====================================================
// Custom tooltip for the donut chart
// =====================================================

function DeviceTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null

  const entry = payload[0]
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: entry.payload.fill }}
        />
        <span className="font-medium">{entry.name}</span>
      </div>
      <p className="text-muted-foreground mt-1">
        {formatNumber(entry.value)} sesi ({entry.payload.percent}%)
      </p>
    </div>
  )
}

// =====================================================
// Main component
// =====================================================

export function SEOOverviewSection({ kpis, dailyTrend, deviceBreakdown, loading }: SEOOverviewProps) {
  // Prepare device data for the donut chart
  const deviceData = deviceBreakdown
    ? (() => {
        const total = deviceBreakdown.desktop + deviceBreakdown.mobile + deviceBreakdown.tablet
        return [
          {
            name: 'Desktop',
            value: deviceBreakdown.desktop,
            fill: DEVICE_COLORS.Desktop,
            percent: total > 0 ? ((deviceBreakdown.desktop / total) * 100).toFixed(1) : '0',
          },
          {
            name: 'Mobile',
            value: deviceBreakdown.mobile,
            fill: DEVICE_COLORS.Mobile,
            percent: total > 0 ? ((deviceBreakdown.mobile / total) * 100).toFixed(1) : '0',
          },
          {
            name: 'Tablet',
            value: deviceBreakdown.tablet,
            fill: DEVICE_COLORS.Tablet,
            percent: total > 0 ? ((deviceBreakdown.tablet / total) * 100).toFixed(1) : '0',
          },
        ]
      })()
    : []

  return (
    <div className="space-y-6">
      {/* ================================================
          KPI Cards Grid
          ================================================ */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)
          : KPI_CARDS.map((def) => {
              const data = kpis?.[def.key]
              if (!data) return <KpiCardSkeleton key={def.key} />
              return <KpiCard key={def.key} def={def} data={data} />
            })}
      </div>

      {/* ================================================
          Charts row
          ================================================ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ----- Daily trend line chart (2/3 width on xl) ----- */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Tren Harian: Clicks & Impressions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full rounded-md" />
            ) : dailyTrend.length === 0 ? (
              <div className="flex items-center justify-center h-72 text-muted-foreground text-sm">
                Tidak ada data tren untuk periode ini
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dailyTrend}
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateLabel}
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      tickFormatter={formatNumber}
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={50}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={formatNumber}
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={55}
                    />
                    <Tooltip content={<TrendTooltip />} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="clicks"
                      name="Clicks"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="impressions"
                      name="Impressions"
                      stroke="#a855f7"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ----- Device breakdown donut chart (1/3 width on xl) ----- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Distribusi Perangkat
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-48 w-48 rounded-full mx-auto" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32 mx-auto" />
                  <Skeleton className="h-4 w-28 mx-auto" />
                  <Skeleton className="h-4 w-24 mx-auto" />
                </div>
              </div>
            ) : !deviceBreakdown ||
              (deviceBreakdown.desktop === 0 &&
                deviceBreakdown.mobile === 0 &&
                deviceBreakdown.tablet === 0) ? (
              <div className="flex items-center justify-center h-72 text-muted-foreground text-sm">
                Tidak ada data perangkat
              </div>
            ) : (
              <div className="h-72 flex flex-col">
                {/* Donut chart */}
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={deviceData}
                        cx="50%"
                        cy="50%"
                        innerRadius="55%"
                        outerRadius="80%"
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {deviceData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<DeviceTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend */}
                <div className="flex items-center justify-center gap-4 pt-2 flex-wrap">
                  {deviceData.map((entry) => {
                    const DeviceIcon = DEVICE_ICONS[entry.name]
                    return (
                      <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                        <DeviceIcon
                          className="h-3.5 w-3.5"
                          style={{ color: entry.fill }}
                        />
                        <span className="text-muted-foreground">{entry.name}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {entry.percent}%
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
