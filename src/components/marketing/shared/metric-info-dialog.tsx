'use client'

import * as React from 'react'
import { Info } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

// =============================================================================
// Types
// =============================================================================

interface MetricInfoDialogProps {
  title: string
  children: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface MetricInfoButtonProps {
  title: string
  children: React.ReactNode
}

interface TableHeaderInfoProps {
  label: string
  info: string
}

interface MetricDescription {
  title: string
  description: string
  formula?: string
  tip?: string
}

// =============================================================================
// MetricInfoDialog
// =============================================================================

export function MetricInfoDialog({
  title,
  children,
  open,
  onOpenChange,
}: MetricInfoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-500 shrink-0" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground leading-relaxed">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// MetricInfoButton
// =============================================================================

export function MetricInfoButton({ title, children }: MetricInfoButtonProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground/60 hover:text-blue-500 hover:bg-blue-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        aria-label={`Info: ${title}`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <MetricInfoDialog title={title} open={open} onOpenChange={setOpen}>
        {children}
      </MetricInfoDialog>
    </>
  )
}

// =============================================================================
// TableHeaderInfo
// =============================================================================

export function TableHeaderInfo({ label, info }: TableHeaderInfoProps) {
  return (
    <div className="flex items-center gap-1">
      <span>{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground/50 hover:text-blue-500 hover:bg-blue-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label={`Info: ${label}`}
          >
            <Info className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="center"
          className="w-64 text-xs leading-relaxed text-muted-foreground"
        >
          <p>{info}</p>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// =============================================================================
// METRIC_DESCRIPTIONS
// =============================================================================

export const METRIC_DESCRIPTIONS: Record<string, MetricDescription> = {
  // ---------------------------------------------------------------------------
  // SEO Metrics
  // ---------------------------------------------------------------------------
  totalClicks: {
    title: 'Total Klik Organik',
    description:
      'Jumlah klik dari hasil pencarian Google ke website kamu.',
  },
  totalImpressions: {
    title: 'Total Impressions',
    description:
      'Berapa kali website kamu muncul di hasil pencarian Google.',
  },
  avgCtr: {
    title: 'Rata-rata CTR',
    description:
      'Click-Through Rate = persentase orang yang klik setelah melihat website kamu di Google.',
    formula: '(Klik / Impressions) x 100%',
    tip: 'CTR > 3% = baik. CTR > 5% = sangat baik.',
  },
  avgPosition: {
    title: 'Rata-rata Posisi',
    description:
      'Posisi rata-rata website kamu di hasil pencarian. 1 = paling atas.',
    tip: 'Posisi < 10 = halaman 1.',
  },
  organicSessions: {
    title: 'Sesi Organik',
    description:
      'Jumlah kunjungan ke website yang berasal dari pencarian Google (bukan iklan).',
  },
  conversionRate: {
    title: 'Conversion Rate',
    description:
      'Persentase pengunjung organik yang melakukan konversi (goal/pembelian).',
    formula: '(Konversi / Sesi) x 100%',
  },

  // ---------------------------------------------------------------------------
  // SEM (Paid Ads) Metrics
  // ---------------------------------------------------------------------------
  totalSpend: {
    title: 'Total Belanja Iklan',
    description:
      'Total biaya yang dikeluarkan untuk semua campaign Google Ads.',
    tip: 'Pantau rasio belanja vs konversi.',
  },
  totalConversions: {
    title: 'Total Konversi',
    description:
      'Jumlah aksi berharga (pembelian, lead, form submit) dari iklan.',
    tip: 'Konversi tinggi = campaign efektif.',
  },
  avgCpc: {
    title: 'Rata-rata CPC',
    description:
      'Cost Per Click = biaya rata-rata per klik iklan.',
    formula: 'Total Spend / Total Clicks',
    tip: 'CPC rendah = iklan lebih efisien.',
  },
  avgCpa: {
    title: 'Rata-rata CPA',
    description:
      'Cost Per Acquisition = biaya rata-rata per konversi.',
    formula: 'Total Spend / Total Konversi',
    tip: 'CPA rendah = ROI lebih baik.',
  },
  overallRoas: {
    title: 'Overall ROAS',
    description:
      'Return On Ad Spend = pendapatan per rupiah yang dibelanjakan.',
    formula: 'Conversion Value / Total Spend',
    tip: 'ROAS > 3x = target umum.',
  },

  // ---------------------------------------------------------------------------
  // Table Column Metrics
  // ---------------------------------------------------------------------------
  clicks: {
    title: 'Klik',
    description: 'Jumlah klik ke website dari hasil pencarian.',
  },
  impressions: {
    title: 'Impressions',
    description: 'Berapa kali halaman muncul di hasil pencarian.',
  },
  ctr: {
    title: 'CTR',
    description: 'Click-Through Rate = Klik / Impressions x 100%.',
  },
  position: {
    title: 'Posisi',
    description:
      'Posisi rata-rata di hasil pencarian Google. 1 = teratas.',
  },
  sessions: {
    title: 'Sesi',
    description: 'Jumlah kunjungan ke halaman dari Google Analytics.',
  },
  engagementRate: {
    title: 'Engagement Rate',
    description:
      'Persentase sesi yang engaged (>10 detik, >2 halaman, atau konversi).',
  },
  bounceRate: {
    title: 'Bounce Rate',
    description:
      'Persentase pengunjung yang langsung keluar tanpa interaksi. Rendah = baik.',
  },
  conversions: {
    title: 'Konversi',
    description: 'Jumlah goal/pembelian yang terjadi.',
  },
  spend: {
    title: 'Belanja',
    description: 'Biaya iklan yang dikeluarkan.',
  },
  roas: {
    title: 'ROAS',
    description:
      'Return On Ad Spend. Pendapatan per rupiah belanja iklan.',
  },
  qualityScore: {
    title: 'Quality Score',
    description:
      'Skor 1-10 dari Google tentang kualitas iklan. Tinggi = CPC lebih murah.',
  },
  keyword: {
    title: 'Keyword',
    description:
      'Kata kunci yang memicu iklan atau muncul di pencarian.',
  },
  campaignName: {
    title: 'Nama Campaign',
    description: 'Nama campaign iklan di Google Ads.',
  },
  campaignStatus: {
    title: 'Status Campaign',
    description:
      'Status: enabled = aktif, paused = dijeda, removed = dihapus.',
  },
  budgetUtilization: {
    title: 'Utilisasi Budget',
    description: 'Persentase budget harian yang terpakai.',
  },
}
