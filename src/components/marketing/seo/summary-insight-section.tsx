'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Zap,
  Target,
  ArrowRight,
  CircleDot,
  AlertCircle,
  CheckCircle2,
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

function getPeriodLabel(dateRange: string): string {
  switch (dateRange) {
    case '7d': return '7 hari terakhir'
    case '30d': return '30 hari terakhir'
    case '90d': return '90 hari terakhir'
    case 'ytd': return 'year-to-date'
    default: return dateRange
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

function FindingsSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-36" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-start gap-2">
            <Skeleton className="h-4 w-4 mt-0.5 shrink-0" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
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
// Highlight metric card (kept from original)
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
// Finding item component
// =====================================================

function FindingItem({
  sentiment,
  text,
}: {
  sentiment: 'positive' | 'negative' | 'neutral'
  text: string
}) {
  const Icon =
    sentiment === 'positive'
      ? CheckCircle2
      : sentiment === 'negative'
        ? AlertCircle
        : CircleDot

  const colorClass =
    sentiment === 'positive'
      ? 'text-green-600 dark:text-green-500'
      : sentiment === 'negative'
        ? 'text-red-500 dark:text-red-400'
        : 'text-muted-foreground'

  return (
    <div className="flex items-start gap-2.5">
      <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', colorClass)} />
      <p className="text-sm leading-relaxed">{text}</p>
    </div>
  )
}

// =====================================================
// Recommendation item component
// =====================================================

function RecommendationItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
      <p className="text-sm leading-relaxed">{text}</p>
    </div>
  )
}

// =====================================================
// Data analysis helpers
// =====================================================

