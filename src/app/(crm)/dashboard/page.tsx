// =====================================================
// Dashboard Page - Role-Based Analytics
// Comprehensive analytics tailored to each user role
// =====================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Inbox,
  TrendingUp,
  Building2,
  Users,
  Target,
  DollarSign,
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Activity,
  UserPlus,
  RotateCcw,
  Briefcase,
  PhoneCall,
  MapPin,
  MessageSquare,
  Mail,
  Video,
} from 'lucide-react'
import { isAdmin, isMarketing, isSales } from '@/lib/permissions'
import { SalesPerformanceAnalytics, SalespersonPerformanceCard, WeeklyAnalytics } from '@/components/crm/sales-performance-analytics'
import { AnalyticsFilter, filterByDateAndSalesperson } from '@/components/crm/analytics-filter'
import { Skeleton } from '@/components/ui/skeleton'

export const dynamic = 'force-dynamic'

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

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const adminClient = createAdminClient()
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  const role = profile.role
  const userId = profile.user_id
  const userName = profile.name || 'User'

  // Get filter params
  const params = await searchParams
  const startDate = typeof params.startDate === 'string' ? params.startDate : null
  const endDate = typeof params.endDate === 'string' ? params.endDate : null
  const salespersonId = typeof params.salespersonId === 'string' ? params.salespersonId : null

  // =====================================================
  // Fetch data based on role
  // =====================================================

  // Common queries for all roles (with role-based filtering)
  let leadsQuery = (adminClient as any).from('leads').select('*')
  let opportunitiesQuery = (adminClient as any).from('opportunities').select('*, accounts(company_name)')
  let accountsQuery = (adminClient as any).from('accounts').select('*')
  let salesPlansQuery = (adminClient as any).from('sales_plans').select('*')
  let pipelineUpdatesQuery = (adminClient as any).from('pipeline_updates').select('*')

  // Apply role-based filters
  if (role === 'salesperson') {
    // Salesperson sees only their own data
    leadsQuery = leadsQuery.or(`sales_owner_user_id.eq.${userId},created_by.eq.${userId}`)
    opportunitiesQuery = opportunitiesQuery.eq('owner_user_id', userId)
    accountsQuery = accountsQuery.eq('owner_user_id', userId)
    salesPlansQuery = salesPlansQuery.eq('owner_user_id', userId)
    pipelineUpdatesQuery = pipelineUpdatesQuery.eq('updated_by', userId)
  } else if (role === 'sales manager' || role === 'sales support') {
    // Sales manager/support sees all sales department data
    // No filter needed - they see all
  } else if (role === 'Marketing Manager' || role === 'MACX') {
    // Marketing manager sees marketing-created leads
    leadsQuery = leadsQuery.not('marketing_owner_user_id', 'is', null)
  } else if (role === 'Marcomm' || role === 'DGO' || role === 'VSDO') {
    // Individual marketing roles see their own data
    leadsQuery = leadsQuery.or(`marketing_owner_user_id.eq.${userId},created_by.eq.${userId}`)
  }
  // Admin/Director see all (no filter)

  // Additional queries for sales performance analytics (only salesperson role for analytics)
  const salesProfilesQuery = (adminClient as any)
    .from('profiles')
    .select('user_id, name, email, role')
    .eq('role', 'salesperson')

  const stageHistoryQuery = (adminClient as any)
    .from('opportunity_stage_history')
    .select('opportunity_id, old_stage, new_stage, changed_at')

  // Query activities for performance analytics (from activities table - combined from pipeline and sales plan)
  const activitiesQuery = (adminClient as any)
    .from('activities')
    .select('activity_id, activity_type, status, owner_user_id, created_at, completed_at')

  // Execute queries
  const [
    { data: leads },
    { data: opportunities },
    { data: accounts },
    { data: salesPlans },
    { data: pipelineUpdates },
    { data: salesProfiles },
    { data: stageHistory },
    { data: activitiesData },
  ] = await Promise.all([
    leadsQuery,
    opportunitiesQuery,
    accountsQuery,
    salesPlansQuery,
    pipelineUpdatesQuery,
    salesProfilesQuery,
    stageHistoryQuery,
    activitiesQuery,
  ])

  // =====================================================
  // Apply Filters to Data
  // =====================================================

  // Helper function to filter by date range
  const filterByDate = (data: any[]): any[] => {
    if (!startDate && !endDate) return data
    return data.filter((item) => {
      const itemDate = item.created_at ? new Date(item.created_at) : null
      if (!itemDate) return true
      if (startDate && itemDate < new Date(startDate)) return false
      if (endDate) {
        const endOfDay = new Date(endDate)
        endOfDay.setHours(23, 59, 59, 999)
        if (itemDate > endOfDay) return false
      }
      return true
    })
  }

  // Helper function to filter by salesperson
  const filterBySalesperson = (
    data: any[],
    ownerField: 'owner_user_id' | 'sales_owner_user_id' = 'owner_user_id'
  ): any[] => {
    if (!salespersonId) return data
    return data.filter((item) => {
      const ownerId = ownerField === 'owner_user_id' ? item.owner_user_id : item.sales_owner_user_id
      return ownerId === salespersonId
    })
  }

  // Apply filters to all data sets
  const filteredLeads = filterBySalesperson(filterByDate(leads || []), 'sales_owner_user_id')
  const filteredOpportunities = filterBySalesperson(filterByDate(opportunities || []))
  const filteredAccounts = filterBySalesperson(filterByDate(accounts || []))
  const filteredSalesPlans = filterBySalesperson(filterByDate(salesPlans || []))
  const filteredPipelineUpdates = filterByDate(pipelineUpdates || []).filter((u: any) =>
    !salespersonId || u.updated_by === salespersonId
  )
  const filteredActivities = filterBySalesperson(filterByDate(activitiesData || []))

  // =====================================================
  // Calculate Analytics (using filtered data)
  // =====================================================

  const totalLeads = filteredLeads.length

  // Lead Analytics
  const leadsByStatus = {
    new: filteredLeads.filter((l: any) => l.triage_status === 'New').length,
    inReview: filteredLeads.filter((l: any) => l.triage_status === 'In Review').length,
    qualified: filteredLeads.filter((l: any) => l.triage_status === 'Qualified').length,
    assignToSales: filteredLeads.filter((l: any) => l.triage_status === 'Assign to Sales').length,
    nurture: filteredLeads.filter((l: any) => l.triage_status === 'Nurture').length,
    disqualified: filteredLeads.filter((l: any) => l.triage_status === 'Disqualified').length,
  }

  // Opportunity Analytics
  const opps = filteredOpportunities
  const oppByStage = {
    prospecting: opps.filter((o: any) => o.stage === 'Prospecting').length,
    discovery: opps.filter((o: any) => o.stage === 'Discovery').length,
    quoteSent: opps.filter((o: any) => o.stage === 'Quote Sent').length,
    negotiation: opps.filter((o: any) => o.stage === 'Negotiation').length,
    closedWon: opps.filter((o: any) => o.stage === 'Closed Won').length,
    closedLost: opps.filter((o: any) => o.stage === 'Closed Lost').length,
    onHold: opps.filter((o: any) => o.stage === 'On Hold').length,
  }

  const activeOpps = opps.filter((o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage))
  const totalPipelineValue = activeOpps.reduce((sum: number, o: any) => sum + (o.estimated_value || 0), 0)
  const wonValue = opps.filter((o: any) => o.stage === 'Closed Won').reduce((sum: number, o: any) => sum + (o.estimated_value || 0), 0)
  const avgDealSize = oppByStage.closedWon > 0 ? wonValue / oppByStage.closedWon : 0

  // Win rate calculation
  const closedOpps = oppByStage.closedWon + oppByStage.closedLost
  const winRate = closedOpps > 0 ? Math.round((oppByStage.closedWon / closedOpps) * 100) : 0

  // Account Analytics
  const accts = filteredAccounts
  const totalAccounts = accts.length
  const accountsByStatus = {
    calon: accts.filter((a: any) => a.account_status === 'calon_account').length,
    new: accts.filter((a: any) => a.account_status === 'new_account').length,
    active: accts.filter((a: any) => a.account_status === 'active_account').length,
    lost: accts.filter((a: any) => a.account_status === 'lost_account').length,
    failed: accts.filter((a: any) => a.account_status === 'failed_account').length,
  }

  // Sales Plan Analytics
  const plans = filteredSalesPlans
  const plansByStatus = {
    planned: plans.filter((p: any) => p.status === 'planned').length,
    completed: plans.filter((p: any) => p.status === 'completed').length,
  }
  const plansByType = {
    maintenance: plans.filter((p: any) => p.plan_type === 'maintenance_existing').length,
    hunting: plans.filter((p: any) => p.plan_type === 'hunting_new').length,
    winback: plans.filter((p: any) => p.plan_type === 'winback_lost').length,
  }
  const huntingPotential = plans.filter((p: any) => p.plan_type === 'hunting_new' && p.potential_status === 'potential').length

  // Activity Analytics (from pipeline updates)
  const updates = filteredPipelineUpdates
  const activityByMethod = {
    siteVisit: updates.filter((u: any) => u.approach_method === 'Site Visit').length,
    phoneCall: updates.filter((u: any) => u.approach_method === 'Phone Call').length,
    onlineMeeting: updates.filter((u: any) => u.approach_method === 'Online Meeting').length,
    whatsapp: updates.filter((u: any) => u.approach_method === 'WhatsApp').length,
    email: updates.filter((u: any) => u.approach_method === 'Email').length,
  }
  const totalActivities = updates.length

  // Lead conversion rate
  const convertedLeads = filteredLeads.filter((l: any) => l.opportunity_id).length
  const leadConversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0

  // =====================================================
  // Render Dashboard based on Role
  // =====================================================

  // Get greeting based on time
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">{greeting}, {userName}</h1>
        <p className="text-sm text-muted-foreground">
          {role === 'salesperson' ? 'Your sales performance overview' :
           isSales(role) ? 'Sales team performance overview' :
           isMarketing(role) ? 'Marketing performance overview' :
           'Business overview dashboard'}
        </p>
      </div>

      {/* Analytics Filter - For roles that can filter by salesperson */}
      {(isAdmin(role) || role === 'sales manager' || role === 'Marketing Manager' || role === 'MACX') && (
        <Suspense fallback={<Skeleton className="h-24 w-full" />}>
          <AnalyticsFilter
            salesProfiles={(salesProfiles || []).map((p: any) => ({
              user_id: p.user_id,
              name: p.name,
              email: p.email,
              role: p.role,
            }))}
            showSalespersonFilter={true}
          />
        </Suspense>
      )}

      {/* Key Metrics - First Row */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {/* Total Pipeline Value */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 lg:p-6 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">Pipeline Value</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent className="p-3 pt-0 lg:p-6 lg:pt-0">
            <div className="text-lg lg:text-2xl font-bold text-green-600">{formatCurrency(totalPipelineValue)}</div>
            <p className="text-xs text-muted-foreground">{activeOpps.length} active opportunities</p>
          </CardContent>
        </Card>

        {/* Won Revenue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 lg:p-6 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">Won Revenue</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="p-3 pt-0 lg:p-6 lg:pt-0">
            <div className="text-lg lg:text-2xl font-bold text-emerald-600">{formatCurrency(wonValue)}</div>
            <p className="text-xs text-muted-foreground">{oppByStage.closedWon} deals closed</p>
          </CardContent>
        </Card>

        {/* Win Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 lg:p-6 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">Win Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="p-3 pt-0 lg:p-6 lg:pt-0">
            <div className="text-lg lg:text-2xl font-bold text-blue-600">{winRate}%</div>
            <p className="text-xs text-muted-foreground">{oppByStage.closedWon}W / {oppByStage.closedLost}L</p>
          </CardContent>
        </Card>

        {/* Lead Conversion */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 lg:p-6 lg:pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium">Lead Conversion</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent className="p-3 pt-0 lg:p-6 lg:pt-0">
            <div className="text-lg lg:text-2xl font-bold text-purple-600">{leadConversionRate}%</div>
            <p className="text-xs text-muted-foreground">{convertedLeads} of {totalLeads} leads</p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Analytics - For Management Roles (aggregate or filtered by salesperson) */}
      {(isAdmin(role) || role === 'sales manager' || role === 'Marketing Manager' || role === 'MACX') && (
        <WeeklyAnalytics
          opportunities={filteredOpportunities.map((o: any) => ({
            opportunity_id: o.opportunity_id,
            name: o.name,
            account_id: o.account_id,
            stage: o.stage,
            estimated_value: o.estimated_value,
            owner_user_id: o.owner_user_id,
            created_at: o.created_at,
            closed_at: o.closed_at,
          }))}
          activities={filteredActivities.map((a: any) => ({
            activity_id: a.activity_id,
            activity_type: a.activity_type,
            status: a.status,
            owner_user_id: a.owner_user_id,
            created_at: a.created_at,
            completed_at: a.completed_at,
          }))}
          currentUserId={salespersonId || userId}
          currentUserRole={role}
          isAggregate={!salespersonId}
        />
      )}

      {/* Weekly Analytics - For Salesperson (personal data only) */}
      {role === 'salesperson' && (
        <WeeklyAnalytics
          opportunities={filteredOpportunities.map((o: any) => ({
            opportunity_id: o.opportunity_id,
            name: o.name,
            account_id: o.account_id,
            stage: o.stage,
            estimated_value: o.estimated_value,
            owner_user_id: o.owner_user_id,
            created_at: o.created_at,
            closed_at: o.closed_at,
          }))}
          activities={filteredActivities.map((a: any) => ({
            activity_id: a.activity_id,
            activity_type: a.activity_type,
            status: a.status,
            owner_user_id: a.owner_user_id,
            created_at: a.created_at,
            completed_at: a.completed_at,
          }))}
          currentUserId={userId}
          currentUserRole={role}
          isAggregate={false}
        />
      )}

      {/* Pipeline Funnel & Lead Status */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Pipeline Funnel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base lg:text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Pipeline Funnel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Prospecting</span>
                <span className="font-medium">{oppByStage.prospecting}</span>
              </div>
              <Progress value={opps.length > 0 ? (oppByStage.prospecting / opps.length) * 100 : 0} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Discovery</span>
                <span className="font-medium">{oppByStage.discovery}</span>
              </div>
              <Progress value={opps.length > 0 ? (oppByStage.discovery / opps.length) * 100 : 0} className="h-2 [&>div]:bg-blue-500" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Quote Sent</span>
                <span className="font-medium">{oppByStage.quoteSent}</span>
              </div>
              <Progress value={opps.length > 0 ? (oppByStage.quoteSent / opps.length) * 100 : 0} className="h-2 [&>div]:bg-indigo-500" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Negotiation</span>
                <span className="font-medium">{oppByStage.negotiation}</span>
              </div>
              <Progress value={opps.length > 0 ? (oppByStage.negotiation / opps.length) * 100 : 0} className="h-2 [&>div]:bg-purple-500" />
            </div>
            <div className="flex justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm">Won: {oppByStage.closedWon}</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm">Lost: {oppByStage.closedLost}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lead Status Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base lg:text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Lead Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
                <p className="text-2xl font-bold text-blue-600">{leadsByStatus.new}</p>
                <p className="text-xs text-muted-foreground">New</p>
              </div>
              <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950">
                <p className="text-2xl font-bold text-yellow-600">{leadsByStatus.inReview}</p>
                <p className="text-xs text-muted-foreground">In Review</p>
              </div>
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950">
                <p className="text-2xl font-bold text-green-600">{leadsByStatus.qualified}</p>
                <p className="text-xs text-muted-foreground">Qualified</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950">
                <p className="text-2xl font-bold text-purple-600">{leadsByStatus.assignToSales}</p>
                <p className="text-xs text-muted-foreground">Assign to Sales</p>
              </div>
            </div>
            <div className="flex justify-between pt-2 border-t text-sm">
              <span className="text-orange-600">Nurture: {leadsByStatus.nurture}</span>
              <span className="text-gray-500">Disqualified: {leadsByStatus.disqualified}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sales Plan & Activity Stats */}
      {(isSales(role) || isAdmin(role)) && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Sales Plan Progress */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                <Target className="h-5 w-5" />
                Sales Plan Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
                  <Building2 className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                  <p className="text-xl font-bold text-blue-600">{plansByType.maintenance}</p>
                  <p className="text-xs text-muted-foreground">Maintenance</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950">
                  <UserPlus className="h-5 w-5 mx-auto text-green-600 mb-1" />
                  <p className="text-xl font-bold text-green-600">{plansByType.hunting}</p>
                  <p className="text-xs text-muted-foreground">Hunting</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-orange-50 dark:bg-orange-950">
                  <RotateCcw className="h-5 w-5 mx-auto text-orange-600 mb-1" />
                  <p className="text-xl font-bold text-orange-600">{plansByType.winback}</p>
                  <p className="text-xs text-muted-foreground">Winback</p>
                </div>
              </div>
              <div className="flex justify-between items-center pt-3 border-t">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm">Planned: {plansByStatus.planned}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm">Done: {plansByStatus.completed}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-purple-500" />
                  <span className="text-sm">Potential: {huntingPotential}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity by Method */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Activity by Method ({totalActivities})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-orange-500" />
                    <span className="text-sm">Site Visit</span>
                  </div>
                  <Badge variant="outline">{activityByMethod.siteVisit}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PhoneCall className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">Phone Call</span>
                  </div>
                  <Badge variant="outline">{activityByMethod.phoneCall}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-purple-500" />
                    <span className="text-sm">Online Meeting</span>
                  </div>
                  <Badge variant="outline">{activityByMethod.onlineMeeting}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-green-500" />
                    <span className="text-sm">WhatsApp</span>
                  </div>
                  <Badge variant="outline">{activityByMethod.whatsapp}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-500" />
                    <span className="text-sm">Email</span>
                  </div>
                  <Badge variant="outline">{activityByMethod.email}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sales Performance Analytics - For Management Roles (date-filtered, shows all salespeople) */}
      {(isAdmin(role) || role === 'sales manager' || role === 'Marketing Manager' || role === 'MACX') && (
        <SalesPerformanceAnalytics
          opportunities={filterByDate(opportunities || []).map((o: any) => ({
            opportunity_id: o.opportunity_id,
            name: o.name,
            account_id: o.account_id,
            stage: o.stage,
            estimated_value: o.estimated_value,
            owner_user_id: o.owner_user_id,
            created_at: o.created_at,
            closed_at: o.closed_at,
          }))}
          accounts={filterByDate(accounts || []).map((a: any) => ({
            account_id: a.account_id,
            company_name: a.company_name,
            account_status: a.account_status,
            owner_user_id: a.owner_user_id,
            created_at: a.created_at,
            first_transaction_date: a.first_transaction_date,
          }))}
          activities={filterByDate(activitiesData || []).map((a: any) => ({
            activity_id: a.activity_id,
            activity_type: a.activity_type,
            status: a.status,
            owner_user_id: a.owner_user_id,
            created_at: a.created_at,
            completed_at: a.completed_at,
          }))}
          stageHistory={(stageHistory || []).map((h: any) => ({
            opportunity_id: h.opportunity_id,
            old_stage: h.old_stage,
            new_stage: h.new_stage,
            changed_at: h.changed_at,
          }))}
          salesProfiles={(salesProfiles || []).map((p: any) => ({
            user_id: p.user_id,
            name: p.name,
            email: p.email,
            role: p.role,
          }))}
          currentUserId={userId}
          currentUserRole={role}
        />
      )}

      {/* Salesperson Performance Card - For Individual Salesperson */}
      {role === 'salesperson' && (
        <SalespersonPerformanceCard
          opportunities={filterByDate(opportunities || []).map((o: any) => ({
            opportunity_id: o.opportunity_id,
            name: o.name,
            account_id: o.account_id,
            stage: o.stage,
            estimated_value: o.estimated_value,
            owner_user_id: o.owner_user_id,
            created_at: o.created_at,
            closed_at: o.closed_at,
          }))}
          accounts={filterByDate(accounts || []).map((a: any) => ({
            account_id: a.account_id,
            company_name: a.company_name,
            account_status: a.account_status,
            owner_user_id: a.owner_user_id,
            created_at: a.created_at,
            first_transaction_date: a.first_transaction_date,
          }))}
          activities={filterByDate(activitiesData || []).map((a: any) => ({
            activity_id: a.activity_id,
            activity_type: a.activity_type,
            status: a.status,
            owner_user_id: a.owner_user_id,
            created_at: a.created_at,
            completed_at: a.completed_at,
          }))}
          salesProfiles={(salesProfiles || []).map((p: any) => ({
            user_id: p.user_id,
            name: p.name,
            email: p.email,
            role: p.role,
          }))}
          currentUserId={userId}
          currentUserName={userName}
        />
      )}

      {/* Account Status & Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Account Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base lg:text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Account Status ({totalAccounts})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-2 text-center">
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900">
                <p className="text-lg font-bold">{accountsByStatus.calon}</p>
                <p className="text-[10px] text-muted-foreground">Calon</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950">
                <p className="text-lg font-bold text-blue-600">{accountsByStatus.new}</p>
                <p className="text-[10px] text-muted-foreground">New</p>
              </div>
              <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950">
                <p className="text-lg font-bold text-green-600">{accountsByStatus.active}</p>
                <p className="text-[10px] text-muted-foreground">Active</p>
              </div>
              <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950">
                <p className="text-lg font-bold text-orange-600">{accountsByStatus.lost}</p>
                <p className="text-[10px] text-muted-foreground">Lost</p>
              </div>
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950">
                <p className="text-lg font-bold text-red-600">{accountsByStatus.failed}</p>
                <p className="text-[10px] text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base lg:text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {(isMarketing(role) || isAdmin(role)) && (
              <a href="/lead-management" className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
                <Inbox className="h-4 w-4 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">Lead Management</p>
                </div>
                {leadsByStatus.new > 0 && (
                  <Badge variant="destructive" className="text-xs">{leadsByStatus.new}</Badge>
                )}
              </a>
            )}
            {(isSales(role) || isAdmin(role)) && (
              <>
                <a href="/lead-bidding" className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
                  <Users className="h-4 w-4 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">Lead Bidding</p>
                  </div>
                  {leadsByStatus.assignToSales > 0 && (
                    <Badge className="bg-purple-100 text-purple-800 text-xs">{leadsByStatus.assignToSales}</Badge>
                  )}
                </a>
                <a href="/sales-plan" className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
                  <Target className="h-4 w-4 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">Sales Plan</p>
                  </div>
                  {plansByStatus.planned > 0 && (
                    <Badge className="bg-yellow-100 text-yellow-800 text-xs">{plansByStatus.planned}</Badge>
                  )}
                </a>
              </>
            )}
            <a href="/pipeline" className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
              <TrendingUp className="h-4 w-4 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">Pipeline</p>
              </div>
              <Badge variant="outline" className="text-xs">{activeOpps.length}</Badge>
            </a>
            {(isSales(role) || isAdmin(role)) && (
              <a href="/activities" className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
                <Activity className="h-4 w-4 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">Activities</p>
                </div>
              </a>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary Stats for Admin */}
      {isAdmin(role) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base lg:text-lg flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Overall Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold">{totalLeads}</p>
                <p className="text-sm text-muted-foreground">Total Leads</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold">{opps.length}</p>
                <p className="text-sm text-muted-foreground">Total Opportunities</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold">{totalAccounts}</p>
                <p className="text-sm text-muted-foreground">Total Accounts</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold">{formatCurrency(avgDealSize)}</p>
                <p className="text-sm text-muted-foreground">Avg Deal Size</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
