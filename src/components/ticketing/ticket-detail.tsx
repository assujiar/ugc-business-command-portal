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
  Bell,
  Plus,
  Package,
} from 'lucide-react'
import { ShipmentDetail, formatShipmentRoute } from '@/types/shipment'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { CustomerQuotationDialog } from '@/components/ticketing/customer-quotation-dialog'
import { MultiShipmentCostDialog } from '@/components/ticketing/multi-shipment-cost-dialog'
import { RATE_COMPONENTS_BY_CATEGORY, getRateComponentLabel } from '@/lib/constants/rate-components'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { SelectGroup, SelectLabel } from '@/components/ui/select'
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
  need_response: { variant: 'destructive', label: 'Need Your Response' },
  in_progress: { variant: 'default', label: 'In Progress' },
  waiting_customer: { variant: 'secondary', label: 'Waiting Customer Response' },
  need_adjustment: { variant: 'secondary', label: 'Requesting Rate Adjustment' },
  pending: { variant: 'outline', label: 'Sent to Customer' },
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

// Lost reason options
const lostReasonOptions = [
  { value: 'price_too_high', label: 'Tarif terlalu mahal', requiresCompetitor: true },
  { value: 'competitor_cheaper', label: 'Kompetitor lebih murah', requiresCompetitor: true },
  { value: 'budget_not_fit', label: 'Budget customer tidak masuk', requiresCompetitor: true },
  { value: 'service_not_fit', label: 'Layanan tidak sesuai kebutuhan customer', requiresCompetitor: false },
  { value: 'timeline_not_match', label: 'Timeline tidak cocok', requiresCompetitor: false },
  { value: 'chose_another_vendor', label: 'Customer pilih vendor lain', requiresCompetitor: true },
  { value: 'project_cancelled', label: 'Proyek dibatalkan', requiresCompetitor: false },
  { value: 'no_response', label: 'Tidak ada respons dari customer', requiresCompetitor: false },
  { value: 'scope_changed', label: 'Scope of work berubah', requiresCompetitor: false },
  { value: 'internal_decision', label: 'Keputusan internal customer', requiresCompetitor: false },
  { value: 'other', label: 'Lainnya', requiresCompetitor: false },
]

// Check if lost reason requires competitor info
const isCompetitorRequired = (reason: string): boolean => {
  const option = lostReasonOptions.find(o => o.value === reason)
  return option?.requiresCompetitor || false
}

