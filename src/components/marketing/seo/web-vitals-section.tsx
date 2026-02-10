'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts'
import { Smartphone, Monitor, Gauge, Clock, Zap, Globe, AlertCircle } from 'lucide-react'

interface WebVitalsProps {
  data: {
    pages: Array<{
      url: string
      mobile: {
        performance_score: number; lcp_ms: number; cls: number; inp_ms: number
        fcp_ms: number; ttfb_ms: number; speed_index_ms: number
        lcp_rating: string; cls_rating: string; inp_rating: string
        fetch_date: string
      } | null
      desktop: {
        performance_score: number; lcp_ms: number; cls: number; inp_ms: number
        fcp_ms: number; ttfb_ms: number; speed_index_ms: number
        lcp_rating: string; cls_rating: string; inp_rating: string
        fetch_date: string
      } | null
    }>
    trends: Record<string, Array<{ date: string; score: number; lcp: number; cls: number; inp: number }>>
    config: { is_active: boolean; last_fetch_at: string; extra_config: any } | null
  } | null
  loading: boolean
}

function getRatingColor(rating: string): string {
  switch (rating) {
    case 'FAST': return 'text-green-600 bg-green-50 border-green-200'
    case 'AVERAGE': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    case 'SLOW': return 'text-red-600 bg-red-50 border-red-200'
    default: return 'text-muted-foreground bg-muted'
  }
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#22c55e'
  if (score >= 50) return '#eab308'
  return '#ef4444'
}

function formatMs(ms: number | null): string {
  if (ms == null) return '-'
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

function ScoreGauge({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (score / 100) * circumference
  const color = getScoreColor(score)

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="currentColor" strokeWidth={4}
          className="text-muted/20"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold" style={{ color }}>{Math.round(score)}</span>
      </div>
    </div>
  )
}

function MetricCard({ label, value, rating, icon: Icon, target }: {
  label: string; value: string; rating: string
  icon: React.ElementType; target: string
}) {
  const colorClass = getRatingColor(rating)
  return (
    <div className={`border rounded-lg p-3 ${colorClass}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium">{label}</span>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="text-lg font-bold">{value}</p>
      <div className="flex items-center justify-between mt-1">
        <Badge variant="outline" className={`text-[10px] ${colorClass}`}>{rating}</Badge>
        <span className="text-[10px] opacity-70">Target: {target}</span>
      </div>
    </div>
  )
}

export default function WebVitalsSection({ data, loading }: WebVitalsProps) {
  const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile')

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  if (!data || data.pages.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Core Web Vitals Belum Tersedia</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
            {data?.config?.is_active
              ? 'Data belum di-fetch. Klik "Refresh Data" untuk memulai pengambilan data PageSpeed.'
              : 'Konfigurasi PageSpeed Insights API Key di tabel marketing_seo_config untuk memulai monitoring.'}
          </p>
          {data?.config?.last_fetch_at && (
            <p className="text-xs text-muted-foreground">
              Last fetch: {new Date(data.config.last_fetch_at).toLocaleString('id-ID')}
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Strategy Toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant={strategy === 'mobile' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStrategy('mobile')}
          className="h-8 text-xs gap-1"
        >
          <Smartphone className="h-3.5 w-3.5" />
          Mobile
        </Button>
        <Button
          variant={strategy === 'desktop' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStrategy('desktop')}
          className="h-8 text-xs gap-1"
        >
          <Monitor className="h-3.5 w-3.5" />
          Desktop
        </Button>
        {data.config?.last_fetch_at && (
          <span className="text-[10px] text-muted-foreground ml-2">
            Data dari: {new Date(data.config.last_fetch_at).toLocaleDateString('id-ID')}
          </span>
        )}
      </div>

      {/* Page Cards */}
      {data.pages.map((page, idx) => {
        const vitals = strategy === 'mobile' ? page.mobile : page.desktop
        if (!vitals) return (
          <Card key={idx}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {page.url}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Data {strategy} belum tersedia untuk halaman ini
              </p>
            </CardContent>
          </Card>
        )

        const trendKey = `${page.url}|${strategy}`
        const trendData = data.trends[trendKey] || []

        return (
          <Card key={idx}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  <span className="truncate max-w-xs">{page.url}</span>
                </CardTitle>
                {vitals.fetch_date && (
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(vitals.fetch_date).toLocaleDateString('id-ID')}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Score Gauge */}
                <div className="flex flex-col items-center gap-2">
                  <ScoreGauge score={Number(vitals.performance_score) || 0} size={100} />
                  <span className="text-xs font-medium">Performance</span>
                </div>

                {/* Core Web Vitals */}
                <div className="flex-1 grid gap-3 grid-cols-1 sm:grid-cols-3">
                  <MetricCard
                    label="LCP"
                    value={formatMs(Number(vitals.lcp_ms))}
                    rating={vitals.lcp_rating || 'UNKNOWN'}
                    icon={Clock}
                    target="< 2.5s"
                  />
                  <MetricCard
                    label="CLS"
                    value={vitals.cls != null ? Number(vitals.cls).toFixed(3) : '-'}
                    rating={vitals.cls_rating || 'UNKNOWN'}
                    icon={Gauge}
                    target="< 0.1"
                  />
                  <MetricCard
                    label="INP"
                    value={formatMs(Number(vitals.inp_ms))}
                    rating={vitals.inp_rating || 'UNKNOWN'}
                    icon={Zap}
                    target="< 200ms"
                  />
                </div>
              </div>

              {/* Additional Metrics */}
              <div className="grid gap-2 grid-cols-3 mt-4 pt-3 border-t">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">FCP</p>
                  <p className="text-sm font-medium">{formatMs(Number(vitals.fcp_ms))}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">TTFB</p>
                  <p className="text-sm font-medium">{formatMs(Number(vitals.ttfb_ms))}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Speed Index</p>
                  <p className="text-sm font-medium">{formatMs(Number(vitals.speed_index_ms))}</p>
                </div>
              </div>

              {/* Trend Chart */}
              {trendData.length > 1 && (
                <div className="mt-4 pt-3 border-t">
                  <p className="text-xs font-medium mb-2">Performance Score Trend</p>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 9 }}
                          tickFormatter={(d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Tooltip
                          labelFormatter={(l) => new Date(l).toLocaleDateString('id-ID')}
                          formatter={(v: number, name: string) => [
                            name === 'score' ? `${Math.round(v)}` : name === 'cls' ? v.toFixed(3) : formatMs(v),
                            name === 'score' ? 'Score' : name.toUpperCase()
                          ]}
                        />
                        <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
