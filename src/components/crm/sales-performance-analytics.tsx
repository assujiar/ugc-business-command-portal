// =====================================================
// Sales Performance Analytics Component
// Shows Top 3 & Bottom 3 performers for each metric
// For management roles: Director, super admin, sales manager, Marketing Manager, MACX
// =====================================================

'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Users,
  UserPlus,
  Clock,
  Activity,
  ChevronRight,
  Medal,
  Award,
  Crown,
  MapPin,
  Video,
  Phone,
  MessageSquare,
  Mail,
} from 'lucide-react'
import type { UserRole, OpportunityStage, ApproachMethod, AccountStatus } from '@/types/database'

// Types for the component
interface SalesProfile {
  user_id: string
  name: string
  email: string
  role: UserRole
}

interface Opportunity {
  opportunity_id: string
  name: string
  account_id: string
  stage: OpportunityStage
  estimated_value: number | null
  owner_user_id: string | null
  created_at: string
  closed_at: string | null
}

interface Account {
  account_id: string
  company_name: string
  account_status: AccountStatus | null
  owner_user_id: string | null
  created_at: string
  first_transaction_date: string | null
}

interface PipelineUpdate {
  update_id: string
  opportunity_id: string
  approach_method: ApproachMethod
  updated_by: string | null
  created_at: string
}

interface OpportunityStageHistory {
  opportunity_id: string
  old_stage: OpportunityStage | null
  new_stage: OpportunityStage
  changed_at: string
}

interface SalesPerformanceAnalyticsProps {
  opportunities: Opportunity[]
  accounts: Account[]
  pipelineUpdates: PipelineUpdate[]
  stageHistory: OpportunityStageHistory[]
  salesProfiles: SalesProfile[]
  currentUserId?: string
  currentUserRole?: UserRole
}

// Metric types
type MetricType =
  | 'revenue'
  | 'pipeline_value'
  | 'win_rate'
  | 'won_deals'
  | 'active_customers_qty'
  | 'active_customers_rev'
  | 'new_customers_qty'
  | 'new_customers_rev'
  | 'sales_cycle'
  | 'activities'

interface MetricConfig {
  key: MetricType
  title: string
  topTitle: string
  bottomTitle: string
  icon: React.ReactNode
  format: (value: number) => string
  higherIsBetter: boolean
  description: string
}

