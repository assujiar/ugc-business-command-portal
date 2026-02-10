'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts'
import { GitCompareArrows, DollarSign, TrendingUp, AlertCircle } from 'lucide-react'

interface CombinedViewProps {
  data: {
    channelSplit: {
      organic: { sessions: number; conversions: number; share: number }
      paid: { sessions: number; conversions: number; share: number }
    }
    blendedMetrics: {
      blendedCpa: number; organicShare: number; paidShare: number; totalAdSpend: number
    }
    monthlyTrend: Array<{ month: string; organic: number; paid: number }>
    keywordOverlap: Array<{
      keyword: string; organicPosition: number; organicClicks: number
      paidClicks: number; paidCpc: number
    }>
  } | null
  loading: boolean
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString('id-ID')
}

function formatCurrency(num: number): string {
  if (num >= 1000000) return `Rp ${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `Rp ${(num / 1000).toFixed(0)}K`
  return `Rp ${Math.round(num).toLocaleString('id-ID')}`
}

const CHANNEL_COLORS = { organic: '#22c55e', paid: '#3b82f6' }

export default function CombinedViewSection({ data, loading }: CombinedViewProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Data Belum Tersedia</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Tampilan gabungan Organic vs Paid membutuhkan data SEO dan SEM.
            Pastikan kedua sumber data sudah dikonfigurasi dan data sudah di-fetch.
          </p>
        </CardContent>
      </Card>
    )
  }

  const { channelSplit, blendedMetrics, monthlyTrend, keywordOverlap } = data

  const pieData = [
    { name: 'Organic', value: channelSplit.organic.sessions, color: CHANNEL_COLORS.organic },
    { name: 'Paid', value: channelSplit.paid.sessions, color: CHANNEL_COLORS.paid },
  ].filter(d => d.value > 0)

  const totalSessions = channelSplit.organic.sessions + channelSplit.paid.sessions

  return (
    <div className="space-y-4">
      {/* Blended Metrics */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Organic Share</span>
              <div className="w-3 h-3 rounded-full" style={{ background: CHANNEL_COLORS.organic }} />
            </div>
            <p className="text-2xl font-bold">{blendedMetrics.organicShare.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground">{formatNumber(channelSplit.organic.sessions)} sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Paid Share</span>
              <div className="w-3 h-3 rounded-full" style={{ background: CHANNEL_COLORS.paid }} />
            </div>
            <p className="text-2xl font-bold">{blendedMetrics.paidShare.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground">{formatNumber(channelSplit.paid.sessions)} sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Blended CPA</span>
              <DollarSign className="h-4 w-4 text-purple-500" />
            </div>
            <p className="text-2xl font-bold">{formatCurrency(blendedMetrics.blendedCpa)}</p>
            <p className="text-[10px] text-muted-foreground">organic + paid conversions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Total Ad Spend</span>
              <TrendingUp className="h-4 w-4 text-red-500" />
            </div>
            <p className="text-2xl font-bold">{formatCurrency(blendedMetrics.totalAdSpend)}</p>
            <p className="text-[10px] text-muted-foreground">periode ini</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Channel Split Donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4" />
              Sessions by Channel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {totalSessions === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Belum ada data sessions</p>
            ) : (
              <div className="h-64 flex items-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatNumber(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Monthly Traffic Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyTrend.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Belum ada data trend</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatNumber} />
                    <Tooltip formatter={(v: number) => formatNumber(v)} />
                    <Legend />
                    <Bar dataKey="organic" name="Organic" stackId="stack" fill={CHANNEL_COLORS.organic} />
                    <Bar dataKey="paid" name="Paid" stackId="stack" fill={CHANNEL_COLORS.paid} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Keyword Overlap */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4" />
            Keyword Overlap (Organic + Paid)
          </CardTitle>
          <p className="text-xs text-muted-foreground">Keywords yang ranking organik DAN juga di-bid paid</p>
        </CardHeader>
        <CardContent>
          {keywordOverlap.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Belum ada data overlap — dibutuhkan data SEO dan SEM
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Keyword</TableHead>
                    <TableHead className="text-xs text-right">Organic Pos.</TableHead>
                    <TableHead className="text-xs text-right">Organic Clicks</TableHead>
                    <TableHead className="text-xs text-right">Paid Clicks</TableHead>
                    <TableHead className="text-xs text-right">Paid CPC</TableHead>
                    <TableHead className="text-xs">Insight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keywordOverlap.map((kw, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium">{kw.keyword}</TableCell>
                      <TableCell className="text-xs text-right">{kw.organicPosition.toFixed(1)}</TableCell>
                      <TableCell className="text-xs text-right">{formatNumber(kw.organicClicks)}</TableCell>
                      <TableCell className="text-xs text-right">{formatNumber(kw.paidClicks)}</TableCell>
                      <TableCell className="text-xs text-right">{formatCurrency(kw.paidCpc)}</TableCell>
                      <TableCell className="text-xs">
                        {kw.organicPosition <= 3 ? (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                            Ranking baik, pertimbangkan kurangi bid
                          </Badge>
                        ) : kw.organicPosition <= 10 ? (
                          <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">
                            Bisa optimasi SEO untuk ganti paid
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Paid masih dibutuhkan
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
