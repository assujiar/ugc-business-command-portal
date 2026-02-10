'use client'

// =====================================================
// CRM Dashboard Content - Comprehensive Client Component
// Handles all dashboard sections with role-based visibility
// =====================================================

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DollarSign, TrendingUp, CheckCircle, Target, Users, UserPlus, Clock,
  Activity, BarChart3, Trophy, Medal, Award, Crown, MapPin, Video, Phone,
  MessageSquare, Mail, Building2, AlertCircle,
  Briefcase, ArrowUp, ArrowDown, Minus, Layers, PieChart, Filter,
  RotateCcw, Star, Calendar, X,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, Cell, PieChart as RechartPieChart, Pie,
} from 'recharts'
import { isAdmin, isSales, isMarketing } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

// =====================================================
// Types
// =====================================================

interface OpportunityData {
  opportunity_id: string
  name: string
  account_id: string
  stage: string
  estimated_value: number
  owner_user_id: string | null
  original_creator_id: string | null
  created_at: string
  closed_at: string | null
  lost_reason: string | null
}

interface AccountData {
  account_id: string
  company_name: string
  account_status: string | null
  industry: string | null
  owner_user_id: string | null
  original_creator_id: string | null
  created_at: string
  first_transaction_date: string | null
  last_transaction_date: string | null
}

interface ActivityData {
  activity_id: string
  activity_type: string
  status: string
  owner_user_id: string
  created_at: string
  completed_at: string | null
  related_opportunity_id?: string | null
}

interface LeadData {
  lead_id: string
  company_name: string | null
  source: string | null
  triage_status: string
  sales_owner_user_id: string | null
  marketing_owner_user_id: string | null
  created_by: string
  opportunity_id: string | null
  account_id: string | null
  created_at: string
  handed_over_at: string | null
  claimed_at: string | null
}

interface SalesPlanData {
  plan_id: string
  plan_type: string
  status: string
  potential_status: string | null
  owner_user_id: string
  created_at: string
}

interface PipelineUpdateData {
  update_id: string
  opportunity_id: string
  approach_method: string | null
  updated_by: string
  created_at: string
  updated_at: string
}

interface StageHistoryData {
  opportunity_id: string
  old_stage: string | null
  new_stage: string
  changed_at: string
}

interface SalesProfileData {
  user_id: string
  name: string
  email: string
  role: string
}

interface QuotationData {
  id: string
  opportunity_id: string | null
  status: string
  total_selling_rate: number
  service_type: string | null
  service_type_code: string | null
  created_by: string
  created_at: string
}

interface RFQTicketData {
  ticket_id: string
  service_type: string | null
  cargo_category: string | null
  origin_city: string | null
  destination_city: string | null
  created_at: string
}

export interface DashboardDataProps {
  userId: string
  userName: string
  role: string
  opportunities: OpportunityData[]
  accounts: AccountData[]
  activities: ActivityData[]
  leads: LeadData[]
  salesPlans: SalesPlanData[]
  pipelineUpdates: PipelineUpdateData[]
  stageHistory: StageHistoryData[]
  salesProfiles: SalesProfileData[]
  customerQuotations: QuotationData[]
  allOpportunities: OpportunityData[]
  allAccounts: AccountData[]
  allActivities: ActivityData[]
  allPipelineUpdates: PipelineUpdateData[]
  allSalesPlans: SalesPlanData[]
  rfqTickets: RFQTicketData[]
  marketingProfiles: SalesProfileData[]
}

// =====================================================
// Helpers
// =====================================================

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `Rp ${(value / 1_000).toFixed(1)}K`
  return `Rp ${value.toLocaleString('id-ID')}`
}

