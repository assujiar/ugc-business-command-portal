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
  BarChart3,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts'
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

// Activity from activities table (combined from pipeline and sales plan)
interface Activity {
  activity_id: string
  activity_type: string // ActivityTypeV2
  status: string // ActivityStatus
  owner_user_id: string
  created_at: string
  completed_at: string | null
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
  activities: Activity[]
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
  | 'won_deals_qty'
  | 'won_deals_value'
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
    description: 'Total revenue from invoices (DSO/AR module)',
  },
  {
    key: 'pipeline_value',
    title: 'Pipeline Opportunity',
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
    key: 'won_deals_qty',
    title: 'Won Deals (Qty)',
    topTitle: 'Most Won Deals',
    bottomTitle: 'Fewest Won Deals',
    icon: <Trophy className="h-4 w-4" />,
    format: (v) => v.toString(),
    higherIsBetter: true,
    description: 'Number of closed won deals',
  },
  {
    key: 'won_deals_value',
    title: 'Won Deals (Value)',
    topTitle: 'Highest Won Value',
    bottomTitle: 'Lowest Won Value',
    icon: <Trophy className="h-4 w-4" />,
    format: formatCurrency,
    higherIsBetter: true,
    description: 'Total value of closed won deals',
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
    revenue: number // Placeholder - will come from DSO/AR module
    pipeline_value: number
    win_rate: number
    won_deals_qty: number
    won_deals_value: number
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
      call: number
      meeting: number
    }
  }
}

