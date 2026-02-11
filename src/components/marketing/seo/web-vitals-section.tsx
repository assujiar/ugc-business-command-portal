'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts'
import { Smartphone, Monitor, Gauge, Clock, Zap, Globe, AlertCircle, Info } from 'lucide-react'

interface WebVitalsProps {
  data: {
    pages: Array<{
      url: string
      mobile: {
        performance_score: number; lcp_ms: number; cls: number; inp_ms: number | null
        fcp_ms: number; ttfb_ms: number; speed_index_ms: number
        lcp_rating: string; cls_rating: string; inp_rating: string
        fetch_date: string
      } | null
      desktop: {
        performance_score: number; lcp_ms: number; cls: number; inp_ms: number | null
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

// =====================================================
// Metric Explanation Data
// =====================================================

interface MetricInfo {
  title: string
  description: string
  whatAffects: string[]
  howToImprove: string[]
  impact: string
  thresholds: { fast: string; average: string; slow: string }
}

const METRIC_INFO: Record<string, MetricInfo> = {
  LCP: {
    title: 'Largest Contentful Paint (LCP)',
    description: 'Mengukur waktu yang dibutuhkan untuk merender elemen konten terbesar yang terlihat di viewport (biasanya hero image, video, atau blok teks besar). LCP adalah indikator utama kecepatan loading yang dirasakan user.',
    whatAffects: [
      'Server response time (TTFB) yang lambat',
      'Render-blocking JavaScript dan CSS',
      'Resource load time (gambar/video besar tanpa optimasi)',
      'Client-side rendering yang lambat',
      'Redirect chain yang panjang',
    ],
    howToImprove: [
      'Optimalkan server response time (gunakan CDN, caching)',
      'Compress dan resize gambar (WebP/AVIF format)',
      'Preload LCP resource dengan <link rel="preload">',
      'Minify CSS/JS dan hapus render-blocking resources',
      'Gunakan lazy loading untuk gambar off-screen (bukan LCP image)',
    ],
    impact: 'LCP mempengaruhi 25% dari skor Performance. LCP yang lambat membuat user merasa website loading lama, meningkatkan bounce rate, dan menurunkan konversi. Google menggunakan LCP sebagai ranking factor.',
    thresholds: { fast: '≤ 2.5 detik', average: '2.5 - 4.0 detik', slow: '> 4.0 detik' },
  },
  CLS: {
    title: 'Cumulative Layout Shift (CLS)',
    description: 'Mengukur stabilitas visual halaman - seberapa banyak elemen bergeser secara tidak terduga saat halaman loading. CLS menghitung total skor pergeseran layout yang terjadi selama siklus hidup halaman.',
    whatAffects: [
      'Gambar/video tanpa dimensi (width/height) yang eksplisit',
      'Font yang menyebabkan FOIT/FOUT (Flash of Invisible/Unstyled Text)',
      'Konten yang di-inject secara dinamis di atas konten existing',
      'Iklan, embed, atau iframe tanpa reserved space',
      'Animasi/transisi yang memicu layout changes',
    ],
    howToImprove: [
      'Selalu set width dan height pada gambar/video/iframe',
      'Gunakan font-display: swap dan preload web fonts',
      'Reserve space untuk ads/embeds dengan CSS aspect-ratio atau fixed dimensions',
      'Hindari inserting konten di atas existing content kecuali oleh user interaction',
      'Gunakan CSS transform untuk animasi (bukan top/left/width/height)',
    ],
    impact: 'CLS mempengaruhi 25% dari skor Performance. Layout shift yang tinggi membuat user frustrasi karena tombol/link bergeser saat diklik, menyebabkan salah klik. Google menggunakan CLS sebagai ranking factor.',
    thresholds: { fast: '≤ 0.1', average: '0.1 - 0.25', slow: '> 0.25' },
  },
  INP: {
    title: 'Interaction to Next Paint (INP)',
    description: 'Mengukur responsivitas halaman terhadap interaksi user (klik, tap, keyboard). INP mencatat delay dari saat user berinteraksi sampai browser selesai merender hasilnya. INP adalah metrik field (data dari user nyata), bukan lab test.',
    whatAffects: [
      'Long tasks di main thread (JavaScript berat >50ms)',
      'Event handler yang lambat atau complex',
      'Excessive DOM size (terlalu banyak elemen)',
      'Third-party scripts yang memblok main thread',
      'Hydration yang lambat (framework SSR/SSG)',
    ],
    howToImprove: [
      'Break up long JavaScript tasks dengan yield/setTimeout/scheduler',
      'Gunakan web workers untuk komputasi berat',
      'Kurangi DOM size dan complexity',
      'Defer/lazy-load third-party scripts yang tidak critical',
      'Optimalkan event handlers (debounce, virtualize long lists)',
    ],
    impact: 'INP mempengaruhi ranking Google Search sejak Maret 2024 (menggantikan FID). INP yang buruk berarti website terasa "lemot" saat diklik, menurunkan user experience dan konversi. INP hanya tersedia dari data user nyata (CrUX) - jika traffic belum cukup, nilainya N/A.',
    thresholds: { fast: '≤ 200ms', average: '200 - 500ms', slow: '> 500ms' },
  },
  FCP: {
    title: 'First Contentful Paint (FCP)',
    description: 'Mengukur waktu dari navigasi sampai browser merender konten pertama (teks, gambar, SVG, atau canvas non-white). FCP menunjukkan seberapa cepat user mulai melihat sesuatu di layar.',
    whatAffects: [
      'Server response time (TTFB)',
      'Render-blocking CSS dan JavaScript',
      'Font loading yang lambat',
      'Redirect chains',
      'Large DOM yang harus di-parse',
    ],
    howToImprove: [
      'Kurangi server response time',
      'Eliminate render-blocking resources',
      'Inline critical CSS',
      'Preconnect ke required origins',
      'Minify CSS dan remove unused CSS',
    ],
    impact: 'FCP mempengaruhi 10% dari skor Performance. FCP yang cepat memberikan sinyal awal ke user bahwa halaman sedang loading, mengurangi perceived wait time.',
    thresholds: { fast: '≤ 1.8 detik', average: '1.8 - 3.0 detik', slow: '> 3.0 detik' },
  },
  TTFB: {
    title: 'Time to First Byte (TTFB)',
    description: 'Mengukur waktu dari request sampai byte pertama response diterima dari server. TTFB mencerminkan kecepatan server dan network latency.',
    whatAffects: [
      'Server processing time (database queries, API calls)',
      'Server location jauh dari user (tanpa CDN)',
      'Tidak ada server-side caching',
      'DNS lookup yang lambat',
      'TLS handshake overhead',
    ],
    howToImprove: [
      'Gunakan CDN untuk mendekatkan konten ke user',
      'Implementasikan server-side caching (Redis, Memcached)',
      'Optimalkan database queries',
      'Gunakan HTTP/2 atau HTTP/3',
      'Prefetch DNS untuk third-party domains',
    ],
    impact: 'TTFB mempengaruhi semua metrik lain - semakin lambat TTFB, semakin lambat FCP, LCP, dan metrik lainnya. TTFB di bawah 800ms dianggap baik oleh Google.',
    thresholds: { fast: '≤ 800ms', average: '800ms - 1.8s', slow: '> 1.8s' },
  },
  'Speed Index': {
    title: 'Speed Index',
    description: 'Mengukur seberapa cepat konten terlihat secara visual selama proses loading. Speed Index menghitung rata-rata waktu dimana area viewport terisi konten.',
    whatAffects: [
      'Semua faktor yang mempengaruhi FCP dan LCP',
      'Render-blocking resources',
      'JavaScript execution yang berat',
      'Fonts dan images yang lambat',
      'Progressive rendering yang tidak optimal',
    ],
    howToImprove: [
      'Optimalkan FCP dan LCP terlebih dahulu',
      'Minimize main-thread work',
      'Reduce JavaScript execution time',
      'Ensure text remains visible during webfont load',
      'Gunakan server-side rendering untuk above-the-fold content',
    ],
    impact: 'Speed Index mempengaruhi 10% dari skor Performance. Speed Index yang rendah menunjukkan halaman menampilkan konten secara progresif dengan baik.',
    thresholds: { fast: '≤ 3.4 detik', average: '3.4 - 5.8 detik', slow: '> 5.8 detik' },
  },
  Performance: {
    title: 'Performance Score',
    description: 'Skor gabungan 0-100 dari Lighthouse yang menggabungkan semua metrik Core Web Vitals dan metrik tambahan dengan bobot tertentu.',
    whatAffects: [
      'FCP (10% bobot)',
      'LCP (25% bobot)',
      'TBT / Total Blocking Time (30% bobot) - proxy lab untuk INP',
      'CLS (25% bobot)',
      'Speed Index (10% bobot)',
    ],
    howToImprove: [
      'Fokus pada TBT/LCP/CLS karena bobot terbesar (80%)',
      'Optimalkan JavaScript execution (reduce TBT)',
      'Percepat LCP element loading',
      'Stabilkan layout (reduce CLS)',
      'Gunakan PageSpeed Insights recommendations',
    ],
    impact: 'Performance Score adalah ringkasan keseluruhan kecepatan halaman. Score ≥90 (hijau) dianggap baik, 50-89 (kuning) perlu perbaikan, <50 (merah) buruk. Google menggunakan Core Web Vitals sebagai ranking factor.',
    thresholds: { fast: '90 - 100 (Baik)', average: '50 - 89 (Perlu Perbaikan)', slow: '0 - 49 (Buruk)' },
  },
}

// =====================================================
// Helper Functions
// =====================================================

function getRatingColor(rating: string): string {
  switch (rating) {
    case 'FAST': return 'text-green-600 bg-green-50 border-green-200'
    case 'AVERAGE': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    case 'SLOW': return 'text-red-600 bg-red-50 border-red-200'
    default: return 'text-muted-foreground bg-muted'
  }
}

function getRatingLabel(rating: string): string {
  switch (rating) {
    case 'FAST': return 'FAST'
    case 'AVERAGE': return 'AVERAGE'
    case 'SLOW': return 'SLOW'
    case 'N/A': return 'N/A'
    default: return 'N/A'
  }
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#22c55e'
  if (score >= 50) return '#eab308'
  return '#ef4444'
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null || isNaN(ms)) return 'N/A'
  if (ms === 0) return 'N/A'
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

// =====================================================
// Sub-Components
// =====================================================

function ScoreGauge({ score, size = 80, onClick }: { score: number; size?: number; onClick?: () => void }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (score / 100) * circumference
  const color = getScoreColor(score)

  return (
    <div
      className={`relative ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      style={{ width: size, height: size }}
      onClick={onClick}
    >
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

function MetricCard({ label, value, rating, icon: Icon, target, onClick }: {
  label: string; value: string; rating: string
  icon: React.ElementType; target: string; onClick?: () => void
}) {
  const colorClass = getRatingColor(rating)
  const displayRating = getRatingLabel(rating)
  return (
    <div
      className={`border rounded-lg p-3 ${colorClass} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium">{label}</span>
        <div className="flex items-center gap-1">
          {onClick && <Info className="h-3 w-3 opacity-50" />}
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-lg font-bold">{value}</p>
      <div className="flex items-center justify-between mt-1">
        <Badge variant="outline" className={`text-[10px] ${colorClass}`}>{displayRating}</Badge>
        <span className="text-[10px] opacity-70">Target: {target}</span>
      </div>
    </div>
  )
}

function AdditionalMetricItem({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <div
      className={`text-center ${onClick ? 'cursor-pointer hover:bg-muted/50 rounded-md py-1 px-2 -my-1 transition-colors' : ''}`}
      onClick={onClick}
    >
      <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
        {label}
        {onClick && <Info className="h-2.5 w-2.5 opacity-50" />}
      </p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}

function MetricInfoDialog({ metricKey, open, onClose }: { metricKey: string | null; open: boolean; onClose: () => void }) {
  const info = metricKey ? METRIC_INFO[metricKey] : null
  if (!info) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{info.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {/* Description */}
          <div>
            <p className="text-muted-foreground leading-relaxed">{info.description}</p>
          </div>

          {/* Thresholds */}
          <div className="grid grid-cols-3 gap-2">
            <div className="border border-green-200 bg-green-50 rounded-md p-2 text-center">
              <p className="text-[10px] font-medium text-green-700">FAST</p>
              <p className="text-xs text-green-600">{info.thresholds.fast}</p>
            </div>
            <div className="border border-yellow-200 bg-yellow-50 rounded-md p-2 text-center">
              <p className="text-[10px] font-medium text-yellow-700">AVERAGE</p>
              <p className="text-xs text-yellow-600">{info.thresholds.average}</p>
            </div>
            <div className="border border-red-200 bg-red-50 rounded-md p-2 text-center">
              <p className="text-[10px] font-medium text-red-700">SLOW</p>
              <p className="text-xs text-red-600">{info.thresholds.slow}</p>
            </div>
          </div>

          {/* What Affects */}
          <div>
            <h4 className="font-semibold text-xs mb-1.5 text-foreground">Apa yang mempengaruhi?</h4>
            <ul className="space-y-1">
              {info.whatAffects.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-red-400 mt-0.5 shrink-0">&#x2022;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* How to Improve */}
          <div>
            <h4 className="font-semibold text-xs mb-1.5 text-foreground">Cara meningkatkan:</h4>
            <ul className="space-y-1">
              {info.howToImprove.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-green-500 mt-0.5 shrink-0">&#x2713;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Impact */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <h4 className="font-semibold text-xs mb-1 text-blue-700">Dampak & Pengaruh</h4>
            <p className="text-xs text-blue-600 leading-relaxed">{info.impact}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// =====================================================
// Main Component
// =====================================================

export default function WebVitalsSection({ data, loading }: WebVitalsProps) {
  const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile')
  const [infoDialog, setInfoDialog] = useState<string | null>(null)

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
      {/* Metric Info Dialog */}
      <MetricInfoDialog
        metricKey={infoDialog}
        open={infoDialog !== null}
        onClose={() => setInfoDialog(null)}
      />

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
        <span className="text-[10px] text-muted-foreground ml-auto">
          Klik card untuk penjelasan detail
        </span>
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
                  <ScoreGauge
                    score={Number(vitals.performance_score) || 0}
                    size={100}
                    onClick={() => setInfoDialog('Performance')}
                  />
                  <span className="text-xs font-medium">Performance</span>
                </div>

                {/* Core Web Vitals */}
                <div className="flex-1 grid gap-3 grid-cols-1 sm:grid-cols-3">
                  <MetricCard
                    label="LCP"
                    value={formatMs(Number(vitals.lcp_ms))}
                    rating={vitals.lcp_rating || 'N/A'}
                    icon={Clock}
                    target="< 2.5s"
                    onClick={() => setInfoDialog('LCP')}
                  />
                  <MetricCard
                    label="CLS"
                    value={vitals.cls != null ? Number(vitals.cls).toFixed(3) : 'N/A'}
                    rating={vitals.cls_rating || 'N/A'}
                    icon={Gauge}
                    target="< 0.1"
                    onClick={() => setInfoDialog('CLS')}
                  />
                  <MetricCard
                    label="INP"
                    value={vitals.inp_ms != null ? formatMs(Number(vitals.inp_ms)) : 'N/A'}
                    rating={vitals.inp_rating || 'N/A'}
                    icon={Zap}
                    target="< 200ms"
                    onClick={() => setInfoDialog('INP')}
                  />
                </div>
              </div>

              {/* Additional Metrics */}
              <div className="grid gap-2 grid-cols-3 mt-4 pt-3 border-t">
                <AdditionalMetricItem
                  label="FCP"
                  value={formatMs(Number(vitals.fcp_ms))}
                  onClick={() => setInfoDialog('FCP')}
                />
                <AdditionalMetricItem
                  label="TTFB"
                  value={formatMs(Number(vitals.ttfb_ms))}
                  onClick={() => setInfoDialog('TTFB')}
                />
                <AdditionalMetricItem
                  label="Speed Index"
                  value={formatMs(Number(vitals.speed_index_ms))}
                  onClick={() => setInfoDialog('Speed Index')}
                />
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
