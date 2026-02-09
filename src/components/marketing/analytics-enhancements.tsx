'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Users,
  Zap,
  Target,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// =====================================================
// Types
// =====================================================

interface WeeklyComparison {
  platform: string
  this_week: MetricSet
  last_week: MetricSet
  changes: ChangeSet
}

interface MetricSet {
  views: number
  likes: number
  comments: number
  shares: number
  followers_gained: number
  engagement: number
  reach: number
  impressions: number
}

interface ChangeSet {
  views: number
  likes: number
  comments: number
  shares: number
  followers_gained: number
  engagement: number
  reach: number
  impressions: number
}

interface CrossPlatformItem {
  platform: string
  followers: number
  views: number
  likes: number
  comments: number
  shares: number
  engagement_rate: number
  reach: number
  impressions: number
}

interface TotalMetrics {
  total_followers: number
  total_followers_gained: number
  total_views: number
  total_likes: number
  total_comments: number
  total_shares: number
  total_interactions: number
  avg_engagement_rate: number
}

interface AnalyticsEnhancementsProps {
  weeklyComparison: WeeklyComparison[]
  weeklyChartData: any[]
  crossPlatformData: CrossPlatformItem[]
  totalMetrics: TotalMetrics
  dailyData: any[]
  selectedPlatform: string
  period: string
}

// =====================================================
// Constants
// =====================================================

const PLATFORM_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  tiktok: { label: 'TikTok', icon: '🎵', color: '#000000' },
  instagram: { label: 'Instagram', icon: '📸', color: '#E4405F' },
  youtube: { label: 'YouTube', icon: '▶️', color: '#FF0000' },
  facebook: { label: 'Facebook', icon: '📘', color: '#1877F2' },
  linkedin: { label: 'LinkedIn', icon: '💼', color: '#0A66C2' },
}

const PLATFORM_COLORS = ['#000000', '#E4405F', '#FF0000', '#1877F2', '#0A66C2']

// =====================================================
// Helpers
// =====================================================

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString('id-ID')
}