function formatDays(days: number): string {
  if (days === 0) return '-'
  if (days < 1) return `${Math.round(days * 24)}h`
  return `${days.toFixed(1)} hari`
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

function getWeekStartDate(year: number, weekNum: number): Date {
  const jan1 = new Date(year, 0, 1)
  const jan1Day = jan1.getDay() || 7
  const daysToFirstMonday = jan1Day <= 4 ? 1 - jan1Day : 8 - jan1Day
  const firstMonday = new Date(year, 0, 1 + daysToFirstMonday)
  const weekStart = new Date(firstMonday)
  weekStart.setDate(firstMonday.getDate() + (weekNum - 1) * 7)
  weekStart.setHours(0, 0, 0, 0)
  return weekStart
}

function getWeekEndDate(weekStart: Date): Date {
  const end = new Date(weekStart)
  end.setDate(weekStart.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

function getTotalWeeks(year: number): number {
  const dec28 = new Date(year, 11, 28)
  const dayOfDec28 = dec28.getDay() || 7
  const thu = new Date(dec28)
  thu.setDate(dec28.getDate() - dayOfDec28 + 4)
  const jan1 = new Date(thu.getFullYear(), 0, 1)
  return Math.ceil(((thu.getTime() - jan1.getTime()) / 86400000 + 1) / 7)
}

function formatWeekLabel(year: number, weekNum: number): string {
  const start = getWeekStartDate(year, weekNum)
  const end = getWeekEndDate(start)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  return `Week ${weekNum} (${start.getDate()}-${end.getDate()} ${months[start.getMonth()]})`
}

function calcGrowth(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return ((current - previous) / previous) * 100
}

/**
 * Compute unified activity count matching the Activities page logic.
 * Activities page combines 3 sources: sales_plans + pipeline_updates + activities (deduplicated).
 * Deduplication: remove activities that have a matching pipeline_update on same opportunity within 1 min.
 */
function computeUnifiedActivityCount(
  activities: ActivityData[],
  pipelineUpdates: PipelineUpdateData[],
  salesPlans: SalesPlanData[]
): { total: number; breakdown: Record<string, number> } {
  // Build dedup keys from pipeline_updates using updated_at (matching Activities page logic)
  // The Activities page uses pu.updated_at for the dedup timestamp, NOT created_at
  const puKeys = new Set(
    pipelineUpdates.map(pu => {
      const ts = new Date(pu.updated_at).getTime()
      return `${pu.opportunity_id}_${Math.floor(ts / 60000)}`
    })
  )

  // Filter out activities that duplicate a pipeline_update (same opp + same 1-min window)
  const uniqueActivities = activities.filter(act => {
    if (!act.related_opportunity_id) return true
    const ts = act.completed_at ? new Date(act.completed_at).getTime() : 0
    const key = `${act.related_opportunity_id}_${Math.floor(ts / 60000)}`
    return !puKeys.has(key)
  })

  const total = salesPlans.length + pipelineUpdates.length + uniqueActivities.length

  // Build breakdown by method/type
  const breakdown: Record<string, number> = {}
  pipelineUpdates.forEach(pu => {
    if (pu.approach_method) breakdown[pu.approach_method] = (breakdown[pu.approach_method] || 0) + 1
  })
  uniqueActivities.forEach(act => {
    breakdown[act.activity_type] = (breakdown[act.activity_type] || 0) + 1
  })
  salesPlans.forEach(sp => {
    const t = sp.plan_type === 'maintenance_existing' ? 'Maintain' : sp.plan_type === 'hunting_new' ? 'Hunting' : 'Winback'
    breakdown[t] = (breakdown[t] || 0) + 1
  })

  return { total, breakdown }
}

// Role helpers
const canSeeLeaderboard = (role: string) => isAdmin(role as UserRole) || role === 'sales manager'
const canSeeSalesTable = (role: string) => isAdmin(role as UserRole) || role === 'sales manager' || role === 'sales support'
const canSeeLeadSource = (role: string) => isAdmin(role as UserRole) || role === 'sales manager' || role === 'sales support'
const canSeeSalesFilter = (role: string) => isAdmin(role as UserRole) || role === 'sales manager' || role === 'sales support'
const isMarketingDept = (role: string) => ['Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO'].includes(role)

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} menit`
  if (hours < 24) return `${hours.toFixed(1)} jam`
  return `${(hours / 24).toFixed(1)} hari`
}

// =====================================================
// Sub-Components
// =====================================================

function GrowthBadge({ value, label }: { value: number | null; label: string }) {
  if (value === null) return (
    <span className="text-xs text-muted-foreground flex items-center gap-1">
      <Minus className="h-3 w-3" />{label}: N/A
    </span>
  )
  const positive = value > 0
  const neutral = value === 0
  return (
    <span className={`text-xs flex items-center gap-1 ${positive ? 'text-green-600' : neutral ? 'text-muted-foreground' : 'text-red-600'}`}>
      {positive ? <ArrowUp className="h-3 w-3" /> : neutral ? <Minus className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {label}: {positive ? '+' : ''}{value.toFixed(1)}%
    </span>
  )
}

function SectionDivider({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-4 pb-1">
      {icon}
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h2>
      <div className="flex-1 border-t" />
    </div>
  )
}

// =====================================================
// Main Component
// =====================================================

export function CRMDashboardContent({ data }: { data: DashboardDataProps }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { role, userId } = data

  // Filter state
  const [dateFrom, setDateFrom] = useState(searchParams.get('startDate') || '')
  const [dateTo, setDateTo] = useState(searchParams.get('endDate') || '')
  const [selectedSales, setSelectedSales] = useState(searchParams.get('salespersonId') || 'all')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedWeek, setSelectedWeek] = useState(0)

  // Sync filter state with URL search params (handles back/forward navigation)
  useEffect(() => {
    setDateFrom(searchParams.get('startDate') || '')
    setDateTo(searchParams.get('endDate') || '')
    setSelectedSales(searchParams.get('salespersonId') || 'all')
  }, [searchParams])

  // Drilldown dialog
  const [drilldownOpen, setDrilldownOpen] = useState(false)
  const [drilldownTitle, setDrilldownTitle] = useState('')
  const [drilldownItems, setDrilldownItems] = useState<any[]>([])
  const [drilldownCols, setDrilldownCols] = useState<{ key: string; label: string; format?: (v: any) => string }[]>([])

  const applyFilters = useCallback(() => {
    const p = new URLSearchParams()
    if (dateFrom) p.set('startDate', dateFrom)
    if (dateTo) p.set('endDate', dateTo)
    if (selectedSales && selectedSales !== 'all') p.set('salespersonId', selectedSales)
    router.push(`/overview-crm?${p.toString()}`)
  }, [dateFrom, dateTo, selectedSales, router])

  const clearFilters = useCallback(() => {
    setDateFrom('')
    setDateTo('')
    setSelectedSales('all')
    router.push('/overview-crm')
  }, [router])

  const openDrill = (title: string, items: any[], cols: typeof drilldownCols) => {
    setDrilldownTitle(title)
    setDrilldownItems(items)
    setDrilldownCols(cols)
    setDrilldownOpen(true)
  }

  // =====================================================
  // Core Calculations
  // =====================================================

  const calc = useMemo(() => {
    const opps = data.opportunities
    const onProgress = opps.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage))
    const won = opps.filter(o => o.stage === 'Closed Won')
    const lost = opps.filter(o => o.stage === 'Closed Lost')

    const totalValue = opps.reduce((s, o) => s + o.estimated_value, 0)
    const onProgressValue = onProgress.reduce((s, o) => s + o.estimated_value, 0)
    const wonValue = won.reduce((s, o) => s + o.estimated_value, 0)
    const lostValue = lost.reduce((s, o) => s + o.estimated_value, 0)

    // Deal value from accepted quotations for won opportunities
    const wonOppIds = new Set(won.map(o => o.opportunity_id))
    const acceptedQ = data.customerQuotations.filter(q => q.status === 'accepted' && q.opportunity_id && wonOppIds.has(q.opportunity_id))
    const dealValue = acceptedQ.reduce((s, q) => s + q.total_selling_rate, 0)

    // Win rate
    const closedCount = won.length + lost.length
    const winRate = closedCount > 0 ? (won.length / closedCount) * 100 : 0

    // Avg sales cycle
    let totalCycleDays = 0, cycleCount = 0
    for (const o of won) {
      if (o.closed_at && o.created_at) {
        totalCycleDays += (new Date(o.closed_at).getTime() - new Date(o.created_at).getTime()) / 86400000
        cycleCount++
      }
    }
    const avgSalesCycle = cycleCount > 0 ? totalCycleDays / cycleCount : 0

    const accts = data.accounts
    const activeAccounts = accts.filter(a => a.account_status === 'active_account')
    const newAccounts = accts.filter(a => a.account_status === 'new_account')

    // Activities
    const acts = data.activities
    const actByType: Record<string, number> = {}
    acts.forEach(a => { actByType[a.activity_type] = (actByType[a.activity_type] || 0) + 1 })

    // Pipeline updates by method
    const updates = data.pipelineUpdates
    const methodCounts: Record<string, number> = {}
    updates.forEach(u => { if (u.approach_method) methodCounts[u.approach_method] = (methodCounts[u.approach_method] || 0) + 1 })

    // Leads by source
    const leads = data.leads
    const leadsBySource: Record<string, number> = {}
    leads.forEach(l => { const src = l.source || 'Unknown'; leadsBySource[src] = (leadsBySource[src] || 0) + 1 })

    // Sales plans
    const plans = data.salesPlans
    const plansByType = {
      maintenance: plans.filter(p => p.plan_type === 'maintenance_existing').length,
      hunting: plans.filter(p => p.plan_type === 'hunting_new').length,
      winback: plans.filter(p => p.plan_type === 'winback_lost').length,
    }
    const plansByStatus = {
      planned: plans.filter(p => p.status === 'planned').length,
      completed: plans.filter(p => p.status === 'completed').length,
    }
    const huntingPotential = plans.filter(p => p.plan_type === 'hunting_new' && p.potential_status === 'potential').length

    // Account status
    const accountsByStatus = {
      calon: accts.filter(a => a.account_status === 'calon_account').length,
      new: newAccounts.length,
      active: activeAccounts.length,
      passive: accts.filter(a => a.account_status === 'passive_account').length,
      lost: accts.filter(a => a.account_status === 'lost_account').length,
      failed: accts.filter(a => a.account_status === 'failed_account').length,
    }

    // Lost reasons breakdown
    const lostReasons: Record<string, number> = {}
    lost.forEach(o => {
      const reason = o.lost_reason || 'Tidak Diketahui'
      lostReasons[reason] = (lostReasons[reason] || 0) + 1
    })

    // Industry breakdown (bidang usaha)
    const industryBreakdown: Record<string, number> = {}
    accts.forEach(a => {
      const ind = a.industry || 'Belum Diisi'
      industryBreakdown[ind] = (industryBreakdown[ind] || 0) + 1
    })

    // Service type breakdown from customer quotations
    const serviceBreakdown: Record<string, { count: number; value: number }> = {}
    data.customerQuotations.forEach(q => {
      const svc = q.service_type || 'Unknown'
      if (!serviceBreakdown[svc]) serviceBreakdown[svc] = { count: 0, value: 0 }
      serviceBreakdown[svc].count++
      serviceBreakdown[svc].value += q.total_selling_rate
    })

    // Service type by status
    const serviceByStatus: Record<string, Record<string, number>> = {}
    data.customerQuotations.forEach(q => {
      const svc = q.service_type || 'Unknown'
      if (!serviceByStatus[svc]) serviceByStatus[svc] = {}
      serviceByStatus[svc][q.status] = (serviceByStatus[svc][q.status] || 0) + 1
    })

    // RFQ analytics
    const rfqByService: Record<string, number> = {}
    const rfqByRoute: Record<string, number> = {}
    const rfqByCargo: Record<string, number> = {}
    data.rfqTickets.forEach(t => {
      const svc = t.service_type || 'Unknown'
      rfqByService[svc] = (rfqByService[svc] || 0) + 1
      if (t.origin_city && t.destination_city) {
        const route = `${t.origin_city} → ${t.destination_city}`
        rfqByRoute[route] = (rfqByRoute[route] || 0) + 1
      }
      if (t.cargo_category) {
        rfqByCargo[t.cargo_category] = (rfqByCargo[t.cargo_category] || 0) + 1
      }
    })

    // Opportunity by stage (for funnel)
    const oppByStage = {
      prospecting: opps.filter(o => o.stage === 'Prospecting').length,
      discovery: opps.filter(o => o.stage === 'Discovery').length,
      quoteSent: opps.filter(o => o.stage === 'Quote Sent').length,
      negotiation: opps.filter(o => o.stage === 'Negotiation').length,
      closedWon: won.length,
      closedLost: lost.length,
      onHold: opps.filter(o => o.stage === 'On Hold').length,
    }

    // =====================================================
    // Marketing-specific analytics
    // =====================================================

    // Lead status (triage) breakdown
    const leadsByStatus: Record<string, number> = {}
    leads.forEach(l => {
      leadsByStatus[l.triage_status] = (leadsByStatus[l.triage_status] || 0) + 1
    })

    // Lead-to-MQL time analysis
    // MQL = lead handed over to sales (handed_over_at or claimed_at)
    const mqlTimes: number[] = [] // in hours
    leads.forEach(l => {
      const handoverTime = l.handed_over_at || l.claimed_at
      if (handoverTime && l.created_at) {
        const hours = (new Date(handoverTime).getTime() - new Date(l.created_at).getTime()) / 3600000
        if (hours >= 0) mqlTimes.push(hours)
      }
    })

    const mqlTimeCategories = {
      under1h: mqlTimes.filter(h => h < 1).length,
      under2h: mqlTimes.filter(h => h >= 1 && h < 2).length,
      under6h: mqlTimes.filter(h => h >= 2 && h < 6).length,
      under12h: mqlTimes.filter(h => h >= 6 && h < 12).length,
      under24h: mqlTimes.filter(h => h >= 12 && h < 24).length,
      over24h: mqlTimes.filter(h => h >= 24).length,
    }
    const avgMqlTimeHours = mqlTimes.length > 0 ? mqlTimes.reduce((s, h) => s + h, 0) / mqlTimes.length : 0
    const totalMqlLeads = mqlTimes.length

    // MQL Conversion Rate: lead → account status
    // Build account lookup by ID
    const accountMap = new Map(accts.map(a => [a.account_id, a]))
    const mqlConversion = { onProgress: 0, won: 0, failed: 0, noAccount: 0, total: 0 }
    leads.forEach(l => {
      if (!l.account_id) {
        mqlConversion.noAccount++
        mqlConversion.total++
        return
      }
      const account = accountMap.get(l.account_id)
      if (!account) {
        mqlConversion.noAccount++
        mqlConversion.total++
        return
      }
      mqlConversion.total++
      const status = account.account_status
      if (status === 'calon_account') {
        mqlConversion.onProgress++
      } else if (status === 'failed_account' || status === 'lost_account') {
        mqlConversion.failed++
      } else if (status === 'new_account' || status === 'active_account' || status === 'passive_account') {
        mqlConversion.won++
      } else {
        mqlConversion.noAccount++
      }
    })

    return {
      opps, onProgress, won, lost,
      totalValue, onProgressValue, wonValue, lostValue, dealValue,
      winRate, avgSalesCycle, closedCount,
      activeAccounts, newAccounts, accts,
      acts, actByType, methodCounts, updates,
      leads, leadsBySource, leadsByStatus,
      plansByType, plansByStatus, huntingPotential, plans,
      accountsByStatus, oppByStage, acceptedQ, lostReasons,
      industryBreakdown, serviceBreakdown, serviceByStatus,
      rfqByService, rfqByRoute, rfqByCargo,
      mqlTimeCategories, avgMqlTimeHours, totalMqlLeads, mqlConversion,
    }
  }, [data])

  // =====================================================
  // Salesperson Rankings
  // =====================================================

  const salesPerfs = useMemo(() => {
    const salesUsers = data.salesProfiles.filter(p => p.role === 'salesperson')
    return salesUsers.map(user => {
      const uid = user.user_id
      const userOpps = data.allOpportunities.filter(o => o.owner_user_id === uid)
      const wonOpps = userOpps.filter(o => o.stage === 'Closed Won')
      const lostOpps = userOpps.filter(o => o.stage === 'Closed Lost')
      const activeOpps = userOpps.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage))
      const userAccts = data.allAccounts.filter(a => a.owner_user_id === uid)
      const userActs = data.allActivities.filter(a => a.owner_user_id === uid)
      const userPUs = data.allPipelineUpdates.filter(u => u.updated_by === uid)
      const userPlans = data.allSalesPlans.filter(p => p.owner_user_id === uid)

      const pipelineValue = activeOpps.reduce((s, o) => s + o.estimated_value, 0)
      const wonValue = wonOpps.reduce((s, o) => s + o.estimated_value, 0)
      const closedCount = wonOpps.length + lostOpps.length
      const winRate = closedCount > 0 ? (wonOpps.length / closedCount) * 100 : 0

      const wonIds = new Set(wonOpps.map(o => o.opportunity_id))
      const dealVal = data.customerQuotations.filter(q => q.status === 'accepted' && q.opportunity_id && wonIds.has(q.opportunity_id)).reduce((s, q) => s + q.total_selling_rate, 0)

      const activeCust = userAccts.filter(a => a.account_status === 'active_account').length
      const newCust = userAccts.filter(a => a.account_status === 'new_account').length

      let totalCycleDays = 0, cycleCount = 0
      for (const o of wonOpps) {
        if (o.closed_at && o.created_at) { totalCycleDays += (new Date(o.closed_at).getTime() - new Date(o.created_at).getTime()) / 86400000; cycleCount++ }
      }

      // Unified activity count: sales_plans + pipeline_updates + activities (deduplicated)
      const unified = computeUnifiedActivityCount(userActs, userPUs, userPlans)

      return {
        userId: uid, name: user.name,
        pipelineValue, wonCount: wonOpps.length, wonValue, dealValue: dealVal,
        lostCount: lostOpps.length, winRate,
        activeCustomers: activeCust, newCustomers: newCust,
        avgSalesCycle: cycleCount > 0 ? totalCycleDays / cycleCount : 0,
        activities: unified.total, actBreakdown: unified.breakdown,
        totalPipeline: userOpps.length,
      }
    })
  }, [data])

  // My performance (salesperson)
  const myPerf = useMemo(() => salesPerfs.find(p => p.userId === userId), [salesPerfs, userId])

  const myRanks = useMemo(() => {
    if (role !== 'salesperson') return null
    const metricKeys = ['pipelineValue', 'wonCount', 'wonValue', 'dealValue', 'winRate', 'activeCustomers', 'newCustomers', 'activities'] as const
    const ranks: Record<string, { rank: number; total: number }> = {}
    for (const m of metricKeys) {
      const sorted = [...salesPerfs].sort((a, b) => (b[m] as number) - (a[m] as number))
      const idx = sorted.findIndex(p => p.userId === userId)
      ranks[m] = { rank: idx >= 0 ? idx + 1 : sorted.length, total: sorted.length }
    }
    const cycleSorted = [...salesPerfs].filter(p => p.avgSalesCycle > 0).sort((a, b) => a.avgSalesCycle - b.avgSalesCycle)
    const cycleIdx = cycleSorted.findIndex(p => p.userId === userId)
    ranks['avgSalesCycle'] = { rank: cycleIdx >= 0 ? cycleIdx + 1 : salesPerfs.length, total: cycleSorted.length || salesPerfs.length }
    return ranks
  }, [salesPerfs, role, userId])

  // =====================================================
  // Weekly Analytics
  // =====================================================

  const weeklyData = useMemo(() => {
    const totalWeeks = getTotalWeeks(selectedYear)
    const opps = data.opportunities
    const acts = data.activities
    const accts = data.accounts
    const now = new Date()

    const weeks: {
      week: string; weekNum: number
      activities: number; pipelineCount: number
      onProgressCount: number; wonCount: number; lostCount: number
      pipelineValue: number; onProgressValue: number; wonValue: number; lostValue: number
      customerByStatus: Record<string, number>
    }[] = []

    for (let w = 1; w <= totalWeeks; w++) {
      const start = getWeekStartDate(selectedYear, w)
      const end = getWeekEndDate(start)
      if (start > now) break

      const inWeek = (dateStr: string) => {
        const d = new Date(dateStr)
        return d >= start && d <= end
      }

      const weekActs = acts.filter(a => inWeek(a.created_at))
      const weekOpps = opps.filter(o => inWeek(o.created_at))
      const onP = weekOpps.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage))
      const wonW = weekOpps.filter(o => o.stage === 'Closed Won')
      const lostW = weekOpps.filter(o => o.stage === 'Closed Lost')

      const weekAccts = accts.filter(a => inWeek(a.created_at))
      const cs: Record<string, number> = {}
      weekAccts.forEach(a => { cs[a.account_status || 'unknown'] = (cs[a.account_status || 'unknown'] || 0) + 1 })

      weeks.push({
        week: `W${w}`, weekNum: w,
        activities: weekActs.length,
        pipelineCount: weekOpps.length,
        onProgressCount: onP.length, wonCount: wonW.length, lostCount: lostW.length,
        pipelineValue: weekOpps.reduce((s, o) => s + o.estimated_value, 0),
        onProgressValue: onP.reduce((s, o) => s + o.estimated_value, 0),
        wonValue: wonW.reduce((s, o) => s + o.estimated_value, 0),
        lostValue: lostW.reduce((s, o) => s + o.estimated_value, 0),
        customerByStatus: cs,
      })
    }
    return weeks
  }, [data.opportunities, data.activities, data.accounts, selectedYear])

  const weekComp = useMemo(() => {
    if (selectedWeek === 0) return null
    const current = weeklyData.find(w => w.weekNum === selectedWeek)
    const previous = weeklyData.find(w => w.weekNum === selectedWeek - 1)
    return current ? { current, previous: previous || null } : null
  }, [weeklyData, selectedWeek])

  // =====================================================
  // Render
  // =====================================================

  const salesOnlyProfiles = data.salesProfiles.filter(p => p.role === 'salesperson')
  const hasFilters = dateFrom || dateTo || (selectedSales && selectedSales !== 'all')

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ============ FILTERS ============ */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filter
            </div>
            <div className="flex-1 flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Dari</Label>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-36 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sampai</Label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-36 text-xs" />
              </div>
              {canSeeSalesFilter(role) && (
                <div className="space-y-1">
                  <Label className="text-xs">Salesperson</Label>
                  <Select value={selectedSales} onValueChange={setSelectedSales}>
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue placeholder="Semua Sales" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Sales</SelectItem>
                      {salesOnlyProfiles.map(p => (
                        <SelectItem key={p.user_id} value={p.user_id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={applyFilters} className="h-8 text-xs">Terapkan</Button>
              {hasFilters && (
                <Button size="sm" variant="ghost" onClick={clearFilters} className="h-8 text-xs">
                  <X className="h-3 w-3 mr-1" />Reset
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============ MY PERFORMANCE (salesperson only) ============ */}
      {role === 'salesperson' && myPerf && myRanks && (
        <>
          <SectionDivider title="My Performance Summary" icon={<Star className="h-4 w-4 text-yellow-500" />} />
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {/* Actual Revenue - Coming Soon */}
            <Card className="border-dashed opacity-60">
              <CardContent className="p-3 lg:p-4">
                <div className="flex items-center justify-between mb-1">
                  <DollarSign className="h-4 w-4 text-amber-500" />
                  <Badge variant="outline" className="text-[10px]">Coming Soon</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Actual Revenue</p>
                <p className="text-lg font-bold text-muted-foreground">-</p>
              </CardContent>
            </Card>

            {/* Won Opportunities */}
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => {
              openDrill('Won Opportunities', data.opportunities.filter(o => o.stage === 'Closed Won'), [
                { key: 'name', label: 'Name' },
                { key: 'estimated_value', label: 'Est. Value', format: (v: number) => formatCurrency(v) },
                { key: 'closed_at', label: 'Closed', format: (v: string) => v ? new Date(v).toLocaleDateString('id-ID') : '-' },
              ])
            }}>
              <CardContent className="p-3 lg:p-4">
                <div className="flex items-center justify-between mb-1">
                  <Trophy className="h-4 w-4 text-emerald-500" />
                  <Badge variant="secondary" className="text-[10px]">#{myRanks.wonCount.rank}/{myRanks.wonCount.total}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Won Opportunities</p>
                <p className="text-lg font-bold text-emerald-600">{myPerf.wonCount}</p>
                <p className="text-[10px] text-muted-foreground">Est: {formatCurrency(myPerf.wonValue)}</p>
                <p className="text-[10px] text-muted-foreground">Deal: {formatCurrency(myPerf.dealValue)}</p>
              </CardContent>
            </Card>

            {/* Won Deals */}
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => {
              openDrill('Won Deals', data.opportunities.filter(o => o.stage === 'Closed Won'), [
                { key: 'name', label: 'Deal' },
                { key: 'estimated_value', label: 'Value', format: (v: number) => formatCurrency(v) },
              ])
            }}>
              <CardContent className="p-3 lg:p-4">
                <div className="flex items-center justify-between mb-1">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <Badge variant="secondary" className="text-[10px]">#{myRanks.dealValue.rank}/{myRanks.dealValue.total}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Won Deals</p>
                <p className="text-lg font-bold text-green-600">{myPerf.wonCount}</p>
                <p className="text-[10px] text-muted-foreground">Deal Value: {formatCurrency(myPerf.dealValue)}</p>
              </CardContent>
            </Card>

            {/* Win Rate */}
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => {
              openDrill('Win/Loss Detail', [
                ...data.opportunities.filter(o => o.stage === 'Closed Won').map(o => ({ ...o, result: 'Won' })),
                ...data.opportunities.filter(o => o.stage === 'Closed Lost').map(o => ({ ...o, result: 'Lost' })),
              ], [
                { key: 'name', label: 'Pipeline' }, { key: 'result', label: 'Result' },
                { key: 'estimated_value', label: 'Value', format: (v: number) => formatCurrency(v) },
              ])
            }}>
              <CardContent className="p-3 lg:p-4">
                <div className="flex items-center justify-between mb-1">
                  <Target className="h-4 w-4 text-blue-500" />
                  <Badge variant="secondary" className="text-[10px]">#{myRanks.winRate.rank}/{myRanks.winRate.total}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <p className="text-lg font-bold text-blue-600">{myPerf.winRate.toFixed(1)}%</p>
                <p className="text-[10px] text-muted-foreground">{myPerf.wonCount}W / {myPerf.lostCount}L</p>
              </CardContent>
            </Card>

            {/* Customers */}
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => {
              openDrill('Customers', data.accounts.filter(a => ['active_account', 'new_account'].includes(a.account_status || '')), [
                { key: 'company_name', label: 'Company' }, { key: 'account_status', label: 'Status' },
              ])
            }}>
              <CardContent className="p-3 lg:p-4">
                <div className="flex items-center justify-between mb-1">
                  <Users className="h-4 w-4 text-indigo-500" />
                  <Badge variant="secondary" className="text-[10px]">#{myRanks.activeCustomers.rank}/{myRanks.activeCustomers.total}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Customers</p>
                <p className="text-lg font-bold text-indigo-600">{myPerf.activeCustomers} <span className="text-sm font-normal">active</span></p>
                <p className="text-[10px] text-muted-foreground">{myPerf.newCustomers} new</p>
              </CardContent>
            </Card>

            {/* Avg Sales Cycle */}
            <Card>
              <CardContent className="p-3 lg:p-4">
                <div className="flex items-center justify-between mb-1">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <Badge variant="secondary" className="text-[10px]">#{myRanks.avgSalesCycle.rank}/{myRanks.avgSalesCycle.total}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Avg Sales Cycle</p>
                <p className="text-lg font-bold text-orange-600">{formatDays(myPerf.avgSalesCycle)}</p>
              </CardContent>
            </Card>

            {/* Activities */}
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => {
              const items = Object.entries(myPerf.actBreakdown).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count)
              openDrill('Activity Breakdown', items, [{ key: 'type', label: 'Type' }, { key: 'count', label: 'Count' }])
            }}>
              <CardContent className="p-3 lg:p-4">
                <div className="flex items-center justify-between mb-1">
                  <Activity className="h-4 w-4 text-purple-500" />
                  <Badge variant="secondary" className="text-[10px]">#{myRanks.activities.rank}/{myRanks.activities.total}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Activities</p>
                <p className="text-lg font-bold text-purple-600">{myPerf.activities}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Object.entries(myPerf.actBreakdown).slice(0, 3).map(([t, c]) => (
                    <span key={t} className="text-[10px] text-muted-foreground">{t}: {c}</span>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* DSO/AR Aging - Coming Soon */}
            <Card className="border-dashed opacity-60">
              <CardContent className="p-3 lg:p-4">
                <div className="flex items-center justify-between mb-1">
                  <Briefcase className="h-4 w-4 text-gray-400" />
                  <Badge variant="outline" className="text-[10px]">Coming Soon</Badge>
                </div>
                <p className="text-xs text-muted-foreground">DSO/AR Aging</p>
                <p className="text-lg font-bold text-muted-foreground">-</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ============ PIPELINE VALUE ============ */}
      <SectionDivider title="Pipeline Overview" icon={<Layers className="h-4 w-4 text-blue-500" />} />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base lg:text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-500" />
            Pipeline Value
            <Badge variant="outline" className="ml-auto text-xs">{calc.opps.length} pipeline</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl lg:text-3xl font-bold mb-4">{formatCurrency(calc.totalValue)}</div>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
            {/* On Progress */}
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => openDrill('On Progress Pipeline', calc.onProgress, [
                { key: 'name', label: 'Name' }, { key: 'stage', label: 'Stage' },
                { key: 'estimated_value', label: 'Value', format: (v: number) => formatCurrency(v) },
              ])}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">On Progress</span>
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">{calc.onProgress.length}</Badge>
              </div>
              <p className="text-xl font-bold text-blue-600">{formatCurrency(calc.onProgressValue)}</p>
              <div className="flex gap-2 mt-2 text-xs text-blue-600">
                <span>{pct(calc.onProgressValue, calc.totalValue)} value</span>
                <span>|</span>
                <span>{pct(calc.onProgress.length, calc.opps.length)} count</span>
              </div>
              <Progress value={calc.totalValue > 0 ? (calc.onProgressValue / calc.totalValue) * 100 : 0} className="mt-2 h-1.5 [&>div]:bg-blue-500" />
            </div>

            {/* Won */}
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => openDrill('Won Pipeline', calc.won, [
                { key: 'name', label: 'Name' },
                { key: 'estimated_value', label: 'Est. Value', format: (v: number) => formatCurrency(v) },
                { key: 'closed_at', label: 'Closed', format: (v: string) => v ? new Date(v).toLocaleDateString('id-ID') : '-' },
              ])}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Won</span>
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">{calc.won.length}</Badge>
              </div>
              <p className="text-xl font-bold text-emerald-600">{formatCurrency(calc.wonValue)}</p>
              <p className="text-xs text-emerald-600 mt-1">Est. Value: {formatCurrency(calc.wonValue)}</p>
              {calc.dealValue > 0 && (
                <p className="text-xs text-emerald-700 font-medium">Deal Value: {formatCurrency(calc.dealValue)}</p>
              )}
              <div className="flex gap-2 mt-2 text-xs text-emerald-600">
                <span>{pct(calc.wonValue, calc.totalValue)} value</span>
                <span>|</span>
                <span>{pct(calc.won.length, calc.opps.length)} count</span>
              </div>
              <Progress value={calc.totalValue > 0 ? (calc.wonValue / calc.totalValue) * 100 : 0} className="mt-2 h-1.5 [&>div]:bg-emerald-500" />
            </div>

            {/* Lost */}
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => openDrill('Lost Pipeline', calc.lost, [
                { key: 'name', label: 'Name' },
                { key: 'estimated_value', label: 'Value', format: (v: number) => formatCurrency(v) },
                { key: 'lost_reason', label: 'Reason' },
              ])}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-red-700 dark:text-red-300">Lost</span>
                <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">{calc.lost.length}</Badge>
              </div>
              <p className="text-xl font-bold text-red-600">{formatCurrency(calc.lostValue)}</p>
              <div className="flex gap-2 mt-2 text-xs text-red-600">
                <span>{pct(calc.lostValue, calc.totalValue)} value</span>
                <span>|</span>
                <span>{pct(calc.lost.length, calc.opps.length)} count</span>
              </div>
              <Progress value={calc.totalValue > 0 ? (calc.lostValue / calc.totalValue) * 100 : 0} className="mt-2 h-1.5 [&>div]:bg-red-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============ LOST REASON ANALYTICS (Interactive Chart) ============ */}
      {calc.lost.length > 0 && (() => {
        const lostChartData = Object.entries(calc.lostReasons)
          .sort((a, b) => b[1] - a[1])
          .map(([reason, count]) => ({
            reason: reason.length > 20 ? reason.slice(0, 20) + '...' : reason,
            fullReason: reason,
            count,
            value: calc.lost.filter(o => (o.lost_reason || 'Tidak Diketahui') === reason).reduce((s, o) => s + o.estimated_value, 0),
          }))
        const LOST_COLORS = ['#ef4444', '#f97316', '#eab308', '#a855f7', '#6366f1', '#ec4899', '#14b8a6', '#64748b']
        return (
          <>
            <SectionDivider title="Lost Pipeline Analysis" icon={<AlertCircle className="h-4 w-4 text-red-500" />} />
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  Lost Reasons ({calc.lost.length} pipeline &middot; {formatCurrency(calc.lostValue)})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Bar Chart */}
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={lostChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" fontSize={11} />
                        <YAxis type="category" dataKey="reason" width={120} fontSize={11} tick={{ fill: '#6b7280' }} />
                        <Tooltip
                          formatter={(val: number, name: string) => {
                            if (name === 'count') return [`${val} pipeline (${pct(val, calc.lost.length)})`, 'Count']
                            return [formatCurrency(val) + ` (${pct(val, calc.lostValue)})`, 'Value']
                          }}
                          labelFormatter={(label: string) => {
                            const item = lostChartData.find(d => d.reason === label)
                            return item?.fullReason || label
                          }}
                        />
                        <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                          {lostChartData.map((_, i) => <Cell key={i} fill={LOST_COLORS[i % LOST_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Detail List */}
                  <div className="space-y-2">
                    {lostChartData.map((item, i) => (
                      <div key={item.fullReason}
                        className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors"
                        onClick={() => openDrill(`Lost: ${item.fullReason}`, calc.lost.filter(o => (o.lost_reason || 'Tidak Diketahui') === item.fullReason), [
                          { key: 'name', label: 'Pipeline' },
                          { key: 'estimated_value', label: 'Value', format: (v: number) => formatCurrency(v) },
                          { key: 'closed_at', label: 'Closed', format: (v: string) => v ? new Date(v).toLocaleDateString('id-ID') : '-' },
                        ])}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: LOST_COLORS[i % LOST_COLORS.length] }} />
                          <span className="text-sm truncate">{item.fullReason}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-muted-foreground">{formatCurrency(item.value)} ({pct(item.value, calc.lostValue)})</span>
                          <Badge variant="outline" className="text-xs">{item.count} ({pct(item.count, calc.lost.length)})</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )
      })()}

      {/* ============ WEEKLY ANALYTICS ============ */}
      <SectionDivider title="Weekly Analytics" icon={<BarChart3 className="h-4 w-4 text-indigo-500" />} />
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base lg:text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-500" />
              Weekly Analytics
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={String(selectedYear)} onValueChange={v => { setSelectedYear(Number(v)); setSelectedWeek(0) }}>
                <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(selectedWeek)} onValueChange={v => setSelectedWeek(Number(v))}>
                <SelectTrigger className="h-8 w-52 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">All Weeks</SelectItem>
                  {Array.from({ length: getTotalWeeks(selectedYear) }, (_, i) => i + 1).map(w => (
                    <SelectItem key={w} value={String(w)}>{formatWeekLabel(selectedYear, w)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {weekComp && weekComp.current && (
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border">
                <p className="text-xs text-muted-foreground mb-1">Activities</p>
                <p className="text-lg font-bold">{weekComp.current.activities}</p>
                {weekComp.previous && <GrowthBadge value={calcGrowth(weekComp.current.activities, weekComp.previous.activities)} label="vs prev" />}
              </div>
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 border">
                <p className="text-xs text-muted-foreground mb-1">Pipeline</p>
                <p className="text-lg font-bold text-blue-600">{weekComp.current.pipelineCount}</p>
                <p className="text-[10px] text-muted-foreground">Active: {weekComp.current.onProgressCount} | Won: {weekComp.current.wonCount} | Lost: {weekComp.current.lostCount}</p>
              </div>
              <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/30 border">
                <p className="text-xs text-muted-foreground mb-1">Pipeline Value</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(weekComp.current.pipelineValue)}</p>
                <p className="text-[10px] text-muted-foreground">Active: {formatCurrency(weekComp.current.onProgressValue)}</p>
                {weekComp.previous && <GrowthBadge value={calcGrowth(weekComp.current.pipelineValue, weekComp.previous.pipelineValue)} label="vs prev" />}
              </div>
              <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/30 border">
                <p className="text-xs text-muted-foreground mb-1">New Customers</p>
                {Object.entries(weekComp.current.customerByStatus).length > 0 ? (
                  Object.entries(weekComp.current.customerByStatus).map(([k, v]) => <p key={k} className="text-[10px]">{k.replace('_account', '')}: {v}</p>)
                ) : (
                  <p className="text-sm text-muted-foreground">-</p>
                )}
              </div>
            </div>
          )}
          <div className="h-56 lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={selectedWeek === 0 ? weeklyData : weeklyData.filter(w => w.weekNum >= Math.max(1, selectedWeek - 4) && w.weekNum <= selectedWeek + 4)} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => formatCurrency(v)} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(value: number, name: string) => name.includes('Value') ? [formatCurrency(value), name] : [value, name]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line yAxisId="left" type="monotone" dataKey="activities" stroke="#6366f1" name="Activities" strokeWidth={2} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="pipelineCount" stroke="#3b82f6" name="Pipeline Count" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="pipelineValue" stroke="#10b981" name="Pipeline Value" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ============ PIPELINE FUNNEL & SALES PLAN ============ */}
      <SectionDivider title="Pipeline & Sales Plan" icon={<TrendingUp className="h-4 w-4 text-green-500" />} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base lg:text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />Pipeline Funnel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Prospecting', count: calc.oppByStage.prospecting, color: '' },
              { label: 'Discovery', count: calc.oppByStage.discovery, color: '[&>div]:bg-blue-500' },
              { label: 'Quote Sent', count: calc.oppByStage.quoteSent, color: '[&>div]:bg-indigo-500' },
              { label: 'Negotiation', count: calc.oppByStage.negotiation, color: '[&>div]:bg-purple-500' },
            ].map(s => (
              <div key={s.label} className="space-y-1 cursor-pointer" onClick={() => openDrill(`${s.label} Pipeline`, calc.opps.filter(o => o.stage === s.label), [
                { key: 'name', label: 'Name' }, { key: 'estimated_value', label: 'Value', format: (v: number) => formatCurrency(v) },
              ])}>
                <div className="flex justify-between text-sm"><span>{s.label}</span><span className="font-medium">{s.count} <span className="text-muted-foreground text-xs">({pct(s.count, calc.opps.length)})</span></span></div>
                <Progress value={calc.opps.length > 0 ? (s.count / calc.opps.length) * 100 : 0} className={`h-2 ${s.color}`} />
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t">
              <span className="text-sm flex items-center gap-1"><CheckCircle className="h-4 w-4 text-green-500" />Won: {calc.oppByStage.closedWon} <span className="text-xs text-muted-foreground">({pct(calc.oppByStage.closedWon, calc.opps.length)})</span></span>
              <span className="text-sm flex items-center gap-1"><AlertCircle className="h-4 w-4 text-red-500" />Lost: {calc.oppByStage.closedLost} <span className="text-xs text-muted-foreground">({pct(calc.oppByStage.closedLost, calc.opps.length)})</span></span>
              {calc.oppByStage.onHold > 0 && <span className="text-sm flex items-center gap-1"><Clock className="h-4 w-4 text-yellow-500" />Hold: {calc.oppByStage.onHold} <span className="text-xs text-muted-foreground">({pct(calc.oppByStage.onHold, calc.opps.length)})</span></span>}
            </div>
          </CardContent>
        </Card>

        {(isSales(role as UserRole) || isAdmin(role as UserRole)) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                <Target className="h-5 w-5" />Sales Plan Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
                  <Building2 className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                  <p className="text-xl font-bold text-blue-600">{calc.plansByType.maintenance}</p>
                  <p className="text-xs text-muted-foreground">Maintenance</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950">
                  <UserPlus className="h-5 w-5 mx-auto text-green-600 mb-1" />
                  <p className="text-xl font-bold text-green-600">{calc.plansByType.hunting}</p>
                  <p className="text-xs text-muted-foreground">Hunting</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-orange-50 dark:bg-orange-950">
                  <RotateCcw className="h-5 w-5 mx-auto text-orange-600 mb-1" />
                  <p className="text-xl font-bold text-orange-600">{calc.plansByType.winback}</p>
                  <p className="text-xs text-muted-foreground">Winback</p>
                </div>
              </div>
              <div className="flex justify-between items-center pt-3 border-t text-sm">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-yellow-500" />Planned: {calc.plansByStatus.planned}</span>
                <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" />Done: {calc.plansByStatus.completed}</span>
                <span className="flex items-center gap-1"><Target className="h-3 w-3 text-purple-500" />Potential: {calc.huntingPotential}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ============ ACTIVITY BY METHOD ============ */}
      {(isSales(role as UserRole) || isAdmin(role as UserRole)) && (
        <>
          <SectionDivider title="Activity Analytics" icon={<Activity className="h-4 w-4 text-purple-500" />} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />Activity by Method ({calc.updates.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { method: 'Site Visit', icon: <MapPin className="h-4 w-4 text-orange-500" /> },
                  { method: 'Phone Call', icon: <Phone className="h-4 w-4 text-blue-500" /> },
                  { method: 'Online Meeting', icon: <Video className="h-4 w-4 text-purple-500" /> },
                  { method: 'WhatsApp', icon: <MessageSquare className="h-4 w-4 text-green-500" /> },
                  { method: 'Email', icon: <Mail className="h-4 w-4 text-gray-500" /> },
                  { method: 'Texting', icon: <MessageSquare className="h-4 w-4 text-cyan-500" /> },
                ].map(({ method, icon }) => {
                  const count = calc.methodCounts[method] || 0
                  return (
                    <div key={method} className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-1 rounded"
                      onClick={() => openDrill(`${method} Activities`, calc.updates.filter(u => u.approach_method === method), [
                        { key: 'opportunity_id', label: 'Opportunity' },
                        { key: 'created_at', label: 'Date', format: (v: string) => new Date(v).toLocaleDateString('id-ID') },
                      ])}>
                      <div className="flex items-center gap-2">{icon}<span className="text-sm">{method}</span></div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{pct(count, calc.updates.length)}</span>
                        <Badge variant="outline">{count}</Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ============ LEADERBOARD ============ */}
      {canSeeLeaderboard(role) && salesPerfs.length > 0 && (
        <>
          <SectionDivider title="Leaderboard" icon={<Trophy className="h-4 w-4 text-yellow-500" />} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />Sales Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {([
                  { key: 'pipelineValue' as const, title: 'Pipeline Value', fmt: formatCurrency, icon: <TrendingUp className="h-4 w-4" /> },
                  { key: 'wonCount' as const, title: 'Won Deals', fmt: (v: number) => String(v), icon: <Trophy className="h-4 w-4" /> },
                  { key: 'wonValue' as const, title: 'Won Value', fmt: formatCurrency, icon: <DollarSign className="h-4 w-4" /> },
                  { key: 'dealValue' as const, title: 'Deal Value', fmt: formatCurrency, icon: <CheckCircle className="h-4 w-4" /> },
                  { key: 'winRate' as const, title: 'Win Rate', fmt: (v: number) => `${v.toFixed(1)}%`, icon: <Target className="h-4 w-4" /> },
                  { key: 'activities' as const, title: 'Activities', fmt: (v: number) => String(v), icon: <Activity className="h-4 w-4" /> },
                ] as const).map(metric => {
                  const sorted = [...salesPerfs].sort((a, b) => (b[metric.key] as number) - (a[metric.key] as number))
                  const top3 = sorted.slice(0, 3)
                  const bottom3 = sorted.length > 3 ? sorted.slice(-3).reverse() : []
                  return (
                    <div key={metric.key} className="border rounded-lg p-3 hover:shadow-sm transition-shadow cursor-pointer"
                      onClick={() => openDrill(`${metric.title} Ranking`, sorted.map((p, i) => ({ rank: i + 1, name: p.name, value: metric.fmt(p[metric.key] as number) })), [
                        { key: 'rank', label: '#' }, { key: 'name', label: 'Name' }, { key: 'value', label: metric.title },
                      ])}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 rounded-md bg-yellow-100 dark:bg-yellow-900 text-yellow-600">{metric.icon}</div>
                        <span className="text-sm font-medium">{metric.title}</span>
                      </div>
                      <div className="space-y-1.5 mb-2">
                        {top3.map((p, i) => (
                          <div key={p.userId} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {i === 0 && <Crown className="h-4 w-4 text-yellow-500" />}
                              {i === 1 && <Medal className="h-4 w-4 text-gray-400" />}
                              {i === 2 && <Award className="h-4 w-4 text-amber-600" />}
                              <span className="text-sm truncate max-w-[100px]">{p.name}</span>
                            </div>
                            <Badge variant="outline" className="text-xs">{metric.fmt(p[metric.key] as number)}</Badge>
                          </div>
                        ))}
                      </div>
                      {bottom3.length > 0 && (
                        <>
                          <div className="border-t my-2" />
                          <p className="text-[10px] text-muted-foreground mb-1">Needs Improvement</p>
                          {bottom3.slice(0, 2).map(p => (
                            <div key={p.userId} className="flex items-center justify-between">
                              <span className="text-xs truncate max-w-[100px]">{p.name}</span>
                              <span className="text-xs text-red-500">{metric.fmt(p[metric.key] as number)}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ============ SALESPERSON PERFORMANCE TABLE ============ */}
      {canSeeSalesTable(role) && salesPerfs.length > 0 && (
        <>
          <SectionDivider title="Salesperson Performance" icon={<Users className="h-4 w-4 text-indigo-500" />} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-500" />Salesperson Performance Detail
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Name</TableHead>
                      <TableHead className="text-right min-w-[100px]">Pipeline Value</TableHead>
                      <TableHead className="text-right">Won (Qty)</TableHead>
                      <TableHead className="text-right min-w-[100px]">Won Value</TableHead>
                      <TableHead className="text-right min-w-[100px]">Deal Value</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                      <TableHead className="text-right">Active Cust.</TableHead>
                      <TableHead className="text-right">New Cust.</TableHead>
                      <TableHead className="text-right">Avg Cycle</TableHead>
                      <TableHead className="text-right">Activities</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...salesPerfs].sort((a, b) => b.wonValue - a.wonValue).map(p => (
                      <TableRow key={p.userId}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatCurrency(p.pipelineValue)}</TableCell>
                        <TableCell className="text-right">{p.wonCount}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatCurrency(p.wonValue)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatCurrency(p.dealValue)}</TableCell>
                        <TableCell className="text-right">{p.winRate.toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{p.activeCustomers}</TableCell>
                        <TableCell className="text-right">{p.newCustomers}</TableCell>
                        <TableCell className="text-right">{formatDays(p.avgSalesCycle)}</TableCell>
                        <TableCell className="text-right">{p.activities}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}

      {/* ============ ACCOUNT STATUS & QUICK ACTIONS ============ */}
      <SectionDivider title="Account & Customer" icon={<Building2 className="h-4 w-4 text-blue-500" />} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base lg:text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />Account Status ({calc.accts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 text-center">
              {[
                { key: 'calon', label: 'Calon', color: 'bg-slate-50 dark:bg-slate-900', tc: '' },
                { key: 'new', label: 'New', color: 'bg-blue-50 dark:bg-blue-950', tc: 'text-blue-600' },
                { key: 'active', label: 'Active', color: 'bg-green-50 dark:bg-green-950', tc: 'text-green-600' },
                { key: 'passive', label: 'Passive', color: 'bg-yellow-50 dark:bg-yellow-950', tc: 'text-yellow-600' },
                { key: 'lost', label: 'Lost', color: 'bg-orange-50 dark:bg-orange-950', tc: 'text-orange-600' },
                { key: 'failed', label: 'Failed', color: 'bg-red-50 dark:bg-red-950', tc: 'text-red-600' },
              ].map(s => {
                const statusMap: Record<string, string> = { calon: 'calon_account', new: 'new_account', active: 'active_account', passive: 'passive_account', lost: 'lost_account', failed: 'failed_account' }
                return (
                  <div key={s.key} className={`p-2 rounded-lg ${s.color} cursor-pointer hover:shadow-sm transition-shadow`}
                    onClick={() => openDrill(`${s.label} Accounts`, calc.accts.filter(a => a.account_status === statusMap[s.key]), [
                      { key: 'company_name', label: 'Company' }, { key: 'account_status', label: 'Status' },
                    ])}>
                    <p className={`text-lg font-bold ${s.tc}`}>{calc.accountsByStatus[s.key as keyof typeof calc.accountsByStatus]}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    <p className="text-[9px] text-muted-foreground">{pct(calc.accountsByStatus[s.key as keyof typeof calc.accountsByStatus], calc.accts.length)}</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base lg:text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <a href="/pipeline" className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium flex-1">Pipeline</span>
              <Badge variant="outline" className="text-xs">{calc.onProgress.length}</Badge>
            </a>
            {(isSales(role as UserRole) || isAdmin(role as UserRole)) && (
              <>
                <a href="/activities" className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
                  <Activity className="h-4 w-4 text-purple-500" /><span className="text-sm font-medium flex-1">Activities</span>
                </a>
                <a href="/sales-plan" className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
                  <Target className="h-4 w-4 text-green-500" /><span className="text-sm font-medium flex-1">Sales Plan</span>
                  <Badge className="bg-yellow-100 text-yellow-800 text-xs">{calc.plansByStatus.planned}</Badge>
                </a>
                <a href="/lead-bidding" className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
                  <Users className="h-4 w-4 text-indigo-500" /><span className="text-sm font-medium flex-1">Lead Bidding</span>
                </a>
              </>
            )}
            {isMarketingDept(role) && (
              <>
                <a href="/lead-management" className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
                  <Users className="h-4 w-4 text-pink-500" /><span className="text-sm font-medium flex-1">Lead Management</span>
                  <Badge variant="outline" className="text-xs">{calc.leads.length}</Badge>
                </a>
                <a href="/lead-inbox" className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
                  <Mail className="h-4 w-4 text-indigo-500" /><span className="text-sm font-medium flex-1">Lead Inbox</span>
                </a>
              </>
            )}
            <a href="/accounts" className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
              <Building2 className="h-4 w-4 text-orange-500" /><span className="text-sm font-medium flex-1">Accounts</span>
              <Badge variant="outline" className="text-xs">{calc.accts.length}</Badge>
            </a>
          </CardContent>
        </Card>
      </div>

      {/* ============ MARKETING ANALYTICS (marketing dept only) ============ */}
      {(isMarketingDept(role) || isAdmin(role as UserRole)) && calc.leads.length > 0 && (
        <>
          <SectionDivider title="Lead Analytics" icon={<Users className="h-4 w-4 text-pink-500" />} />
          <div className="grid gap-4 md:grid-cols-3">
            {/* Lead Status (Triage) Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-5 w-5 text-pink-500" />Lead Status ({calc.leads.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { status: 'New', color: 'bg-gray-100 text-gray-800' },
                    { status: 'In Review', color: 'bg-blue-100 text-blue-800' },
                    { status: 'Qualified', color: 'bg-green-100 text-green-800' },
                    { status: 'Assign to Sales', color: 'bg-indigo-100 text-indigo-800' },
                    { status: 'Nurture', color: 'bg-yellow-100 text-yellow-800' },
                    { status: 'Disqualified', color: 'bg-red-100 text-red-800' },
                  ].map(({ status, color }) => {
                    const count = calc.leadsByStatus[status] || 0
                    return (
                      <div key={status}
                        className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-1.5 rounded transition-colors"
                        onClick={() => openDrill(`Leads: ${status}`, calc.leads.filter(l => l.triage_status === status), [
                          { key: 'company_name', label: 'Company' }, { key: 'source', label: 'Source' },
                          { key: 'created_at', label: 'Date', format: (v: string) => new Date(v).toLocaleDateString('id-ID') },
                        ])}>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[10px] ${color}`}>{status}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{pct(count, calc.leads.length)}</span>
                          <span className="text-sm font-bold">{count}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Lead-to-MQL Time Analysis */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-500" />Lead to MQL Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center mb-3 p-2 rounded-lg bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800">
                  <p className="text-xs text-muted-foreground">Rata-rata Waktu</p>
                  <p className="text-xl font-bold text-orange-600">{calc.totalMqlLeads > 0 ? formatHours(calc.avgMqlTimeHours) : '-'}</p>
                  <p className="text-[10px] text-muted-foreground">{calc.totalMqlLeads} lead sudah di-handover</p>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: '< 1 jam', count: calc.mqlTimeCategories.under1h, color: 'bg-green-500' },
                    { label: '1-2 jam', count: calc.mqlTimeCategories.under2h, color: 'bg-blue-500' },
                    { label: '2-6 jam', count: calc.mqlTimeCategories.under6h, color: 'bg-indigo-500' },
                    { label: '6-12 jam', count: calc.mqlTimeCategories.under12h, color: 'bg-yellow-500' },
                    { label: '12-24 jam', count: calc.mqlTimeCategories.under24h, color: 'bg-orange-500' },
                    { label: '> 24 jam', count: calc.mqlTimeCategories.over24h, color: 'bg-red-500' },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span>{label}</span>
                        <span className="font-medium">{count} <span className="text-muted-foreground">({pct(count, calc.totalMqlLeads)})</span></span>
                      </div>
                      <Progress value={calc.totalMqlLeads > 0 ? (count / calc.totalMqlLeads) * 100 : 0} className={`h-1.5 [&>div]:${color}`} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* MQL Conversion Rate */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />MQL Conversion Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const { onProgress, won, failed, noAccount, total } = calc.mqlConversion
                  const conversionData = [
                    { name: 'Won', value: won, color: '#10b981', desc: 'Active/New/Passive Account' },
                    { name: 'On Progress', value: onProgress, color: '#3b82f6', desc: 'Calon Account' },
                    { name: 'Failed', value: failed, color: '#ef4444', desc: 'Failed/Lost Account' },
                    { name: 'No Account', value: noAccount, color: '#94a3b8', desc: 'Belum Punya Account' },
                  ].filter(d => d.value > 0)
                  return (
                    <div className="space-y-3">
                      {total > 0 && (
                        <div className="h-40">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartPieChart>
                              <Pie data={conversionData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                                outerRadius={65} innerRadius={30} paddingAngle={2}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                labelLine={{ strokeWidth: 1 }} fontSize={10}>
                                {conversionData.map((d, i) => <Cell key={i} fill={d.color} />)}
                              </Pie>
                              <Tooltip formatter={(val: number) => [`${val} leads`, 'Count']} />
                            </RechartPieChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        {[
                          { label: 'Won', count: won, color: 'text-green-600', desc: 'Active/New/Passive' },
                          { label: 'On Progress', count: onProgress, color: 'text-blue-600', desc: 'Calon Account' },
                          { label: 'Failed', count: failed, color: 'text-red-600', desc: 'Failed/Lost Account' },
                          { label: 'No Account', count: noAccount, color: 'text-muted-foreground', desc: 'Belum dikonversi' },
                        ].map(({ label, count, color, desc }) => (
                          <div key={label} className="flex items-center justify-between">
                            <div>
                              <span className={`text-sm font-medium ${color}`}>{label}</span>
                              <span className="text-[10px] text-muted-foreground ml-1">({desc})</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">{pct(count, total)}</span>
                              <span className="text-sm font-bold">{count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ============ LEAD SOURCE ============ */}
      {(canSeeLeadSource(role) || isMarketingDept(role)) && calc.leads.length > 0 && (
        <>
          <SectionDivider title="Lead Source" icon={<PieChart className="h-4 w-4 text-pink-500" />} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                <PieChart className="h-5 w-5 text-pink-500" />Lead Source Analysis ({calc.leads.length} leads)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Badge className="bg-pink-100 text-pink-800">Marketing</Badge>
                  </h3>
                  <div className="space-y-2">
                    {['Webform (SEM)', 'Webform (Organic)', 'Instagram', 'TikTok', 'Facebook', 'Event'].map(src => {
                      const count = calc.leadsBySource[src] || 0
                      return (
                        <div key={src} className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-1 rounded"
                          onClick={() => openDrill(`Leads: ${src}`, calc.leads.filter(l => l.source === src), [
                            { key: 'company_name', label: 'Company' }, { key: 'triage_status', label: 'Status' },
                            { key: 'created_at', label: 'Date', format: (v: string) => new Date(v).toLocaleDateString('id-ID') },
                          ])}>
                          <span className="text-sm">{src}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{pct(count, calc.leads.length)}</span>
                            <Badge variant="outline" className="text-xs">{count}</Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-800">Sales</Badge>
                  </h3>
                  <div className="space-y-2">
                    {['Outbound', 'Referral', 'Lainnya'].map(src => {
                      const count = calc.leadsBySource[src] || 0
                      return (
                        <div key={src} className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-1 rounded"
                          onClick={() => openDrill(`Leads: ${src}`, calc.leads.filter(l => l.source === src), [
                            { key: 'company_name', label: 'Company' }, { key: 'triage_status', label: 'Status' },
                            { key: 'created_at', label: 'Date', format: (v: string) => new Date(v).toLocaleDateString('id-ID') },
                          ])}>
                          <span className="text-sm">{src}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{pct(count, calc.leads.length)}</span>
                            <Badge variant="outline" className="text-xs">{count}</Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {Object.entries(calc.leadsBySource)
                    .filter(([src]) => !['Webform (SEM)', 'Webform (Organic)', 'Instagram', 'TikTok', 'Facebook', 'Event', 'Outbound', 'Referral', 'Lainnya'].includes(src))
                    .map(([src, count]) => (
                      <div key={src} className="flex items-center justify-between mt-2 p-1">
                        <span className="text-sm text-muted-foreground">{src}</span>
                        <Badge variant="outline" className="text-xs">{count}</Badge>
                      </div>
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ============ INDUSTRY (BIDANG USAHA) ANALYTICS ============ */}
      {Object.keys(calc.industryBreakdown).length > 0 && (
        <>
          <SectionDivider title="Bidang Usaha" icon={<Building2 className="h-4 w-4 text-teal-500" />} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5 text-teal-500" />
                Account by Bidang Usaha ({calc.accts.length} accounts)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {/* Chart */}
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={Object.entries(calc.industryBreakdown).sort((a, b) => b[1] - a[1]).map(([ind, count]) => ({
                        name: ind.length > 18 ? ind.slice(0, 18) + '...' : ind,
                        fullName: ind,
                        count,
                      }))}
                      layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" fontSize={11} />
                      <YAxis type="category" dataKey="name" width={120} fontSize={11} tick={{ fill: '#6b7280' }} />
                      <Tooltip formatter={(val: number) => [`${val} accounts (${pct(val, calc.accts.length)})`, 'Count']}
                        labelFormatter={(label: string, payload: any[]) => payload?.[0]?.payload?.fullName || label} />
                      <Bar dataKey="count" fill="#14b8a6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Detail list */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {Object.entries(calc.industryBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([ind, count]) => (
                      <div key={ind}
                        className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors"
                        onClick={() => openDrill(`Bidang Usaha: ${ind}`, calc.accts.filter(a => (a.industry || 'Belum Diisi') === ind), [
                          { key: 'company_name', label: 'Company' },
                          { key: 'account_status', label: 'Status' },
                          { key: 'industry', label: 'Bidang Usaha' },
                        ])}>
                        <span className="text-sm truncate flex-1">{ind}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">{pct(count, calc.accts.length)}</span>
                          <Badge variant="outline" className="text-xs">{count}</Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ============ SERVICE ANALYTICS (Customer Quotation) ============ */}
      {Object.keys(calc.serviceBreakdown).length > 0 && (() => {
        const svcData = Object.entries(calc.serviceBreakdown)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([svc, d]) => ({ service: svc, count: d.count, value: d.value }))
        const SVC_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1']
        return (
          <>
            <SectionDivider title="Service Analytics" icon={<Layers className="h-4 w-4 text-blue-500" />} />
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                  <Layers className="h-5 w-5 text-blue-500" />
                  Service Type - Customer Quotation ({data.customerQuotations.length} quotations)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Pie Chart */}
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartPieChart>
                        <Pie data={svcData} dataKey="count" nameKey="service" cx="50%" cy="50%"
                          outerRadius={90} innerRadius={40} paddingAngle={2} label={({ service, percent }) => `${service} ${(percent * 100).toFixed(0)}%`}
                          labelLine={{ strokeWidth: 1 }} fontSize={10}>
                          {svcData.map((_, i) => <Cell key={i} fill={SVC_COLORS[i % SVC_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(val: number, name: string, props: any) => {
                          const totalCount = data.customerQuotations.length
                          const totalValue = data.customerQuotations.reduce((s, q) => s + q.total_selling_rate, 0)
                          return [`${val} (${pct(val, totalCount)}) - ${formatCurrency(props.payload.value)} (${pct(props.payload.value, totalValue)})`, name]
                        }} />
                      </RechartPieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Detail table with status breakdown */}
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {svcData.map((item, i) => {
                      const statusData = calc.serviceByStatus[item.service] || {}
                      return (
                        <div key={item.service}
                          className="p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => openDrill(`Service: ${item.service}`, data.customerQuotations.filter(q => (q.service_type || 'Unknown') === item.service), [
                            { key: 'id', label: 'Quotation ID' },
                            { key: 'status', label: 'Status' },
                            { key: 'total_selling_rate', label: 'Value', format: (v: number) => formatCurrency(v) },
                            { key: 'created_at', label: 'Date', format: (v: string) => new Date(v).toLocaleDateString('id-ID') },
                          ])}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: SVC_COLORS[i % SVC_COLORS.length] }} />
                              <span className="text-sm font-medium">{item.service}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono">{formatCurrency(item.value)} ({pct(item.value, svcData.reduce((s, d) => s + d.value, 0))})</span>
                              <Badge variant="outline" className="text-xs">{item.count} ({pct(item.count, data.customerQuotations.length)})</Badge>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-5">
                            {statusData.accepted && <Badge className="bg-green-100 text-green-800 text-[10px]">Accepted: {statusData.accepted}</Badge>}
                            {statusData.sent && <Badge className="bg-blue-100 text-blue-800 text-[10px]">Sent: {statusData.sent}</Badge>}
                            {statusData.rejected && <Badge className="bg-red-100 text-red-800 text-[10px]">Rejected: {statusData.rejected}</Badge>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )
      })()}

      {/* ============ RFQ ANALYTICS ============ */}
      {data.rfqTickets.length > 0 && (() => {
        const rfqSvcData = Object.entries(calc.rfqByService).sort((a, b) => b[1] - a[1]).map(([svc, count]) => ({ service: svc, count }))
        const rfqRouteData = Object.entries(calc.rfqByRoute).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([route, count]) => ({ route, count }))
        return (
          <>
            <SectionDivider title="RFQ Analytics" icon={<Mail className="h-4 w-4 text-orange-500" />} />
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                  <Mail className="h-5 w-5 text-orange-500" />
                  Request for Quotation ({data.rfqTickets.length} RFQs)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {/* RFQ by Service Type */}
                  <div>
                    <h3 className="text-sm font-medium mb-3">By Service Type</h3>
                    <div className="space-y-2">
                      {rfqSvcData.map(item => (
                        <div key={item.service}
                          className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors"
                          onClick={() => openDrill(`RFQ: ${item.service}`, data.rfqTickets.filter(t => (t.service_type || 'Unknown') === item.service), [
                            { key: 'ticket_id', label: 'Ticket' },
                            { key: 'cargo_category', label: 'Cargo' },
                            { key: 'origin_city', label: 'Origin' },
                            { key: 'destination_city', label: 'Destination' },
                            { key: 'created_at', label: 'Date', format: (v: string) => new Date(v).toLocaleDateString('id-ID') },
                          ])}>
                          <span className="text-sm">{item.service}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{pct(item.count, data.rfqTickets.length)}</span>
                            <Badge variant="outline" className="text-xs">{item.count}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Cargo Category */}
                    {Object.keys(calc.rfqByCargo).length > 0 && (
                      <div className="mt-4 pt-3 border-t">
                        <h3 className="text-sm font-medium mb-2">By Cargo Category</h3>
                        <div className="flex gap-2 flex-wrap">
                          {Object.entries(calc.rfqByCargo).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                            <Badge key={cat} variant="outline" className="text-xs">{cat}: {count} ({pct(count, data.rfqTickets.length)})</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Top Routes */}
                  <div>
                    <h3 className="text-sm font-medium mb-3">Top Routes</h3>
                    {rfqRouteData.length > 0 ? (
                      <div className="space-y-2">
                        {rfqRouteData.map(item => (
                          <div key={item.route} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => openDrill(`Route: ${item.route}`, data.rfqTickets.filter(t => t.origin_city && t.destination_city && `${t.origin_city} → ${t.destination_city}` === item.route), [
                              { key: 'ticket_id', label: 'Ticket' },
                              { key: 'service_type', label: 'Service' },
                              { key: 'cargo_category', label: 'Cargo' },
                              { key: 'created_at', label: 'Date', format: (v: string) => new Date(v).toLocaleDateString('id-ID') },
                            ])}>
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3 w-3 text-orange-500 shrink-0" />
                              <span className="text-sm">{item.route}</span>
                            </div>
                            <Badge variant="outline" className="text-xs">{item.count} ({pct(item.count, data.rfqTickets.length)})</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No route data available</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )
      })()}

      {/* ============ DRILLDOWN DIALOG ============ */}
      <Dialog open={drilldownOpen} onOpenChange={setDrilldownOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{drilldownTitle}</DialogTitle>
            <DialogDescription>{drilldownItems.length} items</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  {drilldownCols.map(col => <TableHead key={col.key}>{col.label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {drilldownItems.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    {drilldownCols.map(col => (
                      <TableCell key={col.key}>{col.format ? col.format(item[col.key]) : (item[col.key] ?? '-')}</TableCell>
                    ))}
                  </TableRow>
                ))}
                {drilldownItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={drilldownCols.length + 1} className="text-center text-muted-foreground py-8">No data available</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
