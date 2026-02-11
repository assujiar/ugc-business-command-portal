'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileText,
  Search,
  RefreshCw,
  Building2,
  Calendar,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Eye,
  MessageSquare,
  Mail,
  ExternalLink,
  Plus,
  Ticket,
  ChevronDown,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { canViewAllTickets } from '@/lib/permissions'
import { CustomerQuotationDialog } from './customer-quotation-dialog'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface CustomerQuotationsDashboardProps {
  profile: Profile
}

// Status badge variants
const statusVariants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; icon: React.ReactNode }> = {
  draft: { variant: 'outline', label: 'Draft', icon: <FileText className="h-3 w-3" /> },
  sent: { variant: 'default', label: 'Sent', icon: <Send className="h-3 w-3" /> },
  viewed: { variant: 'secondary', label: 'Viewed', icon: <Eye className="h-3 w-3" /> },
  accepted: { variant: 'secondary', label: 'Accepted', icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { variant: 'destructive', label: 'Rejected', icon: <XCircle className="h-3 w-3" /> },
  expired: { variant: 'destructive', label: 'Expired', icon: <Clock className="h-3 w-3" /> },
  revoked: { variant: 'destructive', label: 'Revoked', icon: <XCircle className="h-3 w-3" /> },
}

// Format currency
const formatCurrency = (amount: number, currency: string = 'IDR') => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function CustomerQuotationsDashboard({ profile }: CustomerQuotationsDashboardProps) {
  const router = useRouter()
  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    sent: 0,
    accepted: 0,
    rejected: 0,
    total_value: 0,
  })

  // Ticket selection for new quotation
  const [ticketSelectDialogOpen, setTicketSelectDialogOpen] = useState(false)
  const [rfqTickets, setRfqTickets] = useState<any[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [ticketSearchQuery, setTicketSearchQuery] = useState('')
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const [quotationDialogOpen, setQuotationDialogOpen] = useState(false)

  const canViewAll = canViewAllTickets(profile.role)

  // Fetch RFQ tickets for selection (only those with operational costs)
  const fetchRfqTickets = async () => {
    setLoadingTickets(true)
    try {
      const params = new URLSearchParams()
      params.append('ticket_type', 'RFQ')
      params.append('status', 'need_response,in_progress,waiting_customer,need_adjustment,pending')
      if (ticketSearchQuery) params.append('search', ticketSearchQuery)
      params.append('limit', '50')

      const response = await fetch(`/api/ticketing/tickets?${params.toString()}`)
      const result = await response.json()

      if (result.success) {
        // Filter tickets that have operational costs
        const ticketsWithCosts = await Promise.all(
          (result.data || []).map(async (ticket: any) => {
            const costsRes = await fetch(`/api/ticketing/tickets/${ticket.id}/quotes`)
            const costsData = await costsRes.json()
            return {
              ...ticket,
              hasCosts: costsData.success && costsData.data && costsData.data.length > 0,
              costCount: costsData.data?.length || 0,
            }
          })
        )
        setRfqTickets(ticketsWithCosts.filter((t: any) => t.hasCosts))
      }
    } catch (err) {
      console.error('Error fetching RFQ tickets:', err)
    } finally {
      setLoadingTickets(false)
    }
  }

  // Create standalone quotation (no source)
  const handleCreateStandalone = () => {
    setSelectedTicket(null)
    setQuotationDialogOpen(true)
  }

  // Open ticket selection dialog
  const handleCreateFromTicket = () => {
    setTicketSelectDialogOpen(true)
    fetchRfqTickets()
  }

  // Select ticket and open quotation dialog
  const handleSelectTicket = (ticket: any) => {
    setSelectedTicket(ticket)
    setTicketSelectDialogOpen(false)
    setQuotationDialogOpen(true)
  }

  // Handle quotation created
  const handleQuotationCreated = () => {
    setQuotationDialogOpen(false)
    setSelectedTicket(null)
    fetchQuotations()
  }

  // Fetch customer quotations
  const fetchQuotations = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (searchQuery) params.append('search', searchQuery)
      params.append('limit', '100')

      const response = await fetch(`/api/ticketing/customer-quotations?${params.toString()}`)
      const result = await response.json()

      if (result.success) {
        setQuotations(result.data || [])
        setTotal(result.total || 0)

        // Calculate stats from all data
        const allQuotations = result.data || []
        setStats({
          total: allQuotations.length,
          draft: allQuotations.filter((q: any) => q.status === 'draft').length,
          sent: allQuotations.filter((q: any) => q.status === 'sent' || q.status === 'viewed').length,
          accepted: allQuotations.filter((q: any) => q.status === 'accepted').length,
          rejected: allQuotations.filter((q: any) => q.status === 'rejected' || q.status === 'expired' || q.status === 'revoked').length,
          total_value: allQuotations
            .filter((q: any) => q.status === 'accepted')
            .reduce((sum: number, q: any) => sum + (q.total_selling_rate || 0), 0),
        })
      }
    } catch (err) {
      console.error('Error fetching customer quotations:', err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, searchQuery])

  useEffect(() => {
    fetchQuotations()
  }, [fetchQuotations])

  // Format date
  const formatDate = (dateString: string) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  // Check if quotation is expired
  const isExpired = (validUntil: string) => {
    if (!validUntil) return false
    return new Date(validUntil) < new Date()
  }

  // Get sent via icon
  const getSentViaIcon = (sentVia: string) => {
    switch (sentVia) {
      case 'whatsapp':
        return <MessageSquare className="h-3 w-3 text-green-500" />
      case 'email':
        return <Mail className="h-3 w-3 text-blue-500" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customer Quotations</h1>
          <p className="text-muted-foreground">
            Manage customer quotations sent from RFQ tickets
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Quotation
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCreateStandalone}>
              <FileText className="h-4 w-4 mr-2" />
              Create New
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCreateFromTicket}>
              <Ticket className="h-4 w-4 mr-2" />
              Create from Ticket
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Quotations</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Draft</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.draft}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <Send className="h-4 w-4 text-brand" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-brand">{stats.sent}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accepted</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{stats.accepted}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(stats.total_value)}</div>
            <p className="text-xs text-muted-foreground">Accepted quotations</p>
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
                  placeholder="Search by quotation number or customer..."
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
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="viewed">Viewed</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchQuotations}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Customer Quotations Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quotation Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Ticket</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent Via</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Response</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : quotations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No customer quotations found</p>
                  </TableCell>
                </TableRow>
              ) : (
                quotations.map((quotation) => (
                  <TableRow
                    key={quotation.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/customer-quotations/${quotation.id}`)}
                  >
                    <TableCell className="font-mono text-sm font-medium">
                      {quotation.quotation_number}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium truncate max-w-[150px]">
                          {quotation.customer_name}
                        </span>
                        {quotation.customer_company && (
                          <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                            {quotation.customer_company}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {quotation.ticket ? (
                        <Link
                          href={`/tickets/${quotation.ticket.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-brand hover:underline"
                        >
                          {quotation.ticket.ticket_code}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(quotation.total_selling_rate, quotation.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={statusVariants[quotation.status]?.variant || 'outline'}
                        className="gap-1"
                      >
                        {statusVariants[quotation.status]?.icon}
                        {statusVariants[quotation.status]?.label || quotation.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {quotation.sent_via ? (
                        <div className="flex items-center gap-1">
                          {getSentViaIcon(quotation.sent_via)}
                          <span className="text-sm capitalize">{quotation.sent_via}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className={`text-sm ${isExpired(quotation.valid_until) && quotation.status !== 'accepted' ? 'text-destructive' : ''}`}>
                          {formatDate(quotation.valid_until)}
                        </span>
                        {isExpired(quotation.valid_until) && quotation.status !== 'accepted' && (
                          <Badge variant="destructive" className="text-xs ml-1">Expired</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(quotation.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {quotation.status === 'accepted' && quotation.accepted_at ? (
                        <span className="text-green-700">{formatDate(quotation.accepted_at)}</span>
                      ) : quotation.status === 'rejected' && quotation.rejected_at ? (
                        <span className="text-destructive">{formatDate(quotation.rejected_at)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Ticket Selection Dialog */}
      <Dialog open={ticketSelectDialogOpen} onOpenChange={setTicketSelectDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select RFQ Ticket</DialogTitle>
            <DialogDescription>
              Choose an RFQ ticket to create a customer quotation. Only tickets with operational costs are shown.
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by ticket code or subject..."
              value={ticketSearchQuery}
              onChange={(e) => {
                setTicketSearchQuery(e.target.value)
                fetchRfqTickets()
              }}
              className="pl-10"
            />
          </div>

          {/* Ticket List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {loadingTickets ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rfqTickets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Ticket className="h-8 w-8 mx-auto mb-2" />
                <p>No RFQ tickets with operational costs found</p>
                <p className="text-sm">Create operational costs first from the ticket detail page</p>
              </div>
            ) : (
              rfqTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => handleSelectTicket(ticket)}
                  className="p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-medium">{ticket.ticket_code}</span>
                    <Badge variant="secondary">{ticket.costCount} cost(s)</Badge>
                  </div>
                  <p className="text-sm font-medium truncate">{ticket.subject}</p>
                  {ticket.account && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Building2 className="h-3 w-3" />
                      {ticket.account.company_name}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTicketSelectDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Quotation Dialog - supports both ticket-linked and standalone */}
      <CustomerQuotationDialog
        ticket={selectedTicket || undefined}
        open={quotationDialogOpen}
        onOpenChange={(open) => {
          setQuotationDialogOpen(open)
          if (!open) setSelectedTicket(null)
        }}
        onCreated={handleQuotationCreated}
      />
    </div>
  )
}
