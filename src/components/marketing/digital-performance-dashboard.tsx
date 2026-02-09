'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Globe,
  Users,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Calendar,
  Clock,
  AlertCircle,
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { cn } from '@/lib/utils'
import { ContentPerformanceTable } from './content-performance-table'

// Platform definitions
const PLATFORMS = [
  { id: 'all', label: 'All Platforms', color: '#6366f1' },
  { id: 'tiktok', label: 'TikTok', color: '#000000', icon: '🎵' },
  { id: 'instagram', label: 'Instagram', color: '#E4405F', icon: '📸' },
  { id: 'youtube', label: 'YouTube', color: '#FF0000', icon: '▶️' },
  { id: 'facebook', label: 'Facebook', color: '#1877F2', icon: '📘' },
  { id: 'linkedin', label: 'LinkedIn', color: '#0A66C2', icon: '💼' },
] as const

type PlatformId = typeof PLATFORMS[number]['id']

// Period options
const PERIODS = [
  { value: '7', label: '7 Hari' },
  { value: '14', label: '14 Hari' },
  { value: '30', label: '30 Hari' },
  { value: '90', label: '90 Hari' },
] as const

interface PlatformSummary {
  platform: string
  followers_count: number
  followers_gained: number
  views_gained: number
  likes_gained: number
  comments_gained: number
  shares_gained: number
  avg_engagement_rate: number
}

interface DailyData {
  date: string
  tiktok_followers?: number
  instagram_followers?: number
  youtube_followers?: number
  facebook_followers?: number
  linkedin_followers?: number
  tiktok_engagement?: number
  instagram_engagement?: number
  youtube_engagement?: number
  facebook_engagement?: number
  linkedin_engagement?: number
  tiktok_views?: number
  instagram_views?: number
  youtube_views?: number
  facebook_views?: number
  linkedin_views?: number
}

