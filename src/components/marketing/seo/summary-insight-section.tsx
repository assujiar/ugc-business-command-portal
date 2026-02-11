'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Lightbulb,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// =====================================================
// Types
// =====================================================

interface SummaryInsightProps {
  seoData: any  // from /api/marketing/seo-sem/overview
  adsData: any  // from /api/marketing/seo-sem/ads
  dateRange: string  // '7d', '30d', '90d', 'ytd'
  loading: boolean
}

// =====================================================
// Formatting helpers
// =====================================================

function fmt(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString('id-ID')
}

function fmtCurrency(n: number): string {
  if (n >= 1000000) return `Rp${(n / 1000000).toFixed(1)}jt`
  if (n >= 1000) return `Rp${(n / 1000).toFixed(0)}rb`
  return `Rp${n.toLocaleString('id-ID')}`
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function formatDateId(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function getPeriodLabel(dateRange: string): string {
  switch (dateRange) {
    case '7d': return '7 hari terakhir'
    case '30d': return '30 hari terakhir'
    case '90d': return '90 hari terakhir'
    case 'ytd': return 'Year-to-Date (dari awal tahun)'
    default: return dateRange
  }
}

function getDaysCount(dateRange: string): number {
  switch (dateRange) {
    case '7d': return 7
    case '30d': return 30
    case '90d': return 90
    case 'ytd': {
      const now = new Date()
      const start = new Date(now.getFullYear(), 0, 1)
      return Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    }
    default: return 30
  }
}

// =====================================================
// Skeleton components
// =====================================================

function SectionSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-4 w-5/6" />
      </CardContent>
    </Card>
  )
}

function InsightCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-4/5" />
      </CardContent>
    </Card>
  )
}

function HighlightSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <Skeleton className="h-3 w-24 mb-2" />
        <Skeleton className="h-7 w-20 mb-1" />
        <Skeleton className="h-3 w-16" />
      </CardContent>
    </Card>
  )
}

// =====================================================
// Insight card component
// =====================================================

function InsightCard({
  icon,
  title,
  body,
  accentColor,
}: {
  icon: string
  title: string
  body: string
  accentColor: string
}) {
  return (
    <Card className="h-full">
      <CardContent className="p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className={cn(
              'flex items-center justify-center h-9 w-9 rounded-lg text-lg',
              accentColor
            )}
          >
            {icon}
          </div>
          <h4 className="text-sm font-semibold">{title}</h4>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {body}
        </p>
      </CardContent>
    </Card>
  )
}

// =====================================================
// Highlight metric card
// =====================================================

function HighlightCard({
  label,
  value,
  yoy,
  invertYoy,
}: {
  label: string
  value: string
  yoy?: number
  invertYoy?: boolean
}) {
  const hasYoy = typeof yoy === 'number' && yoy !== 0
  const isPositive = invertYoy ? (yoy ?? 0) < 0 : (yoy ?? 0) > 0
  const isNegative = invertYoy ? (yoy ?? 0) > 0 : (yoy ?? 0) < 0

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
          {label}
        </p>
        <p className="text-xl font-bold tracking-tight mb-1">{value}</p>
        {hasYoy ? (
          <div className="flex items-center gap-1">
            {isPositive ? (
              <TrendingUp className="h-3 w-3 text-green-600" />
            ) : isNegative ? (
              <TrendingDown className="h-3 w-3 text-red-500" />
            ) : null}
            <span
              className={cn(
                'text-xs font-medium',
                isPositive
                  ? 'text-green-600'
                  : isNegative
                    ? 'text-red-500'
                    : 'text-muted-foreground'
              )}
            >
              {(yoy ?? 0) > 0 ? '+' : ''}
              {(yoy ?? 0).toFixed(1)}% YoY
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">-- YoY</span>
        )}
      </CardContent>
    </Card>
  )
}

// =====================================================
// Main component
// =====================================================

