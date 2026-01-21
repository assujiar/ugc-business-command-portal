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
import { canViewAllTickets } from '@/lib/permissions'
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
        <TabsContent value="sla" className="space-y-4">
          {slaMetrics && (
            <>
              {/* Overall SLA Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Timer className="h-4 w-4" />
                      First Response SLA
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {slaMetrics.overall?.first_response?.compliance_rate || 100}%
                    </div>
                    <Progress
                      value={slaMetrics.overall?.first_response?.compliance_rate || 100}
                      className="h-2 mt-2"
                    />
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>{slaMetrics.overall?.first_response?.met || 0} met</span>
                      <span>{slaMetrics.overall?.first_response?.breached || 0} breached</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Resolution SLA
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {slaMetrics.overall?.resolution?.compliance_rate || 100}%
                    </div>
                    <Progress
                      value={slaMetrics.overall?.resolution?.compliance_rate || 100}
                      className="h-2 mt-2"
                    />
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>{slaMetrics.overall?.resolution?.met || 0} met</span>
                      <span>{slaMetrics.overall?.resolution?.breached || 0} breached</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Avg First Response</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {slaMetrics.overall?.first_response?.avg_hours || 0}h
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Average time to first response</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      At Risk
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-destructive">
                      {slaMetrics.at_risk_count || 0}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Approaching SLA breach</p>
                  </CardContent>
                </Card>
              </div>

              {/* SLA by Ticket Type */}
              {slaMetrics.by_type && (
                <Card>
                  <CardHeader>
                    <CardTitle>SLA by Ticket Type</CardTitle>
                    <CardDescription>Comparison between RFQ and General Request tickets</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-6 md:grid-cols-2">
                      {/* RFQ */}
                      <div className="p-4 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Badge variant="default">RFQ</Badge>
                            <span className="text-sm text-muted-foreground">
                              {slaMetrics.by_type.RFQ?.total || 0} tickets
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">First Response</p>
                            <p className="text-2xl font-bold">
                              {slaMetrics.by_type.RFQ?.first_response_compliance || 100}%
                            </p>
                            <Progress
                              value={slaMetrics.by_type.RFQ?.first_response_compliance || 100}
                              className="h-1.5 mt-1"
                            />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Resolution</p>
                            <p className="text-2xl font-bold">
                              {slaMetrics.by_type.RFQ?.resolution_compliance || 100}%
                            </p>
                            <Progress
                              value={slaMetrics.by_type.RFQ?.resolution_compliance || 100}
                              className="h-1.5 mt-1"
                            />
                          </div>
                        </div>
                      </div>

                      {/* GEN */}
                      <div className="p-4 rounded-lg border bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">GEN</Badge>
                            <span className="text-sm text-muted-foreground">
                              {slaMetrics.by_type.GEN?.total || 0} tickets
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">First Response</p>
                            <p className="text-2xl font-bold">
                              {slaMetrics.by_type.GEN?.first_response_compliance || 100}%
                            </p>
                            <Progress
                              value={slaMetrics.by_type.GEN?.first_response_compliance || 100}
                              className="h-1.5 mt-1"
                            />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Resolution</p>
                            <p className="text-2xl font-bold">
                              {slaMetrics.by_type.GEN?.resolution_compliance || 100}%
                            </p>
                            <Progress
                              value={slaMetrics.by_type.GEN?.resolution_compliance || 100}
                              className="h-1.5 mt-1"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

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
                                  <span>{data.first_response?.compliance_rate || 100}%</span>
                                </div>
                                <Progress value={data.first_response?.compliance_rate || 100} className="h-1.5" />
                              </div>
                              <div>
                                <div className="flex justify-between text-sm">
                                  <span>Resolution</span>
                                  <span>{data.resolution?.compliance_rate || 100}%</span>
                                </div>
                                <Progress value={data.resolution?.compliance_rate || 100} className="h-1.5" />
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
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total Responses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{responseTime.total_responses || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Last {period} days
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{responseTime.avg_response_hours || 0}h</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Across all responses
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Under 1 Hour</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-success">
                      {responseTime.distribution?.under_1h || 0}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Quick responses
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Response Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Response Time Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-4">
                    {responseTime.distribution && Object.entries({
                      'Under 1h': responseTime.distribution.under_1h,
                      '1-4h': responseTime.distribution['1_to_4h'],
                      '4-8h': responseTime.distribution['4_to_8h'],
                      '8-24h': responseTime.distribution['8_to_24h'],
                      'Over 24h': responseTime.distribution.over_24h,
                    }).map(([label, count]) => (
                      <div key={label} className="text-center p-3 rounded-lg bg-muted">
                        <p className="text-2xl font-bold">{count as number || 0}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Top Responders */}
              {responseTime.top_responders && responseTime.top_responders.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      Top Responders
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {responseTime.top_responders.slice(0, 5).map((user: any, idx: number) => (
                        <div key={user.user_id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-muted-foreground w-6">
                              #{idx + 1}
                            </span>
                            <span className="font-medium">{user.name}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {user.response_count} responses | Avg {user.avg_hours}h
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
                        {deptPerformance.rankings?.best_sla_compliance?.slice(0, 3).map((dept: any, idx: number) => (
                          <div key={dept.department} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant={idx === 0 ? 'default' : 'outline'}>#{idx + 1}</Badge>
                              <span>{departmentLabels[dept.department] || dept.department}</span>
                            </div>
                            <span className="font-medium">{dept.overall_sla_compliance}%</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Highest Win Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {deptPerformance.rankings?.highest_win_rate?.slice(0, 3).map((dept: any, idx: number) => (
                          <div key={dept.department} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant={idx === 0 ? 'default' : 'outline'}>#{idx + 1}</Badge>
                              <span>{departmentLabels[dept.department] || dept.department}</span>
                            </div>
                            <span className="font-medium">{dept.win_loss?.win_rate || 0}%</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Department Details */}
                <Card>
                  <CardHeader>
                    <CardTitle>Department Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {deptPerformance.departments?.map((dept: any) => (
                        <div key={dept.department} className="space-y-3 pb-4 border-b last:border-0">
                          <div className="flex justify-between items-center">
                            <h4 className="font-semibold">{departmentLabels[dept.department] || dept.department}</h4>
                            <Badge variant="outline">{dept.tickets?.assigned || 0} tickets</Badge>
                          </div>
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Active</p>
                              <p className="font-medium">{dept.tickets?.active || 0}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Completed</p>
                              <p className="font-medium">{(dept.tickets?.resolved || 0) + (dept.tickets?.closed || 0)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">FR SLA</p>
                              <p className="font-medium">{dept.sla?.first_response?.compliance_rate || 100}%</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Win Rate</p>
                              <p className="font-medium">{dept.win_loss?.win_rate || 0}%</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          {userPerformance && (
              <>
                {/* Leaderboard */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                          <p className="text-2xl font-bold">{userPerformance.leaderboard.most_tickets[0].tickets?.assigned || 0}</p>
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
                          <p className="text-2xl font-bold">{userPerformance.leaderboard.highest_completion_rate[0].tickets?.completion_rate || 0}%</p>
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
                              ((userPerformance.leaderboard.best_sla_compliance[0].sla?.first_response?.compliance_rate || 100) +
                              (userPerformance.leaderboard.best_sla_compliance[0].sla?.resolution?.compliance_rate || 100)) / 2
                            )}%
                          </p>
                          <p className="text-xs text-muted-foreground">avg SLA compliance</p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No data</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Timer className="h-4 w-4 text-purple-500" />
                        Fastest Response
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {userPerformance.leaderboard?.fastest_response?.[0] ? (
                        <div>
                          <p className="font-semibold">{userPerformance.leaderboard.fastest_response[0].name}</p>
                          <p className="text-2xl font-bold">{userPerformance.leaderboard.fastest_response[0].response?.avg_response_hours || 0}h</p>
                          <p className="text-xs text-muted-foreground">avg response time</p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No data</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* User Performance List */}
                <Card>
                  <CardHeader>
                    <CardTitle>Team Performance</CardTitle>
                    <CardDescription>{userPerformance.total_users || 0} team members</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {userPerformance.users?.slice(0, 10).map((user: any) => (
                        <div key={user.user_id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                              <Users className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
                            </div>
                          </div>
                          <div className="flex gap-6 text-sm">
                            <div className="text-center">
                              <p className="font-medium">{user.tickets?.assigned || 0}</p>
                              <p className="text-xs text-muted-foreground">Assigned</p>
                            </div>
                            <div className="text-center">
                              <p className="font-medium">{user.tickets?.completion_rate || 0}%</p>
                              <p className="text-xs text-muted-foreground">Completion</p>
                            </div>
                            <div className="text-center">
                              <p className="font-medium">{user.sla?.first_response?.compliance_rate || 100}%</p>
                              <p className="text-xs text-muted-foreground">FR SLA</p>
                            </div>
                          </div>
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
