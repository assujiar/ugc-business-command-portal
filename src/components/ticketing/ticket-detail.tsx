'use client'

import { useState, useEffect } from 'react'
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
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
} from '@/lib/permissions'
import type { Database } from '@/types/database'
import type {
  Ticket as TicketType,
  TicketComment,
  TicketEvent,
  TicketStatus,
  TicketPriority,
  TicketingDepartment,
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

  // Permission checks
  const canAssign = canAssignTickets(profile.role)
  const canTransition = canTransitionTickets(profile.role)
  const canClose = canCloseTickets(profile.role)
  const canInternalComment = canCreateInternalComments(profile.role)

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Fetch comments and events
  const fetchData = async () => {
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
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [ticket.id])

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

      // Refresh ticket data
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

      // Refresh ticket data
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
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Service Type</p>
                    <p>{(ticket.rfq_data as { service_type?: string })?.service_type || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Cargo Category</p>
                    <p>{(ticket.rfq_data as { cargo_category?: string })?.cargo_category || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Origin</p>
                    <p>{(ticket.rfq_data as { origin_city?: string })?.origin_city || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Destination</p>
                    <p>{(ticket.rfq_data as { destination_city?: string })?.destination_city || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Quantity</p>
                    <p>
                      {(ticket.rfq_data as { quantity?: number })?.quantity || '—'}{' '}
                      {(ticket.rfq_data as { unit_of_measure?: string })?.unit_of_measure || ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Volume</p>
                    <p>{(ticket.rfq_data as { total_volume?: number })?.total_volume || '—'} CBM</p>
                  </div>
                </div>
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
              {/* Comment List */}
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

              <Separator />

              {/* Add Comment Form */}
              <div className="space-y-3">
                <Textarea
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={3}
                />
                <div className="flex items-center justify-between">
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
                  <Button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || submittingComment}
                  >
                    {submittingComment ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send
                  </Button>
                </div>
              </div>
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
              <div>
                <p className="text-sm font-medium text-muted-foreground">Account</p>
                {ticket.account ? (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <Link
                      href={`/accounts/${ticket.account.account_id}`}
                      className="text-brand hover:underline"
                    >
                      {ticket.account.company_name}
                    </Link>
                  </div>
                ) : (
                  <p className="text-muted-foreground">—</p>
                )}
              </div>
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
            </CardContent>
          </Card>

          {/* Actions Card */}
          {(canAssign || canTransition) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Assign */}
                {canAssign && (
                  <div className="space-y-2">
                    <Label>Assign To</Label>
                    <Select
                      value={ticket.assigned_to || ''}
                      onValueChange={handleAssign}
                    >
                      <SelectTrigger>
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
                    <Label>Change Status</Label>
                    <Select
                      value=""
                      onValueChange={(value) => handleTransition(value as TicketStatus)}
                    >
                      <SelectTrigger>
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