// Shipment Details Display Component (for multi-shipment support)
function ShipmentDetailsDisplay({ shipment }: { shipment: Partial<ShipmentDetail> }) {
  return (
    <>
      {/* Service Information */}
      <div>
        <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Service Information</h4>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Service Code</p>
            <p className="text-sm">{shipment.service_type_code || '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Department</p>
            <p className="text-sm">{shipment.department || '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Fleet Type</p>
            <p className="text-sm">{shipment.fleet_type || '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Fleet Quantity</p>
            <p className="text-sm">{shipment.fleet_quantity ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Incoterm</p>
            <p className="text-sm">{shipment.incoterm || '-'}</p>
          </div>
        </div>
      </div>

      {/* Cargo Information */}
      <div>
        <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Cargo Information</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Cargo Category</p>
            <p className="text-sm">{shipment.cargo_category || '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Cargo Description</p>
            <p className="text-sm">{shipment.cargo_description || '-'}</p>
          </div>
        </div>
      </div>

      {/* Origin & Destination */}
      <div>
        <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Origin & Destination</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="p-3 border rounded-md bg-emerald-500/5">
            <p className="text-xs font-medium text-emerald-600 uppercase mb-2">Origin</p>
            <div className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Address:</span> {shipment.origin_address || '-'}</p>
              <p><span className="text-muted-foreground">City:</span> {shipment.origin_city || '-'}</p>
              <p><span className="text-muted-foreground">Country:</span> {shipment.origin_country || '-'}</p>
            </div>
          </div>
          <div className="p-3 border rounded-md bg-rose-500/5">
            <p className="text-xs font-medium text-rose-600 uppercase mb-2">Destination</p>
            <div className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Address:</span> {shipment.destination_address || '-'}</p>
              <p><span className="text-muted-foreground">City:</span> {shipment.destination_city || '-'}</p>
              <p><span className="text-muted-foreground">Country:</span> {shipment.destination_country || '-'}</p>
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
            <p className="text-sm">{shipment.quantity ?? '-'} {shipment.unit_of_measure || ''}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Weight/Unit (Kg)</p>
            <p className="text-sm">{shipment.weight_per_unit_kg ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total Weight (Kg)</p>
            <p className="text-sm">{shipment.weight_total_kg ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total Volume (CBM)</p>
            <p className="text-sm">{shipment.volume_total_cbm ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Length (cm)</p>
            <p className="text-sm">{shipment.length_cm ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Width (cm)</p>
            <p className="text-sm">{shipment.width_cm ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Height (cm)</p>
            <p className="text-sm">{shipment.height_cm ?? '-'}</p>
          </div>
        </div>
      </div>

      {/* Scope of Work */}
      {shipment.scope_of_work && (
        <div>
          <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Scope of Work</h4>
          <p className="text-sm p-3 border rounded-md bg-muted/30 whitespace-pre-wrap">
            {shipment.scope_of_work}
          </p>
        </div>
      )}

      {/* Additional Services */}
      {shipment.additional_services && shipment.additional_services.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Additional Services</h4>
          <div className="flex flex-wrap gap-2">
            {shipment.additional_services.map((service: string) => (
              <span key={service} className="px-2 py-1 text-xs rounded-full bg-brand/10 text-brand">
                {service}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
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
  const [costs, setCosts] = useState<any[]>([])

  // Multi-shipment cost dialog state
  const [multiShipmentCostDialogOpen, setMultiShipmentCostDialogOpen] = useState(false)

  // Cost dialog state (single shipment - legacy)
  const [costDialogOpen, setCostDialogOpen] = useState(false)
  const [costAmount, setCostAmount] = useState('')
  const [costCurrency, setCostCurrency] = useState('IDR')
  const [costTerms, setCostTerms] = useState('')
  const [costRateStructure, setCostRateStructure] = useState<'bundling' | 'breakdown'>('bundling')
  const [costItems, setCostItems] = useState<Array<{
    id: string
    component_type: string
    component_name: string
    description: string
    cost_amount: number
    quantity: number | null
    unit: string | null
  }>>([])

  // Helper functions for cost items
  const addCostItem = () => {
    setCostItems([...costItems, {
      id: `item-${Date.now()}`,
      component_type: '',
      component_name: '',
      description: '',
      cost_amount: 0,
      quantity: null,
      unit: null,
    }])
  }

  const updateCostItem = (id: string, field: string, value: any) => {
    setCostItems(costItems.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value }
        // Auto-fill component name from type
        if (field === 'component_type' && !item.component_name) {
          updated.component_name = getRateComponentLabel(value)
        }
        return updated
      }
      return item
    }))
  }

  const removeCostItem = (id: string) => {
    setCostItems(costItems.filter(item => item.id !== id))
  }

  // Calculate total from breakdown items
  const totalBreakdownCost = costItems.reduce((sum, item) => sum + (item.cost_amount || 0), 0)

  // Lost dialog state
  const [lostDialogOpen, setLostDialogOpen] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [lostReasonNote, setLostReasonNote] = useState('')
  const [lostCompetitor, setLostCompetitor] = useState('')
  const [lostCompetitorCost, setLostCompetitorCost] = useState('')

  // Reminder state
  const [sendingReminder, setSendingReminder] = useState(false)

  // Customer quotation dialog state
  const [quotationDialogOpen, setQuotationDialogOpen] = useState(false)

  // Customer quotations state
  const [customerQuotations, setCustomerQuotations] = useState<any[]>([])

  // Lead data for quotation prefill (includes shipment_details)
  const [leadData, setLeadData] = useState<any>(null)

  // Multi-shipment support
  const [shipments, setShipments] = useState<ShipmentDetail[]>([])
  const [activeShipmentTab, setActiveShipmentTab] = useState<string>('0')
  const [costShipmentId, setCostShipmentId] = useState<string>('') // Shipment ID for cost submission

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

      // Fetch operational costs
      const costsRes = await fetch(`/api/ticketing/tickets/${ticket.id}/quotes`)
      const costsData = await costsRes.json()
      if (costsData.success) {
        setCosts(costsData.data || [])
      }

      // Fetch customer quotations for this ticket
      const quotationsRes = await fetch(`/api/ticketing/customer-quotations?ticket_id=${ticket.id}`)
      const quotationsData = await quotationsRes.json()
      if (quotationsData.success) {
        setCustomerQuotations(quotationsData.data || [])
      }

      // Fetch lead data with shipment_details
      // Priority: direct lead_id > opportunity's source_lead_id
      let leadIdToFetch = ticket.lead_id

      // If no direct lead_id but has opportunity, get lead from opportunity's source_lead_id
      if (!leadIdToFetch && ticket.opportunity_id) {
        const oppRes = await fetch(`/api/crm/opportunities/${ticket.opportunity_id}`)
        const oppResult = await oppRes.json()
        if (oppResult.data?.source_lead_id) {
          leadIdToFetch = oppResult.data.source_lead_id
        }
      }

      let loadedShipmentsFromLead = false
      if (leadIdToFetch) {
        const leadRes = await fetch(`/api/crm/leads/${leadIdToFetch}`)
        const leadResult = await leadRes.json()
        if (leadResult.data) {
          setLeadData(leadResult.data)
          // Store shipments array for multi-shipment display
          if (leadResult.data.shipments && Array.isArray(leadResult.data.shipments) && leadResult.data.shipments.length > 0) {
            setShipments(leadResult.data.shipments)
            loadedShipmentsFromLead = true
            // Set default cost shipment to first shipment
            if (!costShipmentId) {
              setCostShipmentId(leadResult.data.shipments[0].shipment_detail_id || '')
            }
          }
        }
      }

      // Fallback: If no shipments from lead, use ticket.shipments_data (for standalone tickets)
      if (!loadedShipmentsFromLead && ticket.shipments_data && Array.isArray(ticket.shipments_data) && ticket.shipments_data.length > 0) {
        setShipments(ticket.shipments_data as unknown as ShipmentDetail[])
        if (!costShipmentId) {
          setCostShipmentId((ticket.shipments_data[0] as any).shipment_detail_id || '')
        }
      }

      // Fetch SLA details
      await fetchSLADetails()
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }, [ticket.id, canAssign, supabase, fetchSLADetails, costShipmentId, ticket.lead_id, ticket.opportunity_id, ticket.shipments_data])

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
      case 'submit_cost': return 'Operational cost submitted successfully'
      case 'request_adjustment': return 'Adjustment requested'
      case 'cost_sent_to_customer': return 'Marked as sent to customer'
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

  // Send reminder (for GEN tickets)
  const handleSendReminder = async () => {
    setSendingReminder(true)
    try {
      const response = await fetch(`/api/ticketing/tickets/${ticket.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '🔔 **Reminder**: Mohon update status request ini. Terima kasih.',
          is_internal: false,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to send reminder')
      }

      toast({
        title: 'Reminder sent',
        description: 'Reminder has been sent to the assignee',
      })

      await refreshTicket()
      fetchData()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to send reminder',
        variant: 'destructive',
      })
    } finally {
      setSendingReminder(false)
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

  // Format event type for display
  const formatEventType = (eventType: string): string => {
    const eventLabels: Record<string, string> = {
      'created': 'created',
      'assigned': 'assigned',
      'status_changed': 'status changed',
      'comment_added': 'comment added',
      'cost_submitted': 'cost sent',
      'cost_sent_to_customer': 'cost sent to customer',
      'quote_submitted': 'cost sent',
      'quote_sent_to_customer': 'cost sent to customer',
      'attachment_added': 'attachment added',
      'attachment_removed': 'attachment removed',
      'priority_changed': 'priority changed',
      'department_changed': 'department changed',
      'resolved': 'resolved',
      'closed': 'closed',
      'reopened': 'reopened',
      'won': 'marked as won',
      'lost': 'marked as lost',
      'request_adjustment': 'requested adjustment',
    }
    return eventLabels[eventType] || eventType.replace(/_/g, ' ')
  }

  // Format duration from seconds
  const formatDuration = (seconds: number | null | undefined): string => {
    if (seconds === null || seconds === undefined) return 'N/A'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    let result = ''
    if (days > 0) result += `${days}d `
    if (hours > 0 || days > 0) result += `${hours}h `
    if (minutes > 0 || hours > 0 || days > 0) result += `${minutes}m`
    // Show seconds when total time is under 1 minute
    if (days === 0 && hours === 0 && minutes === 0) result += `${secs}s`
    return result.trim() || '0s'
  }

  // Get first response time from exchanges or metrics
  const getFirstResponseFormatted = (): string => {
    // First try metrics
    if (slaDetails?.metrics?.assignee?.first_response_formatted) {
      return slaDetails.metrics.assignee.first_response_formatted
    }

    // Calculate from first_response_at and created_at timestamps
    if (slaDetails?.sla?.first_response_at && slaDetails?.created_at) {
      const responseTime = new Date(slaDetails.sla.first_response_at).getTime()
      const createdTime = new Date(slaDetails.created_at).getTime()
      const diffSeconds = Math.floor((responseTime - createdTime) / 1000)
      if (diffSeconds >= 0) {
        return formatDuration(diffSeconds)
      }
    }

    // Fallback to exchanges - find first assignee response (not necessarily exchange_number === 1)
    const firstAssigneeExchange = slaDetails?.exchanges?.find(
      (ex) => ex.responder_type === 'assignee'
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

  // Build unified timeline
  type TimelineItem = {
    id: string
    type: 'comment' | 'cost' | 'status_change' | 'event'
    created_at: string
    user_id: string
    user_name: string
    user_initials: string
    is_creator: boolean
    content: string
    badge_type: string
    badge_label: string
    extra_data?: any
  }

  // Deduplicate timeline items - collapse redundant entries from batch operations and mirror trigger
  const deduplicateTimelineItems = (items: TimelineItem[]): TimelineItem[] => {
    const WINDOW_MS = 5000 // 5-second window for exact duplicate grouping
    const EXTENDED_WINDOW_MS = 30000 // 30-second window for related event merging
    const removedIds = new Set<string>()

    const sorted = [...items].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    // Precompute timestamps
    const tsMap = new Map<string, number>()
    sorted.forEach(item => tsMap.set(item.id, new Date(item.created_at).getTime()))
    const ts = (item: TimelineItem) => tsMap.get(item.id)!
    const nearBy = (a: TimelineItem, b: TimelineItem) => Math.abs(ts(a) - ts(b)) <= WINDOW_MS
    const nearByExtended = (a: TimelineItem, b: TimelineItem) => Math.abs(ts(a) - ts(b)) <= EXTENDED_WINDOW_MS

    // Quotation lifecycle events that suppress mirror-trigger auto-comments
    const LIFECYCLE_BADGES = new Set([
      'rejected', 'quotation_sent', 'quotation', 'accepted', 'sent_to_customer',
    ])

    // Status change badges that are auto-generated alongside lifecycle events
    const AUTO_STATUS_BADGES = new Set(['status', 'adjustment', 'assigned'])

    sorted.forEach((item) => {
      if (removedIds.has(item.id)) return

      // Rule 1: Rejection hides request_adjustment events within extended window
      if (item.badge_type === 'rejected') {
        sorted.forEach((other) => {
          if (other.id !== item.id && !removedIds.has(other.id) && nearByExtended(item, other)) {
            if (other.extra_data?.event_type === 'request_adjustment') {
              removedIds.add(other.id)
            }
          }
        })
      }

      // Rule 2: Lifecycle events hide auto-comments from same actor within extended window
      if (LIFECYCLE_BADGES.has(item.badge_type)) {
        sorted.forEach((other) => {
          if (other.id !== item.id && !removedIds.has(other.id) && nearByExtended(item, other)) {
            if (other.type === 'comment' && other.user_id === item.user_id) {
              removedIds.add(other.id)
            }
          }
        })
      }

      // Rule 3: "Cost Created" batch event hidden when individual cost items exist nearby
      if (item.badge_label === 'Cost Created' && item.extra_data?.event_type === 'quote_created') {
        const hasCosts = sorted.some((other) =>
          other.type === 'cost' && !removedIds.has(other.id) && nearBy(item, other)
        )
        if (hasCosts) removedIds.add(item.id)
      }

      // Rule 5: Lifecycle events absorb status_changed events from same actor within extended window
      // When a quotation is rejected/accepted/sent, status_changed event is redundant
      if (LIFECYCLE_BADGES.has(item.badge_type)) {
        sorted.forEach((other) => {
          if (other.id !== item.id && !removedIds.has(other.id) && nearByExtended(item, other)) {
            if (other.type === 'status_change' && other.user_id === item.user_id) {
              removedIds.add(other.id)
            }
          }
        })
      }

      // Rule 6: Lifecycle events absorb other auto-generated events within extended window
      // e.g., assigned/reassigned events that fire alongside status changes
      if (LIFECYCLE_BADGES.has(item.badge_type)) {
        sorted.forEach((other) => {
          if (other.id !== item.id && !removedIds.has(other.id) && nearByExtended(item, other)) {
            if (other.type === 'event' && AUTO_STATUS_BADGES.has(other.badge_type) && other.user_id === item.user_id) {
              removedIds.add(other.id)
            }
          }
        })
      }
    })

    // Rule 4: Same badge_type + same user within window → keep longer content
    // Skip cost items (different costs can legitimately exist at same time)
    for (let i = 0; i < sorted.length; i++) {
      if (removedIds.has(sorted[i].id) || sorted[i].type === 'cost') continue
      for (let j = i + 1; j < sorted.length; j++) {
        if (removedIds.has(sorted[j].id) || sorted[j].type === 'cost') continue
        if (ts(sorted[j]) - ts(sorted[i]) > WINDOW_MS) break
        if (sorted[i].badge_type === sorted[j].badge_type && sorted[i].user_id === sorted[j].user_id) {
          if ((sorted[j].content?.length || 0) > (sorted[i].content?.length || 0)) {
            removedIds.add(sorted[i].id)
          } else {
            removedIds.add(sorted[j].id)
          }
        }
      }
    }

    // Rule 7: Consecutive status_changed events from same user within extended window → keep last
    for (let i = 0; i < sorted.length; i++) {
      if (removedIds.has(sorted[i].id) || sorted[i].type !== 'status_change') continue
      for (let j = i + 1; j < sorted.length; j++) {
        if (removedIds.has(sorted[j].id)) continue
        if (ts(sorted[j]) - ts(sorted[i]) > EXTENDED_WINDOW_MS) break
        if (sorted[j].type === 'status_change' && sorted[j].user_id === sorted[i].user_id) {
          // Keep the later one (more recent status), remove earlier
          removedIds.add(sorted[i].id)
          break
        }
      }
    }

    return items.filter((item) => !removedIds.has(item.id))
  }

  const buildUnifiedTimeline = (): TimelineItem[] => {
    const items: TimelineItem[] = []

    // Add comments
    comments.forEach((comment) => {
      const isCreatorComment = comment.user_id === ticket.created_by
      items.push({
        id: `comment-${comment.id}`,
        type: 'comment',
        created_at: comment.created_at,
        user_id: comment.user_id,
        user_name: comment.user?.name || 'Unknown',
        user_initials: getInitials(comment.user?.name || 'U'),
        is_creator: isCreatorComment,
        content: comment.content,
        badge_type: comment.is_internal ? 'internal' : 'comment',
        badge_label: comment.is_internal ? 'Internal' : 'Comment',
        extra_data: { is_internal: comment.is_internal },
      })
    })

    // Add operational costs - sorted by created_at to get correct sequence
    const sortedCosts = [...costs].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    const ordinalLabels = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth']

    sortedCosts.forEach((cost, index) => {
      const isCreatorCost = cost.created_by === ticket.created_by
      const costLabel = index < ordinalLabels.length
        ? `${ordinalLabels[index]} Cost`
        : `Cost #${index + 1}`

      // Find shipment info if cost has shipment_detail_id
      const linkedShipment = cost.shipment_detail_id
        ? shipments.find(s => s.shipment_detail_id === cost.shipment_detail_id)
        : null

      items.push({
        id: `cost-${cost.id}`,
        type: 'cost',
        created_at: cost.created_at,
        user_id: cost.created_by,
        user_name: cost.creator?.name || 'Unknown',
        user_initials: getInitials(cost.creator?.name || 'U'),
        is_creator: isCreatorCost,
        content: cost.notes || '',
        badge_type: 'cost',
        badge_label: costLabel,
        extra_data: {
          cost_number: cost.quote_number,
          amount: cost.amount,
          currency: cost.currency,
          valid_until: cost.valid_until,
          terms: cost.terms,
          cost_sequence: index + 1,
          rate_structure: cost.rate_structure,
          // Shipment info for multi-shipment support
          shipment_detail_id: cost.shipment_detail_id || null,
          shipment_label: cost.shipment_label || linkedShipment?.shipment_label || null,
          shipment_route: linkedShipment
            ? `${linkedShipment.origin_city || '-'} → ${linkedShipment.destination_city || '-'}`
            : null,
          shipment_service: linkedShipment?.service_type_code || null,
          shipment_fleet: linkedShipment?.fleet_type
            ? `${linkedShipment.fleet_type} x ${linkedShipment.fleet_quantity || 1}`
            : null,
          shipment_weight: linkedShipment?.weight_total_kg || null,
          shipment_volume: linkedShipment?.volume_total_cbm || null,
        },
      })
    })

    // Add status change events
    events.filter(e => e.event_type === 'status_changed').forEach((event) => {
      const isCreatorEvent = event.actor_user_id === ticket.created_by
      const oldStatus = typeof event.old_value === 'object' ? (event.old_value as any)?.status : event.old_value
      const newStatus = typeof event.new_value === 'object' ? (event.new_value as any)?.status : event.new_value
      items.push({
        id: `event-${event.id}`,
        type: 'status_change',
        created_at: event.created_at,
        user_id: event.actor_user_id || '',
        user_name: event.actor?.name || 'System',
        user_initials: getInitials(event.actor?.name || 'S'),
        is_creator: isCreatorEvent,
        content: event.notes || `${oldStatus} → ${newStatus}`,
        badge_type: 'status',
        badge_label: 'Status Update',
        extra_data: { old_status: oldStatus, new_status: newStatus },
      })
    })

    // Add cost_sent_to_customer events with ordinal labels (still using quote_sent_to_customer in DB)
    const costSentEvents = events
      .filter(e => e.event_type === 'quote_sent_to_customer')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    costSentEvents.forEach((event, index) => {
      const isCreatorEvent = event.actor_user_id === ticket.created_by
      const sentOrdinal = index < ordinalLabels.length
        ? `${ordinalLabels[index]} Sent`
        : `${index + 1}${index === 0 ? 'st' : index === 1 ? 'nd' : index === 2 ? 'rd' : 'th'} Sent`

      items.push({
        id: `cost-sent-${event.id}`,
        type: 'event',
        created_at: event.created_at,
        user_id: event.actor_user_id || '',
        user_name: event.actor?.name || 'System',
        user_initials: getInitials(event.actor?.name || 'S'),
        is_creator: isCreatorEvent,
        content: event.notes || 'Cost forwarded to end customer',
        badge_type: 'sent_to_customer',
        badge_label: sentOrdinal,
        extra_data: {
          sent_count: (event.new_value as any)?.sent_count || index + 1,
          quotation_id: (event.new_value as any)?.quotation_id,
          quotation_number: (event.new_value as any)?.quotation_number,
        },
      })
    })

    // Add ALL other events - include customer quotation events and everything else
    // Exclude events already processed above: status_changed, quote_sent_to_customer
    const processedEventTypes = ['status_changed', 'quote_sent_to_customer']

    const eventLabelsMap: Record<string, string> = {
      'request_adjustment': 'Request Adjustment',
      'won': 'Won',
      'lost': 'Lost',
      'assigned': 'Assigned',
      'reassigned': 'Reassigned',
      'priority_changed': 'Priority Changed',
      'customer_quotation_created': 'Quotation Created',
      'customer_quotation_sent': 'Quotation Sent',
      'customer_quotation_accepted': 'Quotation Accepted',
      'customer_quotation_rejected': 'Quotation Rejected',
      'quote_created': 'Cost Created',
      'quote_sent': 'Cost Sent',
      'cost_sent': 'Cost Sent',
      'comment_added': 'Comment',
      'attachment_added': 'Attachment',
      'created': 'Created',
      'resolved': 'Resolved',
      'closed': 'Closed',
      'reopened': 'Reopened',
    }

    const eventBadgeTypes: Record<string, string> = {
      'request_adjustment': 'adjustment',
      'won': 'won',
      'lost': 'lost',
      'assigned': 'assigned',
      'reassigned': 'assigned',
      'priority_changed': 'priority',
      'customer_quotation_created': 'quotation',
      'customer_quotation_sent': 'quotation_sent',
      'customer_quotation_accepted': 'accepted',
      'customer_quotation_rejected': 'rejected',
      'quote_created': 'cost',
      'quote_sent': 'cost',
      'cost_sent': 'cost',
      'comment_added': 'comment',
      'attachment_added': 'attachment',
      'created': 'created',
      'resolved': 'resolved',
      'closed': 'closed',
      'reopened': 'reopened',
    }

    events.filter(e => !processedEventTypes.includes(e.event_type)).forEach((event) => {
      const isCreatorEvent = event.actor_user_id === ticket.created_by
      items.push({
        id: `event-other-${event.id}`,
        type: 'event',
        created_at: event.created_at,
        user_id: event.actor_user_id || '',
        user_name: event.actor?.name || 'System',
        user_initials: getInitials(event.actor?.name || 'S'),
        is_creator: isCreatorEvent,
        content: event.notes || eventLabelsMap[event.event_type] || event.event_type,
        badge_type: eventBadgeTypes[event.event_type] || 'event',
        badge_label: eventLabelsMap[event.event_type] || event.event_type,
        extra_data: {
          event_type: event.event_type,
          old_value: event.old_value,
          new_value: event.new_value,
        },
      })
    })

    // Deduplicate redundant entries (batch costs, rejection triple-events, mirror trigger auto-comments)
    const dedupedItems = deduplicateTimelineItems(items)

    // Sort by created_at descending (newest first)
    dedupedItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return dedupedItems
  }

  // Get user initials
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Calculate response metrics
  const calculateResponseMetrics = () => {
    const timeline = buildUnifiedTimeline()

    // Sort in ascending order (oldest first) for proper calculation
    const sortedTimeline = [...timeline].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    // Count ALL responses by each party (excluding auto-assigned and auto-status)
    let deptCount = 0
    let creatorCount = 0

    // For average response time calculation (time between party switches)
    const deptResponseTimes: number[] = []
    const creatorResponseTimes: number[] = []
    let lastTimestamp = new Date(ticket.created_at).getTime()
    let lastResponderIsCreator = true // Ticket starts with creator

    sortedTimeline.forEach((item) => {
      const itemTime = new Date(item.created_at).getTime()
      const responseSeconds = Math.floor((itemTime - lastTimestamp) / 1000)

      // Exclude auto-assigned and auto-status from count
      const isAutoEvent = item.badge_type === 'assigned' ||
        (item.badge_type === 'status' && item.content?.includes('auto'))

      if (!isAutoEvent) {
        // Count all responses
        if (item.is_creator) {
          creatorCount++
        } else {
          deptCount++
        }
      }

      // Calculate response time only on party switch
      if (responseSeconds > 0) {
        if (item.is_creator && !lastResponderIsCreator) {
          creatorResponseTimes.push(responseSeconds)
        } else if (!item.is_creator && lastResponderIsCreator) {
          deptResponseTimes.push(responseSeconds)
        }
      }

      // Update tracking
      lastResponderIsCreator = item.is_creator
      lastTimestamp = itemTime
    })

    const avgDept = deptResponseTimes.length > 0
      ? Math.floor(deptResponseTimes.reduce((a, b) => a + b, 0) / deptResponseTimes.length)
      : 0
    const avgCreator = creatorResponseTimes.length > 0
      ? Math.floor(creatorResponseTimes.reduce((a, b) => a + b, 0) / creatorResponseTimes.length)
      : 0

    return {
      dept: {
        count: deptCount,
        avgSeconds: avgDept,
        avgFormatted: formatDuration(avgDept),
      },
      creator: {
        count: creatorCount,
        avgSeconds: avgCreator,
        avgFormatted: formatDuration(avgCreator),
      },
    }
  }

  // Format short duration (for badges)
  const formatShortDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    return `${Math.floor(seconds / 86400)}d`
  }

  // Calculate response time for each timeline item
  const getTimelineWithResponseTimes = () => {
    const timeline = buildUnifiedTimeline()

    // Sort ascending for response time calculation
    const sortedAsc = [...timeline].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    let lastTimestamp = new Date(ticket.created_at).getTime()
    const responseMap = new Map<string, { seconds: number; formatted: string }>()

    sortedAsc.forEach((item) => {
      const itemTime = new Date(item.created_at).getTime()
      const responseSeconds = Math.floor((itemTime - lastTimestamp) / 1000)
      lastTimestamp = itemTime
      responseMap.set(item.id, {
        seconds: responseSeconds,
        formatted: formatShortDuration(responseSeconds),
      })
    })

    // Return timeline in original order (descending - newest first) with response times
    return timeline.map((item) => {
      const response = responseMap.get(item.id) || { seconds: 0, formatted: '0s' }
      return {
        ...item,
        responseSeconds: response.seconds,
        responseFormatted: response.formatted,
      }
    })
  }

  // Handle submit operational cost
  const handleSubmitCost = async () => {
    // Validate based on rate structure
    if (costRateStructure === 'bundling') {
      const amount = parseFloat(costAmount)
      if (isNaN(amount) || amount <= 0) {
        toast({
          title: 'Error',
          description: 'Please enter a valid amount',
          variant: 'destructive',
        })
        return
      }
    } else {
      // Breakdown validation
      if (costItems.length === 0) {
        toast({
          title: 'Error',
          description: 'Please add at least one cost item',
          variant: 'destructive',
        })
        return
      }
      if (totalBreakdownCost <= 0) {
        toast({
          title: 'Error',
          description: 'Total cost must be greater than 0',
          variant: 'destructive',
        })
        return
      }
      // Validate all items have component type
      const invalidItem = costItems.find(item => !item.component_type)
      if (invalidItem) {
        toast({
          title: 'Error',
          description: 'All items must have a component type',
          variant: 'destructive',
        })
        return
      }
    }

    // Get shipment info for multi-shipment support
    const selectedShipment = shipments.find(s => s.shipment_detail_id === costShipmentId)
    const shipmentLabel = selectedShipment?.shipment_label ||
      (shipments.length > 1 ? `Shipment ${shipments.findIndex(s => s.shipment_detail_id === costShipmentId) + 1}` : null)

    const payload: any = {
      currency: costCurrency,
      terms: costTerms || null,
      rate_structure: costRateStructure,
      // Multi-shipment support: include shipment ID and label
      shipment_detail_id: costShipmentId || null,
      shipment_label: shipmentLabel,
    }

    if (costRateStructure === 'bundling') {
      payload.amount = parseFloat(costAmount)
    } else {
      payload.amount = totalBreakdownCost
      payload.items = costItems.map((item, index) => ({
        component_type: item.component_type,
        component_name: item.component_name,
        description: item.description,
        cost_amount: item.cost_amount,
        quantity: item.quantity,
        unit: item.unit,
        sort_order: index,
      }))
    }

    const success = await executeAction('submit_quote', payload)

    if (success) {
      setCostDialogOpen(false)
      setCostAmount('')
      setCostTerms('')
      setCostRateStructure('bundling')
      setCostItems([])
    }
  }

  // Handle mark lost
  const handleMarkLost = async () => {
    // Build the full reason text
    const reasonOption = lostReasonOptions.find(o => o.value === lostReason)
    const reasonLabel = reasonOption?.label || lostReason
    const fullReason = lostReason === 'other'
      ? `Lainnya: ${lostReasonNote}`
      : lostReasonNote
        ? `${reasonLabel} - ${lostReasonNote}`
        : reasonLabel

    const success = await executeAction('mark_lost', {
      reason: fullReason,
      competitor_name: lostCompetitor || null,
      competitor_cost: lostCompetitorCost ? parseFloat(lostCompetitorCost) : null,
    })

    if (success) {
      setLostDialogOpen(false)
      setLostReason('')
      setLostReasonNote('')
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
                      <p className="text-xs font-medium text-muted-foreground">Time to Cost</p>
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

          {/* RFQ Data (if applicable) - Multi-Shipment Support */}
          {ticket.ticket_type === 'RFQ' && (ticket.rfq_data || shipments.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Shipment Details
                  {shipments.length > 1 && (
                    <Badge variant="secondary" className="ml-2">
                      {shipments.length} shipments
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Multi-shipment tabs or single shipment display */}
                {shipments.length > 1 ? (
                  <Tabs value={activeShipmentTab} onValueChange={setActiveShipmentTab}>
                    <TabsList className="mb-4 flex-wrap h-auto gap-1">
                      {shipments.map((shipment, idx) => (
                        <TabsTrigger key={idx} value={String(idx)} className="text-xs">
                          <Package className="h-3 w-3 mr-1" />
                          {shipment.shipment_label || `Shipment ${idx + 1}`}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {shipments.map((shipment, idx) => (
                      <TabsContent key={idx} value={String(idx)} className="space-y-6 mt-0">
                        <ShipmentDetailsDisplay shipment={shipment} />
                      </TabsContent>
                    ))}
                  </Tabs>
                ) : shipments.length === 1 ? (
                  <div className="space-y-6">
                    <ShipmentDetailsDisplay shipment={shipments[0]} />
                  </div>
                ) : (
                  /* Fallback to rfq_data for backward compatibility */
                  <div className="space-y-6">
                    <ShipmentDetailsDisplay shipment={{
                      shipment_order: 1,
                      service_type_code: (ticket.rfq_data as any)?.service_type_code,
                      fleet_type: (ticket.rfq_data as any)?.fleet_type,
                      fleet_quantity: (ticket.rfq_data as any)?.fleet_quantity,
                      incoterm: (ticket.rfq_data as any)?.incoterm,
                      cargo_category: (ticket.rfq_data as any)?.cargo_category,
                      cargo_description: (ticket.rfq_data as any)?.cargo_description,
                      origin_address: (ticket.rfq_data as any)?.origin_address,
                      origin_city: (ticket.rfq_data as any)?.origin_city,
                      origin_country: (ticket.rfq_data as any)?.origin_country,
                      destination_address: (ticket.rfq_data as any)?.destination_address,
                      destination_city: (ticket.rfq_data as any)?.destination_city,
                      destination_country: (ticket.rfq_data as any)?.destination_country,
                      quantity: (ticket.rfq_data as any)?.quantity,
                      unit_of_measure: (ticket.rfq_data as any)?.unit_of_measure,
                      weight_per_unit_kg: (ticket.rfq_data as any)?.weight_per_unit_kg,
                      weight_total_kg: (ticket.rfq_data as any)?.weight_total_kg,
                      length_cm: (ticket.rfq_data as any)?.length_cm,
                      width_cm: (ticket.rfq_data as any)?.width_cm,
                      height_cm: (ticket.rfq_data as any)?.height_cm,
                      volume_total_cbm: (ticket.rfq_data as any)?.volume_total_cbm || (ticket.rfq_data as any)?.total_volume,
                      scope_of_work: (ticket.rfq_data as any)?.scope_of_work,
                      additional_services: (ticket.rfq_data as any)?.additional_services,
                    }} />
                  </div>
                )}
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
                      {/* Request Adjustment - available after ops sends cost */}
                      {costs.length > 0 && (
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

                      {/* Create Customer Quotation - available always (direct or from ops cost) */}
                      <Button
                        onClick={() => setQuotationDialogOpen(true)}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Create Customer Quotation
                      </Button>

                      {/* Sent to Customer - checks if quotation exists first */}
                      <Button
                        onClick={async () => {
                          // Check if customer quotation exists
                          if (customerQuotations.length === 0) {
                            // No quotation - prompt to create one
                            toast({
                              title: 'Quotation Required',
                              description: 'Please create a customer quotation first before sending to customer.',
                              variant: 'destructive',
                            })
                            setQuotationDialogOpen(true)
                            return
                          }
                          // Has quotation - execute the action
                          const result = await executeAction('quote_sent_to_customer')
                          if (result) {
                            // Refresh quotation status
                            const quotationsRes = await fetch(`/api/ticketing/customer-quotations?ticket_id=${ticket.id}`)
                            const quotationsData = await quotationsRes.json()
                            if (quotationsData.success) {
                              setCustomerQuotations(quotationsData.data || [])
                            }
                          }
                        }}
                        disabled={actionLoading === 'quote_sent_to_customer'}
                        className="w-full"
                        variant="outline"
                      >
                        {actionLoading === 'quote_sent_to_customer' ? (
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Forward className="mr-2 h-4 w-4" />
                        )}
                        {customerQuotations.length > 0 ? 'Mark Sent to Customer' : 'Sent to Customer (Create Quotation First)'}
                      </Button>

                      {/* Won/Lost Buttons */}
                      {(costs.length > 0 || customerQuotations.length > 0) && (
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
                                  <Label htmlFor="lost-reason">Alasan Lost *</Label>
                                  <Select value={lostReason} onValueChange={setLostReason}>
                                    <SelectTrigger id="lost-reason">
                                      <SelectValue placeholder="Pilih alasan lost" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {lostReasonOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* Show note field for "other" reason */}
                                {lostReason === 'other' && (
                                  <div>
                                    <Label htmlFor="lost-reason-note">Keterangan *</Label>
                                    <Textarea
                                      id="lost-reason-note"
                                      name="lost-reason-note"
                                      placeholder="Jelaskan alasan lost..."
                                      value={lostReasonNote}
                                      onChange={(e) => setLostReasonNote(e.target.value)}
                                    />
                                  </div>
                                )}

                                {/* Show competitor fields for price-related reasons */}
                                {isCompetitorRequired(lostReason) && (
                                  <>
                                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                                        Alasan terkait harga memerlukan informasi kompetitor/budget
                                      </p>
                                    </div>
                                    <div>
                                      <Label htmlFor="lost-competitor">
                                        {lostReason === 'budget_not_fit' ? 'Nama Customer' : 'Nama Kompetitor'} *
                                      </Label>
                                      <Input
                                        id="lost-competitor"
                                        name="lost-competitor"
                                        placeholder={lostReason === 'budget_not_fit' ? 'Siapa customernya?' : 'Siapa kompetitornya?'}
                                        value={lostCompetitor}
                                        onChange={(e) => setLostCompetitor(e.target.value)}
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor="lost-competitor-cost">
                                        {lostReason === 'budget_not_fit' ? 'Budget Customer' : 'Harga Kompetitor'} *
                                      </Label>
                                      <Input
                                        id="lost-competitor-cost"
                                        name="lost-competitor-cost"
                                        type="number"
                                        placeholder={lostReason === 'budget_not_fit' ? 'Berapa budget customer?' : 'Berapa harga kompetitor?'}
                                        value={lostCompetitorCost}
                                        onChange={(e) => setLostCompetitorCost(e.target.value)}
                                      />
                                    </div>
                                  </>
                                )}

                                {/* Optional note for non-other reasons */}
                                {lostReason && lostReason !== 'other' && (
                                  <div>
                                    <Label htmlFor="lost-reason-note">Catatan Tambahan (opsional)</Label>
                                    <Textarea
                                      id="lost-reason-note"
                                      name="lost-reason-note"
                                      placeholder="Tambahkan catatan jika perlu..."
                                      value={lostReasonNote}
                                      onChange={(e) => setLostReasonNote(e.target.value)}
                                    />
                                  </div>
                                )}
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => {
                                  setLostDialogOpen(false)
                                  setLostReason('')
                                  setLostReasonNote('')
                                  setLostCompetitor('')
                                  setLostCompetitorCost('')
                                }}>
                                  Cancel
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={handleMarkLost}
                                  disabled={
                                    actionLoading === 'mark_lost' ||
                                    !lostReason ||
                                    (lostReason === 'other' && !lostReasonNote) ||
                                    (isCompetitorRequired(lostReason) && (!lostCompetitor || !lostCompetitorCost))
                                  }
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

                  {/* Creator Actions for GEN tickets */}
                  {isCreator && ticket.ticket_type === 'GEN' && (
                    <>
                      {/* Send Reminder - available when ticket is not yet resolved/closed */}
                      {!['resolved', 'closed'].includes(ticket.status) && (
                        <Button
                          onClick={handleSendReminder}
                          disabled={sendingReminder}
                          className="w-full"
                          variant="outline"
                        >
                          {sendingReminder ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Bell className="mr-2 h-4 w-4" />
                          )}
                          Send Reminder
                        </Button>
                      )}

                      {/* Resolved/Closed Buttons - available after ops responds */}
                      {(comments.length > 0 || ticket.status !== 'open') && (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            onClick={() => executeAction('mark_won')}
                            disabled={actionLoading === 'mark_won'}
                            className="w-full bg-green-600 hover:bg-green-700"
                          >
                            {actionLoading === 'mark_won' ? (
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Resolved
                          </Button>

                          <Dialog open={lostDialogOpen} onOpenChange={setLostDialogOpen}>
                            <DialogTrigger asChild>
                              <Button
                                variant="destructive"
                                className="w-full"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Closed
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Close Ticket</DialogTitle>
                                <DialogDescription>
                                  Please provide a reason for closing this ticket.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <Label htmlFor="close-reason">Alasan Close *</Label>
                                  <Select value={lostReason} onValueChange={setLostReason}>
                                    <SelectTrigger id="close-reason">
                                      <SelectValue placeholder="Pilih alasan close" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="no_longer_needed">Tidak Diperlukan Lagi</SelectItem>
                                      <SelectItem value="duplicate">Duplikat Request</SelectItem>
                                      <SelectItem value="resolved_elsewhere">Sudah Diselesaikan di Tempat Lain</SelectItem>
                                      <SelectItem value="cannot_be_fulfilled">Tidak Dapat Dipenuhi</SelectItem>
                                      <SelectItem value="other">Lainnya</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* Show note field for "other" reason */}
                                {lostReason === 'other' && (
                                  <div>
                                    <Label htmlFor="close-reason-note">Keterangan *</Label>
                                    <Textarea
                                      id="close-reason-note"
                                      name="close-reason-note"
                                      placeholder="Jelaskan alasan close..."
                                      value={lostReasonNote}
                                      onChange={(e) => setLostReasonNote(e.target.value)}
                                    />
                                  </div>
                                )}

                                {/* Optional note for non-other reasons */}
                                {lostReason && lostReason !== 'other' && (
                                  <div>
                                    <Label htmlFor="close-reason-note">Catatan Tambahan (opsional)</Label>
                                    <Textarea
                                      id="close-reason-note"
                                      name="close-reason-note"
                                      placeholder="Tambahkan catatan jika perlu..."
                                      value={lostReasonNote}
                                      onChange={(e) => setLostReasonNote(e.target.value)}
                                    />
                                  </div>
                                )}
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => {
                                  setLostDialogOpen(false)
                                  setLostReason('')
                                  setLostReasonNote('')
                                }}>
                                  Cancel
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={handleMarkLost}
                                  disabled={
                                    actionLoading === 'mark_lost' ||
                                    !lostReason ||
                                    (lostReason === 'other' && !lostReasonNote)
                                  }
                                >
                                  {actionLoading === 'mark_lost' ? (
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                  ) : null}
                                  Confirm Close
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
                      {/* Submit Cost Button - Multi-shipment vs Single-shipment */}
                      {shipments.length > 1 ? (
                        // Multi-shipment: Use dedicated dialog for batch cost submission
                        <Button
                          className="w-full bg-green-600 hover:bg-green-700"
                          onClick={() => setMultiShipmentCostDialogOpen(true)}
                        >
                          <DollarSign className="mr-2 h-4 w-4" />
                          Submit Costs ({shipments.length} Shipments)
                        </Button>
                      ) : (
                        // Single shipment: Use original dialog
                        <Dialog open={costDialogOpen} onOpenChange={setCostDialogOpen}>
                          <DialogTrigger asChild>
                            <Button className="w-full bg-green-600 hover:bg-green-700">
                              <DollarSign className="mr-2 h-4 w-4" />
                              Submit Cost
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Submit Operational Cost</DialogTitle>
                              <DialogDescription>
                                Enter the cost details to send to the ticket creator.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              {/* Shipment Selector for Multi-Shipment */}
                              {shipments.length > 1 && (
                                <div className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
                                  <Label className="text-blue-700 dark:text-blue-300">Select Shipment for this Cost</Label>
                                  <Select value={costShipmentId} onValueChange={setCostShipmentId}>
                                    <SelectTrigger className="mt-2">
                                      <SelectValue placeholder="Select shipment" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {shipments.map((shipment, idx) => (
                                        <SelectItem key={shipment.shipment_detail_id || idx} value={shipment.shipment_detail_id || String(idx)}>
                                          <div className="flex items-center gap-2">
                                            <Package className="h-3 w-3" />
                                            {shipment.shipment_label || `Shipment ${idx + 1}`}
                                            <span className="text-xs text-muted-foreground">
                                              ({shipment.origin_city || '-'} → {shipment.destination_city || '-'})
                                            </span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              {/* Shipment Summary Card - Essential operational info for costing */}
                              {shipments.length > 0 && (() => {
                                const selectedShipment = shipments.find(s => s.shipment_detail_id === costShipmentId) || shipments[0]
                                return (
                                  <div className="p-3 border rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-2">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Package className="h-4 w-4 text-slate-600" />
                                      <span className="font-medium text-sm">
                                        {selectedShipment.shipment_label || 'Shipment Details'}
                                      </span>
                                      {selectedShipment.service_type_code && (
                                        <Badge variant="outline" className="text-xs">
                                          {selectedShipment.service_type_code}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                      {/* Route */}
                                      <div className="col-span-2 flex items-center gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                                        <span className="text-emerald-600">{selectedShipment.origin_city || '-'}</span>
                                        <span className="text-muted-foreground">→</span>
                                        <span className="text-rose-600">{selectedShipment.destination_city || '-'}</span>
                                        {(selectedShipment.origin_country !== selectedShipment.destination_country) && (
                                          <span className="text-muted-foreground text-xs">
                                            ({selectedShipment.origin_country} → {selectedShipment.destination_country})
                                          </span>
                                        )}
                                      </div>
                                      {/* Fleet or Incoterm */}
                                      {selectedShipment.fleet_type && (
                                        <div>
                                          <span className="text-muted-foreground">Fleet:</span>{' '}
                                          <span className="font-medium">{selectedShipment.fleet_type} x {selectedShipment.fleet_quantity || 1}</span>
                                        </div>
                                      )}
                                      {selectedShipment.incoterm && (
                                        <div>
                                          <span className="text-muted-foreground">Incoterm:</span>{' '}
                                          <span className="font-medium">{selectedShipment.incoterm}</span>
                                        </div>
                                      )}
                                      {/* Cargo */}
                                      {selectedShipment.cargo_category && (
                                        <div>
                                          <span className="text-muted-foreground">Cargo:</span>{' '}
                                          <span className="font-medium">{selectedShipment.cargo_category}</span>
                                        </div>
                                      )}
                                      {/* Quantity */}
                                      {selectedShipment.quantity && (
                                        <div>
                                          <span className="text-muted-foreground">Qty:</span>{' '}
                                          <span className="font-medium">{selectedShipment.quantity} {selectedShipment.unit_of_measure || 'units'}</span>
                                        </div>
                                      )}
                                      {/* Weight */}
                                      {selectedShipment.weight_total_kg && (
                                        <div>
                                          <span className="text-muted-foreground">Weight:</span>{' '}
                                          <span className="font-medium">{selectedShipment.weight_total_kg.toLocaleString()} kg</span>
                                        </div>
                                      )}
                                      {/* Volume */}
                                      {selectedShipment.volume_total_cbm && (
                                        <div>
                                          <span className="text-muted-foreground">Volume:</span>{' '}
                                          <span className="font-medium">{selectedShipment.volume_total_cbm} CBM</span>
                                        </div>
                                      )}
                                    </div>
                                    {/* Cargo Description */}
                                    {selectedShipment.cargo_description && (
                                      <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                                        {selectedShipment.cargo_description}
                                      </p>
                                    )}
                                  </div>
                                )
                              })()}

                              {/* Rate Structure Toggle */}
                              <div className="flex items-center justify-between">
                                <Label>Cost Structure</Label>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant={costRateStructure === 'bundling' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setCostRateStructure('bundling')}
                                  >
                                    Bundling
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={costRateStructure === 'breakdown' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setCostRateStructure('breakdown')}
                                  >
                                    Breakdown
                                  </Button>
                                </div>
                              </div>

                              {/* Currency Selection */}
                              <div>
                                <Label htmlFor="cost-currency">Currency</Label>
                                <Select value={costCurrency} onValueChange={setCostCurrency}>
                                  <SelectTrigger id="cost-currency">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="IDR">IDR</SelectItem>
                                    <SelectItem value="USD">USD</SelectItem>
                                    <SelectItem value="SGD">SGD</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Bundling Mode - Single Amount */}
                              {costRateStructure === 'bundling' && (
                                <div className="p-4 bg-muted/50 rounded-lg">
                                  <Label htmlFor="cost-amount">Total Cost *</Label>
                                  <Input
                                    id="cost-amount"
                                    name="cost-amount"
                                    type="number"
                                    placeholder="Enter total cost amount"
                                    value={costAmount}
                                    onChange={(e) => setCostAmount(e.target.value)}
                                    className="mt-2 text-right font-mono"
                                  />
                                </div>
                              )}

                              {/* Breakdown Mode - Itemized Costs */}
                              {costRateStructure === 'breakdown' && (
                                <div className="space-y-3">
                                  {/* Total and Add Item - Always visible at top */}
                                  <div className="sticky top-0 bg-background z-10 pb-2 space-y-3">
                                    {/* Total Display */}
                                    <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                      <span className="text-xs text-muted-foreground block">Total Cost</span>
                                      <span className="text-xl font-bold font-mono text-green-700 dark:text-green-400">
                                        {new Intl.NumberFormat('id-ID', {
                                          style: 'currency',
                                          currency: costCurrency,
                                          minimumFractionDigits: 0,
                                        }).format(totalBreakdownCost)}
                                      </span>
                                    </div>

                                    {/* Add Item Button */}
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm text-muted-foreground">
                                        {costItems.length} component{costItems.length !== 1 ? 's' : ''} added
                                      </span>
                                      <Button type="button" size="sm" variant="outline" onClick={addCostItem}>
                                        <Plus className="h-4 w-4 mr-1" />
                                        Add Item
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Items List */}
                                  {costItems.length === 0 ? (
                                    <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
                                      No items added. Click "Add Item" to start.
                                    </div>
                                  ) : (
                                    <div className="space-y-3 max-h-[250px] overflow-y-auto">
                                      {costItems.map((item, index) => (
                                        <div key={item.id} className="p-3 border rounded-lg space-y-3 bg-muted/30">
                                          <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">Item {index + 1}</span>
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="ghost"
                                              className="h-8 w-8 text-destructive"
                                              onClick={() => removeCostItem(item.id)}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                          <div className="grid grid-cols-2 gap-3">
                                            <div>
                                              <Label className="text-xs">Component Type *</Label>
                                              <SearchableSelect
                                                value={item.component_type}
                                                onValueChange={(v) => updateCostItem(item.id, 'component_type', v)}
                                                placeholder="Select component"
                                                searchPlaceholder="Search component..."
                                                popoverWidth="w-[320px]"
                                                groups={Object.entries(RATE_COMPONENTS_BY_CATEGORY).map(([category, components]) => ({
                                                  label: category,
                                                  options: components.map((comp) => ({ value: comp.value, label: comp.label })),
                                                }))}
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Display Name</Label>
                                              <Input
                                                value={item.component_name}
                                                onChange={(e) => updateCostItem(item.id, 'component_name', e.target.value)}
                                                placeholder="Custom name"
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Cost Amount *</Label>
                                              <Input
                                                type="number"
                                                value={item.cost_amount || ''}
                                                onChange={(e) => updateCostItem(item.id, 'cost_amount', parseFloat(e.target.value) || 0)}
                                                className="text-right font-mono"
                                                placeholder="0"
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Qty / Unit (optional)</Label>
                                              <div className="flex gap-1">
                                                <Input
                                                  type="number"
                                                  value={item.quantity || ''}
                                                  onChange={(e) => updateCostItem(item.id, 'quantity', e.target.value ? parseInt(e.target.value) : null)}
                                                  placeholder="Qty"
                                                  className="w-20 text-right"
                                                />
                                                <Input
                                                  value={item.unit || ''}
                                                  onChange={(e) => updateCostItem(item.id, 'unit', e.target.value)}
                                                  placeholder="Unit"
                                                  className="flex-1"
                                                />
                                              </div>
                                            </div>
                                            <div className="col-span-2">
                                              <Label className="text-xs">Description (optional)</Label>
                                              <Input
                                                value={item.description}
                                                onChange={(e) => updateCostItem(item.id, 'description', e.target.value)}
                                                placeholder="Additional details"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Terms & Conditions */}
                              <div>
                                <Label htmlFor="cost-terms">Terms & Conditions (optional)</Label>
                                <Textarea
                                  id="cost-terms"
                                  name="cost-terms"
                                  placeholder="Enter any terms or conditions"
                                  value={costTerms}
                                  onChange={(e) => setCostTerms(e.target.value)}
                                  rows={2}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => {
                                setCostDialogOpen(false)
                                setCostAmount('')
                                setCostTerms('')
                                setCostRateStructure('bundling')
                                setCostItems([])
                              }}>
                                Cancel
                              </Button>
                              <Button
                                onClick={handleSubmitCost}
                                disabled={
                                  actionLoading === 'submit_cost' ||
                                  (costRateStructure === 'bundling' && !costAmount) ||
                                  (costRateStructure === 'breakdown' && (costItems.length === 0 || totalBreakdownCost <= 0))
                                }
                                className="bg-green-600 hover:bg-green-700"
                              >
                                {actionLoading === 'submit_cost' ? (
                                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                Submit Cost
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}

                      {/* Multi-Shipment Cost Dialog */}
                      <MultiShipmentCostDialog
                        open={multiShipmentCostDialogOpen}
                        onOpenChange={setMultiShipmentCostDialogOpen}
                        ticketId={ticket.id}
                        ticketCode={ticket.ticket_code}
                        shipments={shipments}
                        existingCosts={costs.map(c => ({
                          id: c.id,
                          shipment_detail_id: c.shipment_detail_id,
                          shipment_label: c.shipment_label,
                          amount: c.amount,
                          status: c.status
                        }))}
                        onSuccess={() => {
                          // Refresh costs after submission
                          fetchData()
                        }}
                      />
                    </>
                  )}
                </div>

                {/* Status indicator - Need Your Response */}
                {ticket.pending_response_from && ticket.status !== 'pending' && (
                  <div className="text-center pt-2">
                    {/* Show "Need Your Response" if current user is the one who needs to respond */}
                    {((isCreator && ticket.pending_response_from === 'creator') ||
                      (!isCreator && ticket.pending_response_from === 'assignee')) ? (
                      <Badge variant="destructive" className="animate-pulse">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Need Your Response
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        Waiting for {ticket.pending_response_from === 'creator' ? 'Creator' : 'Department'} response
                      </Badge>
                    )}
                  </div>
                )}
                {/* Sent to Customer - waiting for feedback */}
                {ticket.status === 'pending' && (
                  <div className="text-center pt-2">
                    <Badge variant="outline" className="border-orange-400 text-orange-500">
                      <Clock className="h-3 w-3 mr-1" />
                      Cost sent to customer, awaiting feedback
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Activity Timeline */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Activity Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Response Summary Cards */}
              {(() => {
                const metrics = calculateResponseMetrics()
                const timeline = getTimelineWithResponseTimes()
                return (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Dept Response Card */}
                      <div className="rounded-lg p-3 bg-brand/10 border border-brand/20">
                        <div className="flex items-center gap-2 mb-1">
                          <Building2 className="h-3 w-3 text-brand" />
                          <span className="text-xs font-medium text-brand">Dept Response</span>
                        </div>
                        <p className="text-xl font-bold text-brand">
                          {metrics.dept.count > 0 ? formatShortDuration(metrics.dept.avgSeconds) : '-'}
                        </p>
                        <p className="text-xs text-muted-foreground">{metrics.dept.count} responses</p>
                      </div>

                      {/* Creator Response Card */}
                      <div className="rounded-lg p-3 bg-orange-500/10 border border-orange-500/20">
                        <div className="flex items-center gap-2 mb-1">
                          <User className="h-3 w-3 text-orange-500" />
                          <span className="text-xs font-medium text-orange-500">Creator Response</span>
                        </div>
                        <p className="text-xl font-bold text-orange-500">
                          {metrics.creator.count > 0 ? formatShortDuration(metrics.creator.avgSeconds) : '-'}
                        </p>
                        <p className="text-xs text-muted-foreground">{metrics.creator.count} responses</p>
                      </div>
                    </div>

                    {/* Timeline Items */}
                    {timeline.length === 0 ? (
                      <p className="text-muted-foreground text-sm text-center py-4">
                        No activity yet
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {timeline.map((item) => (
                          <div key={item.id} className="relative">
                            {/* Timeline Item Header */}
                            <div className="flex items-center gap-3 mb-2">
                              {/* Avatar */}
                              <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium ${
                                item.is_creator
                                  ? 'bg-orange-500/20 text-orange-500'
                                  : 'bg-brand/20 text-brand'
                              }`}>
                                {item.user_initials}
                              </div>

                              {/* Name and Badge */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{item.user_name}</span>
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0 ${
                                      item.badge_type === 'comment' ? 'border-blue-400 text-blue-500 bg-blue-500/10' :
                                      item.badge_type === 'internal' ? 'border-yellow-400 text-yellow-600 bg-yellow-500/10' :
                                      item.badge_type === 'cost' ? 'border-green-400 text-green-500 bg-green-500/10' :
                                      item.badge_type === 'status' ? 'border-orange-400 text-orange-500 bg-orange-500/10' :
                                      item.badge_type === 'sent_to_customer' ? 'border-purple-400 text-purple-500 bg-purple-500/10' :
                                      item.badge_type === 'adjustment' ? 'border-amber-400 text-amber-500 bg-amber-500/10' :
                                      item.badge_type === 'won' ? 'border-emerald-400 text-emerald-500 bg-emerald-500/10' :
                                      item.badge_type === 'lost' ? 'border-red-400 text-red-500 bg-red-500/10' :
                                      item.badge_type === 'assigned' ? 'border-cyan-400 text-cyan-500 bg-cyan-500/10' :
                                      item.badge_type === 'priority' ? 'border-pink-400 text-pink-500 bg-pink-500/10' :
                                      item.badge_type === 'quotation' ? 'border-indigo-400 text-indigo-500 bg-indigo-500/10' :
                                      item.badge_type === 'quotation_sent' ? 'border-violet-400 text-violet-500 bg-violet-500/10' :
                                      item.badge_type === 'accepted' ? 'border-emerald-400 text-emerald-500 bg-emerald-500/10' :
                                      item.badge_type === 'rejected' ? 'border-red-400 text-red-500 bg-red-500/10' :
                                      item.badge_type === 'created' ? 'border-gray-400 text-gray-500 bg-gray-500/10' :
                                      item.badge_type === 'resolved' ? 'border-teal-400 text-teal-500 bg-teal-500/10' :
                                      item.badge_type === 'closed' ? 'border-slate-400 text-slate-500 bg-slate-500/10' :
                                      item.badge_type === 'reopened' ? 'border-amber-400 text-amber-500 bg-amber-500/10' :
                                      ''
                                    }`}
                                  >
                                    {item.badge_label}
                                  </Badge>
                                </div>
                              </div>

                              {/* Response Time + Timestamp */}
                              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                                <div className="flex items-center gap-1">
                                  {item.is_creator ? (
                                    <User className="h-3 w-3" />
                                  ) : (
                                    <Building2 className="h-3 w-3" />
                                  )}
                                  <span>→</span>
                                  {!item.is_creator ? (
                                    <User className="h-3 w-3" />
                                  ) : (
                                    <Building2 className="h-3 w-3" />
                                  )}
                                </div>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-500 border-green-400">
                                  ⏱ {item.responseFormatted}
                                </Badge>
                              </div>
                            </div>

                            {/* Timestamp */}
                            <p className="text-[10px] text-muted-foreground ml-11 mb-2">
                              {formatDate(item.created_at)}
                            </p>

                            {/* Content Card */}
                            <div className={`ml-11 rounded-lg p-3 ${
                              item.is_creator
                                ? 'bg-orange-500/10 border border-orange-500/20'
                                : 'bg-muted/50 border border-border'
                            }`}>
                              {item.type === 'cost' && item.extra_data && (
                                <div className="mb-2">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <DollarSign className="h-3 w-3" />
                                    <span>Operational Cost</span>
                                    <span className="font-mono text-[10px]">{item.extra_data.cost_number}</span>
                                    {item.extra_data.rate_structure && (
                                      <Badge variant="outline" className="text-[10px] py-0">
                                        {item.extra_data.rate_structure}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-lg font-bold text-green-500">
                                    {item.extra_data.currency} {Number(item.extra_data.amount).toLocaleString('id-ID')}
                                  </p>
                                  {item.extra_data.valid_until && (
                                    <p className="text-[10px] text-muted-foreground">
                                      Valid until: {new Date(item.extra_data.valid_until).toLocaleDateString('id-ID')}
                                    </p>
                                  )}
                                  {/* Shipment Info for multi-shipment */}
                                  {(item.extra_data.shipment_label || item.extra_data.shipment_route) && (
                                    <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-800 rounded text-xs">
                                      <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        <Package className="h-3 w-3" />
                                        {item.extra_data.shipment_label || 'Shipment'}
                                        {item.extra_data.shipment_service && (
                                          <Badge variant="secondary" className="text-[10px] py-0 px-1">
                                            {item.extra_data.shipment_service}
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
                                        {item.extra_data.shipment_route && (
                                          <div className="col-span-2">
                                            <span className="text-emerald-600">{item.extra_data.shipment_route.split('→')[0]?.trim()}</span>
                                            <span className="mx-1">→</span>
                                            <span className="text-rose-600">{item.extra_data.shipment_route.split('→')[1]?.trim()}</span>
                                          </div>
                                        )}
                                        {item.extra_data.shipment_fleet && (
                                          <div>Fleet: <span className="text-foreground">{item.extra_data.shipment_fleet}</span></div>
                                        )}
                                        {item.extra_data.shipment_weight && (
                                          <div>Weight: <span className="text-foreground">{item.extra_data.shipment_weight.toLocaleString()} kg</span></div>
                                        )}
                                        {item.extra_data.shipment_volume && (
                                          <div>Volume: <span className="text-foreground">{item.extra_data.shipment_volume} CBM</span></div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {item.type === 'status_change' && item.extra_data && (
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="outline" className="text-[10px]">
                                    {statusVariants[item.extra_data.new_status as TicketStatus]?.label || item.extra_data.new_status}
                                  </Badge>
                                </div>
                              )}

                              {item.badge_type === 'sent_to_customer' && (
                                <div className="space-y-1 mb-2">
                                  <div className="flex items-center gap-2">
                                    <Forward className="h-4 w-4 text-purple-500" />
                                    <span className="text-sm font-medium text-purple-500">Sent to Customer</span>
                                  </div>
                                  {item.extra_data?.quotation_id && (
                                    <Link
                                      href={`/customer-quotations/${item.extra_data.quotation_id}`}
                                      className="inline-flex items-center gap-1 text-xs text-brand hover:underline ml-6"
                                    >
                                      <FileText className="h-3 w-3" />
                                      View Quotation {item.extra_data.quotation_number ? `(${item.extra_data.quotation_number})` : ''}
                                    </Link>
                                  )}
                                </div>
                              )}

                              {item.badge_type === 'adjustment' && (
                                <div className="flex items-center gap-2 mb-2">
                                  <RotateCcw className="h-4 w-4 text-amber-500" />
                                  <span className="text-sm font-medium text-amber-500">Request Adjustment</span>
                                </div>
                              )}

                              {item.badge_type === 'won' && (
                                <div className="flex items-center gap-2 mb-2">
                                  <Award className="h-4 w-4 text-emerald-500" />
                                  <span className="text-sm font-medium text-emerald-500">Won</span>
                                </div>
                              )}

                              {item.badge_type === 'lost' && (
                                <div className="flex items-center gap-2 mb-2">
                                  <XCircle className="h-4 w-4 text-red-500" />
                                  <span className="text-sm font-medium text-red-500">Lost</span>
                                </div>
                              )}

                              {item.content && (
                                <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                              )}

                              {item.type === 'cost' && item.extra_data?.terms && (
                                <p className="text-xs text-muted-foreground mt-2">{item.extra_data.terms}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}
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
              {/* Lost Details - only show when outcome is lost */}
              {ticket.close_outcome === 'lost' && ticket.close_reason && (
                <div className="p-3 border border-red-200 rounded-lg bg-red-50 dark:bg-red-950/20 dark:border-red-900 space-y-2">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">Lost Details</p>
                  <div>
                    <p className="text-xs text-muted-foreground">Reason</p>
                    <p className="text-sm">{ticket.close_reason}</p>
                  </div>
                  {ticket.competitor_name && (
                    <div>
                      <p className="text-xs text-muted-foreground">Competitor</p>
                      <p className="text-sm">{ticket.competitor_name}</p>
                    </div>
                  )}
                  {ticket.competitor_cost && (
                    <div>
                      <p className="text-xs text-muted-foreground">Competitor Price</p>
                      <p className="text-sm font-medium">IDR {Number(ticket.competitor_cost).toLocaleString('id-ID')}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Customer Quotations Card - for RFQ tickets */}
          {ticket.ticket_type === 'RFQ' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Customer Quotations ({customerQuotations.length})
                  </div>
                  {isCreator && !isClosed && (
                    <Button size="sm" variant="outline" onClick={() => setQuotationDialogOpen(true)}>
                      <Plus className="h-3 w-3 mr-1" /> New
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {customerQuotations.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    No customer quotations yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {customerQuotations.map((quotation: any) => {
                      // For OPS users: show as non-clickable div without price
                      // For other users: show as clickable link with price
                      const QuotationItem = (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-sm font-medium">{quotation.quotation_number}</span>
                            <Badge variant={
                              quotation.status === 'sent' ? 'default' :
                              quotation.status === 'accepted' ? 'outline' :
                              quotation.status === 'rejected' ? 'destructive' :
                              quotation.status === 'draft' ? 'secondary' : 'outline'
                            } className={
                              quotation.status === 'accepted' ? 'border-green-500 text-green-600 bg-green-500/10' : ''
                            }>
                              {quotation.status}
                            </Badge>
                          </div>
                          {/* Hide price for OPS users */}
                          {!isOpsUser && (
                            <div className="text-sm text-muted-foreground">
                              {quotation.currency} {Number(quotation.total_selling_rate).toLocaleString('id-ID')}
                            </div>
                          )}
                          {quotation.sent_at && (
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Sent: {formatDate(quotation.sent_at)}
                            </div>
                          )}
                        </>
                      )

                      // OPS users: non-clickable div
                      if (isOpsUser) {
                        return (
                          <div
                            key={quotation.id}
                            className="block p-3 rounded-lg border bg-muted/30"
                          >
                            {QuotationItem}
                          </div>
                        )
                      }

                      // Other users: clickable link
                      return (
                        <Link
                          key={quotation.id}
                          href={`/customer-quotations/${quotation.id}`}
                          className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          {QuotationItem}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Ticket Actions Card - for Admin and Ops */}
          {(canAssign || canTransition) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ticket Actions</CardTitle>
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

          {/* Activity Log */}
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
                  {events.slice(0, 15).map((event) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex-shrink-0 mt-1.5">
                        <div className="h-2 w-2 rounded-full bg-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{event.actor?.name || 'System'}</span>
                          {' '}
                          <span className="text-muted-foreground">
                            {formatEventType(event.event_type)}
                          </span>
                        </p>
                        {event.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {event.notes}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
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

      {/* Customer Quotation Dialog */}
      <CustomerQuotationDialog
        open={quotationDialogOpen}
        onOpenChange={setQuotationDialogOpen}
        ticketId={ticket.id}
        ticketData={{
          ticket_code: ticket.ticket_code,
          subject: ticket.subject,
          rfq_data: ticket.rfq_data,
          account: ticket.account || undefined,
          contact: ticket.sender_name ? {
            first_name: ticket.sender_name,
            last_name: '',
            email: ticket.sender_email || undefined,
            phone: ticket.sender_phone || undefined,
          } : undefined,
        }}
        // Pass lead data with shipments array for multi-shipment support
        lead={leadData ? {
          lead_id: leadData.lead_id,
          company_name: leadData.company_name || ticket.account?.company_name || '',
          contact_name: leadData.contact_name || ticket.sender_name || undefined,
          contact_email: leadData.contact_email || ticket.sender_email || undefined,
          contact_phone: leadData.contact_phone || ticket.sender_phone || undefined,
          shipment_details: leadData.shipment_details || undefined,
          // Multi-shipment support: pass all shipments
          shipments: shipments.length > 0 ? shipments : (leadData.shipments || undefined),
        } : ticket.lead_id ? {
          lead_id: ticket.lead_id,
          company_name: ticket.account?.company_name || '',
          contact_name: ticket.sender_name || undefined,
          contact_email: ticket.sender_email || undefined,
          contact_phone: ticket.sender_phone || undefined,
        } : undefined}
        // Pass opportunity data if ticket is linked to a pipeline
        opportunity={ticket.opportunity ? {
          opportunity_id: ticket.opportunity.opportunity_id,
          name: ticket.opportunity.name,
          company_name: ticket.account?.company_name,
          pic_name: ticket.sender_name || undefined,
          pic_email: ticket.sender_email || undefined,
          pic_phone: ticket.sender_phone || undefined,
        } : undefined}
        // Filter to only submitted costs (exclude rejected/revise_requested costs)
        operationalCost={(() => {
          const submittedCosts = costs.filter(c => c.status === 'submitted')
          if (submittedCosts.length === 0) return undefined
          // For single cost, use the latest submitted
          const latestCost = submittedCosts[0]
          return {
            id: latestCost?.id,
            amount: latestCost?.amount || 0,
            currency: latestCost?.currency || 'IDR',
            rate_structure: latestCost?.rate_structure || 'bundling',
            items: latestCost?.items || [],
          }
        })()}
        // Multi-shipment support: Pass all submitted costs, deduplicated by shipment_detail_id (latest per shipment)
        operationalCosts={(() => {
          const submittedCosts = costs.filter(c => c.status === 'submitted')
          if (submittedCosts.length === 0 || shipments.length <= 1) return undefined

          // Deduplicate: for each shipment_detail_id, keep only the latest cost
          const costsByShipment = new Map<string | null, typeof submittedCosts[0]>()

          // Costs are already sorted by created_at DESC, so first occurrence is latest
          for (const cost of submittedCosts) {
            const key = cost.shipment_detail_id || '__no_shipment__'
            if (!costsByShipment.has(key)) {
              costsByShipment.set(key, cost)
            }
          }

          // Convert map to array and format for dialog
          return Array.from(costsByShipment.values()).map(c => ({
            id: c.id,
            shipment_detail_id: c.shipment_detail_id || null,
            shipment_label: c.shipment_label || null,
            amount: c.amount || 0,
            currency: c.currency || 'IDR',
            rate_structure: c.rate_structure || 'bundling',
            items: c.items || [],
          }))
        })()}
        onSuccess={() => {
          setQuotationDialogOpen(false)
          fetchData()
        }}
      />
    </div>
  )
}
