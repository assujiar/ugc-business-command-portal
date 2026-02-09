'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Search,
  ArrowUpDown,
  ExternalLink,
  Trophy,
  Film,
  Image,
  FileText,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const PLATFORM_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  tiktok: { label: 'TikTok', icon: '🎵', color: '#000000' },
  instagram: { label: 'Instagram', icon: '📸', color: '#E4405F' },
  youtube: { label: 'YouTube', icon: '▶️', color: '#FF0000' },
  facebook: { label: 'Facebook', icon: '📘', color: '#1877F2' },
  linkedin: { label: 'LinkedIn', icon: '💼', color: '#0A66C2' },
}

const CONTENT_TYPE_ICONS: Record<string, typeof Film> = {
  video: Film,
  reel: Zap,
  short: Zap,
  post: Image,
  carousel: Image,
  story: Image,
  live: Film,
  article: FileText,
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString('id-ID')
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

interface ContentItem {
  id: number
  platform: string
  content_id: string
  content_type: string
  title: string | null
  caption: string | null
  url: string | null
  thumbnail_url: string | null
  published_at: string | null
  hashtags: string[]
  views_count: number
  likes_count: number
  comments_count: number
  shares_count: number
  saves_count: number
  reach: number
  impressions: number
  engagement_rate: number
  click_count: number
  video_duration_seconds: number | null
  avg_watch_time_seconds: number | null
  watch_through_rate: number | null
  extra_metrics: Record<string, any>
}

interface ContentPerformanceProps {
  selectedPlatform?: string
  period?: string
}

export function ContentPerformanceTable({ selectedPlatform = 'all', period = '30' }: ContentPerformanceProps) {
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState<ContentItem[]>([])
  const [topContent, setTopContent] = useState<ContentItem[]>([])
  const [stats, setStats] = useState<any>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [sortBy, setSortBy] = useState('published_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [contentType, setContentType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchContent = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        days: period,
        page: page.toString(),
        limit: '15',
        sort_by: sortBy,
        sort_order: sortOrder,
      })

      if (selectedPlatform !== 'all') params.set('platform', selectedPlatform)
      if (contentType !== 'all') params.set('content_type', contentType)
      if (searchQuery) params.set('search', searchQuery)

      const response = await fetch(`/api/marketing/social-media/content?${params}`)
      if (!response.ok) throw new Error('Failed to fetch content')

      const data = await response.json()
      setContent(data.content || [])
      setTopContent(data.top_content || [])
      setStats(data.stats || null)
      setTotal(data.total || 0)
      setTotalPages(data.total_pages || 1)
    } catch (err) {
      console.error('Content fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedPlatform, period, page, sortBy, sortOrder, contentType, searchQuery])

  useEffect(() => {
    fetchContent()
  }, [fetchContent])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [selectedPlatform, contentType, searchQuery, sortBy])

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const SortButton = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors"
      onClick={() => handleSort(field)}
    >
      {children}
      <ArrowUpDown className={cn('h-3 w-3', sortBy === field ? 'text-brand' : 'text-muted-foreground')} />
    </button>
  )

  return (
    <div className="space-y-4">
      {/* Top Performing Content */}
      {topContent.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Top Performing Content
              <Badge variant="outline" className="text-[10px]">{period} hari terakhir</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {topContent.slice(0, 8).map((item, idx) => {
                const platformConf = PLATFORM_CONFIG[item.platform]
                const ContentIcon = CONTENT_TYPE_ICONS[item.content_type] || FileText

                return (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{platformConf?.icon}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          <ContentIcon className="h-2.5 w-2.5 mr-0.5" />
                          {item.content_type}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">#{idx + 1}</span>
                    </div>
                    <p className="text-xs font-medium line-clamp-2 mb-2 min-h-[2rem]">
                      {item.title || item.caption?.substring(0, 80) || 'Untitled'}
                    </p>
                    <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Eye className="h-2.5 w-2.5" />{formatNumber(item.views_count)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Heart className="h-2.5 w-2.5" />{formatNumber(item.likes_count)}
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="h-2.5 w-2.5" />{formatNumber(item.comments_count)}
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-2.5 w-2.5" />{item.engagement_rate.toFixed(2)}%
                      </div>
                    </div>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-brand hover:underline flex items-center gap-0.5 mt-2"
                      >
                        Lihat <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-sm font-medium">
              Semua Konten ({total})
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cari konten..."
                  className="h-8 pl-7 w-[180px] text-xs"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue placeholder="Tipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tipe</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="reel">Reel</SelectItem>
                  <SelectItem value="short">Short</SelectItem>
                  <SelectItem value="post">Post</SelectItem>
                  <SelectItem value="carousel">Carousel</SelectItem>
                  <SelectItem value="story">Story</SelectItem>
                  <SelectItem value="article">Article</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : content.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Belum ada data konten. Data akan tersedia setelah cron job berjalan dan API platform dikonfigurasi.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[280px] text-xs">Konten</TableHead>
                      <TableHead className="text-xs">Platform</TableHead>
                      <TableHead className="text-xs">
                        <SortButton field="views_count">Views</SortButton>
                      </TableHead>
                      <TableHead className="text-xs">
                        <SortButton field="likes_count">Likes</SortButton>
                      </TableHead>
                      <TableHead className="text-xs">
                        <SortButton field="comments_count">Comments</SortButton>
                      </TableHead>
                      <TableHead className="text-xs">
                        <SortButton field="shares_count">Shares</SortButton>
                      </TableHead>
                      <TableHead className="text-xs">
                        <SortButton field="engagement_rate">Eng. Rate</SortButton>
                      </TableHead>
                      <TableHead className="text-xs">
                        <SortButton field="published_at">Published</SortButton>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {content.map((item) => {
                      const platformConf = PLATFORM_CONFIG[item.platform]
                      const ContentIcon = CONTENT_TYPE_ICONS[item.content_type] || FileText

                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="flex items-start gap-2 min-w-[200px]">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium line-clamp-2">
                                  {item.title || item.caption?.substring(0, 100) || 'Untitled'}
                                </p>
                                <div className="flex items-center gap-1 mt-1">
                                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                                    <ContentIcon className="h-2.5 w-2.5 mr-0.5" />
                                    {item.content_type}
                                  </Badge>
                                  {item.url && (
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-brand hover:underline"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                                {item.hashtags && item.hashtags.length > 0 && (
                                  <div className="flex gap-1 mt-1 flex-wrap">
                                    {item.hashtags.slice(0, 3).map((tag, i) => (
                                      <span key={i} className="text-[9px] text-blue-500">#{tag}</span>
                                    ))}
                                    {item.hashtags.length > 3 && (
                                      <span className="text-[9px] text-muted-foreground">
                                        +{item.hashtags.length - 3}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{platformConf?.icon}</span>
                          </TableCell>
                          <TableCell className="text-xs font-medium tabular-nums">
                            {formatNumber(item.views_count)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {formatNumber(item.likes_count)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {formatNumber(item.comments_count)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {formatNumber(item.shares_count)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] tabular-nums',
                                item.engagement_rate >= 5 ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300' :
                                item.engagement_rate >= 2 ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300' :
                                'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300'
                              )}
                            >
                              {item.engagement_rate.toFixed(2)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {item.published_at ? timeAgo(item.published_at) : '-'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Halaman {page} dari {totalPages} ({total} konten)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(p => p - 1)}
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => p + 1)}
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

      {/* Content Type Distribution */}
      {stats?.content_type_distribution && Object.keys(stats.content_type_distribution).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Distribusi Tipe Konten</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {Object.entries(stats.content_type_distribution).map(([platform, types]: [string, any]) => {
                const platformConf = PLATFORM_CONFIG[platform]
                const totalForPlatform = Object.values(types as Record<string, number>).reduce((a: number, b: number) => a + b, 0)

                return (
                  <div key={platform} className="p-3 rounded-lg border">
                    <div className="flex items-center gap-2 mb-2">
                      <span>{platformConf?.icon}</span>
                      <span className="text-xs font-medium">{platformConf?.label}</span>
                      <Badge variant="outline" className="ml-auto text-[10px]">{totalForPlatform}</Badge>
                    </div>
                    <div className="space-y-1">
                      {Object.entries(types as Record<string, number>)
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([type, count]) => {
                          const Icon = CONTENT_TYPE_ICONS[type] || FileText
                          const pct = totalForPlatform > 0 ? ((count as number) / totalForPlatform * 100) : 0

                          return (
                            <div key={type} className="flex items-center justify-between text-[10px]">
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Icon className="h-2.5 w-2.5" />{type}
                              </span>
                              <span className="font-medium">{count as number} ({pct.toFixed(0)}%)</span>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
