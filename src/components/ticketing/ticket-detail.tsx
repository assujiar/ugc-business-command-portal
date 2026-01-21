'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import {
  Ticket,
  ArrowLeft,
  User,
  Building2,
  Clock,
  Calendar,
  MessageSquare,
  Paperclip,
  FileText,
  Send,
  UserPlus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Upload,
  X,
  Download,
  File,
  Trash2,
  DollarSign,
  Timer,
  AlertTriangle,
  TrendingUp,
  Award,
  ThumbsDown,
  ThumbsUp,
  RotateCcw,
  Forward,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import {
  canAssignTickets,
  canTransitionTickets,
  canCloseTickets,
  canCreateInternalComments,
  canViewAllTickets,
  canViewCRMAccounts,
  isOps,
} from '@/lib/permissions'
import type { Database } from '@/types/database'
import type {
  Ticket as TicketType,
  TicketComment,
  TicketEvent,
  TicketStatus,
  TicketPriority,
  TicketingDepartment,
  TicketSLADetails,
} from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface TicketDetailProps {
  ticket: TicketType
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

export function TicketDetail({ ticket: initialTicket, profile }: TicketDetailProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [ticket, setTicket] = useState(initialTicket)
  const [comments, setComments] = useState<TicketComment[]>([])
  const [events, setEvents] = useState<TicketEvent[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [attachments, setAttachments] = useState<any[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [slaDetails, setSlaDetails] = useState<TicketSLADetails | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Quote dialog state
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false)
  const [quoteAmount, setQuoteAmount] = useState('')
  const [quoteCurrency, setQuoteCurrency] = useState('IDR')
  const [quoteTerms, setQuoteTerms] = useState('')

  // Lost dialog state
  const [lostDialogOpen, setLostDialogOpen] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [lostCompetitor, setLostCompetitor] = useState('')
  const [lostCompetitorCost, setLostCompetitorCost] = useState('')

  // Permission checks
  const canAssign = canAssignTickets(profile.role)
  const canTransition = canTransitionTickets(profile.role)
  const canClose = canCloseTickets(profile.role)
  const canInternalComment = canCreateInternalComments(profile.role)
  const canViewAll = canViewAllTickets(profile.role)
  const canViewAccounts = canViewCRMAccounts(profile.role)
  const isOpsUser = isOps(profile.role)

  // Role-based UI
  const isCreator = ticket.created_by === profile.user_id
  const isAssignee = ticket.assigned_to === profile.user_id
  const isOpsOrAdmin = canViewAll

  // Ops users can only see sender info if show_sender_to_ops is true
  const canSeeSenderInfo = !isOpsUser || ticket.show_sender_to_ops

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Fetch SLA details
  const fetchSLADetails = useCallback(async () => {
    try {
      const response = await fetch(`/api/ticketing/tickets/${ticket.id}/sla`)
      const result = await response.json()
      if (result.success && result.data) {
        setSlaDetails(result.data)
      }
    } catch (err) {
      console.error('Error fetching SLA details:', err)
    }
  }, [ticket.id])

  // Fetch comments and events
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch comments
      const { data: commentsData } = await supabase
        .from('ticket_comments')
        .select(`
          *,
          user:profiles!ticket_comments_user_id_fkey(user_id, name, email)
        `)
        .eq('ticket_id', ticket.id)
        .order('created_at', { ascending: true })

      setComments(commentsData || [])

      // Fetch events
      const { data: eventsData } = await supabase
        .from('ticket_events')
        .select(`
          *,
          actor:profiles!ticket_events_actor_user_id_fkey(user_id, name)
        `)
        .eq('ticket_id', ticket.id)
        .order('created_at', { ascending: false })

      setEvents(eventsData || [])

      // Fetch users for assignment
      if (canAssign) {
        const { data: usersData } = await supabase
          .from('profiles')
          .select('*')
          .eq('is_active', true)
          .order('name')

        setUsers(usersData || [])
      }

      // Fetch attachments
      const attachmentsRes = await fetch(`/api/ticketing/tickets/${ticket.id}/attachments`)
      const attachmentsData = await attachmentsRes.json()
      if (attachmentsData.success) {
        setAttachments(attachmentsData.data || [])
      }

      // Fetch SLA details
      await fetchSLADetails()
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }, [ticket.id, canAssign, supabase, fetchSLADetails])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Refresh ticket data
  const refreshTicket = async () => {
    const { data: updatedTicket } = await supabase
      .from('tickets')
      .select(`
        *,
        creator:profiles!tickets_created_by_fkey(user_id, name, email),
        assignee:profiles!tickets_assigned_to_fkey(user_id, name, email),
        account:accounts!tickets_account_id_fkey(account_id, company_name)
      `)
      .eq('id', ticket.id)
      .single()

    if (updatedTicket) {
      setTicket(updatedTicket)
    }
  }

  // Execute ticket action
  const executeAction = async (action: string, data: any = {}) => {
    setActionLoading(action)
    try {
      const response = await fetch(`/api/ticketing/tickets/${ticket.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || `Failed to execute action: ${action}`)
      }

      toast({
        title: 'Success',
        description: getActionSuccessMessage(action),
      })

      await refreshTicket()
      await fetchData()
      return true
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to execute action',
        variant: 'destructive',
      })
      return false
    } finally {
      setActionLoading(null)
    }
  }

  const getActionSuccessMessage = (action: string): string => {
    switch (action) {
      case 'submit_quote': return 'Quote submitted successfully'
      case 'request_adjustment': return 'Adjustment requested'
      case 'quote_sent_to_customer': return 'Marked as sent to customer'
      case 'mark_won': return 'Ticket marked as won!'
      case 'mark_lost': return 'Ticket marked as lost'
      default: return 'Action completed'
    }
  }

  // Upload attachment
  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Maximum file size is 10MB',
        variant: 'destructive',
      })
      return
    }

    setUploadingFile(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/ticketing/tickets/${ticket.id}/attachments`, {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to upload file')
      }

      toast({
        title: 'File uploaded',
        description: 'Attachment added successfully',
      })

      fetchData()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to upload file',
        variant: 'destructive',
      })
    } finally {
      setUploadingFile(false)
      e.target.value = ''
    }
  }

  // Delete attachment
  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      const response = await fetch(`/api/ticketing/tickets/${ticket.id}/attachments?attachment_id=${attachmentId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete attachment')
      }

      toast({
        title: 'Attachment deleted',
        description: 'File removed successfully',
      })

      fetchData()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete attachment',
        variant: 'destructive',
      })
    }
  }

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Add comment
  const handleAddComment = async () => {
    if (!newComment.trim()) return

    setSubmittingComment(true)
    try {
      const response = await fetch(`/api/ticketing/tickets/${ticket.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newComment,
          is_internal: isInternal,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to add comment')
      }

      toast({
        title: 'Comment added',
        description: isInternal ? 'Internal note added successfully' : 'Comment added successfully',
      })

      setNewComment('')
      setIsInternal(false)
      await refreshTicket()
      fetchData()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to add comment',
        variant: 'destructive',
      })
    } finally {
      setSubmittingComment(false)
    }
  }

  // Assign ticket
  const handleAssign = async (assignedTo: string) => {
    try {
      const response = await fetch(`/api/ticketing/tickets/${ticket.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: assignedTo }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to assign ticket')
      }

      toast({
        title: 'Ticket assigned',
        description: 'Ticket has been assigned successfully',
      })

      await refreshTicket()
      fetchData()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to assign ticket',
        variant: 'destructive',
      })
    }
  }

  // Transition ticket status
  const handleTransition = async (newStatus: TicketStatus, notes?: string) => {
    try {
      const response = await fetch(`/api/ticketing/tickets/${ticket.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_status: newStatus, notes }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update status')
      }

      toast({
        title: 'Status updated',
        description: `Ticket status changed to ${statusVariants[newStatus]?.label || newStatus}`,
      })

      await refreshTicket()
      fetchData()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update status',
        variant: 'destructive',
      })
    }
  }

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

  // Format duration from seconds
  const formatDuration = (seconds: number | null | undefined): string => {
    if (seconds === null || seconds === undefined) return 'N/A'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    let result = ''
    if (days > 0) result += `${days}d `
    if (hours > 0 || days > 0) result += `${hours}h `
    result += `${minutes}m`
    return result.trim()
  }

  // Get first response time from exchanges or metrics
  const getFirstResponseFormatted = (): string => {
    // First try metrics
    if (slaDetails?.metrics?.assignee?.first_response_formatted) {
      return slaDetails.metrics.assignee.first_response_formatted
    }
    // Fallback to exchanges - find first assignee response
    const firstAssigneeExchange = slaDetails?.exchanges?.find(
      (ex) => ex.responder_type === 'assignee' && ex.exchange_number === 1
    )
    if (firstAssigneeExchange?.business_response_seconds) {
      return formatDuration(firstAssigneeExchange.business_response_seconds)
    }
    return 'N/A'
  }

  // Get available status transitions
  const getAvailableTransitions = (): TicketStatus[] => {
    const currentStatus = ticket.status as TicketStatus
    const transitions: Record<TicketStatus, TicketStatus[]> = {
      open: ['in_progress', 'pending', 'closed'],
      need_response: ['in_progress', 'waiting_customer', 'resolved', 'closed'],
      in_progress: ['need_response', 'waiting_customer', 'need_adjustment', 'pending', 'resolved', 'closed'],
      waiting_customer: ['in_progress', 'need_adjustment', 'resolved', 'closed'],
      need_adjustment: ['in_progress', 'resolved', 'closed'],
      pending: ['open', 'in_progress', 'resolved', 'closed'],
      resolved: ['closed', 'in_progress'],
      closed: ['open'],
    }
    return transitions[currentStatus] || []
  }

  // Handle submit quote
  const handleSubmitQuote = async () => {
    const amount = parseFloat(quoteAmount)
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid amount',
        variant: 'destructive',
      })
      return
    }

    const success = await executeAction('submit_quote', {
      amount,
      currency: quoteCurrency,
      terms: quoteTerms || null,
    })

    if (success) {
      setQuoteDialogOpen(false)
      setQuoteAmount('')
      setQuoteTerms('')
    }
  }

  // Handle mark lost
  const handleMarkLost = async () => {
    const success = await executeAction('mark_lost', {
      reason: lostReason || null,
      competitor_name: lostCompetitor || null,
      competitor_cost: lostCompetitorCost ? parseFloat(lostCompetitorCost) : null,
    })

    if (success) {
      setLostDialogOpen(false)
      setLostReason('')
      setLostCompetitor('')
      setLostCompetitorCost('')
    }
  }

  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight font-mono">
              {ticket.ticket_code}
            </h1>
            <Badge variant={ticket.ticket_type === 'RFQ' ? 'default' : 'secondary'}>
              {ticket.ticket_type}
            </Badge>
            <Badge variant={statusVariants[ticket.status as TicketStatus]?.variant || 'outline'}>
              {statusVariants[ticket.status as TicketStatus]?.label || ticket.status}
            </Badge>
            <Badge variant={priorityVariants[ticket.priority as TicketPriority]?.variant || 'outline'}>
              {priorityVariants[ticket.priority as TicketPriority]?.label || ticket.priority}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">{ticket.subject}</p>
        </div>
      </div>

      {/* SLA Tracking Card */}
      {slaDetails && (
        <Card className={slaDetails.sla?.is_breached ? 'border-destructive' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Timer className="h-4 w-4" />
              SLA Tracking
              {slaDetails.sla?.is_breached && (
                <Badge variant="destructive" className="ml-2">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Overdue
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Status */}
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <div className="flex items-center gap-2 mt-1">
                  {slaDetails.sla?.is_breached ? (
                    <Badge variant="destructive">Overdue</Badge>
                  ) : slaDetails.sla?.first_response_met === true ? (
                    <Badge variant="outline" className="border-green-500 text-green-600">On Track</Badge>
                  ) : (
                    <Badge variant="secondary">Awaiting...</Badge>
                  )}
                </div>
              </div>

              {/* Ticket Age */}
              <div>
                <p className="text-sm font-medium text-muted-foreground">Ticket Age</p>
                <p className="text-lg font-semibold mt-1">{slaDetails.age?.formatted || 'N/A'}</p>
              </div>

              {/* First Response */}
              <div>
                <p className="text-sm font-medium text-muted-foreground">First Response</p>
                {slaDetails.sla?.first_response_at ? (
                  <p className="text-sm mt-1">
                    {getFirstResponseFormatted()}
                    {slaDetails.sla?.first_response_met !== null && (
                      <span className={slaDetails.sla.first_response_met ? 'text-green-600 ml-1' : 'text-red-600 ml-1'}>
                        ({slaDetails.sla.first_response_met ? 'Met' : 'Missed'})
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">Awaiting...</p>
                )}
              </div>

              {/* Timeline */}
              <div>
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <p className="text-sm mt-1">{formatDate(ticket.created_at)}</p>
              </div>
            </div>

            {/* Response Metrics */}
            {slaDetails.metrics && (
              <>
                <Separator className="my-4" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Creator Avg Response</p>
                    <p className="text-sm font-medium">{slaDetails.metrics.creator?.avg_formatted || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Dept Avg Response</p>
                    <p className="text-sm font-medium">{slaDetails.metrics.assignee?.avg_formatted || 'N/A'}</p>
                  </div>
                  {ticket.ticket_type === 'RFQ' && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Time to Quote</p>
                      <p className="text-sm font-medium">{slaDetails.metrics.quote?.time_to_first_quote_formatted || 'N/A'}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Resolution Time</p>
                    <p className="text-sm font-medium">{slaDetails.metrics.resolution?.time_to_resolution_formatted || 'N/A'}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">
                {ticket.description || 'No description provided'}
              </p>
            </CardContent>
          </Card>

          {/* RFQ Data (if applicable) */}
          {ticket.ticket_type === 'RFQ' && ticket.rfq_data && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  RFQ Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Service Information */}
                <div>
                  <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Service Information</h4>
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Service Type</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.service_type || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Service Code</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.service_type_code || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Department</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.department || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Fleet Type</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.fleet_type || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Fleet Quantity</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.fleet_quantity ?? '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Incoterm</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.incoterm || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* Cargo Information */}
                <div>
                  <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Cargo Information</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Cargo Category</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.cargo_category || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Cargo Description</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.cargo_description || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* Origin & Destination */}
                <div>
                  <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Origin & Destination</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="p-3 border rounded-md bg-muted/30">
                      <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Origin</p>
                      <div className="space-y-1 text-sm">
                        <p><span className="text-muted-foreground">Address:</span> {(ticket.rfq_data as any)?.origin_address || '-'}</p>
                        <p><span className="text-muted-foreground">City:</span> {(ticket.rfq_data as any)?.origin_city || '-'}</p>
                        <p><span className="text-muted-foreground">Country:</span> {(ticket.rfq_data as any)?.origin_country || '-'}</p>
                      </div>
                    </div>
                    <div className="p-3 border rounded-md bg-muted/30">
                      <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Destination</p>
                      <div className="space-y-1 text-sm">
                        <p><span className="text-muted-foreground">Address:</span> {(ticket.rfq_data as any)?.destination_address || '-'}</p>
                        <p><span className="text-muted-foreground">City:</span> {(ticket.rfq_data as any)?.destination_city || '-'}</p>
                        <p><span className="text-muted-foreground">Country:</span> {(ticket.rfq_data as any)?.destination_country || '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quantity & Dimensions */}
                <div>
                  <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Quantity & Dimensions</h4>
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Quantity</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.quantity ?? '-'} {(ticket.rfq_data as any)?.unit_of_measure || ''}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Weight/Unit (Kg)</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.weight_per_unit_kg ?? '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Total Weight (Kg)</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.weight_total_kg ?? '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Total Volume (CBM)</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.volume_total_cbm ?? (ticket.rfq_data as any)?.total_volume ?? '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Length (cm)</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.length_cm ?? '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Width (cm)</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.width_cm ?? '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Height (cm)</p>
                      <p className="text-sm">{(ticket.rfq_data as any)?.height_cm ?? '-'}</p>
                    </div>
                  </div>
                </div>

                {/* Scope of Work */}
                <div>
                  <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Scope of Work</h4>
                  <p className="text-sm p-3 border rounded-md bg-muted/30 whitespace-pre-wrap">
                    {(ticket.rfq_data as any)?.scope_of_work || '-'}
                  </p>
                </div>

                {/* Additional Services */}
                <div>
                  <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Additional Services</h4>
                  {(ticket.rfq_data as any)?.additional_services && (ticket.rfq_data as any).additional_services.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {((ticket.rfq_data as any).additional_services as string[]).map((service: string) => (
                        <span key={service} className="px-2 py-1 text-xs rounded-full bg-brand/10 text-brand">
                          {service}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">-</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Attachments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Attachments ({attachments.length})
                </div>
                {!isClosed && (
                  <label htmlFor="file-upload">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={uploadingFile}
                      asChild
                    >
                      <span>
                        {uploadingFile ? (
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        Attach Files
                      </span>
                    </Button>
                  </label>
                )}
                <input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  onChange={handleUploadAttachment}
                  disabled={uploadingFile}
                />
              </CardTitle>
              <p className="text-xs text-muted-foreground">Max 10MB per file. Allowed: PDF, DOC, XLS, JPG, PNG</p>
            </CardHeader>
            <CardContent>
              {attachments.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No attachments yet
                </p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <File className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{attachment.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(attachment.file_size)} • {formatDate(attachment.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                        >
                          <a href={attachment.file_url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        {!isClosed && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteAttachment(attachment.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions Card - Role Based */}
          {!isClosed && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Actions
                </CardTitle>
                <p className="text-sm text-muted-foreground">Respond or update ticket status</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Comment Form */}
                <div className="space-y-3">
                  <Label htmlFor="ticket-comment">Add Comment</Label>
                  <Textarea
                    id="ticket-comment"
                    name="ticket-comment"
                    placeholder="Write your message..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={3}
                  />
                  {canInternalComment && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="internal"
                        checked={isInternal}
                        onCheckedChange={(checked) => setIsInternal(checked as boolean)}
                      />
                      <Label htmlFor="internal" className="text-sm">
                        Internal note (not visible to creator)
                      </Label>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  {/* Send Comment Button - Always visible */}
                  <Button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || submittingComment}
                    className="w-full"
                    variant="secondary"
                  >
                    {submittingComment ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send Comment
                  </Button>

                  {/* Creator Actions */}
                  {isCreator && ticket.ticket_type === 'RFQ' && (
                    <>
                      {/* Request Adjustment - when waiting for creator response */}
                      {(ticket.status === 'waiting_customer' || ticket.status === 'in_progress') && (
                        <Button
                          onClick={() => executeAction('request_adjustment')}
                          disabled={actionLoading === 'request_adjustment'}
                          className="w-full"
                          variant="outline"
                        >
                          {actionLoading === 'request_adjustment' ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="mr-2 h-4 w-4" />
                          )}
                          Request Adjustment / Nego Harga
                        </Button>
                      )}

                      {/* Quote Sent to Customer */}
                      {ticket.status === 'waiting_customer' && (
                        <Button
                          onClick={() => executeAction('quote_sent_to_customer')}
                          disabled={actionLoading === 'quote_sent_to_customer'}
                          className="w-full"
                          variant="outline"
                        >
                          {actionLoading === 'quote_sent_to_customer' ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Forward className="mr-2 h-4 w-4" />
                          )}
                          Quote Sent to Customer
                        </Button>
                      )}

                      {/* Won/Lost Buttons */}
                      {(ticket.status === 'pending' || ticket.status === 'waiting_customer') && (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            onClick={() => executeAction('mark_won')}
                            disabled={actionLoading === 'mark_won'}
                            className="w-full bg-green-600 hover:bg-green-700"
                          >
                            {actionLoading === 'mark_won' ? (
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <ThumbsUp className="mr-2 h-4 w-4" />
                            )}
                            Won
                          </Button>

                          <Dialog open={lostDialogOpen} onOpenChange={setLostDialogOpen}>
                            <DialogTrigger asChild>
                              <Button
                                variant="destructive"
                                className="w-full"
                              >
                                <ThumbsDown className="mr-2 h-4 w-4" />
                                Lost
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Mark as Lost</DialogTitle>
                                <DialogDescription>
                                  Please provide details about why this ticket was lost.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <Label htmlFor="lost-reason">Reason</Label>
                                  <Textarea
                                    id="lost-reason"
                                    name="lost-reason"
                                    placeholder="Why was this lost?"
                                    value={lostReason}
                                    onChange={(e) => setLostReason(e.target.value)}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="lost-competitor">Competitor Name (optional)</Label>
                                  <Input
                                    id="lost-competitor"
                                    name="lost-competitor"
                                    placeholder="Who won the deal?"
                                    value={lostCompetitor}
                                    onChange={(e) => setLostCompetitor(e.target.value)}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="lost-competitor-cost">Competitor Cost (optional)</Label>
                                  <Input
                                    id="lost-competitor-cost"
                                    name="lost-competitor-cost"
                                    type="number"
                                    placeholder="Competitor's price"
                                    value={lostCompetitorCost}
                                    onChange={(e) => setLostCompetitorCost(e.target.value)}
                                  />
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setLostDialogOpen(false)}>
                                  Cancel
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={handleMarkLost}
                                  disabled={actionLoading === 'mark_lost'}
                                >
                                  {actionLoading === 'mark_lost' ? (
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                  ) : null}
                                  Confirm Lost
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      )}
                    </>
                  )}

                  {/* Assignee/Ops Actions */}
                  {(isAssignee || isOpsOrAdmin) && ticket.ticket_type === 'RFQ' && !isCreator && (
                    <>
                      {/* Submit Quote Button */}
                      {(ticket.status === 'open' || ticket.status === 'in_progress' || ticket.status === 'need_adjustment') && (
                        <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
                          <DialogTrigger asChild>
                            <Button className="w-full bg-green-600 hover:bg-green-700">
                              <DollarSign className="mr-2 h-4 w-4" />
                              Submit Quote
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Submit Quote</DialogTitle>
                              <DialogDescription>
                                Enter the quote details to send to the customer.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="quote-amount">Amount *</Label>
                                <Input
                                  id="quote-amount"
                                  name="quote-amount"
                                  type="number"
                                  placeholder="Enter amount"
                                  value={quoteAmount}
                                  onChange={(e) => setQuoteAmount(e.target.value)}
                                />
                              </div>
                              <div>
                                <Label htmlFor="quote-currency">Currency</Label>
                                <Select value={quoteCurrency} onValueChange={setQuoteCurrency}>
                                  <SelectTrigger id="quote-currency">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="IDR">IDR</SelectItem>
                                    <SelectItem value="USD">USD</SelectItem>
                                    <SelectItem value="SGD">SGD</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label htmlFor="quote-terms">Terms & Conditions (optional)</Label>
                                <Textarea
                                  id="quote-terms"
                                  name="quote-terms"
                                  placeholder="Enter any terms or conditions"
                                  value={quoteTerms}
                                  onChange={(e) => setQuoteTerms(e.target.value)}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setQuoteDialogOpen(false)}>
                                Cancel
                              </Button>
                              <Button
                                onClick={handleSubmitQuote}
                                disabled={actionLoading === 'submit_quote' || !quoteAmount}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                {actionLoading === 'submit_quote' ? (
                                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                Submit Quote
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </>
                  )}
                </div>

                {/* Status indicator */}
                {ticket.pending_response_from && (
                  <div className="text-center pt-2">
                    <Badge variant={ticket.pending_response_from === 'creator' ? 'secondary' : 'default'}>
                      Waiting for {ticket.pending_response_from === 'creator' ? 'Creator' : 'Department'} response
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Comments ({comments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {comments.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No comments yet
                </p>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`rounded-lg p-4 ${
                        comment.is_internal
                          ? 'bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800'
                          : comment.user_id === ticket.created_by
                            ? 'bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800'
                            : 'bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">
                            {comment.user?.name || 'Unknown'}
                          </span>
                          {comment.is_internal && (
                            <Badge variant="outline" className="text-xs">
                              Internal
                            </Badge>
                          )}
                          {comment.user_id === ticket.created_by && (
                            <Badge variant="outline" className="text-xs border-blue-300">
                              Creator
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(comment.created_at)}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Department</p>
                <p>{departmentLabels[ticket.department as TicketingDepartment] || ticket.department}</p>
              </div>
              {/* Account - hidden for Ops if show_sender_to_ops is false */}
              {canSeeSenderInfo && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Account</p>
                  {ticket.account ? (
                    canViewAccounts ? (
                      <Link
                        href={`/accounts/${ticket.account.account_id}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-brand">{ticket.account.company_name}</span>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span>{ticket.account.company_name}</span>
                      </div>
                    )
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
              )}
              {/* Sender Info - hidden for Ops if show_sender_to_ops is false */}
              {canSeeSenderInfo && (ticket.sender_name || ticket.sender_email || ticket.sender_phone) && (
                <div className="sm:col-span-2 p-3 border rounded-lg bg-muted/30">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Sender Information</p>
                  <div className="grid gap-2 sm:grid-cols-3 text-sm">
                    {ticket.sender_name && (
                      <div>
                        <span className="text-muted-foreground">Name: </span>
                        <span>{ticket.sender_name}</span>
                      </div>
                    )}
                    {ticket.sender_email && (
                      <div>
                        <span className="text-muted-foreground">Email: </span>
                        <span>{ticket.sender_email}</span>
                      </div>
                    )}
                    {ticket.sender_phone && (
                      <div>
                        <span className="text-muted-foreground">Phone: </span>
                        <span>{ticket.sender_phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-muted-foreground">Created By</p>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{ticket.creator?.name || 'Unknown'}</span>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Assigned To</p>
                {ticket.assignee ? (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{ticket.assignee.name}</span>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Unassigned</p>
                )}
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{formatDate(ticket.created_at)}</span>
                </div>
              </div>
              {ticket.first_response_at && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">First Response</p>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{formatDate(ticket.first_response_at)}</span>
                  </div>
                </div>
              )}
              {ticket.resolved_at && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Resolved</p>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-sm">{formatDate(ticket.resolved_at)}</span>
                  </div>
                </div>
              )}
              {ticket.close_outcome && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Outcome</p>
                  <Badge variant={ticket.close_outcome === 'won' ? 'default' : 'destructive'}>
                    {ticket.close_outcome === 'won' ? (
                      <><Award className="h-3 w-3 mr-1" /> Won</>
                    ) : (
                      <><XCircle className="h-3 w-3 mr-1" /> Lost</>
                    )}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Admin Actions Card - only for Admin */}
          {(canAssign || canTransition) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Admin Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Assign */}
                {canAssign && (
                  <div className="space-y-2">
                    <Label htmlFor="assign-to">Assign To</Label>
                    <Select
                      value={ticket.assigned_to || ''}
                      onValueChange={handleAssign}
                    >
                      <SelectTrigger id="assign-to">
                        <SelectValue placeholder="Select assignee" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.user_id} value={user.user_id}>
                            {user.name} ({user.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Status Transition */}
                {canTransition && getAvailableTransitions().length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="change-status">Change Status</Label>
                    <Select
                      value=""
                      onValueChange={(value) => handleTransition(value as TicketStatus)}
                    >
                      <SelectTrigger id="change-status">
                        <SelectValue placeholder="Select new status" />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableTransitions().map((status) => (
                          <SelectItem key={status} value={status}>
                            {statusVariants[status]?.label || status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No activity yet
                </p>
              ) : (
                <div className="space-y-4">
                  {events.slice(0, 10).map((event) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex-shrink-0 mt-1">
                        <div className="h-2 w-2 rounded-full bg-brand" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{event.actor?.name || 'System'}</span>
                          {' '}
                          <span className="text-muted-foreground">
                            {event.event_type.replace(/_/g, ' ')}
                          </span>
                        </p>
                        {event.notes && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {event.notes}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(event.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