function ChangeIndicator({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (value > 0) {
    return (
      <span className="flex items-center gap-0.5 text-green-600 text-xs font-medium">
        <ArrowUpRight className="h-3 w-3" />+{value}{suffix}
      </span>
    )
  }
  if (value < 0) {
    return (
      <span className="flex items-center gap-0.5 text-red-600 text-xs font-medium">
        <ArrowDownRight className="h-3 w-3" />{value}{suffix}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-0.5 text-muted-foreground text-xs">
      <Minus className="h-3 w-3" />0{suffix}
    </span>
  )
}

function computeHealthScore(
  engagement: number,
  followersGrowthPct: number,
  interactionRate: number
): number {
  // Health = weighted average: engagement(40%) + growth(30%) + interaction(30%)
  // Each component normalized to 0-100
  const engScore = Math.min(engagement * 10, 100) // 10% eng = 100 score
  const growthScore = Math.min(Math.max(followersGrowthPct, 0) * 5, 100) // 20% growth = 100
  const interScore = Math.min(interactionRate * 8, 100)
  return Math.round(engScore * 0.4 + growthScore * 0.3 + interScore * 0.3)
}

function getHealthLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Excellent', color: 'text-green-600' }
  if (score >= 60) return { label: 'Good', color: 'text-blue-600' }
  if (score >= 40) return { label: 'Fair', color: 'text-yellow-600' }
  if (score >= 20) return { label: 'Needs Work', color: 'text-orange-600' }
  return { label: 'Critical', color: 'text-red-600' }
}

// =====================================================
// Main Component
// =====================================================

export function AnalyticsEnhancements({
  weeklyComparison,
  weeklyChartData,
  crossPlatformData,
  totalMetrics,
  dailyData,
  selectedPlatform,
  period,
}: AnalyticsEnhancementsProps) {
  const activePlatforms = Object.keys(PLATFORM_CONFIG).filter(
    p => selectedPlatform === 'all' || p === selectedPlatform
  )

  // =====================================================
  // 1. Aggregate KPI Summary (Total across all platforms)
  // =====================================================

  const KPISummary = () => (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Total Followers</span>
            <Users className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold">{formatNumber(totalMetrics.total_followers)}</p>
          <div className="flex items-center gap-2 mt-1">
            <ChangeIndicator value={totalMetrics.total_followers_gained} />
            <span className="text-[10px] text-muted-foreground">periode ini</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Total Views</span>
            <Eye className="h-4 w-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold">{formatNumber(totalMetrics.total_views)}</p>
          <span className="text-[10px] text-muted-foreground">
            {period} hari terakhir
          </span>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Total Interaksi</span>
            <Zap className="h-4 w-4 text-orange-500" />
          </div>
          <p className="text-2xl font-bold">{formatNumber(totalMetrics.total_interactions)}</p>
          <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
            <span><Heart className="h-2.5 w-2.5 inline" /> {formatNumber(totalMetrics.total_likes)}</span>
            <span><MessageCircle className="h-2.5 w-2.5 inline" /> {formatNumber(totalMetrics.total_comments)}</span>
            <span><Share2 className="h-2.5 w-2.5 inline" /> {formatNumber(totalMetrics.total_shares)}</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Avg Engagement Rate</span>
            <Target className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold">{totalMetrics.avg_engagement_rate.toFixed(2)}%</p>
          <span className="text-[10px] text-muted-foreground">
            rata-rata semua platform
          </span>
        </CardContent>
      </Card>
    </div>
  )

  // =====================================================
  // 2. Weekly Comparison (This Week vs Last Week)
  // =====================================================

  const EmptyState = ({ icon: Icon, title }: { icon: typeof Activity; title: string }) => (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-10 text-center">
        <Icon className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">Data akan tersedia setelah cron job berjalan</p>
      </CardContent>
    </Card>
  )

  const WeeklyComparisonSection = () => {
    if (weeklyComparison.length === 0) return (
      <EmptyState icon={Activity} title="Perbandingan Mingguan" />
    )

    const metrics = [
      { key: 'views', label: 'Views', icon: Eye },
      { key: 'likes', label: 'Likes', icon: Heart },
      { key: 'comments', label: 'Comments', icon: MessageCircle },
      { key: 'shares', label: 'Shares', icon: Share2 },
      { key: 'followers_gained', label: 'New Followers', icon: Users },
      { key: 'engagement', label: 'Eng. Rate', icon: Target },
    ] as const

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Perbandingan Minggu Ini vs Minggu Lalu
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Platform</th>
                  {metrics.map(m => (
                    <th key={m.key} className="text-center py-2 px-2 font-medium text-muted-foreground">
                      <m.icon className="h-3 w-3 mx-auto mb-0.5" />
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeklyComparison.map(wc => {
                  const conf = PLATFORM_CONFIG[wc.platform]
                  if (!conf) return null

                  return (
                    <tr key={wc.platform} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-1.5">
                          <span>{conf.icon}</span>
                          <span className="font-medium">{conf.label}</span>
                        </span>
                      </td>
                      {metrics.map(m => {
                        const thisVal = wc.this_week[m.key as keyof MetricSet]
                        const change = wc.changes[m.key as keyof ChangeSet]
                        const isRate = m.key === 'engagement'

                        return (
                          <td key={m.key} className="py-3 px-2 text-center">
                            <p className="font-semibold tabular-nums">
                              {isRate ? `${(thisVal as number).toFixed(2)}%` : formatNumber(thisVal as number)}
                            </p>
                            <ChangeIndicator value={change} suffix="%" />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {/* Totals row */}
                {weeklyComparison.length > 1 && (
                  <tr className="bg-muted/30 font-medium">
                    <td className="py-3 pr-4">
                      <span className="flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5" />
                        <span>Total</span>
                      </span>
                    </td>
                    {metrics.map(m => {
                      const isRate = m.key === 'engagement'
                      const totalThis = isRate
                        ? weeklyComparison.reduce((s, wc) => s + (wc.this_week[m.key as keyof MetricSet] as number), 0) / weeklyComparison.length
                        : weeklyComparison.reduce((s, wc) => s + (wc.this_week[m.key as keyof MetricSet] as number), 0)
                      const totalLast = isRate
                        ? weeklyComparison.reduce((s, wc) => s + (wc.last_week[m.key as keyof MetricSet] as number), 0) / weeklyComparison.length
                        : weeklyComparison.reduce((s, wc) => s + (wc.last_week[m.key as keyof MetricSet] as number), 0)
                      const totalChange = totalLast === 0
                        ? (totalThis > 0 ? 100 : 0)
                        : Math.round(((totalThis - totalLast) / totalLast) * 100)

                      return (
                        <td key={m.key} className="py-3 px-2 text-center">
                          <p className="font-bold tabular-nums">
                            {isRate ? `${totalThis.toFixed(2)}%` : formatNumber(totalThis)}
                          </p>
                          <ChangeIndicator value={totalChange} suffix="%" />
                        </td>
                      )
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    )
  }

  // =====================================================
  // 3. Weekly Trend Chart (aggregated by week)
  // =====================================================

  const WeeklyTrendChart = () => {
    if (weeklyChartData.length < 2) return (
      <EmptyState icon={BarChart3} title="Weekly Performance Trend" />
    )

    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Weekly Performance Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyChartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="week_label"
                  tick={{ fontSize: 10 }}
                  angle={-20}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tickFormatter={formatNumber} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => formatNumber(value)} />
                <Legend />
                {activePlatforms.map((p, i) => (
                  <Bar
                    key={p}
                    dataKey={`${p}_views`}
                    name={`${PLATFORM_CONFIG[p]?.label} Views`}
                    fill={PLATFORM_CONFIG[p]?.color || '#666'}
                    stackId="weekly"
                    opacity={0.85}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    )
  }

  // =====================================================
  // 4. Engagement Composition (Likes vs Comments vs Shares)
  // =====================================================

  const EngagementComposition = () => {
    if (dailyData.length === 0) return (
      <EmptyState icon={Heart} title="Engagement Composition" />
    )

    // Compute daily totals of likes + comments + shares across selected platforms
    const compositionData = dailyData.slice(-14).map((day: any) => {
      let likes = 0, comments = 0, shares = 0
      for (const p of activePlatforms) {
        likes += day[`${p}_likes`] || 0
        comments += day[`${p}_comments`] || 0
        shares += day[`${p}_shares`] || 0
      }
      return {
        date: day.date,
        Likes: likes,
        Comments: comments,
        Shares: shares,
      }
    })

    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Heart className="h-4 w-4" />
            Engagement Composition (14 Hari Terakhir)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={compositionData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tickFormatter={formatNumber} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => formatNumber(value)} />
                <Legend />
                <Area type="monotone" dataKey="Likes" stackId="1" fill="#ef4444" stroke="#ef4444" fillOpacity={0.6} />
                <Area type="monotone" dataKey="Comments" stackId="1" fill="#8b5cf6" stroke="#8b5cf6" fillOpacity={0.6} />
                <Area type="monotone" dataKey="Shares" stackId="1" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    )
  }

  // =====================================================
  // 5. Cross-Platform Comparison (Radar Chart)
  // =====================================================

  const CrossPlatformRadar = () => {
    if (crossPlatformData.length < 2) return (
      <EmptyState icon={Target} title="Cross-Platform Comparison" />
    )

    // Normalize values to 0-100 for radar
    const maxFollowers = Math.max(...crossPlatformData.map(d => d.followers), 1)
    const maxViews = Math.max(...crossPlatformData.map(d => d.views), 1)
    const maxLikes = Math.max(...crossPlatformData.map(d => d.likes), 1)
    const maxComments = Math.max(...crossPlatformData.map(d => d.comments), 1)
    const maxEngagement = Math.max(...crossPlatformData.map(d => d.engagement_rate), 1)

    const radarData = [
      { metric: 'Followers', ...Object.fromEntries(crossPlatformData.map(d => [d.platform, Math.round((d.followers / maxFollowers) * 100)])) },
      { metric: 'Views', ...Object.fromEntries(crossPlatformData.map(d => [d.platform, Math.round((d.views / maxViews) * 100)])) },
      { metric: 'Likes', ...Object.fromEntries(crossPlatformData.map(d => [d.platform, Math.round((d.likes / maxLikes) * 100)])) },
      { metric: 'Comments', ...Object.fromEntries(crossPlatformData.map(d => [d.platform, Math.round((d.comments / maxComments) * 100)])) },
      { metric: 'Engagement', ...Object.fromEntries(crossPlatformData.map(d => [d.platform, Math.round((d.engagement_rate / maxEngagement) * 100)])) },
    ]

    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4" />
            Cross-Platform Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                {crossPlatformData.map(d => (
                  <Radar
                    key={d.platform}
                    name={PLATFORM_CONFIG[d.platform]?.label || d.platform}
                    dataKey={d.platform}
                    stroke={PLATFORM_CONFIG[d.platform]?.color || '#666'}
                    fill={PLATFORM_CONFIG[d.platform]?.color || '#666'}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                ))}
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    )
  }

  // =====================================================
  // 6. Platform Health Score
  // =====================================================

  const PlatformHealthScores = () => {
    if (weeklyComparison.length === 0) return (
      <EmptyState icon={Award} title="Platform Health Score" />
    )

    const scores = weeklyComparison.map(wc => {
      const snap = crossPlatformData.find(d => d.platform === wc.platform)
      const followersGrowthPct = snap && snap.followers > 0
        ? (wc.this_week.followers_gained / snap.followers) * 100
        : 0
      const interactionRate = wc.this_week.views > 0
        ? ((wc.this_week.likes + wc.this_week.comments + wc.this_week.shares) / wc.this_week.views) * 100
        : 0

      const score = computeHealthScore(wc.this_week.engagement, followersGrowthPct, interactionRate)
      const health = getHealthLabel(score)
      const conf = PLATFORM_CONFIG[wc.platform]

      return { platform: wc.platform, score, health, conf, followersGrowthPct, interactionRate, wc }
    })

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Award className="h-4 w-4" />
            Platform Health Score
            <Badge variant="outline" className="text-[10px] ml-auto">minggu ini</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {scores
            .sort((a, b) => b.score - a.score)
            .map(({ platform, score, health, conf }) => (
              <div key={platform} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <span>{conf?.icon}</span>
                    <span>{conf?.label}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn('text-xs font-semibold', health.color)}>
                      {health.label}
                    </span>
                    <span className="text-sm font-bold tabular-nums">{score}</span>
                  </span>
                </div>
                <Progress
                  value={score}
                  className={cn(
                    'h-2',
                    score >= 80 ? '[&>div]:bg-green-500' :
                    score >= 60 ? '[&>div]:bg-blue-500' :
                    score >= 40 ? '[&>div]:bg-yellow-500' :
                    score >= 20 ? '[&>div]:bg-orange-500' :
                    '[&>div]:bg-red-500'
                  )}
                />
                <div className="flex gap-4 text-[10px] text-muted-foreground">
                  <span>Engagement: {scores.find(s => s.platform === platform)?.wc.this_week.engagement.toFixed(2)}%</span>
                  <span>Growth: {scores.find(s => s.platform === platform)?.followersGrowthPct.toFixed(2)}%</span>
                  <span>Interaction: {scores.find(s => s.platform === platform)?.interactionRate.toFixed(2)}%</span>
                </div>
              </div>
            ))}
          <p className="text-[10px] text-muted-foreground border-t pt-2">
            Health Score = Engagement Rate (40%) + Follower Growth (30%) + Interaction Rate (30%). Max 100.
          </p>
        </CardContent>
      </Card>
    )
  }

  // =====================================================
  // 7. Growth Velocity (Followers Gained per Day)
  // =====================================================

  const GrowthVelocity = () => {
    if (dailyData.length < 3) return (
      <EmptyState icon={TrendingUp} title="Follower Growth Velocity" />
    )

    const growthData = dailyData.slice(-14).map((day: any) => {
      const entry: any = { date: day.date }
      for (const p of activePlatforms) {
        entry[`${p}`] = day[`${p}_followers_gained`] || 0
      }
      return entry
    })

    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Follower Growth Velocity (14 Hari Terakhir)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tickFormatter={formatNumber} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number) => formatNumber(value)}
                  labelFormatter={(label) => new Date(label).toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                />
                <Legend />
                {activePlatforms.map(p => (
                  <Line
                    key={p}
                    type="monotone"
                    dataKey={p}
                    name={PLATFORM_CONFIG[p]?.label || p}
                    stroke={PLATFORM_CONFIG[p]?.color || '#666'}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    )
  }

  // =====================================================
  // 8. Engagement per Platform (Bar Comparison)
  // =====================================================

  const EngagementBarComparison = () => {
    if (crossPlatformData.length === 0) return (
      <EmptyState icon={Zap} title="Engagement Per Platform" />
    )

    const barData = crossPlatformData.map(d => ({
      name: PLATFORM_CONFIG[d.platform]?.label || d.platform,
      icon: PLATFORM_CONFIG[d.platform]?.icon || '',
      Likes: d.likes,
      Comments: d.comments,
      Shares: d.shares,
      color: PLATFORM_CONFIG[d.platform]?.color || '#666',
    }))

    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Engagement Per Platform
            <Badge variant="outline" className="text-[10px]">{period} hari</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tickFormatter={formatNumber} tick={{ fontSize: 11 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 11 }}
                  width={80}
                />
                <Tooltip formatter={(value: number) => formatNumber(value)} />
                <Legend />
                <Bar dataKey="Likes" fill="#ef4444" stackId="eng" />
                <Bar dataKey="Comments" fill="#8b5cf6" stackId="eng" />
                <Bar dataKey="Shares" fill="#3b82f6" stackId="eng" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    )
  }

  // =====================================================
  // Render All Sections
  // =====================================================

  return (
    <div className="space-y-6">
      {/* KPI Summary */}
      <KPISummary />

      {/* Weekly Comparison Table */}
      <WeeklyComparisonSection />

      {/* Charts Row 1: Weekly Trend + Engagement Composition */}
      <div className="grid gap-4 md:grid-cols-2">
        <WeeklyTrendChart />
        <EngagementComposition />
      </div>

      {/* Charts Row 2: Cross-Platform Radar + Health Score */}
      <div className="grid gap-4 md:grid-cols-2">
        <CrossPlatformRadar />
        <PlatformHealthScores />
      </div>

      {/* Charts Row 3: Growth Velocity + Engagement Bars */}
      <div className="grid gap-4 md:grid-cols-2">
        <GrowthVelocity />
        <EngagementBarComparison />
      </div>
    </div>
  )
}