// Format currency
function formatCurrency(value: number): string {
  if (value >= 1000000000) {
    return `Rp ${(value / 1000000000).toFixed(1)}B`
  }
  if (value >= 1000000) {
    return `Rp ${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `Rp ${(value / 1000).toFixed(1)}K`
  }
  return `Rp ${value.toLocaleString('id-ID')}`
}

// Format days
function formatDays(days: number): string {
  if (days === 0) return '-'
  if (days < 1) return `${Math.round(days * 24)}h`
  return `${days.toFixed(1)} days`
}

// Metric configurations
const METRIC_CONFIGS: MetricConfig[] = [
  {
    key: 'revenue',
    title: 'Revenue',
    topTitle: 'Highest Revenue',
    bottomTitle: 'Lowest Revenue',
    icon: <DollarSign className="h-4 w-4" />,
    format: formatCurrency,
    higherIsBetter: true,
    description: 'Total closed won revenue',
  },
  {
    key: 'pipeline_value',
    title: 'Pipeline Value',
    topTitle: 'Largest Pipeline Opportunity',
    bottomTitle: 'Smallest Pipeline Opportunity',
    icon: <TrendingUp className="h-4 w-4" />,
    format: formatCurrency,
    higherIsBetter: true,
    description: 'Active pipeline opportunity value',
  },
  {
    key: 'win_rate',
    title: 'Win Rate',
    topTitle: 'Highest Win Rate',
    bottomTitle: 'Lowest Win Rate',
    icon: <Target className="h-4 w-4" />,
    format: (v) => `${v.toFixed(1)}%`,
    higherIsBetter: true,
    description: 'Won / (Won + Lost) percentage',
  },
  {
    key: 'won_deals',
    title: 'Won Deals',
    topTitle: 'Most Won Deals',
    bottomTitle: 'Fewest Won Deals',
    icon: <Trophy className="h-4 w-4" />,
    format: (v) => v.toString(),
    higherIsBetter: true,
    description: 'Number of closed won deals',
  },
  {
    key: 'active_customers_qty',
    title: 'Active Customers (Qty)',
    topTitle: 'Most Active Customers',
    bottomTitle: 'Fewest Active Customers',
    icon: <Users className="h-4 w-4" />,
    format: (v) => v.toString(),
    higherIsBetter: true,
    description: 'Number of active accounts',
  },
  {
    key: 'active_customers_rev',
    title: 'Active Customer Revenue',
    topTitle: 'Highest Active Customer Revenue',
    bottomTitle: 'Lowest Active Customer Revenue',
    icon: <Users className="h-4 w-4" />,
    format: formatCurrency,
    higherIsBetter: true,
    description: 'Revenue from active customers',
  },
  {
    key: 'new_customers_qty',
    title: 'New Customers (Qty)',
    topTitle: 'Most New Customers',
    bottomTitle: 'Fewest New Customers',
    icon: <UserPlus className="h-4 w-4" />,
    format: (v) => v.toString(),
    higherIsBetter: true,
    description: 'Number of new customers acquired',
  },
  {
    key: 'new_customers_rev',
    title: 'New Customer Revenue',
    topTitle: 'Highest New Customer Revenue',
    bottomTitle: 'Lowest New Customer Revenue',
    icon: <UserPlus className="h-4 w-4" />,
    format: formatCurrency,
    higherIsBetter: true,
    description: 'Revenue from new customers',
  },
  {
    key: 'sales_cycle',
    title: 'Sales Cycle',
    topTitle: 'Fastest Sales Cycle',
    bottomTitle: 'Slowest Sales Cycle',
    icon: <Clock className="h-4 w-4" />,
    format: formatDays,
    higherIsBetter: false, // Lower is better for sales cycle
    description: 'Average days to close a deal',
  },
  {
    key: 'activities',
    title: 'Activities',
    topTitle: 'Most Activities',
    bottomTitle: 'Fewest Activities',
    icon: <Activity className="h-4 w-4" />,
    format: (v) => v.toString(),
    higherIsBetter: true,
    description: 'Total number of activities performed',
  },
]

// Calculate performance metrics for each salesperson
interface SalesPerformance {
  userId: string
  name: string
  metrics: {
    revenue: number
    pipeline_value: number
    win_rate: number
    won_deals: number
    lost_deals: number
    active_customers_qty: number
    active_customers_rev: number
    new_customers_qty: number
    new_customers_rev: number
    sales_cycle: number
    activities: number
    activities_breakdown: {
      site_visit: number
      online_meeting: number
      phone_call: number
      whatsapp: number
      email: number
      texting: number
    }
  }
}

// Activity breakdown dialog content
function ActivityBreakdownContent({ breakdown }: { breakdown: SalesPerformance['metrics']['activities_breakdown'] }) {
  const items = [
    { label: 'Site Visit', value: breakdown.site_visit, icon: <MapPin className="h-4 w-4 text-orange-500" /> },
    { label: 'Online Meeting', value: breakdown.online_meeting, icon: <Video className="h-4 w-4 text-purple-500" /> },
    { label: 'Phone Call', value: breakdown.phone_call, icon: <Phone className="h-4 w-4 text-blue-500" /> },
    { label: 'WhatsApp', value: breakdown.whatsapp, icon: <MessageSquare className="h-4 w-4 text-green-500" /> },
    { label: 'Email', value: breakdown.email, icon: <Mail className="h-4 w-4 text-gray-500" /> },
  ]

  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1 text-xs text-muted-foreground">
          {item.icon}
          <span>{item.value}</span>
        </div>
      ))}
    </div>
  )
}

export function SalesPerformanceAnalytics({
  opportunities,
  accounts,
  pipelineUpdates,
  stageHistory,
  salesProfiles,
  currentUserId,
  currentUserRole,
}: SalesPerformanceAnalyticsProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricConfig | null>(null)
  const [showDetail, setShowDetail] = useState(false)

  // Calculate performance for each salesperson
  const salesPerformances = useMemo(() => {
    const performances: SalesPerformance[] = []

    // Filter only sales roles
    const salesUsers = salesProfiles.filter(p =>
      p.role === 'salesperson' || p.role === 'sales manager' || p.role === 'sales support'
    )

    for (const user of salesUsers) {
      const userId = user.user_id

      // Get opportunities owned by this user
      const userOpps = opportunities.filter(o => o.owner_user_id === userId)
      const wonOpps = userOpps.filter(o => o.stage === 'Closed Won')
      const lostOpps = userOpps.filter(o => o.stage === 'Closed Lost')
      const activeOpps = userOpps.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage))

      // Revenue (from closed won)
      const revenue = wonOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0)

      // Pipeline value (from active opps)
      const pipelineValue = activeOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0)

      // Win rate
      const totalClosed = wonOpps.length + lostOpps.length
      const winRate = totalClosed > 0 ? (wonOpps.length / totalClosed) * 100 : 0

      // Get accounts owned by this user
      const userAccounts = accounts.filter(a => a.owner_user_id === userId)
      const activeAccounts = userAccounts.filter(a => a.account_status === 'active_account')
      const newAccounts = userAccounts.filter(a => a.account_status === 'new_account')

      // Active customers revenue (from won opps for active accounts)
      const activeAccountIds = new Set(activeAccounts.map(a => a.account_id))
      const activeCustomerRev = wonOpps
        .filter(o => activeAccountIds.has(o.account_id))
        .reduce((sum, o) => sum + (o.estimated_value || 0), 0)

      // New customers revenue
      const newAccountIds = new Set(newAccounts.map(a => a.account_id))
      const newCustomerRev = wonOpps
        .filter(o => newAccountIds.has(o.account_id))
        .reduce((sum, o) => sum + (o.estimated_value || 0), 0)

      // Sales cycle calculation (average days from Prospecting to Closed Won)
      let totalSalesCycleDays = 0
      let salesCycleCount = 0
      for (const opp of wonOpps) {
        if (opp.closed_at && opp.created_at) {
          const createdDate = new Date(opp.created_at)
          const closedDate = new Date(opp.closed_at)
          const days = (closedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
          totalSalesCycleDays += days
          salesCycleCount++
        }
      }
      const avgSalesCycle = salesCycleCount > 0 ? totalSalesCycleDays / salesCycleCount : 0

      // Activities from pipeline updates
      const userUpdates = pipelineUpdates.filter(u => u.updated_by === userId)
      const activitiesBreakdown = {
        site_visit: userUpdates.filter(u => u.approach_method === 'Site Visit').length,
        online_meeting: userUpdates.filter(u => u.approach_method === 'Online Meeting').length,
        phone_call: userUpdates.filter(u => u.approach_method === 'Phone Call').length,
        whatsapp: userUpdates.filter(u => u.approach_method === 'WhatsApp').length,
        email: userUpdates.filter(u => u.approach_method === 'Email').length,
        texting: userUpdates.filter(u => u.approach_method === 'Texting').length,
      }

      performances.push({
        userId,
        name: user.name,
        metrics: {
          revenue,
          pipeline_value: pipelineValue,
          win_rate: winRate,
          won_deals: wonOpps.length,
          lost_deals: lostOpps.length,
          active_customers_qty: activeAccounts.length,
          active_customers_rev: activeCustomerRev,
          new_customers_qty: newAccounts.length,
          new_customers_rev: newCustomerRev,
          sales_cycle: avgSalesCycle,
          activities: userUpdates.length,
          activities_breakdown: activitiesBreakdown,
        },
      })
    }

    return performances
  }, [opportunities, accounts, pipelineUpdates, salesProfiles])

  // Get top 3 and bottom 3 for a metric
  const getTopAndBottom = (metricKey: MetricType, higherIsBetter: boolean) => {
    // Filter out users with zero values for certain metrics
    let filtered = [...salesPerformances]

    // For sales cycle, only include users who have closed deals
    if (metricKey === 'sales_cycle') {
      filtered = filtered.filter(p => p.metrics.sales_cycle > 0)
    }

    // For win rate, only include users who have closed deals
    if (metricKey === 'win_rate') {
      filtered = filtered.filter(p => p.metrics.won_deals + p.metrics.lost_deals > 0)
    }

    // Sort based on metric value
    const sorted = filtered.sort((a, b) => {
      const aVal = a.metrics[metricKey as keyof typeof a.metrics] as number
      const bVal = b.metrics[metricKey as keyof typeof b.metrics] as number
      return higherIsBetter ? bVal - aVal : aVal - bVal
    })

    return {
      top3: sorted.slice(0, 3),
      bottom3: sorted.slice(-3).reverse(),
    }
  }

  // Get all rankings for a metric (for detail view)
  const getAllRankings = (metricKey: MetricType, higherIsBetter: boolean) => {
    let filtered = [...salesPerformances]

    if (metricKey === 'sales_cycle') {
      filtered = filtered.filter(p => p.metrics.sales_cycle > 0)
    }

    if (metricKey === 'win_rate') {
      filtered = filtered.filter(p => p.metrics.won_deals + p.metrics.lost_deals > 0)
    }

    return filtered.sort((a, b) => {
      const aVal = a.metrics[metricKey as keyof typeof a.metrics] as number
      const bVal = b.metrics[metricKey as keyof typeof b.metrics] as number
      return higherIsBetter ? bVal - aVal : aVal - bVal
    })
  }

  // Render medal for position
  const renderMedal = (position: number, isTop: boolean) => {
    if (isTop) {
      switch (position) {
        case 0:
          return <Crown className="h-4 w-4 text-yellow-500" />
        case 1:
          return <Medal className="h-4 w-4 text-gray-400" />
        case 2:
          return <Award className="h-4 w-4 text-amber-600" />
        default:
          return null
      }
    } else {
      return <span className="text-xs text-muted-foreground">#{position + 1}</span>
    }
  }

  // Open detail dialog
  const openDetail = (metric: MetricConfig) => {
    setSelectedMetric(metric)
    setShowDetail(true)
  }

  if (salesPerformances.length === 0) {
    return null
  }

  return (
    <>
      {/* Top 3 Performers Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base lg:text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            Top 3 Performers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {METRIC_CONFIGS.map((config) => {
              const { top3 } = getTopAndBottom(config.key, config.higherIsBetter)
              if (top3.length === 0) return null

              return (
                <div key={config.key} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400">
                        {config.icon}
                      </div>
                      <span className="text-sm font-medium">{config.topTitle}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {top3.map((perf, idx) => (
                      <div key={perf.userId} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {renderMedal(idx, true)}
                          <span className="text-sm truncate max-w-[100px]">{perf.name}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {config.format(perf.metrics[config.key as keyof typeof perf.metrics] as number)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2 text-xs"
                    onClick={() => openDetail(config)}
                  >
                    View Detail
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Bottom 3 Performers Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base lg:text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-red-500" />
            Bottom 3 Performers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {METRIC_CONFIGS.map((config) => {
              const { bottom3 } = getTopAndBottom(config.key, config.higherIsBetter)
              if (bottom3.length === 0) return null

              return (
                <div key={config.key} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400">
                        {config.icon}
                      </div>
                      <span className="text-sm font-medium">{config.bottomTitle}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {bottom3.map((perf, idx) => {
                      const allRankings = getAllRankings(config.key, config.higherIsBetter)
                      const actualRank = allRankings.findIndex(p => p.userId === perf.userId)
                      return (
                        <div key={perf.userId} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-5">#{actualRank + 1}</span>
                            <span className="text-sm truncate max-w-[100px]">{perf.name}</span>
                          </div>
                          <Badge variant="outline" className="text-xs text-red-600">
                            {config.format(perf.metrics[config.key as keyof typeof perf.metrics] as number)}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2 text-xs"
                    onClick={() => openDetail(config)}
                  >
                    View Detail
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedMetric?.icon}
              {selectedMetric?.title} Rankings
            </DialogTitle>
            <DialogDescription>
              {selectedMetric?.description}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Sales Person</TableHead>
                  <TableHead className="text-right">{selectedMetric?.title}</TableHead>
                  {selectedMetric?.key === 'activities' && (
                    <TableHead>Breakdown</TableHead>
                  )}
                  {selectedMetric?.key === 'win_rate' && (
                    <TableHead className="text-right">W/L</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedMetric && getAllRankings(selectedMetric.key, selectedMetric.higherIsBetter).map((perf, idx) => (
                  <TableRow
                    key={perf.userId}
                    className={perf.userId === currentUserId ? 'bg-blue-50 dark:bg-blue-950' : ''}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {idx < 3 ? renderMedal(idx, true) : <span className="text-muted-foreground">#{idx + 1}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {perf.name}
                      {perf.userId === currentUserId && (
                        <Badge variant="secondary" className="ml-2 text-xs">You</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {selectedMetric.format(perf.metrics[selectedMetric.key as keyof typeof perf.metrics] as number)}
                    </TableCell>
                    {selectedMetric.key === 'activities' && (
                      <TableCell>
                        <ActivityBreakdownContent breakdown={perf.metrics.activities_breakdown} />
                      </TableCell>
                    )}
                    {selectedMetric.key === 'win_rate' && (
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {perf.metrics.won_deals}W / {perf.metrics.lost_deals}L
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}

// =====================================================
// Salesperson Performance Card
// For individual salesperson to see their own performance
// =====================================================

interface SalespersonPerformanceCardProps {
  opportunities: Opportunity[]
  accounts: Account[]
  pipelineUpdates: PipelineUpdate[]
  salesProfiles: SalesProfile[]
  currentUserId: string
  currentUserName: string
}

export function SalespersonPerformanceCard({
  opportunities,
  accounts,
  pipelineUpdates,
  salesProfiles,
  currentUserId,
  currentUserName,
}: SalespersonPerformanceCardProps) {
  // Calculate performance for all sales
  const allPerformances = useMemo(() => {
    const performances: SalesPerformance[] = []

    const salesUsers = salesProfiles.filter(p =>
      p.role === 'salesperson' || p.role === 'sales manager' || p.role === 'sales support'
    )

    for (const user of salesUsers) {
      const userId = user.user_id
      const userOpps = opportunities.filter(o => o.owner_user_id === userId)
      const wonOpps = userOpps.filter(o => o.stage === 'Closed Won')
      const lostOpps = userOpps.filter(o => o.stage === 'Closed Lost')
      const activeOpps = userOpps.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage))

      const revenue = wonOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0)
      const pipelineValue = activeOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0)
      const totalClosed = wonOpps.length + lostOpps.length
      const winRate = totalClosed > 0 ? (wonOpps.length / totalClosed) * 100 : 0

      const userAccounts = accounts.filter(a => a.owner_user_id === userId)
      const activeAccounts = userAccounts.filter(a => a.account_status === 'active_account')
      const newAccounts = userAccounts.filter(a => a.account_status === 'new_account')

      const activeAccountIds = new Set(activeAccounts.map(a => a.account_id))
      const activeCustomerRev = wonOpps
        .filter(o => activeAccountIds.has(o.account_id))
        .reduce((sum, o) => sum + (o.estimated_value || 0), 0)

      const newAccountIds = new Set(newAccounts.map(a => a.account_id))
      const newCustomerRev = wonOpps
        .filter(o => newAccountIds.has(o.account_id))
        .reduce((sum, o) => sum + (o.estimated_value || 0), 0)

      let totalSalesCycleDays = 0
      let salesCycleCount = 0
      for (const opp of wonOpps) {
        if (opp.closed_at && opp.created_at) {
          const createdDate = new Date(opp.created_at)
          const closedDate = new Date(opp.closed_at)
          const days = (closedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
          totalSalesCycleDays += days
          salesCycleCount++
        }
      }
      const avgSalesCycle = salesCycleCount > 0 ? totalSalesCycleDays / salesCycleCount : 0

      const userUpdates = pipelineUpdates.filter(u => u.updated_by === userId)
      const activitiesBreakdown = {
        site_visit: userUpdates.filter(u => u.approach_method === 'Site Visit').length,
        online_meeting: userUpdates.filter(u => u.approach_method === 'Online Meeting').length,
        phone_call: userUpdates.filter(u => u.approach_method === 'Phone Call').length,
        whatsapp: userUpdates.filter(u => u.approach_method === 'WhatsApp').length,
        email: userUpdates.filter(u => u.approach_method === 'Email').length,
        texting: userUpdates.filter(u => u.approach_method === 'Texting').length,
      }

      performances.push({
        userId,
        name: user.name,
        metrics: {
          revenue,
          pipeline_value: pipelineValue,
          win_rate: winRate,
          won_deals: wonOpps.length,
          lost_deals: lostOpps.length,
          active_customers_qty: activeAccounts.length,
          active_customers_rev: activeCustomerRev,
          new_customers_qty: newAccounts.length,
          new_customers_rev: newCustomerRev,
          sales_cycle: avgSalesCycle,
          activities: userUpdates.length,
          activities_breakdown: activitiesBreakdown,
        },
      })
    }

    return performances
  }, [opportunities, accounts, pipelineUpdates, salesProfiles])

  // Get current user's performance
  const myPerformance = allPerformances.find(p => p.userId === currentUserId)

  // Get rankings for each metric
  const getRanking = (metricKey: MetricType, higherIsBetter: boolean): number => {
    let filtered = [...allPerformances]

    if (metricKey === 'sales_cycle') {
      filtered = filtered.filter(p => p.metrics.sales_cycle > 0)
    }

    if (metricKey === 'win_rate') {
      filtered = filtered.filter(p => p.metrics.won_deals + p.metrics.lost_deals > 0)
    }

    const sorted = filtered.sort((a, b) => {
      const aVal = a.metrics[metricKey as keyof typeof a.metrics] as number
      const bVal = b.metrics[metricKey as keyof typeof b.metrics] as number
      return higherIsBetter ? bVal - aVal : aVal - bVal
    })

    return sorted.findIndex(p => p.userId === currentUserId) + 1
  }

  if (!myPerformance) {
    return null
  }

  const totalSales = allPerformances.length

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base lg:text-lg flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          My Performance Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {/* Revenue */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Revenue</span>
            </div>
            <p className="text-lg font-bold text-green-600">{formatCurrency(myPerformance.metrics.revenue)}</p>
            <Badge variant="outline" className="text-xs mt-1">
              Rank #{getRanking('revenue', true)} of {totalSales}
            </Badge>
          </div>

          {/* Pipeline Value */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Pipeline</span>
            </div>
            <p className="text-lg font-bold text-blue-600">{formatCurrency(myPerformance.metrics.pipeline_value)}</p>
            <Badge variant="outline" className="text-xs mt-1">
              Rank #{getRanking('pipeline_value', true)} of {totalSales}
            </Badge>
          </div>

          {/* Win Rate */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950 dark:to-violet-950 border">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-purple-600" />
              <span className="text-xs text-muted-foreground">Win Rate</span>
            </div>
            <p className="text-lg font-bold text-purple-600">{myPerformance.metrics.win_rate.toFixed(1)}%</p>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs mt-1">
                Rank #{getRanking('win_rate', true)} of {totalSales}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {myPerformance.metrics.won_deals}W/{myPerformance.metrics.lost_deals}L
              </span>
            </div>
          </div>

          {/* Won Deals */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 border">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-4 w-4 text-amber-600" />
              <span className="text-xs text-muted-foreground">Won Deals</span>
            </div>
            <p className="text-lg font-bold text-amber-600">{myPerformance.metrics.won_deals}</p>
            <Badge variant="outline" className="text-xs mt-1">
              Rank #{getRanking('won_deals', true)} of {totalSales}
            </Badge>
          </div>

          {/* Active Customers */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950 dark:to-cyan-950 border">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-teal-600" />
              <span className="text-xs text-muted-foreground">Active Customers</span>
            </div>
            <p className="text-lg font-bold text-teal-600">{myPerformance.metrics.active_customers_qty}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(myPerformance.metrics.active_customers_rev)}</p>
            <Badge variant="outline" className="text-xs mt-1">
              Rank #{getRanking('active_customers_qty', true)} of {totalSales}
            </Badge>
          </div>

          {/* New Customers */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950 dark:to-pink-950 border">
            <div className="flex items-center gap-2 mb-1">
              <UserPlus className="h-4 w-4 text-rose-600" />
              <span className="text-xs text-muted-foreground">New Customers</span>
            </div>
            <p className="text-lg font-bold text-rose-600">{myPerformance.metrics.new_customers_qty}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(myPerformance.metrics.new_customers_rev)}</p>
            <Badge variant="outline" className="text-xs mt-1">
              Rank #{getRanking('new_customers_qty', true)} of {totalSales}
            </Badge>
          </div>

          {/* Sales Cycle */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950 dark:to-red-950 border">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-orange-600" />
              <span className="text-xs text-muted-foreground">Avg Sales Cycle</span>
            </div>
            <p className="text-lg font-bold text-orange-600">{formatDays(myPerformance.metrics.sales_cycle)}</p>
            <Badge variant="outline" className="text-xs mt-1">
              Rank #{getRanking('sales_cycle', false)} of {totalSales}
            </Badge>
          </div>

          {/* Activities */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950 dark:to-gray-950 border">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-slate-600" />
              <span className="text-xs text-muted-foreground">Activities</span>
            </div>
            <p className="text-lg font-bold text-slate-600">{myPerformance.metrics.activities}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />{myPerformance.metrics.activities_breakdown.site_visit}
              </span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Video className="h-3 w-3" />{myPerformance.metrics.activities_breakdown.online_meeting}
              </span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Phone className="h-3 w-3" />{myPerformance.metrics.activities_breakdown.phone_call}
              </span>
            </div>
            <Badge variant="outline" className="text-xs mt-1">
              Rank #{getRanking('activities', true)} of {totalSales}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
