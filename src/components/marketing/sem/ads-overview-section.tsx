'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell
} from 'recharts'
import {
  DollarSign, MousePointerClick, Target, TrendingUp,
  BarChart3, Eye, AlertCircle, ArrowUpRight, ArrowDownRight
} from 'lucide-react'

interface KpiValue {
  value: number
  yoy: number
}

interface AdsOverviewProps {
  data: {
    kpis: {
      totalSpend: KpiValue
      totalConversions: KpiValue
      avgCpc: KpiValue
      avgCpa: KpiValue
      overallRoas: KpiValue
      totalImpressions: KpiValue
      totalClicks: KpiValue
    }
    campaigns: Array<{
      platform: string; campaign_id: string; campaign_name: string
      campaign_status: string; spend: number; impressions: number
      clicks: number; ctr: number; avg_cpc: number; conversions: number
      cost_per_conversion: number; roas: number; daily_budget: number
      budget_utilization: number
    }>
    total: number
    page: number
    dailySpend: Array<{ date: string; platform: string; spend: number; clicks: number; conversions: number }>
    configs: Array<{ service: string; is_active: boolean; last_fetch_at: string | null }>
  } | null
  loading: boolean
}

function formatCurrency(num: number): string {
  if (num >= 1000000) return `Rp ${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `Rp ${(num / 1000).toFixed(0)}K`
  return `Rp ${num.toLocaleString('id-ID')}`
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString('id-ID')
}

const PLATFORM_COLORS: Record<string, string> = {
  google_ads: '#4285f4',
  meta_ads: '#1877f2',
}

export default function AdsOverviewSection({ data, loading }: AdsOverviewProps) {
  const googleAdsActive = data?.configs?.find(c => c.service === 'google_ads')?.is_active
  const metaAdsActive = data?.configs?.find(c => c.service === 'meta_ads')?.is_active

  if (!loading && !googleAdsActive && !metaAdsActive) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">SEM / Paid Ads Belum Dikonfigurasi</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
            Untuk menampilkan data Google Ads dan Meta Ads, hubungkan akun Anda melalui konfigurasi API.
            Fitur ini membutuhkan Google Ads Developer Token dan/atau Meta Ads Account ID.
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ background: PLATFORM_COLORS.google_ads }} />
              Google Ads: {googleAdsActive ? 'Aktif' : 'Belum Aktif'}
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ background: PLATFORM_COLORS.meta_ads }} />
              Meta Ads: {metaAdsActive ? 'Aktif' : 'Belum Aktif'}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!data) return null

  const { kpis, campaigns, dailySpend } = data

  // Prepare daily spend chart data (aggregate by date)
  const spendByDate = new Map<string, { date: string; google_ads: number; meta_ads: number }>()
  for (const d of dailySpend) {
    const existing = spendByDate.get(d.date) || { date: d.date, google_ads: 0, meta_ads: 0 }
    if (d.platform === 'google_ads') existing.google_ads += d.spend
    if (d.platform === 'meta_ads') existing.meta_ads += d.spend
    spendByDate.set(d.date, existing)
  }
  const spendChartData = Array.from(spendByDate.values()).sort((a, b) => a.date.localeCompare(b.date))

  // Top 5 campaigns by ROAS
  const topRoas = [...campaigns].sort((a, b) => b.roas - a.roas).slice(0, 5)

  const kpiCards = [
    { label: 'Total Ad Spend', value: formatCurrency(kpis.totalSpend.value), yoy: kpis.totalSpend.yoy, icon: DollarSign, color: 'text-red-500', invertYoy: true },
    { label: 'Total Conversions', value: formatNumber(kpis.totalConversions.value), yoy: kpis.totalConversions.yoy, icon: Target, color: 'text-green-500' },
    { label: 'Avg CPC', value: formatCurrency(kpis.avgCpc.value), yoy: kpis.avgCpc.yoy, icon: MousePointerClick, color: 'text-blue-500', invertYoy: true },
    { label: 'Avg CPA', value: formatCurrency(kpis.avgCpa.value), yoy: kpis.avgCpa.yoy, icon: TrendingUp, color: 'text-purple-500', invertYoy: true },
    { label: 'Overall ROAS', value: `${kpis.overallRoas.value.toFixed(2)}x`, yoy: kpis.overallRoas.yoy, icon: BarChart3, color: 'text-amber-500' },
  ]

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {kpiCards.map((kpi, i) => {
          const yoyVal = kpi.yoy || 0
          const isPositive = kpi.invertYoy ? yoyVal < 0 : yoyVal > 0
          const isNegative = kpi.invertYoy ? yoyVal > 0 : yoyVal < 0
          return (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <p className="text-xl font-bold">{kpi.value}</p>
                {yoyVal !== 0 && (
                  <div className={`flex items-center gap-1 mt-1 text-xs ${isPositive ? 'text-green-600' : isNegative ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {yoyVal > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    <span>{yoyVal > 0 ? '+' : ''}{yoyVal.toFixed(1)}% YoY</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Spend Trend Chart */}
      {spendChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Daily Ad Spend Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spendChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(l) => new Date(l).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} />
                  <Legend />
                  <Area type="monotone" dataKey="google_ads" name="Google Ads" stackId="1" fill="#4285f4" stroke="#4285f4" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="meta_ads" name="Meta Ads" stackId="1" fill="#1877f2" stroke="#1877f2" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Campaign Table */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Campaigns ({campaigns.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada data campaign</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Platform</TableHead>
                      <TableHead className="text-xs">Campaign</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Spend</TableHead>
                      <TableHead className="text-xs text-right">Clicks</TableHead>
                      <TableHead className="text-xs text-right">CTR</TableHead>
                      <TableHead className="text-xs text-right">CPC</TableHead>
                      <TableHead className="text-xs text-right">Conv.</TableHead>
                      <TableHead className="text-xs text-right">ROAS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.slice(0, 10).map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[c.platform] || '#666' }} />
                            {c.platform === 'google_ads' ? 'Google' : 'Meta'}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-medium max-w-[150px] truncate">{c.campaign_name}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant={c.campaign_status === 'ENABLED' ? 'default' : 'secondary'} className="text-[10px]">
                            {c.campaign_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right">{formatCurrency(Number(c.spend))}</TableCell>
                        <TableCell className="text-xs text-right">{formatNumber(c.clicks)}</TableCell>
                        <TableCell className="text-xs text-right">{(Number(c.ctr) * 100).toFixed(2)}%</TableCell>
                        <TableCell className="text-xs text-right">{formatCurrency(Number(c.avg_cpc))}</TableCell>
                        <TableCell className="text-xs text-right">{Number(c.conversions).toFixed(0)}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{Number(c.roas).toFixed(2)}x</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Campaigns by ROAS */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Top Campaigns by ROAS
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topRoas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada data</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topRoas} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(1)}x`} />
                    <YAxis type="category" dataKey="campaign_name" width={100} tick={{ fontSize: 9 }} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)}x`} />
                    <Bar dataKey="roas" name="ROAS" radius={[0, 4, 4, 0]}>
                      {topRoas.map((c, i) => (
                        <Cell key={i} fill={PLATFORM_COLORS[c.platform] || '#666'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
