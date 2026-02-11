'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  Building2,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  RefreshCw,
  Filter,
  Trophy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface SLAComplianceSectionProps {
  profile: Profile
}

interface UserMetric {
  user_id: string
  user_name: string
  user_role: string
  role_category: string
  ticket_type: string
  tickets_created: number
  tickets_assigned: number
  creator_avg_stage_response_seconds: number
  creator_avg_stage_response_formatted: string
  assignee_avg_first_response_seconds: number
  assignee_avg_first_response_formatted: string
  assignee_avg_stage_response_seconds: number
  assignee_avg_stage_response_formatted: string
  assignee_avg_resolution_seconds: number
  assignee_avg_resolution_formatted: string
  ops_avg_first_quote_seconds: number
  ops_avg_first_quote_formatted: string
  ops_acceptance_rate_percent: number
  sla_compliance: {
    first_response_met: number
    first_response_breached: number
    stage_response_met: number
    resolution_met: number
    resolution_breached: number
  }
}

interface DepartmentMetric {
  department: string
  ticket_type: string
  total_users: number
  total_tickets_created: number
  total_tickets_assigned: number
  avg_first_response_seconds: number
  avg_first_response_formatted: string
  avg_stage_response_seconds: number
  avg_stage_response_formatted: string
  avg_resolution_seconds: number
  avg_resolution_formatted: string
  avg_first_quote_seconds: number
  avg_first_quote_formatted: string
  cost_acceptance_rate_percent: number
  sla_compliance: {
    first_response_met: number
    first_response_breached: number
    resolution_met: number
    resolution_breached: number
  }
}

interface CompanyMetric {
  ticket_type: string
  total_users: number
  total_tickets_created: number
  total_tickets_assigned: number
  avg_first_response_seconds: number
  avg_first_response_formatted: string
  avg_stage_response_seconds: number
  avg_stage_response_formatted: string
  avg_resolution_seconds: number
  avg_resolution_formatted: string
  avg_first_quote_seconds: number
  avg_first_quote_formatted: string
  cost_acceptance_rate_percent: number
  sla_compliance: {
    first_response_met: number
    first_response_breached: number
    resolution_met: number
    resolution_breached: number
  }
}

interface SLAMetricsData {
  user_metrics: UserMetric[]
  department_metrics: DepartmentMetric[]
  company_metrics: CompanyMetric[]
}

interface TicketDetail {
  id: string
  ticket_code: string
  subject: string
  status: string
  ticket_type: string
  created_at: string
  resolved_at: string | null
  creator_name: string
  assignee_name: string
  sla_status: string
  metrics: {
    first_response_seconds: number
    first_response_formatted: string
    stage_response_seconds: number
    stage_response_formatted: string
    resolution_seconds: number
    resolution_formatted: string
  }
}

