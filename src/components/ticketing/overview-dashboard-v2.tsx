'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Ticket,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Users,
  Building2,
  RefreshCw,
  Target,
  Timer,
  Trophy,
  ArrowRight,
  XCircle,
  Ban,
  FileText,
  DollarSign,
  X,
  ChevronRight,
  AlertTriangle,
  Hourglass,
  Inbox,
  PenLine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Database } from '@/types/database'
import { isOps } from '@/lib/permissions'

type Profile = Database['public']['Tables']['profiles']['Row']

interface OverviewDashboardV2Props {
  profile: Profile
}

// Department labels
const departmentLabels: Record<string, string> = {
  MKT: 'Marketing',
  SAL: 'Sales',
  DOM: 'Domestics Ops',
  EXI: 'EXIM Ops',
  DTD: 'Import DTD Ops',
  TRF: 'Traffic & Warehouse',
}

// Status labels and colors
const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  open: { label: 'Open', color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-950/30' },
  need_response: { label: 'Need Response', color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-950/30' },
  in_progress: { label: 'In Progress', color: 'text-yellow-600', bgColor: 'bg-yellow-50 dark:bg-yellow-950/30' },
  waiting_customer: { label: 'Waiting Customer', color: 'text-purple-600', bgColor: 'bg-purple-50 dark:bg-purple-950/30' },
  need_adjustment: { label: 'Need Adjustment', color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-950/30' },
  pending: { label: 'Pending', color: 'text-gray-600', bgColor: 'bg-gray-50 dark:bg-gray-950/30' },
  resolved: { label: 'Resolved', color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-950/30' },
  closed: { label: 'Closed', color: 'text-slate-600', bgColor: 'bg-slate-50 dark:bg-slate-950/30' },
}

// Rejection reason labels
const rejectionReasonLabels: Record<string, string> = {
  price_too_high: 'Price Too High',
  competitor_better_price: 'Competitor Better Price',
  customer_budget_limited: 'Customer Budget Limited',
  service_not_suitable: 'Service Not Suitable',
  timing_issue: 'Timing Issue',
  other: 'Other',
}

// Format duration helpers
function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '0 detik'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} jam`)
  if (minutes > 0) parts.push(`${minutes} menit`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs} detik`)
  return parts.join(' ')
}

function formatDurationShort(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '0d'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0 && minutes > 0) return `${hours}j ${minutes}m`
  if (hours > 0) return `${hours}j`
  if (minutes > 0) return `${minutes}m`
  return `${Math.floor(seconds)}d`
}

function formatCurrency(value: number | null | undefined): string {
  if (!value) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Drilldown ticket interface
interface DrilldownTicket {
  id: string
  ticket_code: string
  subject: string
  status: string
  department: string
  ticket_type: string
  created_at: string
  updated_at: string
  creator_name: string | null
  assignee_name: string | null
  first_response_at: string | null
  first_response_met: boolean | null
  resolution_at: string | null
  resolution_met: boolean | null
}

// Drilldown Modal Component
function DrilldownModal({
  open,
  onClose,
  title,
  description,
  metric,
  ticketType,
  period,
  viewMode,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  metric: string
  ticketType: string
  period: number
  viewMode: string
}) {
  const [loading, setLoading] = useState(false)
  const [tickets, setTickets] = useState<DrilldownTicket[]>([])
  const [totalCount, setTotalCount] = useState(0)

  const fetchDrilldown = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        metric,
        ticket_type: ticketType,
        period: period.toString(),
        view_mode: viewMode,
        limit: '50',
      })
      const res = await fetch(`/api/ticketing/overview/drilldown?${params}`)
      const data = await res.json()
      if (data.success) {
        setTickets(data.data.tickets || [])
        setTotalCount(data.data.total_count || 0)
      }
    } catch (err) {
      console.error('Error fetching drilldown:', err)
    } finally {
      setLoading(false)
    }
  }, [metric, ticketType, period, viewMode])

  useEffect(() => {
    if (open && metric) {
      fetchDrilldown()
    }
  }, [open, metric, fetchDrilldown])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {title}
            <Badge variant="outline">{totalCount} tiket</Badge>
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Tidak ada tiket yang ditemukan
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/tickets/${ticket.id}`}
                  className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={ticket.ticket_type === 'RFQ' ? 'default' : 'secondary'} className="text-xs">
                          {ticket.ticket_type}
                        </Badge>
                        <span className="font-mono text-sm font-medium">{ticket.ticket_code}</span>
                        <Badge
                          variant="outline"
                          className={statusConfig[ticket.status]?.color || ''}
                        >
                          {statusConfig[ticket.status]?.label || ticket.status}
                        </Badge>
                      </div>
                      <p className="text-sm truncate">{ticket.subject}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>Creator: {ticket.creator_name || '-'}</span>
                        <span>Assignee: {ticket.assignee_name || '-'}</span>
                        <span>{new Date(ticket.created_at).toLocaleDateString('id-ID')}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

// Clickable Metric Card Component
function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'text-foreground',
  bgColor = 'bg-muted/50',
  onClick,
  clickable = false,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon?: any
  color?: string
  bgColor?: string
  onClick?: () => void
  clickable?: boolean
}) {
  const CardWrapper = clickable ? 'button' : 'div'

  return (
    <CardWrapper
      onClick={clickable ? onClick : undefined}
      className={`p-4 rounded-lg ${bgColor} text-left w-full ${
        clickable ? 'cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{title}</p>
        {Icon && <Icon className={`h-4 w-4 ${color}`} />}
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      {clickable && (
        <p className="text-xs text-primary mt-1 flex items-center gap-1">
          Lihat detail <ArrowRight className="h-3 w-3" />
        </p>
      )}
    </CardWrapper>
  )
}