// Activity breakdown dialog content
function ActivityBreakdownContent({ breakdown }: { breakdown: SalesPerformance['metrics']['activities_breakdown'] }) {
  const items = [
    { label: 'Site Visit', value: breakdown.site_visit, icon: <MapPin className="h-4 w-4 text-orange-500" /> },
    { label: 'Online Meeting', value: breakdown.online_meeting, icon: <Video className="h-4 w-4 text-purple-500" /> },
    { label: 'Phone Call', value: breakdown.phone_call, icon: <Phone className="h-4 w-4 text-blue-500" /> },
    { label: 'Call', value: breakdown.call, icon: <Phone className="h-4 w-4 text-cyan-500" /> },
    { label: 'Meeting', value: breakdown.meeting, icon: <Users className="h-4 w-4 text-indigo-500" /> },
    { label: 'WhatsApp', value: breakdown.whatsapp, icon: <MessageSquare className="h-4 w-4 text-green-500" /> },
    { label: 'Email', value: breakdown.email, icon: <Mail className="h-4 w-4 text-gray-500" /> },
  ]

  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {items.filter(item => item.value > 0).map((item) => (
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
  activities,
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

    // Filter only salesperson role (not sales manager or sales support)
    const salesUsers = salesProfiles.filter(p => p.role === 'salesperson')

    for (const user of salesUsers) {
      const userId = user.user_id

      // Get opportunities owned by this user
      const userOpps = opportunities.filter(o => o.owner_user_id === userId)
      const wonOpps = userOpps.filter(o => o.stage === 'Closed Won')
      const lostOpps = userOpps.filter(o => o.stage === 'Closed Lost')
      const activeOpps = userOpps.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage))

      // Get accounts owned by this user
      const userAccounts = accounts.filter(a => a.owner_user_id === userId)

      // Activities from activities table (combined from pipeline and sales plan)
      const userActivities = activities.filter(a => a.owner_user_id === userId)

      // Pipeline value (from active opps)
      const pipelineValue = activeOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0)

      // Win rate
      const totalClosed = wonOpps.length + lostOpps.length
      const winRate = totalClosed > 0 ? (wonOpps.length / totalClosed) * 100 : 0

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

      const activitiesBreakdown = {
        site_visit: userActivities.filter(a => a.activity_type === 'Site Visit').length,
        online_meeting: userActivities.filter(a => a.activity_type === 'Online Meeting').length,
        phone_call: userActivities.filter(a => a.activity_type === 'Phone Call').length,
        call: userActivities.filter(a => a.activity_type === 'Call').length,
        meeting: userActivities.filter(a => a.activity_type === 'Meeting').length,
        whatsapp: userActivities.filter(a => a.activity_type === 'WhatsApp').length,
        email: userActivities.filter(a => a.activity_type === 'Email').length,
      }

      // Won deals value
      const wonDealsValue = wonOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0)

      performances.push({
        userId,
        name: user.name,
        metrics: {
          revenue: 0, // Placeholder - will come from DSO/AR module invoices
          pipeline_value: pipelineValue,
          win_rate: winRate,
          won_deals_qty: wonOpps.length,
          won_deals_value: wonDealsValue,
          lost_deals: lostOpps.length,
          active_customers_qty: activeAccounts.length,
          active_customers_rev: activeCustomerRev,
          new_customers_qty: newAccounts.length,
          new_customers_rev: newCustomerRev,
          sales_cycle: avgSalesCycle,
          activities: userActivities.length,
          activities_breakdown: activitiesBreakdown,
        },
      })
    }

    return performances
  }, [opportunities, accounts, activities, salesProfiles])

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
      filtered = filtered.filter(p => p.metrics.won_deals_qty + p.metrics.lost_deals > 0)
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
      filtered = filtered.filter(p => p.metrics.won_deals_qty + p.metrics.lost_deals > 0)
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

  // Check if there's any data for a metric (skip if all values are 0 or metric is placeholder)
  const hasDataForMetric = (metricKey: MetricType): boolean => {
    // Skip revenue metric as it's a placeholder for DSO/AR module
    if (metricKey === 'revenue') return false

    const values = salesPerformances.map(p => p.metrics[metricKey as keyof typeof p.metrics] as number)
    return values.some(v => v > 0)
  }

  // Show empty state if no sales profiles found
  if (salesPerformances.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base lg:text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            Sales Performance Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No sales data available</p>
            <p className="text-sm">Performance analytics will appear once sales activities are recorded.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Filter metrics that have data
  const metricsWithData = METRIC_CONFIGS.filter(config => hasDataForMetric(config.key))

  // If no metrics have data, show empty state
  if (metricsWithData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base lg:text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            Sales Performance Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No performance data available yet</p>
            <p className="text-sm">Analytics will appear once sales activities and deals are recorded.</p>
          </div>
        </CardContent>
      </Card>
    )
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
            {metricsWithData.map((config) => {
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
            {metricsWithData.map((config) => {
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
                        {perf.metrics.won_deals_qty}W / {perf.metrics.lost_deals}L
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
  activities: Activity[]
  salesProfiles: SalesProfile[]
  currentUserId: string
  currentUserName: string
}

// =====================================================
// Weekly Analytics Component
// Shows weekly activities, pipeline, revenue opportunity
// For management roles: aggregate all sales data
// For salesperson: only their own data
// =====================================================

interface WeeklyAnalyticsProps {
  opportunities: Opportunity[]
  activities: Activity[]
  currentUserId?: string
  currentUserRole?: UserRole
  isAggregate: boolean // true for management roles, false for salesperson
}

// Get start and end of current week (Monday to Sunday)
function getCurrentWeekRange(): { start: Date; end: Date } {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1

  const start = new Date(now)
  start.setDate(now.getDate() - diffToMonday)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  return { start, end }
}

// Helper to get week number of year
function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
}

// Helper to get start of week (Monday)
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// Helper to get end of week (Sunday)
function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

// Interface for weekly data point
interface WeeklyDataPoint {
  week: string
  weekNumber: number
  activities: number
  pipeline: number
  revenueOpp: number
  actualRevenue: number
  startDate: Date
  endDate: Date
}

// Interface for growth metrics
interface GrowthMetrics {
  wow: number | null // Week over Week
  mom: number | null // Month over Month
  yoy: number | null // Year over Year
  mtd: number // Month to Date
  ytd: number // Year to Date
}

// Calculate growth percentage
function calcGrowth(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return ((current - previous) / previous) * 100
}

// Growth indicator component
function GrowthIndicator({ value, label }: { value: number | null; label: string }) {
  if (value === null) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <Minus className="h-3 w-3 text-muted-foreground" />
        <span className="text-muted-foreground">{label}: N/A</span>
      </div>
    )
  }
  const isPositive = value > 0
  const isNeutral = value === 0
  return (
    <div className="flex items-center gap-1 text-xs">
      {isPositive ? (
        <ArrowUp className="h-3 w-3 text-green-600" />
      ) : isNeutral ? (
        <Minus className="h-3 w-3 text-muted-foreground" />
      ) : (
        <ArrowDown className="h-3 w-3 text-red-600" />
      )}
      <span className={isPositive ? 'text-green-600' : isNeutral ? 'text-muted-foreground' : 'text-red-600'}>
        {label}: {isPositive ? '+' : ''}{value.toFixed(1)}%
      </span>
    </div>
  )
}

export function WeeklyAnalytics({
  opportunities,
  activities,
  currentUserId,
  currentUserRole,
  isAggregate,
}: WeeklyAnalyticsProps) {
  const [activeTab, setActiveTab] = useState<'activities' | 'pipeline' | 'revenue'>('activities')

  // Calculate historical weekly data for the year
  const historicalData = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentWeekNum = getWeekNumber(now)

    // Filter data based on role
    let filteredActivities = activities
    let filteredOpportunities = opportunities

    if (!isAggregate && currentUserId) {
      filteredActivities = activities.filter(a => a.owner_user_id === currentUserId)
      filteredOpportunities = opportunities.filter(o => o.owner_user_id === currentUserId)
    }

    // Build weekly data from week 1 to current week
    const weeklyData: WeeklyDataPoint[] = []

    for (let weekNum = 1; weekNum <= currentWeekNum; weekNum++) {
      // Calculate the date range for this week
      const jan1 = new Date(currentYear, 0, 1)
      const daysToAdd = (weekNum - 1) * 7 - jan1.getDay() + 1 // Start from Monday of week 1
      const weekStartDate = new Date(jan1)
      weekStartDate.setDate(jan1.getDate() + daysToAdd)
      const weekStart = getWeekStart(weekStartDate)
      const weekEnd = getWeekEnd(weekStartDate)

      // Count activities in this week
      const weekActivities = filteredActivities.filter(a => {
        const createdAt = new Date(a.created_at)
        return createdAt >= weekStart && createdAt <= weekEnd
      }).length

      // Sum pipeline value for new opportunities this week
      const weekOpps = filteredOpportunities.filter(o => {
        const createdAt = new Date(o.created_at)
        return createdAt >= weekStart && createdAt <= weekEnd
      })
      const weekPipeline = weekOpps
        .filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage))
        .reduce((sum, o) => sum + (o.estimated_value || 0), 0)
      const weekRevenueOpp = weekOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0)

      weeklyData.push({
        week: `W${weekNum}`,
        weekNumber: weekNum,
        activities: weekActivities,
        pipeline: weekPipeline,
        revenueOpp: weekRevenueOpp,
        actualRevenue: 0, // Placeholder for DSO/AR
        startDate: weekStart,
        endDate: weekEnd,
      })
    }

    return weeklyData
  }, [opportunities, activities, currentUserId, isAggregate])

  // Calculate growth metrics for each metric type
  const growthMetrics = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    const currentWeekNum = getWeekNumber(now)

    // Get current week data
    const currentWeekData = historicalData.find(d => d.weekNumber === currentWeekNum)
    const lastWeekData = historicalData.find(d => d.weekNumber === currentWeekNum - 1)

    // Get current month weeks
    const currentMonthWeeks = historicalData.filter(d => {
      return d.startDate.getMonth() === currentMonth
    })

    // Get last month weeks (for MoM comparison)
    const lastMonthWeeks = historicalData.filter(d => {
      return d.startDate.getMonth() === (currentMonth - 1 + 12) % 12 &&
        (currentMonth > 0 || d.startDate.getFullYear() === currentYear - 1)
    })

    // MTD: Sum of current month
    const mtdActivities = currentMonthWeeks.reduce((sum, d) => sum + d.activities, 0)
    const mtdPipeline = currentMonthWeeks.reduce((sum, d) => sum + d.pipeline, 0)
    const mtdRevenueOpp = currentMonthWeeks.reduce((sum, d) => sum + d.revenueOpp, 0)

    // Last month total (for MoM)
    const lastMonthActivities = lastMonthWeeks.reduce((sum, d) => sum + d.activities, 0)
    const lastMonthPipeline = lastMonthWeeks.reduce((sum, d) => sum + d.pipeline, 0)
    const lastMonthRevenueOpp = lastMonthWeeks.reduce((sum, d) => sum + d.revenueOpp, 0)

    // YTD: Sum of all weeks this year
    const ytdActivities = historicalData.reduce((sum, d) => sum + d.activities, 0)
    const ytdPipeline = historicalData.reduce((sum, d) => sum + d.pipeline, 0)
    const ytdRevenueOpp = historicalData.reduce((sum, d) => sum + d.revenueOpp, 0)

    // WoW calculations
    const wowActivities = currentWeekData && lastWeekData
      ? calcGrowth(currentWeekData.activities, lastWeekData.activities)
      : null
    const wowPipeline = currentWeekData && lastWeekData
      ? calcGrowth(currentWeekData.pipeline, lastWeekData.pipeline)
      : null
    const wowRevenueOpp = currentWeekData && lastWeekData
      ? calcGrowth(currentWeekData.revenueOpp, lastWeekData.revenueOpp)
      : null

    // MoM calculations
    const momActivities = lastMonthActivities > 0 ? calcGrowth(mtdActivities, lastMonthActivities) : null
    const momPipeline = lastMonthPipeline > 0 ? calcGrowth(mtdPipeline, lastMonthPipeline) : null
    const momRevenueOpp = lastMonthRevenueOpp > 0 ? calcGrowth(mtdRevenueOpp, lastMonthRevenueOpp) : null

    return {
      activities: {
        wow: wowActivities,
        mom: momActivities,
        yoy: null, // Would need last year's data
        mtd: mtdActivities,
        ytd: ytdActivities,
      },
      pipeline: {
        wow: wowPipeline,
        mom: momPipeline,
        yoy: null,
        mtd: mtdPipeline,
        ytd: ytdPipeline,
      },
      revenueOpp: {
        wow: wowRevenueOpp,
        mom: momRevenueOpp,
        yoy: null,
        mtd: mtdRevenueOpp,
        ytd: ytdRevenueOpp,
      },
    }
  }, [historicalData])

  // Current week data for summary
  const currentWeekData = useMemo(() => {
    const { start, end } = getCurrentWeekRange()

    let filteredActivities = activities
    let filteredOpportunities = opportunities

    if (!isAggregate && currentUserId) {
      filteredActivities = activities.filter(a => a.owner_user_id === currentUserId)
      filteredOpportunities = opportunities.filter(o => o.owner_user_id === currentUserId)
    }

    const weeklyActivities = filteredActivities.filter(a => {
      const createdAt = new Date(a.created_at)
      return createdAt >= start && createdAt <= end
    })

    const weeklyActivitiesBreakdown = {
      site_visit: weeklyActivities.filter(a => a.activity_type === 'Site Visit').length,
      online_meeting: weeklyActivities.filter(a => a.activity_type === 'Online Meeting').length,
      phone_call: weeklyActivities.filter(a => a.activity_type === 'Phone Call').length,
      call: weeklyActivities.filter(a => a.activity_type === 'Call').length,
      meeting: weeklyActivities.filter(a => a.activity_type === 'Meeting').length,
      whatsapp: weeklyActivities.filter(a => a.activity_type === 'WhatsApp').length,
      email: weeklyActivities.filter(a => a.activity_type === 'Email').length,
    }

    const weeklyNewOpportunities = filteredOpportunities.filter(o => {
      const createdAt = new Date(o.created_at)
      return createdAt >= start && createdAt <= end
    })
    const weeklyPipelineValue = weeklyNewOpportunities
      .filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage))
      .reduce((sum, o) => sum + (o.estimated_value || 0), 0)

    const weeklyRevenueOpportunity = weeklyNewOpportunities
      .reduce((sum, o) => sum + (o.estimated_value || 0), 0)

    const totalActivePipeline = filteredOpportunities
      .filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage))
      .reduce((sum, o) => sum + (o.estimated_value || 0), 0)

    return {
      weeklyActivitiesCount: weeklyActivities.length,
      weeklyActivitiesBreakdown,
      weeklyPipelineValue,
      weeklyNewOpportunitiesCount: weeklyNewOpportunities.length,
      weeklyRevenueOpportunity,
      totalActivePipeline,
    }
  }, [opportunities, activities, currentUserId, isAggregate])

  const { start, end } = getCurrentWeekRange()
  const weekRangeText = `${start.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`

  // Chart data limited to last 12 weeks for better readability
  const chartData = historicalData.slice(-12)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base lg:text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-indigo-500" />
          Weekly Analytics
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            {weekRangeText}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Summary Cards */}
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4 mb-4">
          {/* Weekly Activities */}
          <div className="p-2 lg:p-3 rounded-lg bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950 dark:to-gray-950 border">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-slate-600" />
              <span className="text-[10px] lg:text-xs text-muted-foreground">Activities</span>
            </div>
            <p className="text-base lg:text-lg font-bold text-slate-600">{currentWeekData.weeklyActivitiesCount}</p>
            <div className="hidden lg:flex flex-wrap gap-1 mt-1">
              {currentWeekData.weeklyActivitiesBreakdown.site_visit > 0 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />{currentWeekData.weeklyActivitiesBreakdown.site_visit}
                </span>
              )}
              {currentWeekData.weeklyActivitiesBreakdown.phone_call > 0 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Phone className="h-3 w-3" />{currentWeekData.weeklyActivitiesBreakdown.phone_call}
                </span>
              )}
              {currentWeekData.weeklyActivitiesBreakdown.whatsapp > 0 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <MessageSquare className="h-3 w-3" />{currentWeekData.weeklyActivitiesBreakdown.whatsapp}
                </span>
              )}
            </div>
          </div>

          {/* Weekly Pipeline */}
          <div className="p-2 lg:p-3 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span className="text-[10px] lg:text-xs text-muted-foreground">Pipeline</span>
            </div>
            <p className="text-base lg:text-lg font-bold text-blue-600">{formatCurrency(currentWeekData.weeklyPipelineValue)}</p>
            <p className="text-[10px] text-muted-foreground">{currentWeekData.weeklyNewOpportunitiesCount} new opp</p>
          </div>

          {/* Revenue Opportunity */}
          <div className="p-2 lg:p-3 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-green-600" />
              <span className="text-[10px] lg:text-xs text-muted-foreground">Revenue Opp</span>
            </div>
            <p className="text-base lg:text-lg font-bold text-green-600">{formatCurrency(currentWeekData.weeklyRevenueOpportunity)}</p>
            <p className="text-[10px] text-muted-foreground">New opportunities</p>
          </div>

          {/* Actual Revenue - Placeholder */}
          <div className="p-2 lg:p-3 rounded-lg bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 border">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-amber-600" />
              <span className="text-[10px] lg:text-xs text-muted-foreground">Actual Rev</span>
            </div>
            <p className="text-base lg:text-lg font-bold text-muted-foreground">N/A</p>
            <p className="text-[10px] text-muted-foreground">DSO/AR module</p>
          </div>
        </div>

        {/* Chart Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-8">
            <TabsTrigger value="activities" className="text-xs">Activities</TabsTrigger>
            <TabsTrigger value="pipeline" className="text-xs">Pipeline</TabsTrigger>
            <TabsTrigger value="revenue" className="text-xs">Revenue Opp</TabsTrigger>
          </TabsList>

          {/* Activities Tab */}
          <TabsContent value="activities" className="mt-3">
            <div className="space-y-3">
              {/* Growth Metrics */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 p-2 bg-muted/50 rounded-lg">
                <GrowthIndicator value={growthMetrics.activities.wow} label="WoW" />
                <GrowthIndicator value={growthMetrics.activities.mom} label="MoM" />
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">MTD: <span className="font-medium text-foreground">{growthMetrics.activities.mtd}</span></span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">YTD: <span className="font-medium text-foreground">{growthMetrics.activities.ytd}</span></span>
                </div>
              </div>

              {/* Chart */}
              <div className="h-48 lg:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      formatter={(value: number) => [value, 'Activities']}
                    />
                    <Area
                      type="monotone"
                      dataKey="activities"
                      stroke="#6366f1"
                      fill="#6366f1"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          {/* Pipeline Tab */}
          <TabsContent value="pipeline" className="mt-3">
            <div className="space-y-3">
              {/* Growth Metrics */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 p-2 bg-muted/50 rounded-lg">
                <GrowthIndicator value={growthMetrics.pipeline.wow} label="WoW" />
                <GrowthIndicator value={growthMetrics.pipeline.mom} label="MoM" />
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">MTD: <span className="font-medium text-foreground">{formatCurrency(growthMetrics.pipeline.mtd)}</span></span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">YTD: <span className="font-medium text-foreground">{formatCurrency(growthMetrics.pipeline.ytd)}</span></span>
                </div>
              </div>

              {/* Chart */}
              <div className="h-48 lg:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v)} className="text-muted-foreground" />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      formatter={(value: number) => [formatCurrency(value), 'Pipeline']}
                    />
                    <Bar dataKey="pipeline" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          {/* Revenue Opportunity Tab */}
          <TabsContent value="revenue" className="mt-3">
            <div className="space-y-3">
              {/* Growth Metrics */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 p-2 bg-muted/50 rounded-lg">
                <GrowthIndicator value={growthMetrics.revenueOpp.wow} label="WoW" />
                <GrowthIndicator value={growthMetrics.revenueOpp.mom} label="MoM" />
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">MTD: <span className="font-medium text-foreground">{formatCurrency(growthMetrics.revenueOpp.mtd)}</span></span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">YTD: <span className="font-medium text-foreground">{formatCurrency(growthMetrics.revenueOpp.ytd)}</span></span>
                </div>
              </div>

              {/* Chart */}
              <div className="h-48 lg:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v)} className="text-muted-foreground" />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      formatter={(value: number) => [formatCurrency(value), 'Revenue Opportunity']}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenueOpp"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Total Active Pipeline Summary */}
        <div className="mt-3 pt-3 border-t flex items-center justify-between">
          <span className="text-xs lg:text-sm text-muted-foreground">Total Active Pipeline:</span>
          <span className="font-semibold text-blue-600">{formatCurrency(currentWeekData.totalActivePipeline)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function SalespersonPerformanceCard({
  opportunities,
  accounts,
  activities,
  salesProfiles,
  currentUserId,
  currentUserName,
}: SalespersonPerformanceCardProps) {
  // Calculate performance for all sales
  const allPerformances = useMemo(() => {
    const performances: SalesPerformance[] = []

    // Filter only salesperson role (not sales manager or sales support)
    const salesUsers = salesProfiles.filter(p => p.role === 'salesperson')

    for (const user of salesUsers) {
      const userId = user.user_id
      const userOpps = opportunities.filter(o => o.owner_user_id === userId)
      const wonOpps = userOpps.filter(o => o.stage === 'Closed Won')
      const lostOpps = userOpps.filter(o => o.stage === 'Closed Lost')
      const activeOpps = userOpps.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage))

      const userAccounts = accounts.filter(a => a.owner_user_id === userId)
      const userActivities = activities.filter(a => a.owner_user_id === userId)

      const pipelineValue = activeOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0)
      const totalClosed = wonOpps.length + lostOpps.length
      const winRate = totalClosed > 0 ? (wonOpps.length / totalClosed) * 100 : 0

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

      const activitiesBreakdown = {
        site_visit: userActivities.filter(a => a.activity_type === 'Site Visit').length,
        online_meeting: userActivities.filter(a => a.activity_type === 'Online Meeting').length,
        phone_call: userActivities.filter(a => a.activity_type === 'Phone Call').length,
        call: userActivities.filter(a => a.activity_type === 'Call').length,
        meeting: userActivities.filter(a => a.activity_type === 'Meeting').length,
        whatsapp: userActivities.filter(a => a.activity_type === 'WhatsApp').length,
        email: userActivities.filter(a => a.activity_type === 'Email').length,
      }

      // Won deals value
      const wonDealsValue = wonOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0)

      performances.push({
        userId,
        name: user.name,
        metrics: {
          revenue: 0, // Placeholder - will come from DSO/AR module
          pipeline_value: pipelineValue,
          win_rate: winRate,
          won_deals_qty: wonOpps.length,
          won_deals_value: wonDealsValue,
          lost_deals: lostOpps.length,
          active_customers_qty: activeAccounts.length,
          active_customers_rev: activeCustomerRev,
          new_customers_qty: newAccounts.length,
          new_customers_rev: newCustomerRev,
          sales_cycle: avgSalesCycle,
          activities: userActivities.length,
          activities_breakdown: activitiesBreakdown,
        },
      })
    }

    return performances
  }, [opportunities, accounts, activities, salesProfiles])

  // Get current user's performance
  const myPerformance = allPerformances.find(p => p.userId === currentUserId)

  // Get rankings for each metric
  const getRanking = (metricKey: MetricType, higherIsBetter: boolean): number => {
    let filtered = [...allPerformances]

    if (metricKey === 'sales_cycle') {
      filtered = filtered.filter(p => p.metrics.sales_cycle > 0)
    }

    if (metricKey === 'win_rate') {
      filtered = filtered.filter(p => p.metrics.won_deals_qty + p.metrics.lost_deals > 0)
    }

    const sorted = filtered.sort((a, b) => {
      const aVal = a.metrics[metricKey as keyof typeof a.metrics] as number
      const bVal = b.metrics[metricKey as keyof typeof b.metrics] as number
      return higherIsBetter ? bVal - aVal : aVal - bVal
    })

    return sorted.findIndex(p => p.userId === currentUserId) + 1
  }

  if (!myPerformance) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base lg:text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            My Performance Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No performance data available</p>
            <p className="text-sm">Your performance metrics will appear once you start recording activities.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalSales = allPerformances.length

  // Helper to check if ranking is available
  const getRankingDisplay = (metricKey: MetricType, higherIsBetter: boolean) => {
    const rank = getRanking(metricKey, higherIsBetter)
    if (rank === 0) return 'N/A'
    return `#${rank} of ${totalSales}`
  }

  // Check if user has any closed deals for win rate
  const hasClosedDeals = myPerformance.metrics.won_deals_qty + myPerformance.metrics.lost_deals > 0

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
          {/* Revenue - Placeholder for DSO/AR module */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Revenue</span>
            </div>
            <p className="text-lg font-bold text-muted-foreground">N/A</p>
            <p className="text-xs text-muted-foreground">From DSO/AR module</p>
          </div>

          {/* Pipeline Value */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Pipeline</span>
            </div>
            {myPerformance.metrics.pipeline_value > 0 ? (
              <>
                <p className="text-lg font-bold text-blue-600">{formatCurrency(myPerformance.metrics.pipeline_value)}</p>
                <Badge variant="outline" className="text-xs mt-1">
                  Rank {getRankingDisplay('pipeline_value', true)}
                </Badge>
              </>
            ) : (
              <p className="text-lg font-bold text-muted-foreground">N/A</p>
            )}
          </div>

          {/* Win Rate */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950 dark:to-violet-950 border">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-purple-600" />
              <span className="text-xs text-muted-foreground">Win Rate</span>
            </div>
            {hasClosedDeals ? (
              <>
                <p className="text-lg font-bold text-purple-600">{myPerformance.metrics.win_rate.toFixed(1)}%</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs mt-1">
                    Rank {getRankingDisplay('win_rate', true)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {myPerformance.metrics.won_deals_qty}W/{myPerformance.metrics.lost_deals}L
                  </span>
                </div>
              </>
            ) : (
              <p className="text-lg font-bold text-muted-foreground">N/A</p>
            )}
          </div>

          {/* Won Deals */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 border">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-4 w-4 text-amber-600" />
              <span className="text-xs text-muted-foreground">Won Deals</span>
            </div>
            {myPerformance.metrics.won_deals_qty > 0 ? (
              <>
                <p className="text-lg font-bold text-amber-600">{myPerformance.metrics.won_deals_qty}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(myPerformance.metrics.won_deals_value)}</p>
                <Badge variant="outline" className="text-xs mt-1">
                  Rank {getRankingDisplay('won_deals_qty', true)}
                </Badge>
              </>
            ) : (
              <p className="text-lg font-bold text-muted-foreground">N/A</p>
            )}
          </div>

          {/* Active Customers */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950 dark:to-cyan-950 border">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-teal-600" />
              <span className="text-xs text-muted-foreground">Active Customers</span>
            </div>
            {myPerformance.metrics.active_customers_qty > 0 ? (
              <>
                <p className="text-lg font-bold text-teal-600">{myPerformance.metrics.active_customers_qty}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(myPerformance.metrics.active_customers_rev)}</p>
                <Badge variant="outline" className="text-xs mt-1">
                  Rank {getRankingDisplay('active_customers_qty', true)}
                </Badge>
              </>
            ) : (
              <p className="text-lg font-bold text-muted-foreground">N/A</p>
            )}
          </div>

          {/* New Customers */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950 dark:to-pink-950 border">
            <div className="flex items-center gap-2 mb-1">
              <UserPlus className="h-4 w-4 text-rose-600" />
              <span className="text-xs text-muted-foreground">New Customers</span>
            </div>
            {myPerformance.metrics.new_customers_qty > 0 ? (
              <>
                <p className="text-lg font-bold text-rose-600">{myPerformance.metrics.new_customers_qty}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(myPerformance.metrics.new_customers_rev)}</p>
                <Badge variant="outline" className="text-xs mt-1">
                  Rank {getRankingDisplay('new_customers_qty', true)}
                </Badge>
              </>
            ) : (
              <p className="text-lg font-bold text-muted-foreground">N/A</p>
            )}
          </div>

          {/* Sales Cycle */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950 dark:to-red-950 border">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-orange-600" />
              <span className="text-xs text-muted-foreground">Avg Sales Cycle</span>
            </div>
            {myPerformance.metrics.sales_cycle > 0 ? (
              <>
                <p className="text-lg font-bold text-orange-600">{formatDays(myPerformance.metrics.sales_cycle)}</p>
                <Badge variant="outline" className="text-xs mt-1">
                  Rank {getRankingDisplay('sales_cycle', false)}
                </Badge>
              </>
            ) : (
              <p className="text-lg font-bold text-muted-foreground">N/A</p>
            )}
          </div>

          {/* Activities */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950 dark:to-gray-950 border">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-slate-600" />
              <span className="text-xs text-muted-foreground">Activities</span>
            </div>
            {myPerformance.metrics.activities > 0 ? (
              <>
                <p className="text-lg font-bold text-slate-600">{myPerformance.metrics.activities}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {myPerformance.metrics.activities_breakdown.site_visit > 0 && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />{myPerformance.metrics.activities_breakdown.site_visit}
                    </span>
                  )}
                  {myPerformance.metrics.activities_breakdown.online_meeting > 0 && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Video className="h-3 w-3" />{myPerformance.metrics.activities_breakdown.online_meeting}
                    </span>
                  )}
                  {myPerformance.metrics.activities_breakdown.phone_call > 0 && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Phone className="h-3 w-3" />{myPerformance.metrics.activities_breakdown.phone_call}
                    </span>
                  )}
                  {myPerformance.metrics.activities_breakdown.call > 0 && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Phone className="h-3 w-3" />{myPerformance.metrics.activities_breakdown.call}
                    </span>
                  )}
                  {myPerformance.metrics.activities_breakdown.meeting > 0 && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Users className="h-3 w-3" />{myPerformance.metrics.activities_breakdown.meeting}
                    </span>
                  )}
                  {myPerformance.metrics.activities_breakdown.whatsapp > 0 && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <MessageSquare className="h-3 w-3" />{myPerformance.metrics.activities_breakdown.whatsapp}
                    </span>
                  )}
                  {myPerformance.metrics.activities_breakdown.email > 0 && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Mail className="h-3 w-3" />{myPerformance.metrics.activities_breakdown.email}
                    </span>
                  )}
                </div>
                <Badge variant="outline" className="text-xs mt-1">
                  Rank {getRankingDisplay('activities', true)}
                </Badge>
              </>
            ) : (
              <p className="text-lg font-bold text-muted-foreground">N/A</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