export function SLAComplianceSection({ profile }: SLAComplianceSectionProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<SLAMetricsData | null>(null)
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all')
  const [selectedTicketType, setSelectedTicketType] = useState<string>('all')
  const [showTicketsDialog, setShowTicketsDialog] = useState(false)
  const [selectedSLAType, setSelectedSLAType] = useState<string>('first_response')
  const [selectedSLAStatus, setSelectedSLAStatus] = useState<string>('all')
  const [tickets, setTickets] = useState<TicketDetail[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)

  // Fetch SLA metrics
  const fetchMetrics = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedDepartment !== 'all') params.set('department', selectedDepartment)
      if (selectedTicketType !== 'all') params.set('ticket_type', selectedTicketType)

      const response = await fetch(`/api/metrics/sla?${params.toString()}`)
      const result = await response.json()

      if (result.success) {
        setMetrics(result.data)
      } else {
        throw new Error(result.error || 'Failed to load metrics')
      }
    } catch (err: any) {
      console.error('Error fetching SLA metrics:', err)
      toast({
        title: 'Error',
        description: err.message || 'Failed to load SLA metrics',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [selectedDepartment, selectedTicketType, toast])

  // Fetch tickets for drill-down
  const fetchTickets = async (slaType: string, status: string) => {
    setTicketsLoading(true)
    try {
      const params = new URLSearchParams({
        sla_type: slaType,
        status: status,
        limit: '50',
      })

      const response = await fetch(`/api/metrics/sla/tickets?${params.toString()}`)
      const result = await response.json()

      if (result.success) {
        setTickets(result.data.tickets || [])
      } else {
        throw new Error(result.error || 'Failed to load tickets')
      }
    } catch (err: any) {
      console.error('Error fetching tickets:', err)
      toast({
        title: 'Error',
        description: err.message || 'Failed to load tickets',
        variant: 'destructive',
      })
    } finally {
      setTicketsLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
  }, [fetchMetrics])

  const handleViewTickets = (slaType: string, status: string) => {
    setSelectedSLAType(slaType)
    setSelectedSLAStatus(status)
    setShowTicketsDialog(true)
    fetchTickets(slaType, status)
  }

  // Calculate compliance percentage
  const getCompliancePercent = (met: number, breached: number) => {
    const total = met + breached
    if (total === 0) return 0
    return Math.round((met / total) * 100)
  }

  // Get departments from metrics
  const departments = metrics?.department_metrics
    ? Array.from(new Set(metrics.department_metrics.map(m => m.department)))
    : []

  // Get ticket types from metrics
  const ticketTypes = metrics?.company_metrics
    ? Array.from(new Set(metrics.company_metrics.map(m => m.ticket_type)))
    : []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filters:</span>
        </div>
        <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map(dept => (
              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedTicketType} onValueChange={setSelectedTicketType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Ticket Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {ticketTypes.map(type => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={fetchMetrics}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Company Overview Cards */}
      {metrics?.company_metrics && metrics.company_metrics.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {metrics.company_metrics.map((company, idx) => (
            <Card key={idx}>
              <CardHeader className="pb-2">
                <CardDescription>
                  {company.ticket_type} Tickets
                </CardDescription>
                <CardTitle className="text-2xl">
                  {company.total_tickets_assigned || 0}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground">
                  Avg Resolution: {company.avg_resolution_formatted || 'N/A'}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* First Response SLA Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                First Response SLA
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.company_metrics.map((company, idx) => {
                const percent = getCompliancePercent(
                  company.sla_compliance.first_response_met,
                  company.sla_compliance.first_response_breached
                )
                return (
                  <div key={idx} className="flex items-center justify-between mb-2">
                    <span className="text-sm">{company.ticket_type}</span>
                    <Badge
                      variant={percent >= 80 ? 'secondary' : 'destructive'}
                      className="cursor-pointer"
                      onClick={() => handleViewTickets('first_response', 'all')}
                    >
                      {percent}%
                    </Badge>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Resolution SLA Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Resolution SLA
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.company_metrics.map((company, idx) => {
                const percent = getCompliancePercent(
                  company.sla_compliance.resolution_met,
                  company.sla_compliance.resolution_breached
                )
                return (
                  <div key={idx} className="flex items-center justify-between mb-2">
                    <span className="text-sm">{company.ticket_type}</span>
                    <Badge
                      variant={percent >= 80 ? 'secondary' : 'destructive'}
                      className="cursor-pointer"
                      onClick={() => handleViewTickets('resolution', 'all')}
                    >
                      {percent}%
                    </Badge>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Cost Acceptance Rate Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Cost Acceptance Rate
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.company_metrics.map((company, idx) => (
                <div key={idx} className="flex items-center justify-between mb-2">
                  <span className="text-sm">{company.ticket_type}</span>
                  <Badge variant={company.cost_acceptance_rate_percent >= 70 ? 'secondary' : 'outline'}>
                    {company.cost_acceptance_rate_percent}%
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Department and User Tabs */}
      <Tabs defaultValue="departments" className="w-full">
        <TabsList>
          <TabsTrigger value="departments" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            By Department
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            By User
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Leaderboard
          </TabsTrigger>
        </TabsList>

        {/* Department Metrics */}
        <TabsContent value="departments">
          <Card>
            <CardHeader>
              <CardTitle>Department Performance</CardTitle>
              <CardDescription>
                SLA metrics aggregated by department
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Users</TableHead>
                    <TableHead className="text-center">Tickets</TableHead>
                    <TableHead>Avg First Response</TableHead>
                    <TableHead>Avg Resolution</TableHead>
                    <TableHead className="text-center">First Response SLA</TableHead>
                    <TableHead className="text-center">Resolution SLA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics?.department_metrics?.map((dept, idx) => {
                    const firstResponsePercent = getCompliancePercent(
                      dept.sla_compliance.first_response_met,
                      dept.sla_compliance.first_response_breached
                    )
                    const resolutionPercent = getCompliancePercent(
                      dept.sla_compliance.resolution_met,
                      dept.sla_compliance.resolution_breached
                    )
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{dept.department}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{dept.ticket_type}</Badge>
                        </TableCell>
                        <TableCell className="text-center">{dept.total_users}</TableCell>
                        <TableCell className="text-center">{dept.total_tickets_assigned}</TableCell>
                        <TableCell>{dept.avg_first_response_formatted || 'N/A'}</TableCell>
                        <TableCell>{dept.avg_resolution_formatted || 'N/A'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={firstResponsePercent >= 80 ? 'secondary' : 'destructive'}>
                            {firstResponsePercent}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={resolutionPercent >= 80 ? 'secondary' : 'destructive'}>
                            {resolutionPercent}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {(!metrics?.department_metrics || metrics.department_metrics.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No department metrics available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* User Metrics */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User Performance</CardTitle>
              <CardDescription>
                SLA metrics per individual user
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Assigned</TableHead>
                    <TableHead>Avg First Response</TableHead>
                    <TableHead>Avg Resolution</TableHead>
                    <TableHead>Ops Quote Time</TableHead>
                    <TableHead className="text-center">Acceptance Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics?.user_metrics?.map((user, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{user.user_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {user.role_category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {user.ticket_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{user.tickets_assigned}</TableCell>
                      <TableCell>{user.assignee_avg_first_response_formatted || 'N/A'}</TableCell>
                      <TableCell>{user.assignee_avg_resolution_formatted || 'N/A'}</TableCell>
                      <TableCell>{user.ops_avg_first_quote_formatted || 'N/A'}</TableCell>
                      <TableCell className="text-center">
                        {user.ops_acceptance_rate_percent > 0 && (
                          <Badge variant={user.ops_acceptance_rate_percent >= 70 ? 'secondary' : 'outline'}>
                            {user.ops_acceptance_rate_percent}%
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!metrics?.user_metrics || metrics.user_metrics.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No user metrics available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leaderboard */}
        <TabsContent value="leaderboard">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Performance Leaderboard
              </CardTitle>
              <CardDescription>
                Users ranked by SLA performance (lower response times = better rank)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Rank</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-center">Tickets</TableHead>
                    <TableHead>Avg First Response</TableHead>
                    <TableHead>Avg Resolution</TableHead>
                    <TableHead className="text-center">Acceptance Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics?.user_metrics
                    ?.filter(u => u.tickets_assigned > 0)
                    .sort((a, b) => {
                      // Sort by performance (lower response times are better)
                      const aScore = (a.assignee_avg_first_response_seconds || 0) * 0.4 +
                                     (a.assignee_avg_resolution_seconds || 0) * 0.4
                      const bScore = (b.assignee_avg_first_response_seconds || 0) * 0.4 +
                                     (b.assignee_avg_resolution_seconds || 0) * 0.4
                      return aScore - bScore
                    })
                    .slice(0, 10)
                    .map((user, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          {idx === 0 && <span className="text-xl">🥇</span>}
                          {idx === 1 && <span className="text-xl">🥈</span>}
                          {idx === 2 && <span className="text-xl">🥉</span>}
                          {idx > 2 && <span className="text-muted-foreground">#{idx + 1}</span>}
                        </TableCell>
                        <TableCell className="font-medium">{user.user_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{user.role_category}</Badge>
                        </TableCell>
                        <TableCell className="text-center">{user.tickets_assigned}</TableCell>
                        <TableCell>
                          {user.assignee_avg_first_response_formatted || 'N/A'}
                        </TableCell>
                        <TableCell>
                          {user.assignee_avg_resolution_formatted || 'N/A'}
                        </TableCell>
                        <TableCell className="text-center">
                          {user.ops_acceptance_rate_percent > 0 && (
                            <span>{user.ops_acceptance_rate_percent}%</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  {(!metrics?.user_metrics || metrics.user_metrics.filter(u => u.tickets_assigned > 0).length === 0) && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No performance data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Tickets Drill-down Dialog */}
      <Dialog open={showTicketsDialog} onOpenChange={setShowTicketsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedSLAType === 'first_response' && 'First Response SLA'}
              {selectedSLAType === 'stage_response' && 'Stage Response SLA'}
              {selectedSLAType === 'resolution' && 'Resolution SLA'}
              {' - '}
              {selectedSLAStatus === 'all' ? 'All Tickets' :
               selectedSLAStatus === 'met' ? 'SLA Met' : 'SLA Breached'}
            </DialogTitle>
            <DialogDescription>
              Tickets filtered by SLA compliance status
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mb-4">
            <Select value={selectedSLAStatus} onValueChange={(v) => {
              setSelectedSLAStatus(v)
              fetchTickets(selectedSLAType, v)
            }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="met">SLA Met</SelectItem>
                <SelectItem value="breached">SLA Breached</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {ticketsLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Response Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className="font-mono">{ticket.ticket_code}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{ticket.subject}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ticket.ticket_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ticket.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {ticket.sla_status === 'met' ? (
                        <Badge variant="secondary">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Met
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <XCircle className="mr-1 h-3 w-3" />
                          Breached
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {selectedSLAType === 'first_response' && ticket.metrics.first_response_formatted}
                      {selectedSLAType === 'stage_response' && ticket.metrics.stage_response_formatted}
                      {selectedSLAType === 'resolution' && ticket.metrics.resolution_formatted}
                    </TableCell>
                  </TableRow>
                ))}
                {tickets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No tickets found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