// SLA Gauge Component
function SLAGauge({
  met,
  breached,
  pending,
  label,
  onClickMet,
  onClickBreached,
  onClickPending,
}: {
  met: number
  breached: number
  pending: number
  label: string
  onClickMet?: () => void
  onClickBreached?: () => void
  onClickPending?: () => void
}) {
  const total = met + breached
  const compliance = total > 0 ? Math.round((met / total) * 100) : 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className={`text-lg font-bold ${compliance >= 80 ? 'text-green-600' : compliance >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
          {compliance}%
        </span>
      </div>
      <Progress
        value={compliance}
        className={`h-2 ${compliance >= 80 ? '[&>div]:bg-green-500' : compliance >= 60 ? '[&>div]:bg-yellow-500' : '[&>div]:bg-red-500'}`}
      />
      <div className="grid grid-cols-3 gap-2 text-xs">
        <button
          onClick={onClickMet}
          className="p-2 rounded bg-green-50 dark:bg-green-950/30 hover:ring-2 hover:ring-green-500/50 transition-all"
        >
          <p className="font-medium text-green-600">{met}</p>
          <p className="text-muted-foreground">Met</p>
        </button>
        <button
          onClick={onClickBreached}
          className="p-2 rounded bg-red-50 dark:bg-red-950/30 hover:ring-2 hover:ring-red-500/50 transition-all"
        >
          <p className="font-medium text-red-600">{breached}</p>
          <p className="text-muted-foreground">Breached</p>
        </button>
        <button
          onClick={onClickPending}
          className="p-2 rounded bg-gray-50 dark:bg-gray-950/30 hover:ring-2 hover:ring-gray-500/50 transition-all"
        >
          <p className="font-medium text-gray-600">{pending}</p>
          <p className="text-muted-foreground">Pending</p>
        </button>
      </div>
    </div>
  )
}

// Main Dashboard Component
export function OverviewDashboardV2({ profile }: OverviewDashboardV2Props) {
  const [period, setPeriod] = useState('30')
  const [ticketTypeFilter, setTicketTypeFilter] = useState<'TOTAL' | 'RFQ' | 'GEN'>('TOTAL')
  const [viewMode, setViewMode] = useState<'received' | 'created'>('received')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)

  // Drilldown state
  const [drilldownOpen, setDrilldownOpen] = useState(false)
  const [drilldownConfig, setDrilldownConfig] = useState({
    title: '',
    description: '',
    metric: '',
  })

  // Fetch data from V2 API
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ticketing/overview/v2?period=${period}&view_mode=${viewMode}`)
      const json = await res.json()
      if (json.success) {
        setData(json.data)
      }
    } catch (err) {
      console.error('Error fetching overview data:', err)
    } finally {
      setLoading(false)
    }
  }, [period, viewMode])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Open drilldown modal
  const openDrilldown = (metric: string, title: string, description: string) => {
    setDrilldownConfig({ metric, title, description })
    setDrilldownOpen(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Gagal memuat data dashboard
      </div>
    )
  }

  // Extract data based on ticket type filter
  const counts = data.counts_by_type?.[ticketTypeFilter] || {}
  const statusCards = ticketTypeFilter === 'TOTAL'
    ? data.status_cards?.by_status || {}
    : data.status_cards?.by_status_and_type?.[ticketTypeFilter] || {}
  const responseMetrics = data.response_time_metrics?.[ticketTypeFilter] || {}
  // Fix: TOTAL section in RPC doesn't include 'pending' — compute from RFQ + GEN
  const slaComplianceRaw = data.sla_compliance?.[ticketTypeFilter] || {}
  const slaCompliance = ticketTypeFilter === 'TOTAL' ? {
    ...slaComplianceRaw,
    first_response: {
      ...slaComplianceRaw.first_response,
      pending: slaComplianceRaw.first_response?.pending ??
        ((data.sla_compliance?.RFQ?.first_response?.pending || 0) + (data.sla_compliance?.GEN?.first_response?.pending || 0)),
    },
    resolution: {
      ...slaComplianceRaw.resolution,
      pending: slaComplianceRaw.resolution?.pending ??
        ((data.sla_compliance?.RFQ?.resolution?.pending || 0) + (data.sla_compliance?.GEN?.resolution?.pending || 0)),
    },
    first_quote_pending: slaComplianceRaw.first_quote_pending ?? (data.sla_compliance?.RFQ?.first_quote_pending || 0),
  } : slaComplianceRaw
  const quotationAnalytics = data.quotation_analytics || {}
  const opsCostAnalytics = data.ops_cost_analytics || {}
  const leaderboards = data.leaderboards || {}
  const meta = data.meta || {}

  const isDirectorScope = meta.scope === 'all'
  const isDepartmentScope = meta.scope === 'department'
  const isOpsUser = isOps(profile.role) || meta.is_ops === true

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview Ticketing</h1>
          <p className="text-muted-foreground">
            {viewMode === 'received' ? 'Tiket yang diterima' : 'Tiket yang dibuat'}
            {meta.scope === 'all' ? ' — semua departemen' : meta.scope === 'department' ? ` — ${departmentLabels[meta.department] || meta.department}` : ''}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={ticketTypeFilter} onValueChange={(v: any) => setTicketTypeFilter(v)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Tipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TOTAL">Semua</SelectItem>
              <SelectItem value="RFQ">RFQ</SelectItem>
              <SelectItem value="GEN">General</SelectItem>
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Periode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 hari terakhir</SelectItem>
              <SelectItem value="30">30 hari terakhir</SelectItem>
              <SelectItem value="90">90 hari terakhir</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Ticket Received / Ticket Created Tabs */}
      <div className="flex">
        <div className="inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
          <button
            onClick={() => setViewMode('received')}
            className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-all ${
              viewMode === 'received'
                ? 'bg-background text-foreground shadow-sm'
                : 'hover:text-foreground'
            }`}
          >
            <Inbox className="h-4 w-4" />
            Ticket Received
          </button>
          <button
            onClick={() => setViewMode('created')}
            className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-all ${
              viewMode === 'created'
                ? 'bg-background text-foreground shadow-sm'
                : 'hover:text-foreground'
            }`}
          >
            <PenLine className="h-4 w-4" />
            Ticket Created
          </button>
        </div>
      </div>

      {/* Section 1: Ticket Distribution — All clickable for drilldown */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
          onClick={() => openDrilldown('total', 'Semua Tiket', 'Daftar semua tiket dalam periode ini')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tiket</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.total || 0}</div>
            <button
              onClick={(e) => { e.stopPropagation(); openDrilldown('today_created', 'Dibuat Hari Ini', 'Tiket yang dibuat hari ini') }}
              className="text-xs text-primary hover:underline"
            >
              {counts.created_today || 0} dibuat hari ini
            </button>
          </CardContent>
        </Card>
        <Card
          className="border-orange-200 dark:border-orange-900 cursor-pointer hover:ring-2 hover:ring-orange-500/50 transition-all"
          onClick={() => openDrilldown('active', 'Tiket Aktif', 'Tiket yang belum resolved/closed')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aktif</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{counts.active || 0}</div>
            <p className="text-xs text-muted-foreground">
              Belum resolved/closed
            </p>
          </CardContent>
        </Card>
        <Card
          className="border-green-200 dark:border-green-900 cursor-pointer hover:ring-2 hover:ring-green-500/50 transition-all"
          onClick={() => openDrilldown('completed', 'Tiket Selesai', 'Tiket resolved/closed')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Selesai</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{counts.completed || 0}</div>
            <button
              onClick={(e) => { e.stopPropagation(); openDrilldown('today_resolved', 'Diselesaikan Hari Ini', 'Tiket yang diselesaikan hari ini') }}
              className="text-xs text-primary hover:underline"
            >
              {counts.resolved_today || 0} diselesaikan hari ini
            </button>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
          onClick={() => openDrilldown('completed', 'Tiket Selesai', 'Tiket resolved/closed (resolution rate)')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolution Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-brand" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0}%
            </div>
            <Progress
              value={counts.total > 0 ? (counts.completed / counts.total) * 100 : 0}
              className="h-2 mt-2"
            />
          </CardContent>
        </Card>
      </div>

      {/* RFQ vs GEN Breakdown */}
      {ticketTypeFilter === 'TOTAL' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card
            className="border-blue-200 dark:border-blue-900 cursor-pointer hover:ring-2 hover:ring-blue-500/50 transition-all"
            onClick={() => setTicketTypeFilter('RFQ')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Badge variant="default" className="text-xs">RFQ</Badge>
                Request for Quotation
              </CardTitle>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.counts_by_type?.RFQ?.total || 0}</div>
              <p className="text-xs text-muted-foreground">
                {data.counts_by_type?.RFQ?.active || 0} aktif, {data.counts_by_type?.RFQ?.completed || 0} selesai
              </p>
            </CardContent>
          </Card>
          <Card
            className="border-purple-200 dark:border-purple-900 cursor-pointer hover:ring-2 hover:ring-purple-500/50 transition-all"
            onClick={() => setTicketTypeFilter('GEN')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">GEN</Badge>
                General Request
              </CardTitle>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.counts_by_type?.GEN?.total || 0}</div>
              <p className="text-xs text-muted-foreground">
                {data.counts_by_type?.GEN?.active || 0} aktif, {data.counts_by_type?.GEN?.completed || 0} selesai
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Section 2: Status Cards (Clickable for Drilldown) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Distribusi Status
          </CardTitle>
          <CardDescription>Klik card untuk melihat daftar tiket</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(statusConfig).map(([status, config]) => {
              const count = (statusCards[status] as number) || 0
              return (
                <button
                  key={status}
                  onClick={() => openDrilldown(
                    `status_${status}`,
                    `Tiket ${config.label}`,
                    `Daftar tiket dengan status ${config.label}`
                  )}
                  className={`p-4 rounded-lg ${config.bgColor} text-left hover:ring-2 hover:ring-primary/50 transition-all`}
                >
                  <p className={`text-2xl font-bold ${config.color}`}>{count}</p>
                  <p className="text-xs text-muted-foreground">{config.label}</p>
                  <p className="text-xs text-primary mt-1 flex items-center gap-1">
                    Lihat <ArrowRight className="h-3 w-3" />
                  </p>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Section 3: SLA Compliance + Response Times */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* SLA Compliance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-brand" />
              SLA Compliance
            </CardTitle>
            <CardDescription>Klik angka untuk melihat daftar tiket</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <SLAGauge
              label="First Response SLA"
              met={slaCompliance.first_response?.met || 0}
              breached={slaCompliance.first_response?.breached || 0}
              pending={slaCompliance.first_response?.pending || 0}
              onClickMet={() => openDrilldown('first_response_met', 'First Response SLA Met', 'Tiket yang memenuhi SLA first response')}
              onClickBreached={() => openDrilldown('first_response_breached', 'First Response SLA Breached', 'Tiket yang melanggar SLA first response')}
              onClickPending={() => openDrilldown('first_response_pending', 'First Response Pending', 'Tiket yang belum ada first response')}
            />
            <SLAGauge
              label="Resolution SLA"
              met={slaCompliance.resolution?.met || 0}
              breached={slaCompliance.resolution?.breached || 0}
              pending={slaCompliance.resolution?.pending || 0}
              onClickMet={() => openDrilldown('resolution_met', 'Resolution SLA Met', 'Tiket yang memenuhi SLA resolution')}
              onClickBreached={() => openDrilldown('resolution_breached', 'Resolution SLA Breached', 'Tiket yang melanggar SLA resolution')}
              onClickPending={() => openDrilldown('resolution_pending', 'Resolution Pending', 'Tiket yang belum resolved')}
            />
            {ticketTypeFilter !== 'GEN' && slaCompliance.first_quote_pending !== undefined && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">RFQ tanpa Quote</span>
                  <button
                    onClick={() => openDrilldown('first_quote_pending', 'RFQ tanpa Quote', 'Tiket RFQ yang belum ada operational cost')}
                    className="text-amber-600 font-bold hover:underline"
                  >
                    {slaCompliance.first_quote_pending}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Tiket RFQ yang perlu ops cost</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Response Time Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-brand" />
              Response Time Metrics
            </CardTitle>
            <CardDescription>Rata-rata waktu respons</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <MetricCard
                title="Assignee First Response"
                value={formatDurationShort(responseMetrics.first_response?.avg_seconds)}
                subtitle={`${responseMetrics.first_response?.count || 0} respons`}
                icon={Clock}
                color="text-blue-600"
                bgColor="bg-blue-50 dark:bg-blue-950/30"
                clickable
                onClick={() => openDrilldown('first_response_met', 'Tiket dengan First Response', 'Tiket yang sudah ada first response')}
              />
              <MetricCard
                title="Assignee Avg Response"
                value={formatDurationShort(responseMetrics.avg_response?.assignee_avg)}
                subtitle="Per stage transition"
                icon={Clock}
                color="text-purple-600"
                bgColor="bg-purple-50 dark:bg-purple-950/30"
                clickable
                onClick={() => openDrilldown('active', 'Tiket Aktif', 'Tiket dengan stage response metrics')}
              />
              <MetricCard
                title="Creator Avg Response"
                value={formatDurationShort(responseMetrics.avg_response?.creator_avg)}
                subtitle="Per stage transition"
                icon={Clock}
                color="text-green-600"
                bgColor="bg-green-50 dark:bg-green-950/30"
                clickable
                onClick={() => openDrilldown('total', 'Semua Tiket', 'Tiket dengan creator response metrics')}
              />
              <MetricCard
                title="Avg Resolution Time"
                value={formatDurationShort(responseMetrics.resolution?.avg_seconds)}
                subtitle={`${responseMetrics.resolution?.count || 0} resolved`}
                icon={CheckCircle2}
                color="text-emerald-600"
                bgColor="bg-emerald-50 dark:bg-emerald-950/30"
                clickable
                onClick={() => openDrilldown('completed', 'Tiket Selesai', 'Tiket yang sudah resolved/closed')}
              />
            </div>

            {/* Response Time Distribution */}
            {responseMetrics.distribution && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm font-medium mb-3">First Response Distribution</p>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <button
                    onClick={() => openDrilldown('response_under_1h', 'First Response < 1 Jam', 'Tiket dengan first response di bawah 1 jam')}
                    className="p-2 rounded bg-green-50 dark:bg-green-950/30 text-center hover:ring-2 hover:ring-green-500/50 transition-all"
                  >
                    <p className="font-bold text-green-600">{responseMetrics.distribution.under_1_hour || 0}</p>
                    <p className="text-muted-foreground">&lt;1 jam</p>
                  </button>
                  <button
                    onClick={() => openDrilldown('response_1_to_4h', 'First Response 1-4 Jam', 'Tiket dengan first response 1-4 jam')}
                    className="p-2 rounded bg-yellow-50 dark:bg-yellow-950/30 text-center hover:ring-2 hover:ring-yellow-500/50 transition-all"
                  >
                    <p className="font-bold text-yellow-600">{responseMetrics.distribution.from_1_to_4_hours || 0}</p>
                    <p className="text-muted-foreground">1-4 jam</p>
                  </button>
                  <button
                    onClick={() => openDrilldown('response_4_to_24h', 'First Response 4-24 Jam', 'Tiket dengan first response 4-24 jam')}
                    className="p-2 rounded bg-orange-50 dark:bg-orange-950/30 text-center hover:ring-2 hover:ring-orange-500/50 transition-all"
                  >
                    <p className="font-bold text-orange-600">{responseMetrics.distribution.from_4_to_24_hours || 0}</p>
                    <p className="text-muted-foreground">4-24 jam</p>
                  </button>
                  <button
                    onClick={() => openDrilldown('response_over_24h', 'First Response > 24 Jam', 'Tiket dengan first response lebih dari 24 jam')}
                    className="p-2 rounded bg-red-50 dark:bg-red-950/30 text-center hover:ring-2 hover:ring-red-500/50 transition-all"
                  >
                    <p className="font-bold text-red-600">{responseMetrics.distribution.over_24_hours || 0}</p>
                    <p className="text-muted-foreground">&gt;24 jam</p>
                  </button>
                </div>
              </div>
            )}

            {/* First Quote for RFQ */}
            {ticketTypeFilter !== 'GEN' && responseMetrics.first_quote && (
              <div className="mt-4 pt-4 border-t">
                <MetricCard
                  title="Ops First Quote (RFQ)"
                  value={formatDurationShort(responseMetrics.first_quote.avg_seconds)}
                  subtitle={`${responseMetrics.first_quote.count || 0} quotes, target: <4 jam`}
                  icon={FileText}
                  color="text-amber-600"
                  bgColor="bg-amber-50 dark:bg-amber-950/30"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 4: Quotation Analytics (Sales/Marketing) - Hidden for Ops users */}
      {!isOpsUser && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-brand" />
              Quotation Analytics
            </CardTitle>
            <CardDescription>Customer quotation performance</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="summary">
              <TabsList className="mb-4">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="rejection">Rejection Analysis</TabsTrigger>
              </TabsList>
              <TabsContent value="summary" className="space-y-4">
                {/* Status Breakdown — All clickable */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <MetricCard
                    title="Draft"
                    value={quotationAnalytics.summary?.draft || 0}
                    icon={FileText}
                    bgColor="bg-gray-50 dark:bg-gray-950/30"
                    clickable
                    onClick={() => openDrilldown('quotation_draft', 'Quotation Draft', 'Tiket dengan quotation draft')}
                  />
                  <MetricCard
                    title="Sent"
                    value={quotationAnalytics.summary?.sent || 0}
                    icon={ArrowRight}
                    color="text-blue-600"
                    bgColor="bg-blue-50 dark:bg-blue-950/30"
                    clickable
                    onClick={() => openDrilldown('quotation_sent', 'Quotation Sent', 'Tiket dengan quotation yang sudah dikirim')}
                  />
                  <MetricCard
                    title="Accepted"
                    value={quotationAnalytics.summary?.accepted || 0}
                    icon={CheckCircle2}
                    color="text-green-600"
                    bgColor="bg-green-50 dark:bg-green-950/30"
                    clickable
                    onClick={() => openDrilldown('quotation_accepted', 'Quotation Accepted', 'Tiket dengan quotation yang diterima')}
                  />
                  <MetricCard
                    title="Rejected"
                    value={quotationAnalytics.summary?.rejected || 0}
                    icon={XCircle}
                    color="text-red-600"
                    bgColor="bg-red-50 dark:bg-red-950/30"
                    clickable
                    onClick={() => openDrilldown('quotation_rejected', 'Quotation Rejected', 'Tiket dengan quotation yang ditolak')}
                  />
                  <MetricCard
                    title="Expired"
                    value={quotationAnalytics.summary?.expired || 0}
                    icon={Hourglass}
                    color="text-orange-600"
                    bgColor="bg-orange-50 dark:bg-orange-950/30"
                    clickable
                    onClick={() => openDrilldown('quotation_expired', 'Quotation Expired', 'Tiket dengan quotation yang expired')}
                  />
                </div>

                {/* Value & Conversion */}
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">Total Value</p>
                    <p className="text-xl font-bold">{formatCurrency(quotationAnalytics.value?.total)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30">
                    <p className="text-sm text-muted-foreground">Accepted Value</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(quotationAnalytics.value?.accepted)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">Win Rate</p>
                    <p className="text-xl font-bold">{quotationAnalytics.conversion?.total_win_rate || 0}%</p>
                    <Progress value={quotationAnalytics.conversion?.total_win_rate || 0} className="h-2 mt-2" />
                  </div>
                </div>

                {/* By Type Breakdown */}
                {quotationAnalytics.by_type && (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg border border-blue-200 dark:border-blue-900">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="default">RFQ</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Total</p>
                          <p className="font-medium">{quotationAnalytics.by_type.RFQ?.total || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Accepted</p>
                          <p className="font-medium text-green-600">{quotationAnalytics.by_type.RFQ?.accepted || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Value</p>
                          <p className="font-medium">{formatCurrency(quotationAnalytics.by_type.RFQ?.value_accepted)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border border-purple-200 dark:border-purple-900">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary">GEN</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Total</p>
                          <p className="font-medium">{quotationAnalytics.by_type.GEN?.total || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Accepted</p>
                          <p className="font-medium text-green-600">{quotationAnalytics.by_type.GEN?.accepted || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Value</p>
                          <p className="font-medium">{formatCurrency(quotationAnalytics.by_type.GEN?.value_accepted)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="rejection" className="space-y-4">
                {/* Rejection Reasons */}
                {quotationAnalytics.rejection_reasons && Object.keys(quotationAnalytics.rejection_reasons).length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Rejection Reasons</p>
                    {Object.entries(quotationAnalytics.rejection_reasons).map(([reason, count]) => {
                      const total = Object.values(quotationAnalytics.rejection_reasons as Record<string, number>).reduce((a, b) => a + b, 0)
                      const percentage = total > 0 ? Math.round(((count as number) / total) * 100) : 0
                      return (
                        <div key={reason} className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span>{rejectionReasonLabels[reason] || reason}</span>
                              <span className="font-medium">{count as number} ({percentage}%)</span>
                            </div>
                            <Progress value={percentage} className="h-2 [&>div]:bg-red-500" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">Tidak ada rejection dalam periode ini</p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Section 5: Ops Cost Analytics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-brand" />
            Operational Cost Analytics
          </CardTitle>
          <CardDescription>Ops cost submission and approval metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="summary">
            <TabsList className="mb-4">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="rejection">Rejection Analysis</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="space-y-4">
              {/* Status Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <MetricCard
                  title="Draft"
                  value={opsCostAnalytics.summary?.draft || 0}
                  bgColor="bg-gray-50 dark:bg-gray-950/30"
                  clickable
                  onClick={() => openDrilldown('ops_cost_draft', 'Ops Cost Draft', 'Tiket dengan operational cost draft')}
                />
                <MetricCard
                  title="Submitted"
                  value={opsCostAnalytics.summary?.submitted || 0}
                  color="text-blue-600"
                  bgColor="bg-blue-50 dark:bg-blue-950/30"
                  clickable
                  onClick={() => openDrilldown('ops_cost_submitted', 'Ops Cost Submitted', 'Tiket dengan operational cost yang sudah disubmit')}
                />
                <MetricCard
                  title="Sent to Customer"
                  value={opsCostAnalytics.summary?.sent_to_customer || 0}
                  color="text-purple-600"
                  bgColor="bg-purple-50 dark:bg-purple-950/30"
                  clickable
                  onClick={() => openDrilldown('ops_cost_sent_to_customer', 'Ops Cost Sent to Customer', 'Tiket dengan operational cost yang sudah dikirim ke customer')}
                />
                <MetricCard
                  title="Accepted"
                  value={opsCostAnalytics.summary?.accepted || 0}
                  icon={CheckCircle2}
                  color="text-green-600"
                  bgColor="bg-green-50 dark:bg-green-950/30"
                  clickable
                  onClick={() => openDrilldown('ops_cost_accepted', 'Ops Cost Accepted', 'Tiket dengan operational cost yang diterima')}
                />
                <MetricCard
                  title="Rejected"
                  value={(opsCostAnalytics.summary?.rejected || 0) + (opsCostAnalytics.summary?.revise_requested || 0)}
                  icon={XCircle}
                  color="text-red-600"
                  bgColor="bg-red-50 dark:bg-red-950/30"
                  clickable
                  onClick={() => openDrilldown('ops_cost_rejected', 'Ops Cost Rejected', 'Tiket dengan operational cost yang ditolak')}
                />
              </div>

              {/* Approval Rate & Turnaround */}
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Approval Rate</p>
                  <p className="text-xl font-bold">{opsCostAnalytics.approval_rate || 0}%</p>
                  <Progress value={opsCostAnalytics.approval_rate || 0} className="h-2 mt-2 [&>div]:bg-green-500" />
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Avg Turnaround</p>
                  <p className="text-xl font-bold">{formatDurationShort(opsCostAnalytics.turnaround?.avg_seconds)}</p>
                  <p className="text-xs text-muted-foreground">{opsCostAnalytics.turnaround?.count || 0} submissions</p>
                </div>
                <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30">
                  <p className="text-sm text-muted-foreground">Approved Value</p>
                  <p className="text-xl font-bold text-green-600">{formatCurrency(opsCostAnalytics.value?.approved)}</p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="rejection" className="space-y-4">
              {/* Rejection Reasons */}
              {opsCostAnalytics.rejection_reasons && Object.keys(opsCostAnalytics.rejection_reasons).length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Rejection Reasons</p>
                  {Object.entries(opsCostAnalytics.rejection_reasons).map(([reason, count]) => {
                    const total = Object.values(opsCostAnalytics.rejection_reasons as Record<string, number>).reduce((a, b) => a + b, 0)
                    const percentage = total > 0 ? Math.round(((count as number) / total) * 100) : 0
                    return (
                      <div key={reason} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span>{rejectionReasonLabels[reason] || reason}</span>
                            <span className="font-medium">{count as number} ({percentage}%)</span>
                          </div>
                          <Progress value={percentage} className="h-2 [&>div]:bg-red-500" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">Tidak ada rejection dalam periode ini</p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Section 6: Leaderboards */}
      {(isDirectorScope || isDepartmentScope) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              Leaderboards
            </CardTitle>
            <CardDescription>
              {isDirectorScope ? 'Global performance rankings' : `Performance dalam ${departmentLabels[meta.department] || meta.department}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="completion">
              <TabsList className="mb-4 flex-wrap">
                <TabsTrigger value="completion">By Completion</TabsTrigger>
                <TabsTrigger value="response">By Response Speed</TabsTrigger>
                <TabsTrigger value="quotes">By Quotes</TabsTrigger>
                <TabsTrigger value="winrate">By Win Rate</TabsTrigger>
              </TabsList>

              <TabsContent value="completion">
                <LeaderboardTable
                  data={leaderboards.by_completion || []}
                  columns={[
                    { key: 'name', label: 'Name' },
                    { key: 'department', label: 'Dept' },
                    { key: 'tickets_completed', label: 'Completed', highlight: true },
                    { key: 'completion_rate', label: 'Rate', suffix: '%' },
                  ]}
                />
              </TabsContent>

              <TabsContent value="response">
                <LeaderboardTable
                  data={leaderboards.by_response_speed || []}
                  columns={[
                    { key: 'name', label: 'Name' },
                    { key: 'department', label: 'Dept' },
                    { key: 'avg_first_response_seconds', label: 'Avg First Response', format: formatDurationShort, highlight: true },
                  ]}
                />
              </TabsContent>

              <TabsContent value="quotes">
                <LeaderboardTable
                  data={leaderboards.by_quotes || []}
                  columns={[
                    { key: 'name', label: 'Name' },
                    { key: 'department', label: 'Dept' },
                    { key: 'quotes_submitted', label: 'Quotes Submitted', highlight: true },
                  ]}
                />
              </TabsContent>

              <TabsContent value="winrate">
                <LeaderboardTable
                  data={leaderboards.by_win_rate || []}
                  columns={[
                    { key: 'name', label: 'Name' },
                    { key: 'department', label: 'Dept' },
                    { key: 'win_rate', label: 'Win Rate', suffix: '%', highlight: true },
                    { key: 'tickets_won', label: 'Won' },
                    { key: 'tickets_lost', label: 'Lost' },
                  ]}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Drilldown Modal */}
      <DrilldownModal
        open={drilldownOpen}
        onClose={() => setDrilldownOpen(false)}
        title={drilldownConfig.title}
        description={drilldownConfig.description}
        metric={drilldownConfig.metric}
        ticketType={ticketTypeFilter}
        period={parseInt(period)}
        viewMode={viewMode}
      />
    </div>
  )
}

// Leaderboard Table Component
function LeaderboardTable({
  data,
  columns,
}: {
  data: any[]
  columns: { key: string; label: string; format?: (v: any) => string; suffix?: string; highlight?: boolean }[]
}) {
  if (!data || data.length === 0) {
    return <p className="text-muted-foreground text-center py-4">Tidak ada data</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-2 font-medium text-muted-foreground">#</th>
            {columns.map((col) => (
              <th key={col.key} className="text-left py-2 px-2 font-medium text-muted-foreground">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 10).map((row, idx) => (
            <tr key={row.user_id || idx} className="border-b last:border-0 hover:bg-muted/50">
              <td className="py-2 px-2">
                {idx === 0 && <span className="text-amber-500">🥇</span>}
                {idx === 1 && <span className="text-gray-400">🥈</span>}
                {idx === 2 && <span className="text-amber-700">🥉</span>}
                {idx > 2 && <span className="text-muted-foreground">{idx + 1}</span>}
              </td>
              {columns.map((col) => {
                const value = row[col.key]
                const displayValue = col.format ? col.format(value) : value
                return (
                  <td
                    key={col.key}
                    className={`py-2 px-2 ${col.highlight ? 'font-bold' : ''}`}
                  >
                    {displayValue}{col.suffix || ''}
                    {col.key === 'department' && value && (
                      <Badge variant="outline" className="ml-1 text-xs">
                        {departmentLabels[value] || value}
                      </Badge>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