function generateFindings(
  hasAnySeoData: boolean,
  hasAdsData: boolean,
  seo: {
    totalClicks: number
    totalImpressions: number
    avgCtr: number
    avgPosition: number
    clicksYoy: number
    impressionsYoy: number
    ctrYoy: number
    positionYoy: number
    mobilePct: number
  },
  ads: {
    totalSpend: number
    totalConversions: number
    avgCpc: number
    avgCpa: number
    roas: number
    spendYoy: number
    roasYoy: number
  }
): { sentiment: 'positive' | 'negative' | 'neutral'; text: string }[] {
  const findings: { sentiment: 'positive' | 'negative' | 'neutral'; text: string }[] = []

  if (hasAnySeoData) {
    // CTR analysis
    const ctrPercent = seo.avgCtr * 100
    if (ctrPercent >= 3) {
      findings.push({
        sentiment: 'positive',
        text: `CTR organik ${ctrPercent.toFixed(1)}% -- di atas rata-rata industri (2-3%). Meta title dan description sudah cukup menarik perhatian pencari.`,
      })
    } else if (ctrPercent >= 2) {
      findings.push({
        sentiment: 'neutral',
        text: `CTR organik ${ctrPercent.toFixed(1)}% -- sesuai rata-rata industri. Masih ada ruang untuk meningkatkan daya tarik snippet di hasil pencarian.`,
      })
    } else if (ctrPercent > 0) {
      findings.push({
        sentiment: 'negative',
        text: `CTR organik hanya ${ctrPercent.toFixed(1)}% -- di bawah rata-rata industri (2-3%). Meta title dan description perlu dioptimasi agar lebih menarik klik.`,
      })
    }

    // Position analysis
    if (seo.avgPosition > 0 && seo.avgPosition <= 5) {
      findings.push({
        sentiment: 'positive',
        text: `Posisi rata-rata ${seo.avgPosition.toFixed(1)} -- website berada di top 5 Google. Posisi yang sangat kompetitif.`,
      })
    } else if (seo.avgPosition > 5 && seo.avgPosition <= 10) {
      findings.push({
        sentiment: 'neutral',
        text: `Posisi rata-rata ${seo.avgPosition.toFixed(1)} -- masih di halaman 1 Google, tapi belum masuk top 5. Peningkatan konten bisa mendorong naik.`,
      })
    } else if (seo.avgPosition > 10 && seo.avgPosition <= 20) {
      findings.push({
        sentiment: 'negative',
        text: `Posisi rata-rata ${seo.avgPosition.toFixed(1)} -- di halaman 2 Google. Sebagian besar klik terjadi di halaman 1, jadi ini perlu diperbaiki.`,
      })
    } else if (seo.avgPosition > 20) {
      findings.push({
        sentiment: 'negative',
        text: `Posisi rata-rata ${seo.avgPosition.toFixed(1)} -- terlalu jauh dari halaman 1. Butuh strategi SEO yang lebih agresif untuk naik peringkat.`,
      })
    }

    // Clicks YoY trend
    if (seo.clicksYoy > 10) {
      findings.push({
        sentiment: 'positive',
        text: `Klik organik tumbuh ${seo.clicksYoy.toFixed(1)}% YoY -- pertumbuhan yang sehat. Strategi konten berjalan baik.`,
      })
    } else if (seo.clicksYoy > 0) {
      findings.push({
        sentiment: 'neutral',
        text: `Klik organik naik tipis ${seo.clicksYoy.toFixed(1)}% YoY -- tumbuh tapi belum signifikan. Perlu akselerasi.`,
      })
    } else if (seo.clicksYoy < -10) {
      findings.push({
        sentiment: 'negative',
        text: `Klik organik turun ${Math.abs(seo.clicksYoy).toFixed(1)}% YoY -- penurunan yang perlu diinvestigasi segera.`,
      })
    } else if (seo.clicksYoy < 0) {
      findings.push({
        sentiment: 'negative',
        text: `Klik organik turun ${Math.abs(seo.clicksYoy).toFixed(1)}% YoY -- tren menurun yang perlu diwaspadai.`,
      })
    }

    // Mobile analysis
    if (seo.mobilePct > 60) {
      findings.push({
        sentiment: 'neutral',
        text: `${seo.mobilePct.toFixed(0)}% traffic datang dari mobile -- pastikan semua halaman penting sudah mobile-optimized dan loading cepat.`,
      })
    } else if (seo.mobilePct > 40) {
      findings.push({
        sentiment: 'neutral',
        text: `Traffic terbagi cukup merata: ${seo.mobilePct.toFixed(0)}% mobile, sisanya desktop/tablet. Optimasi kedua pengalaman.`,
      })
    }
  }

  if (hasAdsData) {
    // ROAS analysis (only when conversion values are tracked)
    if (ads.roas >= 5) {
      findings.push({
        sentiment: 'positive',
        text: `ROAS ${ads.roas.toFixed(1)}x -- setiap Rp1 yang dibelanjakan menghasilkan Rp${ads.roas.toFixed(0)} revenue. Campaign sangat profitable.`,
      })
    } else if (ads.roas >= 3) {
      findings.push({
        sentiment: 'positive',
        text: `ROAS ${ads.roas.toFixed(1)}x -- campaign profitable. Masih ada potensi scale up dengan budget tambahan.`,
      })
    } else if (ads.roas >= 1) {
      findings.push({
        sentiment: 'neutral',
        text: `ROAS ${ads.roas.toFixed(1)}x -- campaign menghasilkan profit tipis. Perlu optimasi targeting dan bidding untuk meningkatkan return.`,
      })
    } else if (ads.roas > 0) {
      findings.push({
        sentiment: 'negative',
        text: `ROAS hanya ${ads.roas.toFixed(1)}x -- campaign belum profitable. Evaluasi segera campaign mana yang menguras budget tanpa hasil.`,
      })
    } else if (ads.roas === 0 && ads.totalConversions > 0) {
      findings.push({
        sentiment: 'neutral',
        text: `ROAS belum bisa dihitung -- conversion value belum dikonfigurasi di Google Ads. Aktifkan pelacakan nilai konversi untuk mengukur profitabilitas campaign.`,
      })
    }

    // CPC analysis
    if (ads.avgCpc > 0) {
      if (ads.avgCpc > 10000) {
        findings.push({
          sentiment: 'negative',
          text: `CPC rata-rata ${fmtCurrency(ads.avgCpc)} -- cukup tinggi. Pertimbangkan untuk memperbaiki Quality Score dan relevansi iklan.`,
        })
      } else if (ads.avgCpc <= 3000) {
        findings.push({
          sentiment: 'positive',
          text: `CPC rata-rata ${fmtCurrency(ads.avgCpc)} -- efisien. Biaya per klik terkontrol dengan baik.`,
        })
      }
    }
  }

  // Return max 4 findings
  return findings.slice(0, 4)
}

