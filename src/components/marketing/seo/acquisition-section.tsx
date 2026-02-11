'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  Link2, TrendingUp, Users, Target, Globe, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// =====================================================
// Types
// =====================================================

interface ChannelData {
  channel: string
  sessions: number
  users: number
  conversions: number
  engaged_sessions: number
  bounce_rate: number
  conversion_rate: number
}

interface SourceMediumData {
  source_medium: string
  sessions: number
  users: number
  conversions: number
  bounce_rate: number
  conversion_rate: number
}

interface CampaignData {
  source: string
  medium: string
  campaign: string
  sessions: number
  users: number
  conversions: number
  engagement_rate: number
  bounce_rate: number
}

interface LandingPageData {
  landing_page: string
  sessions: number
  users: number
  conversions: number
  bounce_rate: number
  conversion_rate: number
}

interface AcquisitionProps {
  data: {
    kpis: {
      totalSessions: number
      totalUsers: number
      totalConversions: number
      totalNewUsers: number
      overallConversionRate: number
    }
    channels: ChannelData[]
    sourceMediums: SourceMediumData[]
    campaigns: CampaignData[]
    landingPages: LandingPageData[]
  } | null
  loading: boolean
}

// =====================================================
// Helpers
// =====================================================

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toLocaleString('id-ID')
}

function formatPercent(num: number): string {
  return `${(num * 100).toFixed(2)}%`
}

const CHANNEL_COLORS: Record<string, string> = {
  'Organic Search': '#22c55e',
  'Direct': '#3b82f6',
  'Organic Social': '#ec4899',
  'Referral': '#f97316',
  'Paid Search': '#eab308',
  'Paid Social': '#a855f7',
  'Email': '#06b6d4',
  'Display': '#84cc16',
  'Affiliates': '#f43f5e',
  'Other': '#94a3b8',
}

function getChannelColor(channel: string): string {
  return CHANNEL_COLORS[channel] || '#94a3b8'
}

// =====================================================
// Loading skeleton
// =====================================================

function AcquisitionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card><CardContent className="pt-4"><Skeleton className="h-[300px] w-full" /></CardContent></Card>
        <Card><CardContent className="pt-4"><Skeleton className="h-[300px] w-full" /></CardContent></Card>
      </div>
    </div>
  )
}

// =====================================================
// Main component
// =====================================================

