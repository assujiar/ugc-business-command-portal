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
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, PieChart, Pie
} from 'recharts'
import {
  Smartphone, Monitor, Gauge, Clock, Zap, Globe, AlertCircle, Info,
  ChevronDown, ChevronUp, AlertTriangle, FileCode, Image,
  FileText, Database, Timer
} from 'lucide-react'

// =====================================================
// Types
// =====================================================

interface Opportunity {
  id: string; title: string; description: string
  displayValue?: string; overallSavingsMs?: number; overallSavingsBytes?: number; score?: number
}
interface Diagnostic {
  id: string; title: string; description: string
  displayValue?: string; score?: number; numericValue?: number
}
interface ResourceItem {
  resourceType: string; label: string; requestCount: number; transferSize: number
}
interface OriginCrux {
  overall_category: string
  metrics: {
    LCP?: { percentile: number; category: string }
    CLS?: { percentile: number; category: string }
    INP?: { percentile: number; category: string }
    FCP?: { percentile: number; category: string }
    TTFB?: { percentile: number; category: string }
  }
}

interface VitalsData {
  performance_score: number; lcp_ms: number; cls: number; inp_ms: number | null
  fcp_ms: number; ttfb_ms: number; speed_index_ms: number
  tbt_ms?: number | null; tbt_rating?: string
  lcp_rating: string; cls_rating: string; inp_rating: string
  fetch_date: string
  diagnostics?: Diagnostic[]; opportunities?: Opportunity[]
  resources?: ResourceItem[]; totalByteWeight?: number | null
  originCrux?: OriginCrux | null
}

interface WebVitalsProps {
  data: {
    pages: Array<{
      url: string
      mobile: VitalsData | null
      desktop: VitalsData | null
    }>
    trends: Record<string, Array<{ date: string; score: number; lcp: number; cls: number; inp: number; tbt?: number }>>
    config: { is_active: boolean; last_fetch_at: string; extra_config: any } | null
  } | null
  loading: boolean
}

// =====================================================
// Metric Explanation Data
// =====================================================

interface MetricInfo {
  title: string; description: string
  whatAffects: string[]; howToImprove: string[]
  impact: string; thresholds: { fast: string; average: string; slow: string }
}