function generateRecommendations(
  hasAnySeoData: boolean,
  hasAdsData: boolean,
  seo: {
    totalClicks: number
    totalImpressions: number
    avgCtr: number
    avgPosition: number
    clicksYoy: number
    impressionsYoy: number
    ctrYoy: number
    positionYoy: number
    mobilePct: number
  },
  ads: {
    totalSpend: number
    totalConversions: number
    avgCpc: number
    avgCpa: number
    roas: number
    spendYoy: number
    roasYoy: number
  }
): string[] {
  const recs: string[] = []

  if (hasAnySeoData) {
    const ctrPercent = seo.avgCtr * 100

    // CTR-based recommendation
    if (ctrPercent < 2) {
      recs.push(
        'Optimalkan meta title dan description di halaman-halaman dengan impressions tinggi tapi CTR rendah. Gunakan angka, power words, dan CTA yang jelas.'
      )
    }

    // Position-based recommendation
    if (seo.avgPosition > 10 && seo.avgPosition <= 20) {
      recs.push(
        'Banyak keyword berada di halaman 2 (posisi 11-20). Tambahkan internal link dan perkuat konten halaman-halaman ini untuk mendorong ke halaman 1.'
      )
    } else if (seo.avgPosition > 20) {
      recs.push(
        'Fokus bangun backlink berkualitas dan buat konten mendalam (long-form) untuk keyword target utama. Posisi saat ini masih terlalu jauh dari halaman 1.'
      )
    } else if (seo.avgPosition > 5 && seo.avgPosition <= 10) {
      recs.push(
        'Keyword sudah di halaman 1 tapi belum top 5. Perkuat konten dengan data terbaru, FAQ schema, dan internal linking untuk naik peringkat.'
      )
    }

    // Impressions vs clicks gap
    if (seo.totalImpressions > 0 && ctrPercent < 3 && seo.totalImpressions > seo.totalClicks * 100) {
      recs.push(
        'Impressions tinggi tapi klik rendah -- ada gap konversi. Review halaman-halaman top impressions di tab Pages dan perbaiki snippet-nya.'
      )
    }

    // Mobile recommendation
    if (seo.mobilePct > 50) {
      recs.push(
        'Mayoritas pengunjung dari mobile. Jalankan PageSpeed test (tab Speed) dan pastikan Core Web Vitals lolos untuk pengalaman mobile yang optimal.'
      )
    }

    // Declining SEO
    if (seo.clicksYoy < -5) {
      recs.push(
        'Tren klik organik menurun YoY. Lakukan audit konten: perbarui artikel lama, hapus halaman thin content, dan targetkan keyword baru yang relevan.'
      )
    }

    // Growing impressions but flat clicks = CTR problem
    if (seo.impressionsYoy > 10 && seo.clicksYoy < 5) {
      recs.push(
        'Impressions tumbuh tapi klik stagnan -- artinya visibility naik tapi daya tarik snippet lemah. Prioritaskan A/B test meta title di halaman utama.'
      )
    }
  }

  if (hasAdsData) {
    // ROAS-based recommendation
    if (ads.roas === 0 && ads.totalConversions > 0) {
      recs.push(
        'Aktifkan pelacakan conversion value di Google Ads agar ROAS bisa dihitung. Tanpa data nilai konversi, tidak bisa mengukur return on ad spend.'
      )
    } else if (ads.roas > 0 && ads.roas < 1) {
      recs.push(
        'Campaign belum profitable (ROAS <1x). Pause campaign dengan performa terburuk dan alokasikan budget ke campaign dengan konversi tertinggi.'
      )
    } else if (ads.roas >= 1 && ads.roas < 3) {
      recs.push(
        'ROAS masih bisa ditingkatkan. Review keyword negatif, tighten audience targeting, dan uji variasi ad copy untuk meningkatkan conversion rate.'
      )
    } else if (ads.roas >= 5) {
      recs.push(
        'ROAS sangat bagus. Pertimbangkan scale up budget secara bertahap (10-20% per minggu) untuk memaksimalkan revenue tanpa menurunkan efisiensi.'
      )
    }

    // High CPC recommendation
    if (ads.avgCpc > 10000) {
      recs.push(
        'CPC tinggi menggerus budget. Tingkatkan Quality Score dengan memperbaiki relevansi landing page, ad copy, dan keyword match type.'
      )
    }

    // High CPA
    if (ads.avgCpa > 0 && ads.totalConversions > 0 && ads.avgCpa > ads.totalSpend / Math.max(ads.totalConversions, 1) * 1.5) {
      recs.push(
        'Cost per acquisition terlalu tinggi. Fokuskan budget pada audience segments yang paling sering convert dan kurangi broad targeting.'
      )
    }
  }

  // Always give at least one general recommendation if list is short
  if (recs.length === 0) {
    recs.push('Pantau dashboard ini secara rutin dan bandingkan performa antar periode untuk mengidentifikasi tren lebih awal.')
  }

  // Return max 4 recommendations
  return recs.slice(0, 4)
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
        <FindingsSkeleton />
        <FindingsSkeleton />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <HighlightSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  // ----- No data state -----
  const hasAnySeoData = !!seoData?.kpis
  const hasAnyAdsData = !!adsData?.kpis && (adsData.kpis.totalSpend?.value ?? 0) > 0

  if (!hasAnySeoData && !hasAnyAdsData) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
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
  const mobilePct =
    totalDeviceClicks > 0
      ? (deviceBreakdown?.mobile ?? 0) / totalDeviceClicks * 100
      : 0

  const periodLabel = getPeriodLabel(dateRange)

  // ----- Extract Ads data -----
  const adsKpis = adsData?.kpis
  const totalSpend = adsKpis?.totalSpend?.value ?? 0
  const totalConversions = adsKpis?.totalConversions?.value ?? 0
  const avgCpc = adsKpis?.avgCpc?.value ?? 0
  const avgCpa = adsKpis?.avgCpa?.value ?? 0
  const roas = adsKpis?.overallRoas?.value ?? 0
  const spendYoy = adsKpis?.totalSpend?.yoy ?? 0
  const roasYoy = adsKpis?.overallRoas?.yoy ?? 0

  // ----- Packaged data for analysis -----
  const seoPackage = {
    totalClicks,
    totalImpressions,
    avgCtr,
    avgPosition,
    clicksYoy,
    impressionsYoy,
    ctrYoy,
    positionYoy,
    mobilePct,
  }

  const adsPackage = {
    totalSpend,
    totalConversions,
    avgCpc,
    avgCpa,
    roas,
    spendYoy,
    roasYoy,
  }

  // =====================================================
  // Section 1: Ringkasan Performa (2-3 punchy bullets)
  // =====================================================

  const summaryBullets: string[] = []

  if (hasAnySeoData) {
    const ctrPercent = avgCtr * 100
    const positionLabel =
      avgPosition <= 10
        ? 'halaman 1 Google'
        : avgPosition <= 20
          ? 'halaman 2 Google'
          : `posisi ${avgPosition.toFixed(0)}`

    summaryBullets.push(
      `${fmt(totalClicks)} klik organik dari ${fmt(totalImpressions)} impressions dalam ${periodLabel}. Rata-rata tampil di ${positionLabel} dengan CTR ${ctrPercent.toFixed(1)}%.`
    )
  }

  if (hasAnyAdsData) {
    const cpaLabel = totalConversions > 0
      ? ` dengan biaya ${fmtCurrency(totalSpend / totalConversions)}/konversi`
      : ''
    const roasLabel = roas > 0 ? ` (ROAS ${roas.toFixed(1)}x)` : ''
    summaryBullets.push(
      `Belanja iklan ${fmtCurrency(totalSpend)} menghasilkan ${fmt(totalConversions)} konversi${roasLabel}${cpaLabel}.`
    )
  }

  // Trend summary
  if (hasAnySeoData && (clicksYoy !== 0 || clicksChange !== 0)) {
    const parts: string[] = []
    if (clicksChange !== 0) {
      parts.push(
        `${clicksChange > 0 ? 'naik' : 'turun'} ${Math.abs(clicksChange).toFixed(1)}% vs periode sebelumnya`
      )
    }
    if (clicksYoy !== 0) {
      parts.push(
        `${clicksYoy > 0 ? 'naik' : 'turun'} ${Math.abs(clicksYoy).toFixed(1)}% YoY`
      )
    }
    summaryBullets.push(
      `Tren traffic organik: ${parts.join(', ')}.`
    )
  }

  // =====================================================
  // Section 2: Temuan Utama
  // =====================================================

  const findings = generateFindings(hasAnySeoData, hasAnyAdsData, seoPackage, adsPackage)

  // =====================================================
  // Section 3: Rekomendasi Aksi
  // =====================================================

  const recommendations = generateRecommendations(hasAnySeoData, hasAnyAdsData, seoPackage, adsPackage)

  // =====================================================
  // Section 4: Highlight KPIs
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

  if (hasAnyAdsData) {
    highlights.push({
      label: 'Ad Spend',
      value: fmtCurrency(totalSpend),
      yoy: spendYoy,
    })
    highlights.push({
      label: 'ROAS',
      value: roas > 0 ? `${roas.toFixed(1)}x` : 'N/A',
      yoy: roas > 0 ? roasYoy : undefined,
    })
  }

  // Fill remaining slots up to 4
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
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base font-semibold">
              Ringkasan Performa
            </CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              {periodLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {summaryBullets.length > 0 ? (
            <ul className="space-y-2">
              {summaryBullets.map((text, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <p className="text-sm leading-relaxed">{text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Belum ada data ringkasan yang tersedia.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ================================================
          Section 2: Temuan Utama
          ================================================ */}
      {findings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950">
                <Target className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              </div>
              <CardTitle className="text-base font-semibold">
                Temuan Utama
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {findings.map((finding, i) => (
                <FindingItem
                  key={i}
                  sentiment={finding.sentiment}
                  text={finding.text}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================
          Section 3: Rekomendasi Aksi
          ================================================ */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-950">
                <BarChart3 className="h-4 w-4 text-blue-700 dark:text-blue-400" />
              </div>
              <CardTitle className="text-base font-semibold">
                Rekomendasi Aksi
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recommendations.map((rec, i) => (
                <RecommendationItem key={i} text={rec} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================
          Section 4: Highlight KPIs
          ================================================ */}
      {displayHighlights.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Highlight KPIs</h3>
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
