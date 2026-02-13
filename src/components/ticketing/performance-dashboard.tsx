'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users,
  Building2,
  Trophy,
  Target,
  Timer,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Award,
  Medal,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { canViewAllTickets } from '@/lib/permissions'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface PerformanceDashboardProps {
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

// Role labels
const roleLabels: Record<string, string> = {
  admin: 'Admin',
  ops_mkt: 'Marketing Ops',
  ops_sal: 'Sales Ops',
  ops_dom: 'Domestics Ops',
  ops_exi: 'EXIM Ops',
  ops_dtd: 'DTD Ops',
  ops_trf: 'Traffic Ops',
  sales: 'Sales',
  marketing: 'Marketing',
}

// Helper to format seconds as human readable
function formatSeconds(seconds: number): string {
  if (seconds <= 0) return '0h'
  const hours = seconds / 3600
  if (hours < 1) return `${Math.round(seconds / 60)}m`
  return `${Math.round(hours * 10) / 10}h`
}

export function PerformanceDashboard({ profile }: PerformanceDashboardProps) {
  const [period, setPeriod] = useState('30')
  const [department, setDepartment] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [deptPerformance, setDeptPerformance] = useState<any>(null)
  const [userPerformance, setUserPerformance] = useState<any>(null)

  const canViewAll = canViewAllTickets(profile.role)

  // Fetch performance data
  const fetchData = useCallback(async () => {
    if (!canViewAll) return

    setLoading(true)
    try {
      const params = new URLSearchParams({ period })
      if (department !== 'all') params.append('department', department)

      const [deptRes, userRes] = await Promise.all([
        fetch(`/api/ticketing/performance/departments?${params.toString()}`),
        fetch(`/api/ticketing/performance/users?${params.toString()}`),
      ])

      const [deptData, userData] = await Promise.all([
        deptRes.json(),
        userRes.json(),
      ])

      if (deptData.success) setDeptPerformance(deptData.data)
      if (userData.success) setUserPerformance(userData.data)
    } catch (err) {
      console.error('Error fetching performance data:', err)
    } finally {
      setLoading(false)
    }
  }, [canViewAll, period, department])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (!canViewAll) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
          <p className="text-muted-foreground">
            Performance metrics and reports
          </p>
        </div>
        <Card>
          <CardContent className="py-16 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Access Restricted</p>
            <p className="text-muted-foreground mt-2">
              Performance reports are only available to admin and operations managers.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Convert departments object to array for rendering
  const deptArray: any[] = deptPerformance?.departments
    ? Object.entries(deptPerformance.departments)
        .filter(([_, d]: [string, any]) => d.total_tickets > 0)
        .map(([key, d]: [string, any]) => ({ department: key, ...d }))
    : []

  const totalDepartments = deptArray.length

  // Helper to get user's assignee tickets data safely
  const getUserTickets = (user: any) => user?.as_assignee?.tickets || {}
  const getUserSla = (user: any) => user?.as_assignee?.sla || {}
  const getUserWinLoss = (user: any) => user?.as_assignee?.win_loss || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
          <p className="text-muted-foreground">
            Team and department performance metrics
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
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="MKT">Marketing</SelectItem>
              <SelectItem value="SAL">Sales</SelectItem>
              <SelectItem value="DOM">Domestics Ops</SelectItem>
              <SelectItem value="EXI">EXIM Ops</SelectItem>
              <SelectItem value="DTD">Import DTD Ops</SelectItem>
              <SelectItem value="TRF">Traffic & Warehouse</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="team" className="space-y-4">
        <TabsList>
          <TabsTrigger value="team">Team Performance</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
        </TabsList>

        {/* Team Performance Tab */}
        <TabsContent value="team" className="space-y-4">
          {userPerformance && (
            <>
              {/* Summary Stats */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total Team Members</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{userPerformance.total_users || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">With assigned tickets</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total Assigned</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {userPerformance.users?.reduce((sum: number, u: any) => sum + (getUserTickets(u).assigned || 0), 0) || 0}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Tickets across team</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Avg Completion Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {userPerformance.users?.length > 0
                        ? Math.round(
                            userPerformance.users.reduce((sum: number, u: any) => sum + (getUserTickets(u).completion_rate || 0), 0) /
                            userPerformance.users.length
                          )
                        : 0}%
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Team average</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Avg SLA Compliance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {userPerformance.users?.length > 0
                        ? Math.round(
                            userPerformance.users.reduce(
                              (sum: number, u: any) => sum + (getUserSla(u).first_response?.compliance_rate || 0),
                              0
                            ) / userPerformance.users.length
                          )
                        : 0}%
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">First response</p>
                  </CardContent>
                </Card>
              </div>

              {/* User Performance Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Team Members Performance</CardTitle>
                  <CardDescription>
                    Detailed performance metrics for each team member
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-center">Assigned</TableHead>
                        <TableHead className="text-center">Active</TableHead>
                        <TableHead className="text-center">Completed</TableHead>
                        <TableHead className="text-center">Completion %</TableHead>
                        <TableHead className="text-center">FR SLA</TableHead>
                        <TableHead className="text-center">Res SLA</TableHead>
                        <TableHead className="text-center">Win Rate</TableHead>
                        <TableHead className="text-center">Avg Res Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userPerformance.users?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8">
                            <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-muted-foreground">No performance data available</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        userPerformance.users?.map((user: any) => {
                          const tickets = getUserTickets(user)
                          const sla = getUserSla(user)
                          const winLoss = getUserWinLoss(user)
                          return (
                            <TableRow key={user.user_id}>
                              <TableCell className="font-medium">{user.name}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {roleLabels[user.role] || user.role}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">{tickets.assigned || 0}</TableCell>
                              <TableCell className="text-center">{tickets.active || 0}</TableCell>
                              <TableCell className="text-center">
                                {(tickets.resolved || 0) + (tickets.closed || 0)}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <span>{tickets.completion_rate || 0}%</span>
                                  <Progress
                                    value={tickets.completion_rate || 0}
                                    className="w-12 h-1.5"
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className={(sla.first_response?.compliance_rate || 0) < 90 ? 'text-destructive' : ''}>
                                  {sla.first_response?.compliance_rate || 0}%
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className={(sla.resolution?.compliance_rate || 0) < 90 ? 'text-destructive' : ''}>
                                  {sla.resolution?.compliance_rate || 0}%
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                {winLoss.win_rate || 0}%
                              </TableCell>
                              <TableCell className="text-center">
                                {user.as_assignee?.avg_resolution_hours || 0}h
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Departments Tab */}
        <TabsContent value="departments" className="space-y-4">
          {deptPerformance && (
            <>
              {/* Department Summary */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total Departments</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{totalDepartments}</div>
                    <p className="text-xs text-muted-foreground mt-1">With active tickets</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Best Performing</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {deptPerformance.rankings?.by_sla_compliance?.[0] ? (
                      <div>
                        <div className="text-xl font-bold">
                          {departmentLabels[deptPerformance.rankings.by_sla_compliance[0].department]}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {deptPerformance.rankings.by_sla_compliance[0].rate}% SLA Compliance
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No data</p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Highest Win Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {deptPerformance.rankings?.by_win_rate?.[0] ? (
                      <div>
                        <div className="text-xl font-bold">
                          {departmentLabels[deptPerformance.rankings.by_win_rate[0].department]}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {deptPerformance.rankings.by_win_rate[0].rate || 0}% Win Rate
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No data</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Department Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {deptArray.map((dept: any) => (
                  <Card key={dept.department}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{departmentLabels[dept.department] || dept.department}</span>
                        <Badge variant="outline">{dept.total_tickets || 0} tickets</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Ticket Stats */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-muted rounded">
                          <p className="text-lg font-bold">{dept.active_tickets || 0}</p>
                          <p className="text-xs text-muted-foreground">Active</p>
                        </div>
                        <div className="p-2 bg-muted rounded">
                          <p className="text-lg font-bold">{dept.by_status?.resolved || 0}</p>
                          <p className="text-xs text-muted-foreground">Resolved</p>
                        </div>
                        <div className="p-2 bg-muted rounded">
                          <p className="text-lg font-bold">{dept.by_status?.closed || 0}</p>
                          <p className="text-xs text-muted-foreground">Closed</p>
                        </div>
                      </div>

                      {/* SLA Metrics */}
                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>First Response SLA</span>
                            <span className={(dept.sla?.first_response?.compliance_rate || 0) < 90 ? 'text-destructive' : ''}>
                              {dept.sla?.first_response?.compliance_rate || 0}%
                            </span>
                          </div>
                          <Progress value={dept.sla?.first_response?.compliance_rate || 0} className="h-1.5" />
                        </div>
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Resolution SLA</span>
                            <span className={(dept.sla?.resolution?.compliance_rate || 0) < 90 ? 'text-destructive' : ''}>
                              {dept.sla?.resolution?.compliance_rate || 0}%
                            </span>
                          </div>
                          <Progress value={dept.sla?.resolution?.compliance_rate || 0} className="h-1.5" />
                        </div>
                      </div>

                      {/* Win/Loss */}
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-sm text-muted-foreground">Win Rate</span>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{dept.win_loss?.win_rate || 0}%</span>
                          <span className="text-xs text-muted-foreground">
                            ({dept.win_loss?.won || 0}W / {dept.win_loss?.lost || 0}L)
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {deptArray.length === 0 && (
                  <Card className="col-span-full">
                    <CardContent className="py-16 text-center">
                      <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">No department data available for this period</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard" className="space-y-4">
          {userPerformance && (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Most Tickets */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    Most Tickets Handled
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {userPerformance.leaderboard?.most_tickets?.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                    )}
                    {userPerformance.leaderboard?.most_tickets?.map((user: any, idx: number) => (
                      <div key={user.user_id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                            idx === 0 ? 'bg-yellow-100 text-yellow-600' :
                            idx === 1 ? 'bg-gray-100 text-gray-600' :
                            idx === 2 ? 'bg-orange-100 text-orange-600' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {idx < 3 ? <Medal className="h-4 w-4" /> : <span className="text-sm">#{idx + 1}</span>}
                          </div>
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{roleLabels[user.role] || user.role}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">{getUserTickets(user).assigned || 0}</p>
                          <p className="text-xs text-muted-foreground">tickets</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Highest Completion Rate */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Highest Completion Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {userPerformance.leaderboard?.highest_completion_rate?.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                    )}
                    {userPerformance.leaderboard?.highest_completion_rate?.map((user: any, idx: number) => (
                      <div key={user.user_id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                            idx === 0 ? 'bg-green-100 text-green-600' :
                            idx === 1 ? 'bg-gray-100 text-gray-600' :
                            idx === 2 ? 'bg-orange-100 text-orange-600' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {idx < 3 ? <Award className="h-4 w-4" /> : <span className="text-sm">#{idx + 1}</span>}
                          </div>
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{getUserTickets(user).assigned || 0} tickets</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">{getUserTickets(user).completion_rate || 0}%</p>
                          <p className="text-xs text-muted-foreground">completion</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Best SLA Compliance */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-blue-500" />
                    Best SLA Compliance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {userPerformance.leaderboard?.best_sla_compliance?.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                    )}
                    {userPerformance.leaderboard?.best_sla_compliance?.map((user: any, idx: number) => {
                      const sla = getUserSla(user)
                      return (
                        <div key={user.user_id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                              idx === 0 ? 'bg-blue-100 text-blue-600' :
                              idx === 1 ? 'bg-gray-100 text-gray-600' :
                              idx === 2 ? 'bg-orange-100 text-orange-600' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {idx < 3 ? <Target className="h-4 w-4" /> : <span className="text-sm">#{idx + 1}</span>}
                            </div>
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-xs text-muted-foreground">{getUserTickets(user).assigned || 0} tickets</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold">
                              {Math.round(
                                ((sla.first_response?.compliance_rate || 0) +
                                (sla.resolution?.compliance_rate || 0)) / 2
                              )}%
                            </p>
                            <p className="text-xs text-muted-foreground">avg SLA</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Fastest First Response */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Timer className="h-5 w-5 text-purple-500" />
                    Fastest First Response
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {userPerformance.leaderboard?.fastest_first_response?.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                    )}
                    {userPerformance.leaderboard?.fastest_first_response?.map((user: any, idx: number) => {
                      const firstResponse = user.as_assignee?.first_response
                      return (
                        <div key={user.user_id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                              idx === 0 ? 'bg-purple-100 text-purple-600' :
                              idx === 1 ? 'bg-gray-100 text-gray-600' :
                              idx === 2 ? 'bg-orange-100 text-orange-600' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {idx < 3 ? <Timer className="h-4 w-4" /> : <span className="text-sm">#{idx + 1}</span>}
                            </div>
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-xs text-muted-foreground">{firstResponse?.count || 0} responses</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold">{formatSeconds(firstResponse?.avg_seconds || 0)}</p>
                            <p className="text-xs text-muted-foreground">avg time</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