const METRIC_INFO: Record<string, MetricInfo> = {
  LCP: {
    title: 'Largest Contentful Paint (LCP)',
    description: 'Mengukur waktu yang dibutuhkan untuk merender elemen konten terbesar yang terlihat di viewport.',
    whatAffects: ['Server response time (TTFB) lambat', 'Render-blocking JavaScript/CSS', 'Resource load time (gambar/video besar)', 'Client-side rendering lambat', 'Redirect chain panjang'],
    howToImprove: ['Optimalkan server (CDN, caching)', 'Compress gambar (WebP/AVIF)', 'Preload LCP resource', 'Minify CSS/JS, hapus render-blocking', 'Lazy load gambar off-screen (bukan LCP)'],
    impact: 'LCP mempengaruhi 25% skor Performance. Google menggunakan LCP sebagai ranking factor.',
    thresholds: { fast: '≤ 2.5s', average: '2.5 - 4.0s', slow: '> 4.0s' },
  },
  CLS: {
    title: 'Cumulative Layout Shift (CLS)',
    description: 'Mengukur stabilitas visual - seberapa banyak elemen bergeser tak terduga saat loading.',
    whatAffects: ['Gambar/video tanpa dimensi eksplisit', 'Font FOIT/FOUT', 'Konten dynamic di atas existing content', 'Ads/embed tanpa reserved space', 'Animasi yang trigger layout changes'],
    howToImprove: ['Set width/height pada gambar/video/iframe', 'font-display: swap + preload fonts', 'Reserve space untuk ads/embeds', 'Hindari insert konten di atas', 'CSS transform untuk animasi'],
    impact: 'CLS mempengaruhi 25% skor Performance. Layout shift membuat user frustrasi.',
    thresholds: { fast: '≤ 0.1', average: '0.1 - 0.25', slow: '> 0.25' },
  },
  INP: {
    title: 'Interaction to Next Paint (INP)',
    description: 'Mengukur responsivitas terhadap interaksi user (klik, tap, keyboard). Metrik field dari data user nyata (CrUX).',
    whatAffects: ['Long tasks di main thread (JS >50ms)', 'Event handler lambat', 'DOM size berlebihan', 'Third-party scripts blocking', 'Hydration lambat (SSR/SSG)'],
    howToImprove: ['Break up long JS tasks (yield/setTimeout)', 'Web workers untuk komputasi berat', 'Kurangi DOM size', 'Defer third-party scripts', 'Debounce/virtualize event handlers'],
    impact: 'INP ranking factor Google sejak Mar 2024. Hanya tersedia dari CrUX (data user nyata) - N/A jika traffic belum cukup.',
    thresholds: { fast: '≤ 200ms', average: '200 - 500ms', slow: '> 500ms' },
  },
  TBT: {
    title: 'Total Blocking Time (TBT)',
    description: 'Total waktu main thread diblok oleh long tasks (>50ms) antara FCP dan TTI. TBT adalah proxy lab untuk INP - bobot terbesar (30%) di Lighthouse.',
    whatAffects: ['JavaScript execution yang berat', 'Third-party scripts', 'Large DOM parsing', 'Excessive CSS calculations', 'Synchronous layout/paint operations'],
    howToImprove: ['Code splitting & lazy loading', 'Minimize/defer JS execution', 'Remove unused JavaScript', 'Break long tasks menjadi smaller chunks', 'Web Workers untuk heavy computation'],
    impact: 'TBT memiliki BOBOT TERBESAR (30%) dari skor Performance! Ini adalah metrik paling berpengaruh di Lighthouse. TBT yang tinggi = website terasa "lemot".',
    thresholds: { fast: '≤ 200ms', average: '200 - 600ms', slow: '> 600ms' },
  },
  FCP: {
    title: 'First Contentful Paint (FCP)',
    description: 'Waktu dari navigasi sampai browser merender konten pertama (teks, gambar, SVG).',
    whatAffects: ['Server response time (TTFB)', 'Render-blocking CSS/JS', 'Font loading lambat', 'Redirect chains', 'Large DOM parsing'],
    howToImprove: ['Kurangi server response time', 'Eliminate render-blocking resources', 'Inline critical CSS', 'Preconnect ke required origins', 'Minify/remove unused CSS'],
    impact: 'FCP mempengaruhi 10% skor Performance. FCP cepat = sinyal awal ke user bahwa halaman sedang loading.',
    thresholds: { fast: '≤ 1.8s', average: '1.8 - 3.0s', slow: '> 3.0s' },
  },
  TTFB: {
    title: 'Time to First Byte (TTFB)',
    description: 'Waktu dari request sampai byte pertama response diterima. Mencerminkan kecepatan server.',
    whatAffects: ['Server processing time', 'Server jauh dari user (tanpa CDN)', 'Tidak ada server-side caching', 'DNS lookup lambat', 'TLS handshake overhead'],
    howToImprove: ['Gunakan CDN', 'Server-side caching (Redis)', 'Optimalkan DB queries', 'HTTP/2 atau HTTP/3', 'Prefetch DNS third-party'],
    impact: 'TTFB mempengaruhi semua metrik lain. TTFB < 800ms dianggap baik oleh Google.',
    thresholds: { fast: '≤ 800ms', average: '800ms - 1.8s', slow: '> 1.8s' },
  },
  'Speed Index': {
    title: 'Speed Index',
    description: 'Seberapa cepat konten terlihat secara visual selama loading.',
    whatAffects: ['Semua faktor FCP dan LCP', 'Render-blocking resources', 'JS execution berat', 'Fonts dan images lambat'],
    howToImprove: ['Optimalkan FCP/LCP dulu', 'Minimize main-thread work', 'Reduce JS execution time', 'SSR untuk above-the-fold content'],
    impact: 'Speed Index mempengaruhi 10% skor Performance.',
    thresholds: { fast: '≤ 3.4s', average: '3.4 - 5.8s', slow: '> 5.8s' },
  },
  Performance: {
    title: 'Performance Score',
    description: 'Skor gabungan 0-100 dari Lighthouse. Bobot: TBT 30%, LCP 25%, CLS 25%, FCP 10%, SI 10%.',
    whatAffects: ['TBT (30% - TERBESAR)', 'LCP (25%)', 'CLS (25%)', 'FCP (10%)', 'Speed Index (10%)'],
    howToImprove: ['Fokus TBT/LCP/CLS (80% bobot)', 'Reduce JavaScript execution', 'Percepat LCP element', 'Stabilkan layout (CLS)', 'Ikuti PageSpeed recommendations'],
    impact: 'Score ≥90 (hijau) baik, 50-89 (kuning) perlu perbaikan, <50 (merah) buruk.',
    thresholds: { fast: '90 - 100', average: '50 - 89', slow: '0 - 49' },
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

function getRatingBadgeColor(rating: string): string {
  switch (rating) {
    case 'FAST': return 'bg-green-100 text-green-700 border-green-300'
    case 'AVERAGE': return 'bg-yellow-100 text-yellow-700 border-yellow-300'
    case 'SLOW': return 'bg-red-100 text-red-700 border-red-300'
    default: return 'bg-gray-100 text-gray-600 border-gray-300'
  }
}

function getRatingLabel(rating: string): string {
  if (rating === 'FAST' || rating === 'AVERAGE' || rating === 'SLOW') return rating
  return 'N/A'
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

const RESOURCE_COLORS: Record<string, string> = {
  script: '#f59e0b',
  stylesheet: '#3b82f6',
  image: '#22c55e',
  font: '#a855f7',
  document: '#ef4444',
  other: '#6b7280',
  media: '#ec4899',
  'third-party': '#f97316',
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
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={4} className="text-muted/20" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold" style={{ color }}>{Math.round(score)}</span>
      </div>
    </div>
  )
}

function MetricCard({ label, value, rating, icon: Icon, target, onClick }: {
  label: string; value: string; rating: string; icon: React.ElementType; target: string; onClick?: () => void
}) {
  const colorClass = getRatingColor(rating)
  return (
    <div className={`border rounded-lg p-3 ${colorClass} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`} onClick={onClick}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium">{label}</span>
        <div className="flex items-center gap-1">
          {onClick && <Info className="h-3 w-3 opacity-50" />}
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-lg font-bold">{value}</p>
      <div className="flex items-center justify-between mt-1">
        <Badge variant="outline" className={`text-[10px] ${colorClass}`}>{getRatingLabel(rating)}</Badge>
        <span className="text-[10px] opacity-70">Target: {target}</span>
      </div>
    </div>
  )
}

function AdditionalMetricItem({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <div className={`text-center ${onClick ? 'cursor-pointer hover:bg-muted/50 rounded-md py-1 px-2 -my-1 transition-colors' : ''}`} onClick={onClick}>
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
        <DialogHeader><DialogTitle className="text-base">{info.title}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground leading-relaxed">{info.description}</p>
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
          <div>
            <h4 className="font-semibold text-xs mb-1.5">Apa yang mempengaruhi?</h4>
            <ul className="space-y-1">
              {info.whatAffects.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-red-400 mt-0.5 shrink-0">&#x2022;</span>{item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-xs mb-1.5">Cara meningkatkan:</h4>
            <ul className="space-y-1">
              {info.howToImprove.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-green-500 mt-0.5 shrink-0">&#x2713;</span>{item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <h4 className="font-semibold text-xs mb-1 text-blue-700">Dampak & Pengaruh</h4>
            <p className="text-xs text-blue-600 leading-relaxed">{info.impact}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Opportunities & Diagnostics Section
function OpportunitiesSection({ opportunities, diagnostics }: { opportunities: Opportunity[]; diagnostics: Diagnostic[] }) {
  const [expanded, setExpanded] = useState(false)
  const hasData = opportunities.length > 0 || diagnostics.length > 0
  if (!hasData) return null

  const topOpportunities = expanded ? opportunities : opportunities.slice(0, 3)
  const topDiagnostics = expanded ? diagnostics : diagnostics.slice(0, 3)
  const totalItems = opportunities.length + diagnostics.length
  const showToggle = totalItems > 6

  return (
    <div className="mt-4 pt-3 border-t">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          Rekomendasi Perbaikan
          <Badge variant="outline" className="text-[10px] ml-1">{totalItems}</Badge>
        </p>
        {showToggle && (
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setExpanded(!expanded)}>
            {expanded ? <><ChevronUp className="h-3 w-3" /> Sembunyikan</> : <><ChevronDown className="h-3 w-3" /> Lihat semua</>}
          </Button>
        )}
      </div>

      {/* Opportunities */}
      {topOpportunities.length > 0 && (
        <div className="space-y-2 mb-3">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Opportunities (Potensi Penghematan)</p>
          {topOpportunities.map((opp, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-amber-50 border border-amber-100">
              <div className="shrink-0 mt-0.5">
                {(opp.score ?? 1) < 0.5 ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{opp.title}</p>
                {opp.displayValue && (
                  <p className="text-[10px] text-muted-foreground">{opp.displayValue}</p>
                )}
              </div>
              {(opp.overallSavingsMs || 0) > 0 && (
                <Badge variant="outline" className="text-[10px] shrink-0 bg-green-50 text-green-700 border-green-200">
                  -{formatMs(opp.overallSavingsMs!)}
                </Badge>
              )}
              {(opp.overallSavingsBytes || 0) > 0 && !(opp.overallSavingsMs || 0) && (
                <Badge variant="outline" className="text-[10px] shrink-0 bg-green-50 text-green-700 border-green-200">
                  -{formatBytes(opp.overallSavingsBytes!)}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Diagnostics */}
      {topDiagnostics.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Diagnostics (Masalah Terdeteksi)</p>
          {topDiagnostics.map((diag, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-red-50/50 border border-red-100">
              <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{diag.title}</p>
                {diag.displayValue && (
                  <p className="text-[10px] text-muted-foreground">{diag.displayValue}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Resource Breakdown Section
function ResourceBreakdownSection({ resources, totalByteWeight }: { resources: ResourceItem[]; totalByteWeight: number | null }) {
  if (!resources || resources.length === 0) return null

  const sortedResources = [...resources].sort((a, b) => b.transferSize - a.transferSize)
  const pieData = sortedResources.filter(r => r.transferSize > 0).map(r => ({
    name: r.label,
    value: r.transferSize,
    type: r.resourceType,
  }))

  const totalRequests = resources.reduce((sum, r) => sum + r.requestCount, 0)

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'script': return FileCode
      case 'image': return Image
      case 'stylesheet': return FileText
      case 'font': return FileText
      default: return Database
    }
  }

  return (
    <div className="mt-4 pt-3 border-t">
      <p className="text-xs font-semibold flex items-center gap-1.5 mb-3">
        <Database className="h-3.5 w-3.5 text-blue-500" />
        Resource Breakdown
        {totalByteWeight != null && (
          <Badge variant="outline" className="text-[10px] ml-1">Total: {formatBytes(totalByteWeight)}</Badge>
        )}
        <Badge variant="outline" className="text-[10px]">{totalRequests} requests</Badge>
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Pie Chart */}
        {pieData.length > 0 && (
          <div className="w-full sm:w-40 h-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={25}
                  outerRadius={50}
                  dataKey="value"
                  strokeWidth={1}
                >
                  {pieData.map((entry, idx) => (
                    <Cell key={idx} fill={RESOURCE_COLORS[entry.type] || RESOURCE_COLORS.other} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatBytes(value)}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 space-y-1">
          {sortedResources.map((r, i) => {
            const Icon = getResourceIcon(r.resourceType)
            const color = RESOURCE_COLORS[r.resourceType] || RESOURCE_COLORS.other
            const pct = totalByteWeight ? Math.round((r.transferSize / totalByteWeight) * 100) : 0
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{r.label}</span>
                <span className="text-muted-foreground">{r.requestCount} req</span>
                <span className="font-medium w-16 text-right">{formatBytes(r.transferSize)}</span>
                {pct > 0 && <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Origin CrUX Section
function OriginCruxSection({ originCrux }: { originCrux: OriginCrux | null }) {
  if (!originCrux) return null

  const metrics = [
    { key: 'LCP', label: 'LCP', data: originCrux.metrics.LCP, format: (v: number) => formatMs(v) },
    { key: 'CLS', label: 'CLS', data: originCrux.metrics.CLS, format: (v: number) => (v / 100).toFixed(2) },
    { key: 'INP', label: 'INP', data: originCrux.metrics.INP, format: (v: number) => formatMs(v) },
    { key: 'FCP', label: 'FCP', data: originCrux.metrics.FCP, format: (v: number) => formatMs(v) },
    { key: 'TTFB', label: 'TTFB', data: originCrux.metrics.TTFB, format: (v: number) => formatMs(v) },
  ].filter(m => m.data)

  if (metrics.length === 0) return null

  return (
    <div className="mt-4 pt-3 border-t">
      <p className="text-xs font-semibold flex items-center gap-1.5 mb-3">
        <Globe className="h-3.5 w-3.5 text-purple-500" />
        Origin CrUX (Data Real User - Seluruh Domain)
        <Badge variant="outline" className={`text-[10px] ml-1 ${getRatingBadgeColor(originCrux.overall_category)}`}>
          {originCrux.overall_category}
        </Badge>
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {metrics.map((m) => (
          <div key={m.key} className={`border rounded-md p-2 text-center ${getRatingColor(m.data!.category)}`}>
            <p className="text-[10px] font-medium">{m.label}</p>
            <p className="text-sm font-bold">{m.format(m.data!.percentile)}</p>
            <Badge variant="outline" className={`text-[9px] ${getRatingBadgeColor(m.data!.category)}`}>
              {m.data!.category}
            </Badge>
          </div>
        ))}
      </div>
    </div>
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
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
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
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <MetricInfoDialog metricKey={infoDialog} open={infoDialog !== null} onClose={() => setInfoDialog(null)} />

      {/* Strategy Toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant={strategy === 'mobile' ? 'default' : 'outline'} size="sm" onClick={() => setStrategy('mobile')} className="h-8 text-xs gap-1">
          <Smartphone className="h-3.5 w-3.5" /> Mobile
        </Button>
        <Button variant={strategy === 'desktop' ? 'default' : 'outline'} size="sm" onClick={() => setStrategy('desktop')} className="h-8 text-xs gap-1">
          <Monitor className="h-3.5 w-3.5" /> Desktop
        </Button>
        {data.config?.last_fetch_at && (
          <span className="text-[10px] text-muted-foreground ml-2">
            Data dari: {new Date(data.config.last_fetch_at).toLocaleDateString('id-ID')}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">Klik card untuk detail</span>
      </div>

      {/* Page Cards */}
      {data.pages.map((page, idx) => {
        const vitals = strategy === 'mobile' ? page.mobile : page.desktop
        if (!vitals) return (
          <Card key={idx}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2"><Globe className="h-4 w-4" />{page.url}</CardTitle>
            </CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">Data {strategy} belum tersedia</p></CardContent>
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
                  <span className="text-[10px] text-muted-foreground">{new Date(vitals.fetch_date).toLocaleDateString('id-ID')}</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Score Gauge */}
                <div className="flex flex-col items-center gap-2">
                  <ScoreGauge score={Number(vitals.performance_score) || 0} size={100} onClick={() => setInfoDialog('Performance')} />
                  <span className="text-xs font-medium">Performance</span>
                </div>

                {/* Core Web Vitals - now 4 cards including TBT */}
                <div className="flex-1 grid gap-3 grid-cols-2 sm:grid-cols-4">
                  <MetricCard
                    label="LCP" value={formatMs(Number(vitals.lcp_ms))}
                    rating={vitals.lcp_rating || 'N/A'} icon={Clock} target="< 2.5s"
                    onClick={() => setInfoDialog('LCP')}
                  />
                  <MetricCard
                    label="TBT (30%)" value={vitals.tbt_ms != null ? formatMs(Number(vitals.tbt_ms)) : 'N/A'}
                    rating={vitals.tbt_rating || 'N/A'} icon={Timer} target="< 200ms"
                    onClick={() => setInfoDialog('TBT')}
                  />
                  <MetricCard
                    label="CLS" value={vitals.cls != null ? Number(vitals.cls).toFixed(3) : 'N/A'}
                    rating={vitals.cls_rating || 'N/A'} icon={Gauge} target="< 0.1"
                    onClick={() => setInfoDialog('CLS')}
                  />
                  <MetricCard
                    label="INP" value={vitals.inp_ms != null ? formatMs(Number(vitals.inp_ms)) : 'N/A'}
                    rating={vitals.inp_rating || 'N/A'} icon={Zap} target="< 200ms"
                    onClick={() => setInfoDialog('INP')}
                  />
                </div>
              </div>

              {/* Additional Metrics */}
              <div className="grid gap-2 grid-cols-3 mt-4 pt-3 border-t">
                <AdditionalMetricItem label="FCP" value={formatMs(Number(vitals.fcp_ms))} onClick={() => setInfoDialog('FCP')} />
                <AdditionalMetricItem label="TTFB" value={formatMs(Number(vitals.ttfb_ms))} onClick={() => setInfoDialog('TTFB')} />
                <AdditionalMetricItem label="Speed Index" value={formatMs(Number(vitals.speed_index_ms))} onClick={() => setInfoDialog('Speed Index')} />
              </div>

              {/* Origin CrUX */}
              <OriginCruxSection originCrux={vitals.originCrux || null} />

              {/* Opportunities & Diagnostics */}
              <OpportunitiesSection
                opportunities={vitals.opportunities || []}
                diagnostics={vitals.diagnostics || []}
              />

              {/* Resource Breakdown */}
              <ResourceBreakdownSection
                resources={vitals.resources || []}
                totalByteWeight={vitals.totalByteWeight || null}
              />

              {/* Trend Chart */}
              {trendData.length > 1 && (
                <div className="mt-4 pt-3 border-t">
                  <p className="text-xs font-medium mb-2">Performance Score Trend</p>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }}
                          tickFormatter={(d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} />
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