export function AcquisitionSection({ data, loading }: AcquisitionProps) {
  if (loading && !data) return <AcquisitionSkeleton />

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Link2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Belum ada data akuisisi/UTM. Klik &quot;Refresh Data&quot; untuk mengambil data dari GA4.
          </p>
        </CardContent>
      </Card>
    )
  }

  const { kpis, channels, sourceMediums, campaigns, landingPages } = data
  const totalChannelSessions = channels.reduce((s, c) => s + c.sessions, 0) || 1

  // Pie chart data
  const pieData = channels.slice(0, 8).map(c => ({
    name: c.channel,
    value: c.sessions,
    color: getChannelColor(c.channel),
  }))

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] text-muted-foreground mb-1">Total Sesi</p>
            <p className="text-xl font-bold">{formatNumber(kpis.totalSessions)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] text-muted-foreground mb-1">Total Users</p>
            <p className="text-xl font-bold">{formatNumber(kpis.totalUsers)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] text-muted-foreground mb-1">User Baru</p>
            <p className="text-xl font-bold">{formatNumber(kpis.totalNewUsers)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] text-muted-foreground mb-1">Key Events</p>
            <p className="text-xl font-bold">{formatNumber(kpis.totalConversions)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] text-muted-foreground mb-1">Conversion Rate</p>
            <p className="text-xl font-bold">{formatPercent(kpis.overallConversionRate)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Channel breakdown - chart + table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel pie chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Channel Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [formatNumber(value), 'Sesi']}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--border))',
                        background: 'hsl(var(--popover))',
                        color: 'hsl(var(--popover-foreground))',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1">
                  {channels.slice(0, 8).map(ch => (
                    <div key={ch.channel} className="flex items-center justify-between text-xs py-0.5">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: getChannelColor(ch.channel) }} />
                        <span className="font-medium">{ch.channel}</span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span>{formatNumber(ch.sessions)}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {((ch.sessions / totalChannelSessions) * 100).toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada data channel.</p>
            )}
          </CardContent>
        </Card>

        {/* Channel performance table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Channel Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {channels.length > 0 ? (
              <div className="rounded-md border overflow-hidden overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Channel</TableHead>
                      <TableHead className="text-xs text-right">Sesi</TableHead>
                      <TableHead className="text-xs text-right">Users</TableHead>
                      <TableHead className="text-xs text-right">Key Events</TableHead>
                      <TableHead className="text-xs text-right">Conv. Rate</TableHead>
                      <TableHead className="text-xs text-right">Bounce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {channels.map((ch, idx) => (
                      <TableRow key={`ch-${idx}`}>
                        <TableCell className="text-xs font-medium py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getChannelColor(ch.channel) }} />
                            {ch.channel}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(ch.sessions)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(ch.users)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(ch.conversions)}</TableCell>
                        <TableCell className="text-xs text-right py-1.5">
                          <Badge variant="outline" className={cn('text-[10px]', ch.conversion_rate >= 0.03 ? 'text-green-600' : '')}>
                            {formatPercent(ch.conversion_rate)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right py-1.5">
                          <Badge variant="outline" className={cn(
                            'text-[10px]',
                            ch.bounce_rate <= 0.4 ? 'text-green-600' : ch.bounce_rate <= 0.6 ? 'text-yellow-600' : 'text-red-600'
                          )}>
                            {formatPercent(ch.bounce_rate)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada data.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Source / Medium table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            Top Source / Medium
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sourceMediums.length > 0 ? (
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Source / Medium</TableHead>
                    <TableHead className="text-xs text-right">Sesi</TableHead>
                    <TableHead className="text-xs text-right">Users</TableHead>
                    <TableHead className="text-xs text-right">Key Events</TableHead>
                    <TableHead className="text-xs text-right">Conv. Rate</TableHead>
                    <TableHead className="text-xs text-right">Bounce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sourceMediums.slice(0, 20).map((sm, idx) => (
                    <TableRow key={`sm-${idx}`}>
                      <TableCell className="text-xs text-muted-foreground py-1.5">{idx + 1}</TableCell>
                      <TableCell className="text-xs font-medium py-1.5">{sm.source_medium}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(sm.sessions)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(sm.users)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(sm.conversions)}</TableCell>
                      <TableCell className="text-xs text-right py-1.5">
                        <Badge variant="outline" className={cn('text-[10px]', sm.conversion_rate >= 0.03 ? 'text-green-600' : '')}>
                          {formatPercent(sm.conversion_rate)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right py-1.5">
                        {formatPercent(sm.bounce_rate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Belum ada data source/medium.</p>
          )}
        </CardContent>
      </Card>

      {/* UTM Campaigns */}
      {campaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              UTM Campaign Tracking
              <Badge variant="outline" className="text-[10px] ml-1">{campaigns.length} campaigns</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Campaign</TableHead>
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs">Medium</TableHead>
                    <TableHead className="text-xs text-right">Sesi</TableHead>
                    <TableHead className="text-xs text-right">Users</TableHead>
                    <TableHead className="text-xs text-right">Key Events</TableHead>
                    <TableHead className="text-xs text-right">Bounce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.slice(0, 20).map((c, idx) => (
                    <TableRow key={`camp-${idx}`}>
                      <TableCell className="text-xs font-medium py-1.5 max-w-[200px] truncate">{c.campaign}</TableCell>
                      <TableCell className="text-xs py-1.5">{c.source}</TableCell>
                      <TableCell className="text-xs py-1.5">{c.medium}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(c.sessions)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(c.users)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(c.conversions)}</TableCell>
                      <TableCell className="text-xs text-right py-1.5">{formatPercent(c.bounce_rate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Landing Pages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            Top Landing Pages
          </CardTitle>
        </CardHeader>
        <CardContent>
          {landingPages.length > 0 ? (
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs min-w-[200px]">Landing Page</TableHead>
                    <TableHead className="text-xs text-right">Sesi</TableHead>
                    <TableHead className="text-xs text-right">Users</TableHead>
                    <TableHead className="text-xs text-right">Key Events</TableHead>
                    <TableHead className="text-xs text-right">Conv. Rate</TableHead>
                    <TableHead className="text-xs text-right">Bounce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {landingPages.map((lp, idx) => (
                    <TableRow key={`lp-${idx}`}>
                      <TableCell className="text-xs text-muted-foreground py-1.5">{idx + 1}</TableCell>
                      <TableCell className="text-xs font-medium py-1.5">
                        <span className="truncate max-w-[260px] inline-block" title={lp.landing_page}>
                          {lp.landing_page}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(lp.sessions)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(lp.users)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(lp.conversions)}</TableCell>
                      <TableCell className="text-xs text-right py-1.5">
                        <Badge variant="outline" className={cn('text-[10px]', lp.conversion_rate >= 0.03 ? 'text-green-600' : '')}>
                          {formatPercent(lp.conversion_rate)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right py-1.5">
                        <Badge variant="outline" className={cn(
                          'text-[10px]',
                          lp.bounce_rate <= 0.4 ? 'text-green-600' : lp.bounce_rate <= 0.6 ? 'text-yellow-600' : 'text-red-600'
                        )}>
                          {formatPercent(lp.bounce_rate)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Belum ada data landing page.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
