'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import {
  Ticket,
  Plus,
  Search,
  Filter,
  AlertCircle,
  Clock,
  CheckCircle2,
  User,
  Building2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { canViewAllTickets, canAssignTickets } from '@/lib/permissions'
import type { Database } from '@/types/database'
import type { Ticket as TicketType, TicketStatus, TicketPriority, TicketType as TicketTypeEnum, TicketingDepartment } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface TicketsDashboardProps {
  profile: Profile
}

// Status badge variants
const statusVariants: Record<TicketStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  open: { variant: 'destructive', label: 'Open' },
  need_response: { variant: 'destructive', label: 'Need Response' },
  in_progress: { variant: 'default', label: 'In Progress' },
  waiting_customer: { variant: 'secondary', label: 'Waiting Customer' },
  need_adjustment: { variant: 'secondary', label: 'Need Adjustment' },
  pending: { variant: 'outline', label: 'Pending' },
  resolved: { variant: 'outline', label: 'Resolved' },
  closed: { variant: 'outline', label: 'Closed' },
}

// Priority badge variants
const priorityVariants: Record<TicketPriority, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  low: { variant: 'outline', label: 'Low' },
  medium: { variant: 'secondary', label: 'Medium' },
  high: { variant: 'default', label: 'High' },
  urgent: { variant: 'destructive', label: 'Urgent' },
}

// Department labels
const departmentLabels: Record<TicketingDepartment, string> = {
  MKT: 'Marketing',
  SAL: 'Sales',
  DOM: 'Domestics Ops',
  EXI: 'EXIM Ops',
  DTD: 'Import DTD Ops',
  TRF: 'Traffic & Warehouse',
}

export function TicketsDashboard({ profile }: TicketsDashboardProps) {
  const router = useRouter()
  const [tickets, setTickets] = useState<TicketType[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    in_progress: 0,
    pending: 0,
    resolved: 0,
  })

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const canViewAll = canViewAllTickets(profile.role)

  // Fetch tickets
  const fetchTickets = async () => {
    setLoading(true)
    try {
      let query = (supabase as any)
        .from('tickets')
        .select(`
          *,
          creator:profiles!tickets_created_by_fkey(user_id, name, email),
          assignee:profiles!tickets_assigned_to_fkey(user_id, name, email),
          account:accounts!tickets_account_id_fkey(account_id, company_name)
        `)
        .order('created_at', { ascending: false })

      // Apply filters
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }
      if (priorityFilter !== 'all') {
        query = query.eq('priority', priorityFilter)
      }
      if (typeFilter !== 'all') {
        query = query.eq('ticket_type', typeFilter)
      }
      if (departmentFilter !== 'all') {
        query = query.eq('department', departmentFilter)
      }
      if (searchQuery) {
        query = query.or(`ticket_code.ilike.%${searchQuery}%,subject.ilike.%${searchQuery}%`)
      }

      // If user cannot view all, filter by ownership
      if (!canViewAll) {
        query = query.or(`created_by.eq.${profile.user_id},assigned_to.eq.${profile.user_id}`)
      }

      const { data, error } = await query.limit(100)

      if (error) {
        console.error('Error fetching tickets:', error)
        return
      }

      const ticketData = (data || []) as TicketType[]
      setTickets(ticketData)

      // Calculate stats
      const allTickets = ticketData
      setStats({
        total: allTickets.length,
        open: allTickets.filter(t => t.status === 'open' || t.status === 'need_response').length,
        in_progress: allTickets.filter(t => t.status === 'in_progress' || t.status === 'waiting_customer' || t.status === 'need_adjustment').length,
        pending: allTickets.filter(t => t.status === 'pending').length,
        resolved: allTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
      })
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTickets()
  }, [statusFilter, priorityFilter, typeFilter, departmentFilter, searchQuery])

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="text-muted-foreground">
            Manage support tickets and rate quote requests
          </p>
        </div>
        <Link href="/tickets/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Ticket
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.open}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-brand" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-brand">{stats.in_progress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{stats.resolved}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by ticket code or subject..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="need_response">Need Response</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="waiting_customer">Waiting Customer</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="RFQ">RFQ</SelectItem>
                <SelectItem value="GEN">General</SelectItem>
              </SelectContent>
            </Select>
            {canViewAll && (
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-[160px]">
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
            )}
            <Button variant="outline" size="icon" onClick={fetchTickets}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tickets Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket Code</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : tickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <Ticket className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No tickets found</p>
                  </TableCell>
                </TableRow>
              ) : (
                tickets.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/tickets/${ticket.id}`)}
                  >
                    <TableCell className="font-mono text-sm">
                      {ticket.ticket_code}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {ticket.subject}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ticket.ticket_type === 'RFQ' ? 'default' : 'secondary'}>
                        {ticket.ticket_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[ticket.status as TicketStatus]?.variant || 'outline'}>
                        {statusVariants[ticket.status as TicketStatus]?.label || ticket.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={priorityVariants[ticket.priority as TicketPriority]?.variant || 'outline'}>
                        {priorityVariants[ticket.priority as TicketPriority]?.label || ticket.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {departmentLabels[ticket.department as TicketingDepartment] || ticket.department}
                    </TableCell>
                    <TableCell>
                      {ticket.account ? (
                        <div className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm truncate max-w-[100px]">
                            {ticket.account.company_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {ticket.assignee ? (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm truncate max-w-[100px]">
                            {ticket.assignee.name}
                          </span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs">Unassigned</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(ticket.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
