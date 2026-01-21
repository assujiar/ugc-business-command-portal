'use client'

import { useState, useEffect } from 'react'
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
import { canViewAllTickets, getUserTicketingDepartment, isOps, isAdmin, getAnalyticsScope } from '@/lib/permissions'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface OverviewDashboardProps {
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

// Format seconds to "xx jam yy menit zz detik" format
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

// Format seconds to short format for cards (e.g., "2j 30m")
function formatDurationShort(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '0d'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0 && minutes > 0) return `${hours}j ${minutes}m`
  if (hours > 0) return `${hours}j`
  if (minutes > 0) return `${minutes}m`
  return `${Math.floor(seconds)}d`
}

export function OverviewDashboard({ profile }: OverviewDashboardProps) {
  const [period, setPeriod] = useState('30')
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<any>(null)
  const [slaMetrics, setSlaMetrics] = useState<any>(null)
  const [responseTime, setResponseTime] = useState<any>(null)
  const [deptPerformance, setDeptPerformance] = useState<any>(null)
  const [userPerformance, setUserPerformance] = useState<any>(null)

  const canViewAll = canViewAllTickets(profile.role)

  // Fetch all data
  const fetchData = async () => {
    setLoading(true)
    try {
      const params = `?period=${period}`

      // Fetch all data in parallel - all roles can see performance data (filtered by RBAC on API)
      const [summaryRes, slaRes, responseRes, deptRes, userRes] = await Promise.all([
        fetch(`/api/ticketing/dashboard/summary${params}`),
        fetch(`/api/ticketing/dashboard/sla-metrics${params}`),
        fetch(`/api/ticketing/dashboard/response-time${params}`),
        fetch(`/api/ticketing/performance/departments${params}`),
        fetch(`/api/ticketing/performance/users${params}`),
      ])

      const [summaryData, slaData, responseData, deptData, userData] = await Promise.all([
        summaryRes.json(),
        slaRes.json(),
        responseRes.json(),
        deptRes.json(),
        userRes.json(),
      ])

      if (summaryData.success) setSummary(summaryData.data)
      if (slaData.success) setSlaMetrics(slaData.data)
      if (responseData.success) setResponseTime(responseData.data)
      if (deptData.success) setDeptPerformance(deptData.data)
      if (userData.success) setUserPerformance(userData.data)
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [period])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Get current user's performance data
  const myPerformance = userPerformance?.users?.find((u: any) => u.user_id === profile.user_id)

  // Get analytics scope to determine which sections to show
  const analyticsScope = getAnalyticsScope(profile.role, profile.user_id)
  const isAllScope = analyticsScope.scope === 'all' // Director, super admin
  const isDepartmentScope = analyticsScope.scope === 'department' // Managers, Ops
  const userDepartment = getUserTicketingDepartment(profile.role)

  // Get current user's department performance
  const myDepartmentPerformance = userDepartment && deptPerformance?.departments?.[userDepartment]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-muted-foreground">
            Ticketing dashboard and performance metrics
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
                <Ticket className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.total_tickets}</div>
                <p className="text-xs text-muted-foreground">
                  {summary.activity?.created_today || 0} created today
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active</CardTitle>
                <AlertCircle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{summary.active_tickets}</div>
                <p className="text-xs text-muted-foreground">
                  {summary.by_priority?.urgent || 0} urgent, {summary.by_priority?.high || 0} high
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-success">{summary.completed_tickets}</div>
                <p className="text-xs text-muted-foreground">
                  {summary.activity?.resolved_today || 0} resolved today
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Resolution Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-brand" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summary.total_tickets > 0
                    ? Math.round((summary.completed_tickets / summary.total_tickets) * 100)
                    : 0}%
                </div>
                <Progress
                  value={summary.total_tickets > 0
                    ? (summary.completed_tickets / summary.total_tickets) * 100
                    : 0}
                  className="h-2 mt-2"
                />
              </CardContent>
            </Card>
          </div>

          {/* Ticket Type Breakdown */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-blue-200 dark:border-blue-900">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Badge variant="default" className="text-xs">RFQ</Badge>
                  Request for Quotation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.by_type?.RFQ || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Tickets requiring price quotes
                </p>
              </CardContent>
            </Card>
            <Card className="border-purple-200 dark:border-purple-900">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">GEN</Badge>
                  General Request
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.by_type?.GEN || 0}</div>
                <p className="text-xs text-muted-foreground">
                  General inquiries and requests
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* My Performance - Personal metrics as Creator and Assignee */}
      {myPerformance && (
        <Card className="border-brand/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-brand" />
              My Performance
            </CardTitle>
            <CardDescription>Your personal metrics as ticket creator and assignee</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {/* As Creator */}
              <div className="p-4 rounded-lg border border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-950/10">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline" className="border-green-500 text-green-600">CREATOR</Badge>
                  <span className="text-sm text-muted-foreground">Tiket yang saya buat</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-bold">{myPerformance.as_creator?.tickets_created || 0}</p>
                    <p className="text-xs text-muted-foreground">Tiket Dibuat</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {myPerformance.as_creator?.stage_response?.count > 0
                        ? formatDurationShort(myPerformance.as_creator.stage_response.avg_seconds)
                        : '-'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Avg Stage Response ({myPerformance.as_creator?.stage_response?.count || 0}x)
                    </p>
                  </div>
                </div>
              </div>

              {/* As Assignee */}
              <div className="p-4 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/10">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600">ASSIGNEE</Badge>
                  <span className="text-sm text-muted-foreground">Tiket yang di-assign ke saya</span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-2xl font-bold">{myPerformance.as_assignee?.tickets?.assigned || 0}</p>
                    <p className="text-xs text-muted-foreground">Tiket Assigned</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{myPerformance.as_assignee?.tickets?.completion_rate || 0}%</p>
                    <p className="text-xs text-muted-foreground">Completion Rate</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {myPerformance.as_assignee?.first_response?.count > 0
                        ? formatDurationShort(myPerformance.as_assignee.first_response.avg_seconds)
                        : '-'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Avg First Response ({myPerformance.as_assignee?.first_response?.count || 0}x)
                    </p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {myPerformance.as_assignee?.stage_response?.count > 0
                        ? formatDurationShort(myPerformance.as_assignee.stage_response.avg_seconds)
                        : '-'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Avg Stage Response ({myPerformance.as_assignee?.stage_response?.count || 0}x)
                    </p>
                  </div>
                </div>
                {/* SLA Compliance */}
                {(myPerformance.as_assignee?.sla?.first_response?.met > 0 || myPerformance.as_assignee?.sla?.first_response?.breached > 0) && (
                  <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">FR SLA:</span>
                        <span className="font-medium ml-1">{myPerformance.as_assignee?.sla?.first_response?.compliance_rate || 0}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Resolution SLA:</span>
                        <span className="font-medium ml-1">{myPerformance.as_assignee?.sla?.resolution?.compliance_rate || 0}%</span>
                      </div>
                    </div>
                  </div>
                )}
                {/* First Quote for OPS */}
                {myPerformance.as_assignee?.first_quote && (
                  <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-blue-600 font-medium">First Quote (OPS):</span>
                        <span className="font-medium ml-1">
                          {myPerformance.as_assignee.first_quote.count > 0
                            ? `${formatDurationShort(myPerformance.as_assignee.first_quote.avg_seconds)} (${myPerformance.as_assignee.first_quote.count}x)`
                            : 'Belum ada'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MY DEPARTMENT - For non-admin users (staff, managers, ops) */}
      {!isAllScope && myDepartmentPerformance && userDepartment && (
        <Card className="border-purple-200 dark:border-purple-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-purple-600" />
              My Department: {departmentLabels[userDepartment] || userDepartment}
            </CardTitle>
            <CardDescription>Performance metrics for your department</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{myDepartmentPerformance.total_tickets || 0}</p>
                <p className="text-xs text-muted-foreground">Total Tickets</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{myDepartmentPerformance.completion_rate || 0}%</p>
                <p className="text-xs text-muted-foreground">Completion Rate</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{myDepartmentPerformance.sla?.first_response?.compliance_rate || 0}%</p>
                <p className="text-xs text-muted-foreground">FR SLA Compliance</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{myDepartmentPerformance.sla?.resolution?.compliance_rate || 0}%</p>
                <p className="text-xs text-muted-foreground">Resolution SLA</p>
              </div>
            </div>
            {/* Type breakdown */}
            {myDepartmentPerformance.by_type_detailed && (
              <div className="grid gap-4 md:grid-cols-2 mt-4">
                {myDepartmentPerformance.by_type_detailed.RFQ && (
                  <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/10">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="default" className="text-xs">RFQ</Badge>
                      <span className="text-sm text-muted-foreground">{myDepartmentPerformance.by_type_detailed.RFQ.total_tickets || 0} tickets</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Comp:</span>
                        <span className="font-medium ml-1">{myDepartmentPerformance.by_type_detailed.RFQ.completion_rate || 0}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">SLA:</span>
                        <span className="font-medium ml-1">{myDepartmentPerformance.by_type_detailed.RFQ.sla?.first_response?.compliance_rate || 0}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Active:</span>
                        <span className="font-medium ml-1">{myDepartmentPerformance.by_type_detailed.RFQ.active_tickets || 0}</span>
                      </div>
                    </div>
                  </div>
                )}
                {myDepartmentPerformance.by_type_detailed.GEN && (
                  <div className="p-3 rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50/30 dark:bg-purple-950/10">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs">GEN</Badge>
                      <span className="text-sm text-muted-foreground">{myDepartmentPerformance.by_type_detailed.GEN.total_tickets || 0} tickets</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Comp:</span>
                        <span className="font-medium ml-1">{myDepartmentPerformance.by_type_detailed.GEN.completion_rate || 0}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">SLA:</span>
                        <span className="font-medium ml-1">{myDepartmentPerformance.by_type_detailed.GEN.sla?.first_response?.compliance_rate || 0}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Active:</span>
                        <span className="font-medium ml-1">{myDepartmentPerformance.by_type_detailed.GEN.active_tickets || 0}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* DEPARTMENT PERFORMANCE - For Director/Super Admin only */}
      {isAllScope && deptPerformance?.departments && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-brand" />
              Department Performance
            </CardTitle>
            <CardDescription>Performance breakdown by department</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(deptPerformance.departments).map(([deptCode, dept]: [string, any]) => (
                <div key={deptCode} className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{deptCode}</Badge>
                      <span className="font-medium">{departmentLabels[deptCode] || deptCode}</span>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span>{dept.total_tickets || 0} tickets</span>
                      <span className="text-muted-foreground">|</span>
                      <span>{dept.completion_rate || 0}% completion</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="p-2 rounded bg-muted/50">
                      <p className="text-lg font-bold">{dept.active_tickets || 0}</p>
                      <p className="text-xs text-muted-foreground">Active</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <p className="text-lg font-bold">{dept.completed_tickets || 0}</p>
                      <p className="text-xs text-muted-foreground">Completed</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <p className="text-lg font-bold">{dept.sla?.first_response?.compliance_rate || 0}%</p>
                      <p className="text-xs text-muted-foreground">FR SLA</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <p className="text-lg font-bold">{dept.sla?.resolution?.compliance_rate || 0}%</p>
                      <p className="text-xs text-muted-foreground">Resolution SLA</p>
                    </div>
                  </div>
                  {/* RFQ/GEN breakdown */}
                  {dept.by_type_detailed && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {dept.by_type_detailed.RFQ && dept.by_type_detailed.RFQ.total_tickets > 0 && (
                        <div className="p-2 rounded bg-blue-50/50 dark:bg-blue-950/20 text-xs">
                          <span className="font-medium text-blue-600">RFQ:</span>
                          <span className="ml-1">{dept.by_type_detailed.RFQ.total_tickets} tickets,</span>
                          <span className="ml-1">{dept.by_type_detailed.RFQ.completion_rate || 0}% comp,</span>
                          <span className="ml-1">{dept.by_type_detailed.RFQ.sla?.first_response?.compliance_rate || 0}% SLA</span>
                        </div>
                      )}
                      {dept.by_type_detailed.GEN && dept.by_type_detailed.GEN.total_tickets > 0 && (
                        <div className="p-2 rounded bg-purple-50/50 dark:bg-purple-950/20 text-xs">
                          <span className="font-medium text-purple-600">GEN:</span>
                          <span className="ml-1">{dept.by_type_detailed.GEN.total_tickets} tickets,</span>
                          <span className="ml-1">{dept.by_type_detailed.GEN.completion_rate || 0}% comp,</span>
                          <span className="ml-1">{dept.by_type_detailed.GEN.sla?.first_response?.compliance_rate || 0}% SLA</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* USERS PERFORMANCE - For Director/Super Admin only */}
      {isAllScope && userPerformance?.users && userPerformance.users.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-brand" />
              Users Performance
            </CardTitle>
            <CardDescription>Performance breakdown by user ({userPerformance.total_users || 0} users)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {userPerformance.users.slice(0, 10).map((user: any) => (
                <div key={user.user_id} className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <Users className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
                      </div>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <div className="text-center">
                        <p className="font-medium">{user.as_creator?.tickets_created || 0}</p>
                        <p className="text-xs text-muted-foreground">Created</p>
                      </div>
                      <div className="text-center">
                        <p className="font-medium">{user.as_assignee?.tickets?.assigned || 0}</p>
                        <p className="text-xs text-muted-foreground">Assigned</p>
                      </div>
                      <div className="text-center">
                        <p className="font-medium">{user.as_assignee?.tickets?.completion_rate || 0}%</p>
                        <p className="text-xs text-muted-foreground">Completion</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    {/* As Creator */}
                    <div className="p-2 rounded bg-green-50/50 dark:bg-green-950/20">
                      <p className="text-green-600 font-medium mb-1">Creator</p>
                      <p>Stage Resp: {user.as_creator?.stage_response?.count > 0 ? formatDurationShort(user.as_creator.stage_response.avg_seconds) : '-'}</p>
                    </div>
                    {/* As Assignee */}
                    <div className="p-2 rounded bg-blue-50/50 dark:bg-blue-950/20">
                      <p className="text-blue-600 font-medium mb-1">First Resp</p>
                      <p>{user.as_assignee?.first_response?.count > 0 ? `${formatDurationShort(user.as_assignee.first_response.avg_seconds)} (${user.as_assignee.first_response.count}x)` : '-'}</p>
                    </div>
                    <div className="p-2 rounded bg-purple-50/50 dark:bg-purple-950/20">
                      <p className="text-purple-600 font-medium mb-1">Stage Resp</p>
                      <p>{user.as_assignee?.stage_response?.count > 0 ? `${formatDurationShort(user.as_assignee.stage_response.avg_seconds)} (${user.as_assignee.stage_response.count}x)` : '-'}</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <p className="font-medium mb-1">SLA</p>
                      <p>FR: {user.as_assignee?.sla?.first_response?.compliance_rate || 0}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Distribution */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
            <CardDescription>Tickets by current status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-8">
              {Object.entries(summary.by_status || {}).map(([status, count]) => (
                <div key={status} className="text-center p-3 rounded-lg bg-muted">
                  <p className="text-2xl font-bold">{count as number}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {status.replace('_', ' ')}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="sla" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sla">SLA Compliance</TabsTrigger>
          <TabsTrigger value="response">Response Times</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="users">Team Performance</TabsTrigger>
        </TabsList>

        {/* SLA Compliance Tab */}
        <TabsContent value="sla" className="space-y-6">
          {slaMetrics && (
            <>
              {/* RFQ Analytics Section */}
              <Card className="border-blue-200 dark:border-blue-900">
                <CardHeader className="bg-blue-50/50 dark:bg-blue-950/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="text-sm">RFQ</Badge>
                      <CardTitle className="text-lg">Request for Quotation</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{slaMetrics.by_type?.RFQ?.total || 0} tickets</span>
                      {(slaMetrics.by_type?.RFQ?.at_risk || 0) > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {slaMetrics.by_type?.RFQ?.at_risk} at risk
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {/* First Response SLA */}
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Timer className="h-4 w-4 text-blue-600" />
                        <p className="text-sm font-medium">First Response</p>
                      </div>
                      <p className="text-2xl font-bold">
                        {slaMetrics.by_type?.RFQ?.first_response?.compliance_rate || 0}%
                      </p>
                      <Progress
                        value={slaMetrics.by_type?.RFQ?.first_response?.compliance_rate || 0}
                        className="h-1.5 mt-2"
                      />
                      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>{slaMetrics.by_type?.RFQ?.first_response?.met || 0} met</span>
                        <span>{slaMetrics.by_type?.RFQ?.first_response?.breached || 0} breached</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Avg: {formatDuration(slaMetrics.by_type?.RFQ?.first_response?.avg_seconds)}
                      </p>
                    </div>

                    {/* First Quote SLA - RFQ Only */}
                    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <p className="text-sm font-medium">First Quote</p>
                      </div>
                      <p className="text-2xl font-bold text-blue-600">
                        {slaMetrics.by_type?.RFQ?.first_quote?.compliance_rate || 0}%
                      </p>
                      <Progress
                        value={slaMetrics.by_type?.RFQ?.first_quote?.compliance_rate || 0}
                        className="h-1.5 mt-2"
                      />
                      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>{slaMetrics.by_type?.RFQ?.first_quote?.met || 0} met</span>
                        <span>{slaMetrics.by_type?.RFQ?.first_quote?.breached || 0} breached</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Avg: {formatDuration(slaMetrics.by_type?.RFQ?.first_quote?.avg_seconds)}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        SLA: {slaMetrics.by_type?.RFQ?.first_quote?.sla_hours || 24}h
                      </p>
                    </div>

                    {/* Resolution SLA */}
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-4 w-4 text-green-600" />
                        <p className="text-sm font-medium">Resolution</p>
                      </div>
                      <p className="text-2xl font-bold">
                        {slaMetrics.by_type?.RFQ?.resolution?.compliance_rate || 0}%
                      </p>
                      <Progress
                        value={slaMetrics.by_type?.RFQ?.resolution?.compliance_rate || 0}
                        className="h-1.5 mt-2"
                      />
                      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>{slaMetrics.by_type?.RFQ?.resolution?.met || 0} met</span>
                        <span>{slaMetrics.by_type?.RFQ?.resolution?.breached || 0} breached</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Avg: {formatDuration(slaMetrics.by_type?.RFQ?.resolution?.avg_seconds)}
                      </p>
                    </div>

                    {/* Pending */}
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        <p className="text-sm font-medium">Pending</p>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">First Response</span>
                          <span className="font-medium">{slaMetrics.by_type?.RFQ?.first_response?.pending || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">First Quote</span>
                          <span className="font-medium">{slaMetrics.by_type?.RFQ?.first_quote?.pending || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Resolution</span>
                          <span className="font-medium">{slaMetrics.by_type?.RFQ?.resolution?.pending || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* GEN Analytics Section */}
              <Card className="border-purple-200 dark:border-purple-900">
                <CardHeader className="bg-purple-50/50 dark:bg-purple-950/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-sm">GEN</Badge>
                      <CardTitle className="text-lg">General Request</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{slaMetrics.by_type?.GEN?.total || 0} tickets</span>
                      {(slaMetrics.by_type?.GEN?.at_risk || 0) > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {slaMetrics.by_type?.GEN?.at_risk} at risk
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    {/* First Response SLA */}
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Timer className="h-4 w-4 text-purple-600" />
                        <p className="text-sm font-medium">First Response</p>
                      </div>
                      <p className="text-2xl font-bold">
                        {slaMetrics.by_type?.GEN?.first_response?.compliance_rate || 0}%
                      </p>
                      <Progress
                        value={slaMetrics.by_type?.GEN?.first_response?.compliance_rate || 0}
                        className="h-1.5 mt-2"
                      />
                      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>{slaMetrics.by_type?.GEN?.first_response?.met || 0} met</span>
                        <span>{slaMetrics.by_type?.GEN?.first_response?.breached || 0} breached</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Avg: {formatDuration(slaMetrics.by_type?.GEN?.first_response?.avg_seconds)}
                      </p>
                    </div>

                    {/* Resolution SLA */}
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-4 w-4 text-green-600" />
                        <p className="text-sm font-medium">Resolution</p>
                      </div>
                      <p className="text-2xl font-bold">
                        {slaMetrics.by_type?.GEN?.resolution?.compliance_rate || 0}%
                      </p>
                      <Progress
                        value={slaMetrics.by_type?.GEN?.resolution?.compliance_rate || 0}
                        className="h-1.5 mt-2"
                      />
                      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>{slaMetrics.by_type?.GEN?.resolution?.met || 0} met</span>
                        <span>{slaMetrics.by_type?.GEN?.resolution?.breached || 0} breached</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Avg: {formatDuration(slaMetrics.by_type?.GEN?.resolution?.avg_seconds)}
                      </p>
                    </div>

                    {/* Pending */}
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        <p className="text-sm font-medium">Pending</p>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">First Response</span>
                          <span className="font-medium">{slaMetrics.by_type?.GEN?.first_response?.pending || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Resolution</span>
                          <span className="font-medium">{slaMetrics.by_type?.GEN?.resolution?.pending || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Overall Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Overall Summary</CardTitle>
                  <CardDescription>Combined metrics for all ticket types</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <p className="text-3xl font-bold">{slaMetrics.overall?.total_tickets || 0}</p>
                      <p className="text-sm text-muted-foreground">Total Tickets</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <p className="text-3xl font-bold">{slaMetrics.overall?.first_response?.compliance_rate || 0}%</p>
                      <p className="text-sm text-muted-foreground">First Response SLA</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <p className="text-3xl font-bold">{slaMetrics.overall?.resolution?.compliance_rate || 0}%</p>
                      <p className="text-sm text-muted-foreground">Resolution SLA</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-destructive/10">
                      <p className="text-3xl font-bold text-destructive">{slaMetrics.at_risk_count || 0}</p>
                      <p className="text-sm text-muted-foreground">At Risk</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* SLA by Department */}
              {slaMetrics.by_department && (
                <Card>
                  <CardHeader>
                    <CardTitle>SLA by Department</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {Object.entries(slaMetrics.by_department).map(([dept, data]: [string, any]) => (
                        data.total > 0 && (
                          <div key={dept} className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-medium">{departmentLabels[dept] || dept}</span>
                              <span className="text-sm text-muted-foreground">{data.total} tickets</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="flex justify-between text-sm">
                                  <span>First Response</span>
                                  <span>{data.first_response?.compliance_rate || 0}%</span>
                                </div>
                                <Progress value={data.first_response?.compliance_rate || 0} className="h-1.5" />
                              </div>
                              <div>
                                <div className="flex justify-between text-sm">
                                  <span>Resolution</span>
                                  <span>{data.resolution?.compliance_rate || 0}%</span>
                                </div>
                                <Progress value={data.resolution?.compliance_rate || 0} className="h-1.5" />
                              </div>
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Response Times Tab */}
        <TabsContent value="response" className="space-y-4">
          {responseTime && (
            <>
              {/* RFQ Response Times */}
              <Card className="border-blue-200 dark:border-blue-900">
                <CardHeader className="bg-blue-50/50 dark:bg-blue-950/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="text-sm">RFQ</Badge>
                      <CardTitle className="text-lg">Response Times</CardTitle>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {responseTime.by_type?.RFQ?.total_responses || 0} responses
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">Avg Response</p>
                      <p className="text-xl font-bold">{formatDuration(responseTime.by_type?.RFQ?.avg_response_seconds)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-lg font-bold text-green-600">{responseTime.by_type?.RFQ?.distribution?.under_1_hour || 0}</p>
                      <p className="text-xs text-muted-foreground">&lt; 1 jam</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-lg font-bold">{responseTime.by_type?.RFQ?.distribution?.under_4_hours || 0}</p>
                      <p className="text-xs text-muted-foreground">&lt; 4 jam</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-lg font-bold">{responseTime.by_type?.RFQ?.distribution?.under_24_hours || 0}</p>
                      <p className="text-xs text-muted-foreground">&lt; 24 jam</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-lg font-bold text-red-600">{responseTime.by_type?.RFQ?.distribution?.over_24_hours || 0}</p>
                      <p className="text-xs text-muted-foreground">&gt; 24 jam</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* GEN Response Times */}
              <Card className="border-purple-200 dark:border-purple-900">
                <CardHeader className="bg-purple-50/50 dark:bg-purple-950/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-sm">GEN</Badge>
                      <CardTitle className="text-lg">Response Times</CardTitle>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {responseTime.by_type?.GEN?.total_responses || 0} responses
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">Avg Response</p>
                      <p className="text-xl font-bold">{formatDuration(responseTime.by_type?.GEN?.avg_response_seconds)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-lg font-bold text-green-600">{responseTime.by_type?.GEN?.distribution?.under_1_hour || 0}</p>
                      <p className="text-xs text-muted-foreground">&lt; 1 jam</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-lg font-bold">{responseTime.by_type?.GEN?.distribution?.under_4_hours || 0}</p>
                      <p className="text-xs text-muted-foreground">&lt; 4 jam</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-lg font-bold">{responseTime.by_type?.GEN?.distribution?.under_24_hours || 0}</p>
                      <p className="text-xs text-muted-foreground">&lt; 24 jam</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-lg font-bold text-red-600">{responseTime.by_type?.GEN?.distribution?.over_24_hours || 0}</p>
                      <p className="text-xs text-muted-foreground">&gt; 24 jam</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Overall Summary with First Response vs Stage Response */}
              <Card>
                <CardHeader>
                  <CardTitle>Overall Summary</CardTitle>
                  <CardDescription>First Response (assignee) vs Stage Response (tektokan)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {/* First Response - Assignee only */}
                    <div className="p-4 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/10">
                      <p className="text-sm font-medium text-blue-600 mb-2">First Response</p>
                      <p className="text-2xl font-bold">{formatDuration(responseTime.first_response?.avg_seconds)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {responseTime.first_response?.total || 0} responses (assignee)
                      </p>
                    </div>
                    {/* Stage Response - Tektokan */}
                    <div className="p-4 rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50/30 dark:bg-purple-950/10">
                      <p className="text-sm font-medium text-purple-600 mb-2">Stage Response</p>
                      <p className="text-2xl font-bold">{formatDuration(responseTime.stage_response?.avg_seconds)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {responseTime.stage_response?.total || 0} tektokan
                      </p>
                    </div>
                    {/* Quick Responses */}
                    <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950/20">
                      <p className="text-3xl font-bold text-green-600">{responseTime.distribution?.under_1_hour || 0}</p>
                      <p className="text-sm text-muted-foreground">Under 1 Hour</p>
                    </div>
                    {/* Slow Responses */}
                    <div className="text-center p-4 rounded-lg bg-red-50 dark:bg-red-950/20">
                      <p className="text-3xl font-bold text-red-600">{responseTime.distribution?.over_24_hours || 0}</p>
                      <p className="text-sm text-muted-foreground">Over 24 Hours</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Top Responders - with separated metrics */}
              {responseTime.top_responders && responseTime.top_responders.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      Top Responders
                    </CardTitle>
                    <CardDescription>First Response (assignee) and Stage Response (tektokan) separated</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {responseTime.top_responders.slice(0, 5).map((user: any, idx: number) => (
                        <div key={user.user_id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-muted-foreground w-6">
                              #{idx + 1}
                            </span>
                            <span className="font-medium">{user.name}</span>
                          </div>
                          <div className="flex gap-4 text-xs">
                            {/* First Response - only shown if user was assignee */}
                            {user.first_response?.count > 0 && (
                              <div className="text-center px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/20">
                                <span className="text-blue-600">FR:</span>{' '}
                                <span className="font-medium">{formatDurationShort(user.first_response.avg_seconds)}</span>
                                <span className="text-muted-foreground ml-1">({user.first_response.count})</span>
                              </div>
                            )}
                            {/* Stage Response */}
                            {user.stage_response?.count > 0 && (
                              <div className="text-center px-2 py-1 rounded bg-purple-50 dark:bg-purple-950/20">
                                <span className="text-purple-600">SR:</span>{' '}
                                <span className="font-medium">{formatDurationShort(user.stage_response.avg_seconds)}</span>
                                <span className="text-muted-foreground ml-1">({user.stage_response.count})</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Departments Tab */}
        <TabsContent value="departments" className="space-y-4">
          {deptPerformance && (
              <>
                {/* Department Rankings */}
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Best SLA Compliance</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {deptPerformance.rankings?.by_sla_compliance?.slice(0, 3).map((dept: any, idx: number) => (
                          <div key={dept.department} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant={idx === 0 ? 'default' : 'outline'}>#{idx + 1}</Badge>
                              <span>{departmentLabels[dept.department] || dept.department}</span>
                            </div>
                            <span className="font-medium">{Math.round(dept.rate || 0)}%</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Highest Win Rate (RFQ)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {deptPerformance.rankings?.by_win_rate?.slice(0, 3).map((dept: any, idx: number) => (
                          <div key={dept.department} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant={idx === 0 ? 'default' : 'outline'}>#{idx + 1}</Badge>
                              <span>{departmentLabels[dept.department] || dept.department}</span>
                            </div>
                            <span className="font-medium">{dept.rate || 0}%</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Department Details by Type */}
                {deptPerformance.departments && Object.entries(deptPerformance.departments).map(([deptCode, dept]: [string, any]) => (
                  dept.total_tickets > 0 && (
                    <Card key={deptCode}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle>{departmentLabels[deptCode] || deptCode}</CardTitle>
                          <Badge variant="outline">{dept.total_tickets || 0} tickets</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4 md:grid-cols-2">
                          {/* RFQ Performance */}
                          <div className="p-4 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/10">
                            <div className="flex items-center gap-2 mb-3">
                              <Badge variant="default" className="text-xs">RFQ</Badge>
                              <span className="text-sm text-muted-foreground">
                                {dept.by_type_detailed?.RFQ?.total_tickets || 0} tickets
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <p className="text-muted-foreground">Active</p>
                                <p className="font-medium">{dept.by_type_detailed?.RFQ?.active_tickets || 0}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Completed</p>
                                <p className="font-medium">{dept.by_type_detailed?.RFQ?.completed_tickets || 0}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">FR SLA</p>
                                <p className="font-medium">{dept.by_type_detailed?.RFQ?.sla?.first_response?.compliance_rate || 0}%</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Win Rate</p>
                                <p className="font-medium">{dept.by_type_detailed?.RFQ?.win_loss?.win_rate || 0}%</p>
                              </div>
                              <div className="col-span-2">
                                <p className="text-muted-foreground">Avg Resolution</p>
                                <p className="font-medium">{formatDuration(dept.by_type_detailed?.RFQ?.avg_resolution_seconds)}</p>
                              </div>
                            </div>
                          </div>

                          {/* GEN Performance */}
                          <div className="p-4 rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50/30 dark:bg-purple-950/10">
                            <div className="flex items-center gap-2 mb-3">
                              <Badge variant="secondary" className="text-xs">GEN</Badge>
                              <span className="text-sm text-muted-foreground">
                                {dept.by_type_detailed?.GEN?.total_tickets || 0} tickets
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <p className="text-muted-foreground">Active</p>
                                <p className="font-medium">{dept.by_type_detailed?.GEN?.active_tickets || 0}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Completed</p>
                                <p className="font-medium">{dept.by_type_detailed?.GEN?.completed_tickets || 0}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">FR SLA</p>
                                <p className="font-medium">{dept.by_type_detailed?.GEN?.sla?.first_response?.compliance_rate || 0}%</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Completion</p>
                                <p className="font-medium">{dept.by_type_detailed?.GEN?.completion_rate || 0}%</p>
                              </div>
                              <div className="col-span-2">
                                <p className="text-muted-foreground">Avg Resolution</p>
                                <p className="font-medium">{formatDuration(dept.by_type_detailed?.GEN?.avg_resolution_seconds)}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                ))}
              </>
            )}
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          {userPerformance && (
              <>
                {/* Leaderboard - Only shown for managers/directors */}
                {userPerformance.can_view_rankings && (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Trophy className="h-4 w-4 text-yellow-500" />
                          Most Tickets
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {userPerformance.leaderboard?.most_tickets?.[0] ? (
                          <div>
                            <p className="font-semibold">{userPerformance.leaderboard.most_tickets[0].name}</p>
                            <p className="text-2xl font-bold">{userPerformance.leaderboard.most_tickets[0].as_assignee?.tickets?.assigned || 0}</p>
                            <p className="text-xs text-muted-foreground">tickets assigned</p>
                          </div>
                        ) : (
                          <p className="text-muted-foreground">No data</p>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          Best Completion
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {userPerformance.leaderboard?.highest_completion_rate?.[0] ? (
                          <div>
                            <p className="font-semibold">{userPerformance.leaderboard.highest_completion_rate[0].name}</p>
                            <p className="text-2xl font-bold">{userPerformance.leaderboard.highest_completion_rate[0].as_assignee?.tickets?.completion_rate || 0}%</p>
                            <p className="text-xs text-muted-foreground">completion rate</p>
                          </div>
                        ) : (
                          <p className="text-muted-foreground">No data</p>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Target className="h-4 w-4 text-blue-500" />
                          Best SLA
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {userPerformance.leaderboard?.best_sla_compliance?.[0] ? (
                          <div>
                            <p className="font-semibold">{userPerformance.leaderboard.best_sla_compliance[0].name}</p>
                            <p className="text-2xl font-bold">
                              {Math.round(
                                ((userPerformance.leaderboard.best_sla_compliance[0].as_assignee?.sla?.first_response?.compliance_rate || 0) +
                                (userPerformance.leaderboard.best_sla_compliance[0].as_assignee?.sla?.resolution?.compliance_rate || 0)) / 2
                              )}%
                            </p>
                            <p className="text-xs text-muted-foreground">avg SLA compliance</p>
                          </div>
                        ) : (
                          <p className="text-muted-foreground">No data</p>
                        )}
                      </CardContent>
                    </Card>
                    <Card className="border-blue-200 dark:border-blue-900">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Timer className="h-4 w-4 text-blue-500" />
                          Fastest First Response
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {userPerformance.leaderboard?.fastest_first_response?.[0] ? (
                          <div>
                            <p className="font-semibold">{userPerformance.leaderboard.fastest_first_response[0].name}</p>
                            <p className="text-lg font-bold">{formatDuration(userPerformance.leaderboard.fastest_first_response[0].as_assignee?.first_response?.avg_seconds)}</p>
                            <p className="text-xs text-muted-foreground">avg first response (assignee)</p>
                          </div>
                        ) : (
                          <p className="text-muted-foreground">No data</p>
                        )}
                      </CardContent>
                    </Card>
                    <Card className="border-purple-200 dark:border-purple-900">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Timer className="h-4 w-4 text-purple-500" />
                          Fastest Stage Response
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {userPerformance.leaderboard?.fastest_stage_response?.[0] ? (
                          <div>
                            <p className="font-semibold">{userPerformance.leaderboard.fastest_stage_response[0].name}</p>
                            <p className="text-lg font-bold">{formatDuration(userPerformance.leaderboard.fastest_stage_response[0].as_assignee?.stage_response?.avg_seconds)}</p>
                            <p className="text-xs text-muted-foreground">avg tektokan (assignee)</p>
                          </div>
                        ) : (
                          <p className="text-muted-foreground">No data</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* User Performance List with Type Breakdown and Response Metrics */}
                <Card>
                  <CardHeader>
                    <CardTitle>Team Performance</CardTitle>
                    <CardDescription>
                      {userPerformance.total_users || 0} team members
                      {!userPerformance.can_view_rankings && ' (Leaderboard hidden for staff roles)'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {userPerformance.users?.slice(0, 10).map((user: any) => (
                        <div key={user.user_id} className="space-y-3 pb-4 border-b last:border-0">
                          {/* User Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                <Users className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="font-medium">{user.name}</p>
                                <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
                              </div>
                            </div>
                            <div className="flex gap-3 text-sm">
                              <div className="text-center">
                                <p className="font-medium">{user.as_creator?.tickets_created || 0}</p>
                                <p className="text-xs text-muted-foreground">Created</p>
                              </div>
                              <div className="text-center">
                                <p className="font-medium">{user.as_assignee?.tickets?.assigned || 0}</p>
                                <p className="text-xs text-muted-foreground">Assigned</p>
                              </div>
                              <div className="text-center">
                                <p className="font-medium">{user.as_assignee?.tickets?.completion_rate || 0}%</p>
                                <p className="text-xs text-muted-foreground">Completion</p>
                              </div>
                              <div className="text-center">
                                <p className="font-medium">{user.as_assignee?.sla?.first_response?.compliance_rate || 0}%</p>
                                <p className="text-xs text-muted-foreground">FR SLA</p>
                              </div>
                            </div>
                          </div>

                          {/* AS CREATOR - Metrics untuk tiket yang dia BUAT */}
                          {user.as_creator?.tickets_created > 0 && (
                            <div className="pl-11">
                              <div className="p-2 rounded border border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-950/10 text-xs">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-500 text-green-600">CREATOR</Badge>
                                  <span className="text-muted-foreground">Tiket yang dibuat: {user.as_creator.tickets_created}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Stage Response (tektokan):</span>
                                  {user.as_creator?.stage_response?.count > 0 ? (
                                    <span className="font-medium">
                                      {user.as_creator.stage_response.count} responses, avg {formatDurationShort(user.as_creator.stage_response.avg_seconds)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">Belum ada</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* AS ASSIGNEE - Metrics untuk tiket yang di-ASSIGN ke dia */}
                          {user.as_assignee?.tickets?.assigned > 0 && (
                            <>
                              <div className="pl-11">
                                <div className="p-2 rounded border border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/10 text-xs mb-2">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-blue-500 text-blue-600">ASSIGNEE</Badge>
                                    <span className="text-muted-foreground">Tiket yang di-assign: {user.as_assignee.tickets.assigned}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    {/* First Response */}
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">First Response:</span>
                                      {user.as_assignee?.first_response?.count > 0 ? (
                                        <span className="font-medium">
                                          {user.as_assignee.first_response.count}x, avg {formatDurationShort(user.as_assignee.first_response.avg_seconds)}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">Belum ada</span>
                                      )}
                                    </div>
                                    {/* Stage Response */}
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Stage Response:</span>
                                      {user.as_assignee?.stage_response?.count > 0 ? (
                                        <span className="font-medium">
                                          {user.as_assignee.stage_response.count}x, avg {formatDurationShort(user.as_assignee.stage_response.avg_seconds)}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">Belum ada</span>
                                      )}
                                    </div>
                                  </div>
                                  {/* First Quote for OPS */}
                                  {user.as_assignee?.first_quote && (
                                    <div className="flex justify-between mt-1 pt-1 border-t border-blue-200 dark:border-blue-800">
                                      <span className="text-blue-600 font-medium">First Quote (OPS):</span>
                                      {user.as_assignee.first_quote.count > 0 ? (
                                        <span className="font-medium">
                                          {user.as_assignee.first_quote.count}x, avg {formatDurationShort(user.as_assignee.first_quote.avg_seconds)}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">Belum ada</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Type Breakdown - Only for assigned tickets */}
                              <div className="grid grid-cols-2 gap-3 pl-11">
                                {/* RFQ */}
                                <div className="p-2 rounded bg-muted/50 text-xs">
                                  <div className="flex items-center gap-1 mb-1">
                                    <Badge variant="default" className="text-[10px] px-1 py-0">RFQ</Badge>
                                    <span className="text-muted-foreground">{user.as_assignee?.by_type?.RFQ?.tickets?.assigned || 0} tickets</span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    <div>
                                      <span className="text-muted-foreground">Comp:</span>
                                      <span className="font-medium ml-1">{user.as_assignee?.by_type?.RFQ?.tickets?.completion_rate || 0}%</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Win:</span>
                                      <span className="font-medium ml-1">{user.as_assignee?.by_type?.RFQ?.win_loss?.win_rate || 0}%</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">SLA:</span>
                                      <span className="font-medium ml-1">{user.as_assignee?.by_type?.RFQ?.sla?.first_response?.compliance_rate || 0}%</span>
                                    </div>
                                  </div>
                                </div>
                                {/* GEN */}
                                <div className="p-2 rounded bg-muted/50 text-xs">
                                  <div className="flex items-center gap-1 mb-1">
                                    <Badge variant="secondary" className="text-[10px] px-1 py-0">GEN</Badge>
                                    <span className="text-muted-foreground">{user.as_assignee?.by_type?.GEN?.tickets?.assigned || 0} tickets</span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    <div>
                                      <span className="text-muted-foreground">Comp:</span>
                                      <span className="font-medium ml-1">{user.as_assignee?.by_type?.GEN?.tickets?.completion_rate || 0}%</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Active:</span>
                                      <span className="font-medium ml-1">{user.as_assignee?.by_type?.GEN?.tickets?.active || 0}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">SLA:</span>
                                      <span className="font-medium ml-1">{user.as_assignee?.by_type?.GEN?.sla?.first_response?.compliance_rate || 0}%</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
        </TabsContent>
      </Tabs>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/tickets">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Ticket className="h-5 w-5 text-brand" />
                <span className="font-medium">View All Tickets</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/quotations">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-brand" />
                <span className="font-medium">Manage Quotations</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/tickets/new">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-brand" />
                <span className="font-medium">Create New Ticket</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