interface LatestSnapshot {
  platform: string
  followers_count: number
  following_count: number
  posts_count: number
  total_views: number
  total_likes: number
  total_comments: number
  total_shares: number
  total_saves: number
  engagement_rate: number
  reach: number
  impressions: number
  fetched_at: string
  fetch_status: string
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString('id-ID')
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

function TrendIndicator({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
        <TrendingUp className="h-3 w-3" />+{formatNumber(value)}
      </span>
    )
  }
  if (value < 0) {
    return (
      <span className="flex items-center gap-1 text-red-600 text-xs font-medium">
        <TrendingDown className="h-3 w-3" />{formatNumber(value)}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs">
      <Minus className="h-3 w-3" />0
    </span>
  )
}

function getPlatformConfig(platformId: string) {
  return PLATFORMS.find(p => p.id === platformId) || PLATFORMS[0]
}

export function DigitalPerformanceDashboard() {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId>('all')
  const [period, setPeriod] = useState('30')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<PlatformSummary[]>([])
  const [dailyData, setDailyData] = useState<DailyData[]>([])
  const [latestSnapshots, setLatestSnapshots] = useState<LatestSnapshot[]>([])
  const [lastFetchTime, setLastFetchTime] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ days: period })
      if (selectedPlatform !== 'all') {
        params.set('platform', selectedPlatform)
      }

      const response = await fetch(`/api/marketing/social-media/analytics?${params}`)
      if (!response.ok) {
        throw new Error('Gagal mengambil data analytics')
      }

      const data = await response.json()
      setSummaries(data.summaries || [])
      setDailyData(data.daily_data || [])
      setLatestSnapshots(data.latest_snapshots || [])
      setLastFetchTime(data.last_fetch_time || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [period, selectedPlatform])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const activePlatforms = PLATFORMS.filter(p => p.id !== 'all')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6" />
            Digital Channel Performance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analitik performa sosial media - TikTok, Instagram, YouTube, Facebook, LinkedIn
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastFetchTime && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Update: {new Date(lastFetchTime).toLocaleString('id-ID')}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={selectedPlatform} onValueChange={(v) => setSelectedPlatform(v as PlatformId)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            {PLATFORMS.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {'icon' in p ? `${p.icon} ` : ''}{p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Periode" />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map(p => (
              <SelectItem key={p.value} value={p.value}>
                <Calendar className="h-3 w-3 inline mr-1" />{p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                Data akan muncul setelah API platform dikonfigurasi dan cron job berjalan.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform Overview Cards */}
      {loading ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {activePlatforms.map(p => (
            <Skeleton key={p.id} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {activePlatforms.map(platform => {
            const summary = summaries.find(s => s.platform === platform.id)
            const snapshot = latestSnapshots.find(s => s.platform === platform.id)
            const isSelected = selectedPlatform === platform.id

            return (
              <Card
                key={platform.id}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md',
                  isSelected && 'ring-2 ring-brand'
                )}
                onClick={() => setSelectedPlatform(
                  selectedPlatform === platform.id ? 'all' : platform.id as PlatformId
                )}
              >
                <CardHeader className="pb-2 p-3">
                  <CardTitle className="text-xs font-medium flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span>{platform.icon}</span>
                      <span>{platform.label}</span>
                    </span>
                    {snapshot?.fetch_status === 'success' && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                        Live
                      </Badge>
                    )}
                    {!snapshot && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        No Data
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-2">
                  <div>
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      <span className="text-lg font-bold">
                        {snapshot ? formatNumber(snapshot.followers_count) : '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">Followers</span>
                      {summary && <TrendIndicator value={summary.followers_gained} />}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <div>
                      <Eye className="h-2.5 w-2.5 inline text-muted-foreground" />
                      <span className="ml-0.5">{summary ? formatNumber(summary.views_gained) : '-'}</span>
                    </div>
                    <div>
                      <Heart className="h-2.5 w-2.5 inline text-muted-foreground" />
                      <span className="ml-0.5">{summary ? formatNumber(summary.likes_gained) : '-'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Charts Section */}
      {!loading && dailyData.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Followers Trend Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Followers Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis tickFormatter={formatNumber} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number) => formatNumber(value)}
                      labelFormatter={(label) => new Date(label).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'long', year: 'numeric'
                      })}
                    />
                    <Legend />
                    {(selectedPlatform === 'all' || selectedPlatform === 'tiktok') && (
                      <Line type="monotone" dataKey="tiktok_followers" name="TikTok" stroke="#000" strokeWidth={2} dot={false} />
                    )}
                    {(selectedPlatform === 'all' || selectedPlatform === 'instagram') && (
                      <Line type="monotone" dataKey="instagram_followers" name="Instagram" stroke="#E4405F" strokeWidth={2} dot={false} />
                    )}
                    {(selectedPlatform === 'all' || selectedPlatform === 'youtube') && (
                      <Line type="monotone" dataKey="youtube_followers" name="YouTube" stroke="#FF0000" strokeWidth={2} dot={false} />
                    )}
                    {(selectedPlatform === 'all' || selectedPlatform === 'facebook') && (
                      <Line type="monotone" dataKey="facebook_followers" name="Facebook" stroke="#1877F2" strokeWidth={2} dot={false} />
                    )}
                    {(selectedPlatform === 'all' || selectedPlatform === 'linkedin') && (
                      <Line type="monotone" dataKey="linkedin_followers" name="LinkedIn" stroke="#0A66C2" strokeWidth={2} dot={false} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Engagement Rate Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Heart className="h-4 w-4" />
                Engagement Rate (%)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number) => `${value.toFixed(2)}%`}
                      labelFormatter={(label) => new Date(label).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'long', year: 'numeric'
                      })}
                    />
                    <Legend />
                    {(selectedPlatform === 'all' || selectedPlatform === 'tiktok') && (
                      <Line type="monotone" dataKey="tiktok_engagement" name="TikTok" stroke="#000" strokeWidth={2} dot={false} />
                    )}
                    {(selectedPlatform === 'all' || selectedPlatform === 'instagram') && (
                      <Line type="monotone" dataKey="instagram_engagement" name="Instagram" stroke="#E4405F" strokeWidth={2} dot={false} />
                    )}
                    {(selectedPlatform === 'all' || selectedPlatform === 'youtube') && (
                      <Line type="monotone" dataKey="youtube_engagement" name="YouTube" stroke="#FF0000" strokeWidth={2} dot={false} />
                    )}
                    {(selectedPlatform === 'all' || selectedPlatform === 'facebook') && (
                      <Line type="monotone" dataKey="facebook_engagement" name="Facebook" stroke="#1877F2" strokeWidth={2} dot={false} />
                    )}
                    {(selectedPlatform === 'all' || selectedPlatform === 'linkedin') && (
                      <Line type="monotone" dataKey="linkedin_engagement" name="LinkedIn" stroke="#0A66C2" strokeWidth={2} dot={false} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Views / Reach Chart */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Daily Views / Reach
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis tickFormatter={formatNumber} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number) => formatNumber(value)}
                      labelFormatter={(label) => new Date(label).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'long', year: 'numeric'
                      })}
                    />
                    <Legend />
                    {(selectedPlatform === 'all' || selectedPlatform === 'tiktok') && (
                      <Bar dataKey="tiktok_views" name="TikTok" fill="#000" stackId="views" />
                    )}
                    {(selectedPlatform === 'all' || selectedPlatform === 'instagram') && (
                      <Bar dataKey="instagram_views" name="Instagram" fill="#E4405F" stackId="views" />
                    )}
                    {(selectedPlatform === 'all' || selectedPlatform === 'youtube') && (
                      <Bar dataKey="youtube_views" name="YouTube" fill="#FF0000" stackId="views" />
                    )}
                    {(selectedPlatform === 'all' || selectedPlatform === 'facebook') && (
                      <Bar dataKey="facebook_views" name="Facebook" fill="#1877F2" stackId="views" />
                    )}
                    {(selectedPlatform === 'all' || selectedPlatform === 'linkedin') && (
                      <Bar dataKey="linkedin_views" name="LinkedIn" fill="#0A66C2" stackId="views" />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Platform Cards */}
      {!loading && latestSnapshots.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Detail Per Platform</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activePlatforms.map(platform => {
              const snapshot = latestSnapshots.find(s => s.platform === platform.id)
              const summary = summaries.find(s => s.platform === platform.id)

              if (selectedPlatform !== 'all' && selectedPlatform !== platform.id) return null
              if (!snapshot) return null

              return (
                <Card key={platform.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <span className="text-lg">{platform.icon}</span>
                      <span>{platform.label}</span>
                      <Badge
                        variant="outline"
                        className="ml-auto text-[10px]"
                        style={{ borderColor: platform.color, color: platform.color }}
                      >
                        {snapshot.fetch_status === 'success' ? 'Connected' : snapshot.fetch_status}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-2 rounded bg-muted/50">
                        <div className="flex items-center gap-1 mb-1">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">Followers</span>
                        </div>
                        <p className="text-base font-bold">{formatNumber(snapshot.followers_count)}</p>
                        {summary && <TrendIndicator value={summary.followers_gained} />}
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <div className="flex items-center gap-1 mb-1">
                          <Eye className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">Views</span>
                        </div>
                        <p className="text-base font-bold">{formatNumber(snapshot.total_views)}</p>
                        {summary && <TrendIndicator value={summary.views_gained} />}
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <div className="flex items-center gap-1 mb-1">
                          <Heart className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">Likes</span>
                        </div>
                        <p className="text-base font-bold">{formatNumber(snapshot.total_likes)}</p>
                        {summary && <TrendIndicator value={summary.likes_gained} />}
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <div className="flex items-center gap-1 mb-1">
                          <MessageCircle className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">Comments</span>
                        </div>
                        <p className="text-base font-bold">{formatNumber(snapshot.total_comments)}</p>
                        {summary && <TrendIndicator value={summary.comments_gained} />}
                      </div>
                    </div>

                    {/* Additional Metrics */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Shares</p>
                        <p className="text-sm font-semibold">{formatNumber(snapshot.total_shares)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Engagement</p>
                        <p className="text-sm font-semibold">{snapshot.engagement_rate.toFixed(2)}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Posts</p>
                        <p className="text-sm font-semibold">{formatNumber(snapshot.posts_count)}</p>
                      </div>
                    </div>

                    {/* Last updated */}
                    <p className="text-[10px] text-muted-foreground text-right">
                      Updated: {new Date(snapshot.fetched_at).toLocaleString('id-ID')}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Content-Level Performance */}
      <ContentPerformanceTable
        selectedPlatform={selectedPlatform}
        period={period}
      />

      {/* Empty state when no data */}
      {!loading && latestSnapshots.length === 0 && !error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Globe className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Belum Ada Data</h2>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              Data analytics sosial media akan tersedia setelah API platform dikonfigurasi
              dan cron job mulai berjalan. Data diambil otomatis 3x sehari (08:00, 12:00, 17:00 WIB).
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Platform yang didukung:</p>
              <div className="flex gap-2 flex-wrap justify-center mt-2">
                {activePlatforms.map(p => (
                  <Badge key={p.id} variant="outline">
                    {p.icon} {p.label}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