export function SummaryInsightSection({
  seoData,
  adsData,
  dateRange,
  loading,
}: SummaryInsightProps) {
  // ----- Loading state -----
  if (loading) {
    return (
      <div className="space-y-6">
        <SectionSkeleton />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <InsightCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <HighlightSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  // ----- No data state -----
  const hasAnySeoData = seoData?.kpis
  const hasAnyAdsData = adsData?.kpis

  if (!hasAnySeoData && !hasAnyAdsData) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <HelpCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Belum ada data untuk ditampilkan. Pastikan koneksi ke Google Search Console
            dan/atau Google Ads sudah dikonfigurasi di tab Settings.
          </p>
        </CardContent>
      </Card>
    )
  }

  // ----- Extract SEO data -----
  const kpis = seoData?.kpis
  const totalClicks = kpis?.totalClicks?.value ?? 0
  const totalImpressions = kpis?.totalImpressions?.value ?? 0
  const avgCtr = kpis?.avgCtr?.value ?? 0
  const avgPosition = kpis?.avgPosition?.value ?? 0

  const clicksChange = kpis?.totalClicks?.change ?? 0
  const clicksYoy = kpis?.totalClicks?.yoy ?? 0
  const impressionsYoy = kpis?.totalImpressions?.yoy ?? 0
  const ctrYoy = kpis?.avgCtr?.yoy ?? 0
  const positionYoy = kpis?.avgPosition?.yoy ?? 0

  // Device breakdown
  const deviceBreakdown = seoData?.deviceBreakdown
  const totalDeviceClicks =
    (deviceBreakdown?.desktop ?? 0) +
    (deviceBreakdown?.mobile ?? 0) +
    (deviceBreakdown?.tablet ?? 0)
  const desktopPct =
    totalDeviceClicks > 0
      ? ((deviceBreakdown?.desktop ?? 0) / totalDeviceClicks * 100).toFixed(1)
      : '0'
  const mobilePct =
    totalDeviceClicks > 0
      ? ((deviceBreakdown?.mobile ?? 0) / totalDeviceClicks * 100).toFixed(1)
      : '0'
  const tabletPct =
    totalDeviceClicks > 0
      ? ((deviceBreakdown?.tablet ?? 0) / totalDeviceClicks * 100).toFixed(1)
      : '0'
  const mobilePctNum = parseFloat(mobilePct)

  // Date range
  const startDate = seoData?.dateRange?.start ?? ''
  const endDate = seoData?.dateRange?.end ?? ''
  const periodLabel = getPeriodLabel(dateRange)
  const daysCount = getDaysCount(dateRange)

  // ----- Extract Ads data -----
  const adsKpis = adsData?.kpis
  const adsActive = !!adsKpis && (adsKpis.totalSpend?.value ?? 0) > 0
  const totalSpend = adsKpis?.totalSpend?.value ?? 0
  const totalConversions = adsKpis?.totalConversions?.value ?? 0
  const roas = adsKpis?.overallRoas?.value ?? 0

  // Trend direction
  const seoImproving = clicksChange > 0
  const seoDeclining = clicksChange < 0

  // =====================================================
  // Section 1: Ringkasan Performa
  // =====================================================

  const summaryParts: string[] = []

  if (hasAnySeoData) {
    summaryParts.push(
      `Dalam ${periodLabel}, website menerima ${fmt(totalClicks)} klik organik dan ${fmt(totalImpressions)} impressions dari Google. Rata-rata posisi di halaman pencarian adalah ${avgPosition.toFixed(1)}.`
    )
  }

  if (adsActive) {
    summaryParts.push(
      `Total belanja iklan sebesar ${fmtCurrency(totalSpend)} menghasilkan ${fmt(totalConversions)} konversi dengan ROAS ${roas.toFixed(1)}x.`
    )
  }

  if (hasAnySeoData && clicksChange !== 0) {
    summaryParts.push(
      `Dibandingkan periode sebelumnya, klik organik ${clicksChange > 0 ? 'naik' : 'turun'} ${Math.abs(clicksChange).toFixed(1)}%.`
    )
  }

  if (hasAnySeoData && clicksYoy !== 0) {
    summaryParts.push(
      `Dibandingkan periode yang sama tahun lalu (YoY), klik organik ${clicksYoy > 0 ? 'naik' : 'turun'} ${Math.abs(clicksYoy).toFixed(1)}%.`
    )
  }

  // =====================================================
  // Section 2: 5W+1H Insights
  // =====================================================

  // APA (What)
  let apaBody = ''
  if (hasAnySeoData) {
    apaBody += `Website UGC mendapat total ${fmt(totalClicks)} klik organik. `
  }
  if (adsActive) {
    apaBody += `Campaign Google Ads menghabiskan ${fmtCurrency(totalSpend)} dan mendapat ${fmt(totalConversions)} konversi. `
  }
  if (hasAnySeoData) {
    apaBody += `CTR rata-rata ${fmtPct(avgCtr)}.`
  }
  if (!apaBody) apaBody = 'Belum ada data performa yang tersedia.'

  // SIAPA (Who)
  let siapaBody = ''
  if (totalDeviceClicks > 0) {
    siapaBody = `${desktopPct}% pengunjung menggunakan Desktop, ${mobilePct}% Mobile, ${tabletPct}% Tablet. `
    if (mobilePctNum > 50) {
      siapaBody += 'Mayoritas pengunjung mengakses via Mobile - pastikan website mobile-friendly.'
    } else {
      siapaBody += 'Mayoritas pengunjung mengakses via Desktop.'
    }
  } else {
    siapaBody = 'Data distribusi perangkat belum tersedia untuk periode ini.'
  }

  // KAPAN (When)
  let kapanBody = ''
  if (startDate && endDate) {
    kapanBody = `Data ini mencakup periode ${formatDateId(startDate)} sampai ${formatDateId(endDate)}. `
    if (dateRange === 'ytd') {
      kapanBody += 'Year-to-Date (dari awal tahun).'
    } else {
      kapanBody += `${daysCount} hari terakhir.`
    }
  } else {
    kapanBody = 'Periode data tidak tersedia.'
  }

  // DI MANA (Where)
  let dimanaBody = 'Traffic organik berasal dari Google Search. '
  if (adsActive) {
    dimanaBody += 'Paid traffic berasal dari Google Ads campaigns. '
  }
  dimanaBody +=
    'Halaman-halaman top performer dan keyword teratas bisa dilihat di tab Keywords dan Pages.'

  // MENGAPA (Why)
  const mengapaParts: string[] = []
  if (hasAnySeoData) {
    if (avgCtr > 0.05) {
      mengapaParts.push('CTR sangat baik (>5%), menunjukkan meta title/description yang menarik.')
    } else if (avgCtr < 0.02) {
      mengapaParts.push('CTR rendah (<2%), perlu optimasi meta title/description.')
    }

    if (avgPosition > 20) {
      mengapaParts.push(
        'Posisi rata-rata di luar halaman 2. Perlu strategi SEO yang lebih agresif.'
      )
    } else if (avgPosition > 0 && avgPosition < 5) {
      mengapaParts.push('Posisi rata-rata di halaman 1 Google - pertahankan!')
    } else if (avgPosition >= 5 && avgPosition <= 10) {
      mengapaParts.push(
        'Posisi rata-rata di halaman 1 Google, namun masih bisa ditingkatkan ke top 5.'
      )
    } else if (avgPosition > 10 && avgPosition <= 20) {
      mengapaParts.push(
        'Posisi rata-rata di halaman 2 Google. Perlu peningkatan konten dan backlink untuk masuk halaman 1.'
      )
    }
  }

  if (adsActive) {
    if (roas > 3) {
      mengapaParts.push('ROAS iklan di atas 3x - campaign sangat profitable.')
    } else if (roas >= 1 && roas <= 3) {
      mengapaParts.push('ROAS iklan di antara 1-3x - campaign cukup baik, masih bisa dioptimasi.')
    } else if (roas > 0 && roas < 1) {
      mengapaParts.push('ROAS di bawah 1x - campaign belum profitable, perlu optimasi.')
    }
  }

  if (mengapaParts.length === 0) {
    mengapaParts.push('Data belum cukup untuk menghasilkan insight mendalam.')
  }
  const mengapaBody = mengapaParts.join(' ')

  // BAGAIMANA (How)
  const bagaimanaParts: string[] = []
  bagaimanaParts.push('Pantau dashboard ini secara rutin untuk mengidentifikasi tren.')

  if (seoImproving) {
    bagaimanaParts.push(
      'Tren SEO positif - lanjutkan strategi content dan backlink saat ini.'
    )
  } else if (seoDeclining) {
    bagaimanaParts.push(
      'Tren SEO menurun - evaluasi kembali strategi keyword dan content.'
    )
  }

  if (adsActive) {
    bagaimanaParts.push(
      'Evaluasi campaign yang ROAS-nya rendah, alokasi budget ke campaign terbaik.'
    )
  }

  const bagaimanaBody = bagaimanaParts.join(' ')

  const insightCards = [
    {
      icon: '\uD83D\uDCCB',
      title: 'APA (What)',
      body: apaBody,
      accentColor: 'bg-blue-100 dark:bg-blue-950',
    },
    {
      icon: '\uD83D\uDC65',
      title: 'SIAPA (Who)',
      body: siapaBody,
      accentColor: 'bg-purple-100 dark:bg-purple-950',
    },
    {
      icon: '\uD83D\uDCC5',
      title: 'KAPAN (When)',
      body: kapanBody,
      accentColor: 'bg-amber-100 dark:bg-amber-950',
    },
    {
      icon: '\uD83D\uDCCD',
      title: 'DI MANA (Where)',
      body: dimanaBody,
      accentColor: 'bg-green-100 dark:bg-green-950',
    },
    {
      icon: '\uD83D\uDCA1',
      title: 'MENGAPA (Why)',
      body: mengapaBody,
      accentColor: 'bg-orange-100 dark:bg-orange-950',
    },
    {
      icon: '\uD83D\uDE80',
      title: 'BAGAIMANA (How)',
      body: bagaimanaBody,
      accentColor: 'bg-teal-100 dark:bg-teal-950',
    },
  ]

  // =====================================================
  // Section 3: Highlight Metrics
  // =====================================================

  const highlights: {
    label: string
    value: string
    yoy?: number
    invertYoy?: boolean
  }[] = []

  if (hasAnySeoData) {
    highlights.push({
      label: 'Organic Clicks',
      value: fmt(totalClicks),
      yoy: clicksYoy,
    })
    highlights.push({
      label: 'Avg. Position',
      value: avgPosition.toFixed(1),
      yoy: positionYoy,
      invertYoy: true,
    })
  }

  if (adsActive) {
    highlights.push({
      label: 'Ad Spend',
      value: fmtCurrency(totalSpend),
      yoy: adsKpis?.totalSpend?.yoy,
    })
    highlights.push({
      label: 'ROAS',
      value: `${roas.toFixed(1)}x`,
      yoy: adsKpis?.overallRoas?.yoy,
    })
  }

  // Fill remaining slots if we have fewer than 4
  if (highlights.length < 4 && hasAnySeoData) {
    if (!highlights.find((h) => h.label === 'Impressions')) {
      highlights.push({
        label: 'Impressions',
        value: fmt(totalImpressions),
        yoy: impressionsYoy,
      })
    }
  }
  if (highlights.length < 4 && hasAnySeoData) {
    if (!highlights.find((h) => h.label === 'Avg. CTR')) {
      highlights.push({
        label: 'Avg. CTR',
        value: fmtPct(avgCtr),
        yoy: ctrYoy,
      })
    }
  }

  // Trim to max 4
  const displayHighlights = highlights.slice(0, 4)

  // =====================================================
  // Render
  // =====================================================

  return (
    <div className="space-y-6">
      {/* ================================================
          Section 1: Ringkasan Performa
          ================================================ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
              <Lightbulb className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base font-semibold">
              Ringkasan Performa
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {summaryParts.length > 0 ? (
            <div className="space-y-2">
              {summaryParts.map((text, i) => (
                <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                  {text}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Belum ada data ringkasan yang tersedia.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ================================================
          Section 2: Insight 5W+1H
          ================================================ */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Insight 5W+1H</h3>
          <Badge variant="secondary" className="text-[10px]">
            Analisis Otomatis
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {insightCards.map((card) => (
            <InsightCard
              key={card.title}
              icon={card.icon}
              title={card.title}
              body={card.body}
              accentColor={card.accentColor}
            />
          ))}
        </div>
      </div>

      {/* ================================================
          Section 3: Highlight Metrics
          ================================================ */}
      {displayHighlights.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Highlight Metrics</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {displayHighlights.map((h) => (
              <HighlightCard
                key={h.label}
                label={h.label}
                value={h.value}
                yoy={h.yoy}
                invertYoy={h.invertYoy}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
