// =====================================================
// Lead Detail Dialog - View and Edit Lead Details
// =====================================================

'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Eye, Pencil, X, Check, FileText, Download, Paperclip, Package, MapPin, Truck, Plus, Send, Ticket, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate, formatCurrency } from '@/lib/utils'
import {
  LEAD_SOURCES,
  INDUSTRIES,
  PRIORITY_LEVELS,
} from '@/lib/constants'
import { getQuotationSequenceLabel } from '@/lib/utils/quotation-utils'
import { toast } from '@/hooks/use-toast'
import type { LeadTriageStatus, LeadSource, UserRole } from '@/types/database'

interface ShipmentDetails {
  shipment_detail_id: string
  lead_id: string
  service_type_code: string | null
  department: string | null
  fleet_type: string | null
  fleet_quantity: number | null
  incoterm: string | null
  cargo_category: string | null
  cargo_description: string | null
  origin_address: string | null
  origin_city: string | null
  origin_country: string | null
  destination_address: string | null
  destination_city: string | null
  destination_country: string | null
  quantity: number | null
  unit_of_measure: string | null
  weight_per_unit_kg: number | null
  weight_total_kg: number | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  volume_total_cbm: number | null
  scope_of_work: string | null
  additional_services: string[] | null
  created_at: string
  shipment_order?: number
  shipment_label?: string | null
}

interface Lead {
  lead_id: string
  company_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  industry: string | null
  source: LeadSource
  source_detail: string | null
  triage_status: LeadTriageStatus
  priority: number
  notes: string | null
  potential_revenue: number | null
  claim_status: string | null
  claimed_by_name: string | null
  marketing_owner_user_id: string | null
  sales_owner_user_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // CRM linkage
  account_id?: string | null
  opportunity_id?: string | null
  // Creator info
  creator_name?: string | null
  creator_role?: UserRole | null
  creator_department?: string | null
  creator_is_marketing?: boolean | null
  // Shipment details (legacy single shipment for backward compatibility)
  shipment_details?: ShipmentDetails | null
  // Multiple shipments support
  shipments?: ShipmentDetails[]
  shipment_count?: number
  // Quotation tracking
  quotation_status?: string | null
  quotation_count?: number
  latest_quotation_id?: string | null
}

interface Attachment {
  attachment_id: string
  file_name: string
  file_path: string
  file_size: number | null
  file_type: string | null
  url: string | null
  created_at: string
}

interface LeadDetailDialogProps {
  lead: Lead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserId: string
  userRole: UserRole | null
}

const MANAGER_ROLES: UserRole[] = ['Director', 'super admin', 'Marketing Manager', 'sales manager']

// Check if user is MACX role
const isMACXRole = (role: UserRole | null): boolean => role === 'MACX'

// Check if creator is in marketing department
const isCreatorMarketingDept = (lead: Lead): boolean => {
  if (lead.creator_is_marketing === true) return true
  if (lead.creator_department && lead.creator_department.toLowerCase().includes('marketing')) return true
  if (lead.creator_role && ['Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO'].includes(lead.creator_role)) return true
  return false
}

export function LeadDetailDialog({
  lead,
  open,
  onOpenChange,
  currentUserId,
  userRole,
}: LeadDetailDialogProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const [loadingAttachments, setLoadingAttachments] = React.useState(false)

  // Quotation state
  const [quotations, setQuotations] = React.useState<any[]>([])
  const [loadingQuotations, setLoadingQuotations] = React.useState(false)
  const [showCreateOptions, setShowCreateOptions] = React.useState(false)
  const [creatingQuotation, setCreatingQuotation] = React.useState(false)

  const [editData, setEditData] = React.useState({
    company_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    industry: '',
    source: '' as string,
    source_detail: '',
    priority: 2,
    notes: '',
    potential_revenue: '',
  })

  // Check if user can edit this lead
  const canEdit = React.useMemo(() => {
    if (!lead || !userRole) return false

    // Admin and managers can always edit
    if (MANAGER_ROLES.includes(userRole)) return true

    // Creator can edit their own lead
    if (lead.created_by === currentUserId) return true

    // Marketing owner can edit
    if (lead.marketing_owner_user_id === currentUserId) return true

    // Sales owner can edit
    if (lead.sales_owner_user_id === currentUserId) return true

    // MACX can edit leads created by marketing department users
    if (isMACXRole(userRole) && isCreatorMarketingDept(lead)) return true

    return false
  }, [lead, userRole, currentUserId])

  // Reset edit data when lead changes
  React.useEffect(() => {
    if (lead) {
      setEditData({
        company_name: lead.company_name || '',
        contact_name: lead.contact_name || '',
        contact_email: lead.contact_email || '',
        contact_phone: lead.contact_phone || '',
        industry: lead.industry || '',
        source: lead.source || '',
        source_detail: lead.source_detail || '',
        priority: lead.priority || 2,
        notes: lead.notes || '',
        potential_revenue: lead.potential_revenue?.toString() || '',
      })
    }
    setIsEditing(false)
    setError(null)
  }, [lead])

  // Fetch attachments when dialog opens
  React.useEffect(() => {
    const fetchAttachments = async () => {
      if (!lead || !open) return

      setLoadingAttachments(true)
      try {
        const response = await fetch(`/api/crm/leads/attachments?lead_id=${lead.lead_id}`)
        if (response.ok) {
          const { data } = await response.json()
          setAttachments(data || [])
        }
      } catch (err) {
        console.error('Error fetching attachments:', err)
      } finally {
        setLoadingAttachments(false)
      }
    }

    fetchAttachments()
  }, [lead, open])

  // Fetch quotations for this lead
  React.useEffect(() => {
    const fetchQuotations = async () => {
      if (!lead || !open) return

      setLoadingQuotations(true)
      try {
        const response = await fetch(`/api/ticketing/customer-quotations?lead_id=${lead.lead_id}`)
        if (response.ok) {
          const result = await response.json()
          setQuotations(result.data || [])
        }
      } catch (err) {
        console.error('Error fetching quotations:', err)
      } finally {
        setLoadingQuotations(false)
      }
    }

    fetchQuotations()
  }, [lead, open])

  // Check if lead can create quotation (must be Qualified or Assign to Sales)
  const canCreateQuotation = React.useMemo(() => {
    if (!lead) return false
    return ['Qualified', 'Assign to Sales'].includes(lead.triage_status)
  }, [lead])

  // Create RFQ ticket from lead
  const handleCreateTicket = () => {
    if (!lead) return

    // Store shipment data in sessionStorage for ticket form to read
    if (lead.shipment_details) {
      sessionStorage.setItem('prefill_ticket_shipment', JSON.stringify({
        service_type_code: lead.shipment_details.service_type_code,
        department: lead.shipment_details.department,
        fleet_type: lead.shipment_details.fleet_type,
        fleet_quantity: lead.shipment_details.fleet_quantity,
        incoterm: lead.shipment_details.incoterm,
        cargo_category: lead.shipment_details.cargo_category,
        cargo_description: lead.shipment_details.cargo_description,
        origin_address: lead.shipment_details.origin_address,
        origin_city: lead.shipment_details.origin_city,
        origin_country: lead.shipment_details.origin_country,
        destination_address: lead.shipment_details.destination_address,
        destination_city: lead.shipment_details.destination_city,
        destination_country: lead.shipment_details.destination_country,
        quantity: lead.shipment_details.quantity,
        unit_of_measure: lead.shipment_details.unit_of_measure,
        weight_per_unit_kg: lead.shipment_details.weight_per_unit_kg,
        weight_total_kg: lead.shipment_details.weight_total_kg,
        length_cm: lead.shipment_details.length_cm,
        width_cm: lead.shipment_details.width_cm,
        height_cm: lead.shipment_details.height_cm,
        volume_total_cbm: lead.shipment_details.volume_total_cbm,
        scope_of_work: lead.shipment_details.scope_of_work,
        additional_services: lead.shipment_details.additional_services,
      }))
    }

    // Navigate to ticket creation with lead data pre-filled
    const params = new URLSearchParams({
      from: 'lead',
      lead_id: lead.lead_id,
      company_name: lead.company_name,
      contact_name: lead.contact_name || '',
      contact_email: lead.contact_email || '',
      contact_phone: lead.contact_phone || '',
    })
    // FIX: Pass account_id and opportunity_id for proper prefill and linkage
    if (lead.account_id) {
      params.set('account_id', lead.account_id)
    }
    if (lead.opportunity_id) {
      params.set('opportunity_id', lead.opportunity_id)
    }
    router.push(`/tickets/new?${params.toString()}`)
    onOpenChange(false)
  }

  // Create quotation directly from lead
  const handleCreateQuotation = async () => {
    if (!lead) return

    setCreatingQuotation(true)
    try {
      // Create quotation via RPC
      const response = await fetch('/api/ticketing/customer-quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.lead_id,
          source_type: 'lead',
          customer_name: lead.contact_name || lead.company_name,
          customer_company: lead.company_name,
          customer_email: lead.contact_email,
          customer_phone: lead.contact_phone,
          // Shipment details if available
          service_type: lead.shipment_details?.service_type_code,
          department: lead.shipment_details?.department,
          fleet_type: lead.shipment_details?.fleet_type,
          fleet_quantity: lead.shipment_details?.fleet_quantity,
          incoterm: lead.shipment_details?.incoterm,
          commodity: lead.shipment_details?.cargo_category,
          cargo_description: lead.shipment_details?.cargo_description,
          cargo_weight: lead.shipment_details?.weight_total_kg,
          cargo_weight_unit: 'kg',
          cargo_volume: lead.shipment_details?.volume_total_cbm,
          cargo_volume_unit: 'cbm',
          cargo_quantity: lead.shipment_details?.quantity,
          cargo_quantity_unit: lead.shipment_details?.unit_of_measure,
          origin_address: lead.shipment_details?.origin_address,
          origin_city: lead.shipment_details?.origin_city,
          origin_country: lead.shipment_details?.origin_country,
          destination_address: lead.shipment_details?.destination_address,
          destination_city: lead.shipment_details?.destination_city,
          destination_country: lead.shipment_details?.destination_country,
          scope_of_work: lead.shipment_details?.scope_of_work,
        }),
      })

      const result = await response.json()

      if (result.success) {
        toast({
          title: 'Quotation Created',
          description: `Quotation ${result.quotation_number} created successfully`,
        })
        // Navigate to quotation editor
        router.push(`/customer-quotations/${result.quotation_id}`)
        onOpenChange(false)
      } else {
        throw new Error(result.error || 'Failed to create quotation')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setCreatingQuotation(false)
    }
  }

  // Format file size
  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleSave = async () => {
    if (!lead) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/crm/leads/${lead.lead_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_name: editData.company_name,
          contact_name: editData.contact_name || null,
          contact_email: editData.contact_email || null,
          contact_phone: editData.contact_phone || null,
          industry: editData.industry || null,
          source: editData.source,
          source_detail: editData.source_detail || null,
          priority: editData.priority,
          notes: editData.notes || null,
          potential_revenue: editData.potential_revenue ? parseFloat(editData.potential_revenue) : null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update lead')
      }

      setIsEditing(false)
      toast.success('Perubahan tersimpan', `Lead ${editData.company_name} berhasil diupdate`)
      router.refresh()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      toast.error('Gagal menyimpan', errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const getPriorityLabel = (priority: number) => {
    const level = PRIORITY_LEVELS.find(l => l.value === priority)
    return level?.label || 'Unknown'
  }

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1:
        return 'bg-slate-500'
      case 2:
        return 'bg-blue-500'
      case 3:
        return 'bg-orange-500'
      case 4:
        return 'bg-red-500'
      default:
        return 'bg-slate-500'
    }
  }

  const getStatusBadgeVariant = (status: LeadTriageStatus) => {
    switch (status) {
      case 'New':
        return 'secondary'
      case 'In Review':
        return 'outline'
      case 'Qualified':
        return 'default'
      case 'Assign to Sales':
        return 'default'
      case 'Nurture':
        return 'secondary'
      case 'Disqualified':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  if (!lead) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto p-4 lg:p-6">
        <DialogHeader className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-base lg:text-lg">
              <Eye className="h-4 w-4 lg:h-5 lg:w-5" />
              Lead Detail
            </DialogTitle>
            {canEdit && !isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="mr-6 lg:mr-8"
              >
                <Pencil className="h-4 w-4 lg:mr-2" />
                <span className="hidden lg:inline">Edit</span>
              </Button>
            )}
          </div>
          <DialogDescription className="text-xs lg:text-sm">
            {isEditing ? 'Edit lead information' : 'View lead information'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Status & Priority Row */}
          <div className="flex items-center gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <div className="mt-1">
                <Badge variant={getStatusBadgeVariant(lead.triage_status)}>
                  {lead.triage_status}
                </Badge>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <div className="mt-1">
                {isEditing ? (
                  <Select
                    value={editData.priority.toString()}
                    onValueChange={(value) =>
                      setEditData({ ...editData, priority: parseInt(value) })
                    }
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_LEVELS.map((level) => (
                        <SelectItem
                          key={level.value}
                          value={level.value.toString()}
                        >
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge className={`${getPriorityColor(lead.priority)} text-white`}>
                    {getPriorityLabel(lead.priority)}
                  </Badge>
                )}
              </div>
            </div>
            {lead.claim_status && (
              <div>
                <Label className="text-xs text-muted-foreground">Claim Status</Label>
                <div className="mt-1">
                  <Badge variant={lead.claim_status === 'claimed' ? 'default' : 'secondary'}>
                    {lead.claim_status}
                  </Badge>
                </div>
              </div>
            )}
          </div>

          {/* Company Information */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground border-b pb-2">
              Company Information
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                {isEditing ? (
                  <Input
                    id="company_name"
                    value={editData.company_name}
                    onChange={(e) =>
                      setEditData({ ...editData, company_name: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-sm font-medium">{lead.company_name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                {isEditing ? (
                  <Select
                    value={editData.industry}
                    onValueChange={(value) =>
                      setEditData({ ...editData, industry: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((industry) => (
                        <SelectItem key={industry} value={industry}>
                          {industry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">{lead.industry || '-'}</p>
                )}
              </div>
            </div>
          </div>

          {/* Contact Person */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground border-b pb-2">
              Contact Person (PIC)
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact_name">Name</Label>
                {isEditing ? (
                  <Input
                    id="contact_name"
                    value={editData.contact_name}
                    onChange={(e) =>
                      setEditData({ ...editData, contact_name: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-sm">{lead.contact_name || '-'}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_phone">Phone</Label>
                {isEditing ? (
                  <Input
                    id="contact_phone"
                    value={editData.contact_phone}
                    onChange={(e) =>
                      setEditData({ ...editData, contact_phone: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-sm">{lead.contact_phone || '-'}</p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="contact_email">Email</Label>
                {isEditing ? (
                  <Input
                    id="contact_email"
                    type="email"
                    value={editData.contact_email}
                    onChange={(e) =>
                      setEditData({ ...editData, contact_email: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-sm">{lead.contact_email || '-'}</p>
                )}
              </div>
            </div>
          </div>

          {/* Lead Details */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground border-b pb-2">
              Lead Details
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="source">Source</Label>
                {isEditing ? (
                  <Select
                    value={editData.source}
                    onValueChange={(value) =>
                      setEditData({ ...editData, source: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map((source) => (
                        <SelectItem key={source} value={source}>
                          {source}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">{lead.source || '-'}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="source_detail">Source Detail</Label>
                {isEditing ? (
                  <Input
                    id="source_detail"
                    value={editData.source_detail}
                    onChange={(e) =>
                      setEditData({ ...editData, source_detail: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-sm">{lead.source_detail || '-'}</p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="potential_revenue">Potential Revenue</Label>
                {isEditing ? (
                  <Input
                    id="potential_revenue"
                    type="number"
                    value={editData.potential_revenue}
                    onChange={(e) =>
                      setEditData({ ...editData, potential_revenue: e.target.value })
                    }
                    placeholder="Enter potential revenue"
                  />
                ) : (
                  <p className="text-sm">
                    {lead.potential_revenue
                      ? formatCurrency(lead.potential_revenue)
                      : '-'}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes / Inquiry</Label>
              {isEditing ? (
                <Textarea
                  id="notes"
                  value={editData.notes}
                  onChange={(e) =>
                    setEditData({ ...editData, notes: e.target.value })
                  }
                  rows={3}
                />
              ) : (
                <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">
                  {lead.notes || 'No notes'}
                </p>
              )}
            </div>
          </div>

          {/* Shipment Details - Multi-shipment support with tabs */}
          {(() => {
            // Get all shipments - prefer shipments array over single shipment_details
            const allShipments = lead.shipments && lead.shipments.length > 0
              ? lead.shipments
              : lead.shipment_details
                ? [lead.shipment_details]
                : []

            if (allShipments.length === 0) return null

            // Render shipment content helper
            const renderShipmentContent = (shipment: ShipmentDetails) => (
              <div className="space-y-4">
                {/* Service Information */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Service Type</Label>
                    <p className="text-sm font-medium">{shipment.service_type_code || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Department</Label>
                    <p className="text-sm">{shipment.department || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Fleet Type</Label>
                    <p className="text-sm">{shipment.fleet_type || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Fleet Quantity</Label>
                    <p className="text-sm">{shipment.fleet_quantity || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Incoterm</Label>
                    <p className="text-sm">{shipment.incoterm || '-'}</p>
                  </div>
                </div>

                {/* Cargo Information */}
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                    <Truck className="h-3 w-3" /> Cargo Information
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Cargo Category</Label>
                      <p className="text-sm">{shipment.cargo_category || '-'}</p>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">Cargo Description</Label>
                      <p className="text-sm bg-muted p-2 rounded">{shipment.cargo_description || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* Origin & Destination */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Origin */}
                  <div className="space-y-2 p-3 border rounded-md bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Origin
                    </p>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Address</Label>
                        <p className="text-sm">{shipment.origin_address || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">City</Label>
                        <p className="text-sm">{shipment.origin_city || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Country</Label>
                        <p className="text-sm">{shipment.origin_country || '-'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Destination */}
                  <div className="space-y-2 p-3 border rounded-md bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Destination
                    </p>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Address</Label>
                        <p className="text-sm">{shipment.destination_address || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">City</Label>
                        <p className="text-sm">{shipment.destination_city || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Country</Label>
                        <p className="text-sm">{shipment.destination_country || '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quantity & Dimensions */}
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Quantity & Dimensions</p>
                  <div className="grid gap-4 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Quantity</Label>
                      <p className="text-sm">{shipment.quantity || '-'} {shipment.unit_of_measure || ''}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Weight/Unit</Label>
                      <p className="text-sm">{shipment.weight_per_unit_kg ? `${shipment.weight_per_unit_kg} Kg` : '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Total Weight</Label>
                      <p className="text-sm">{shipment.weight_total_kg ? `${shipment.weight_total_kg} Kg` : '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Total Volume</Label>
                      <p className="text-sm">{shipment.volume_total_cbm ? `${shipment.volume_total_cbm} CBM` : '-'}</p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Length</Label>
                      <p className="text-sm">{shipment.length_cm ? `${shipment.length_cm} cm` : '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Width</Label>
                      <p className="text-sm">{shipment.width_cm ? `${shipment.width_cm} cm` : '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Height</Label>
                      <p className="text-sm">{shipment.height_cm ? `${shipment.height_cm} cm` : '-'}</p>
                    </div>
                  </div>
                </div>

                {/* Scope of Work */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Scope of Work</Label>
                  <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">
                    {shipment.scope_of_work || '-'}
                  </p>
                </div>

                {/* Additional Services */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Additional Services</Label>
                  {shipment.additional_services && shipment.additional_services.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {shipment.additional_services.map((service, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {service}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">-</p>
                  )}
                </div>
              </div>
            )

            return (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground border-b pb-2 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Shipment Details
                  {allShipments.length > 1 && (
                    <Badge variant="secondary" className="ml-auto">
                      {allShipments.length} shipments
                    </Badge>
                  )}
                </h4>

                {allShipments.length === 1 ? (
                  // Single shipment - no tabs needed
                  renderShipmentContent(allShipments[0])
                ) : (
                  // Multiple shipments - show tabs
                  <Tabs defaultValue="shipment-0" className="w-full">
                    <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
                      {allShipments.map((shipment, index) => (
                        <TabsTrigger
                          key={index}
                          value={`shipment-${index}`}
                          className="flex-1 min-w-[100px] text-xs data-[state=active]:bg-background"
                        >
                          {shipment.shipment_label || `Shipment ${shipment.shipment_order || index + 1}`}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {allShipments.map((shipment, index) => (
                      <TabsContent key={index} value={`shipment-${index}`} className="mt-4">
                        {renderShipmentContent(shipment)}
                      </TabsContent>
                    ))}
                  </Tabs>
                )}
              </div>
            )
          })()}

          {/* Attachments */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground border-b pb-2 flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Attachments
            </h4>
            {loadingAttachments ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading attachments...</span>
              </div>
            ) : attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.attachment_id}
                    className="flex items-center justify-between p-3 border rounded-md bg-muted/30"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{attachment.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(attachment.file_size)}
                          {attachment.file_type && ` • ${attachment.file_type.split('/')[1]?.toUpperCase() || attachment.file_type}`}
                        </p>
                      </div>
                    </div>
                    {attachment.url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="flex-shrink-0"
                      >
                        <a href={attachment.url} target="_blank" rel="noopener noreferrer" download>
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No attachments
              </p>
            )}
          </div>

          {/* Quotations Section - for Qualified leads */}
          {canCreateQuotation && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground border-b pb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Customer Quotations
                {quotations.length > 0 && (
                  <Badge variant="secondary" className="ml-auto">{quotations.length}</Badge>
                )}
              </h4>

              {/* Create Options */}
              {!showCreateOptions ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCreateOptions(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Create Ticket / Quotation
                  </Button>
                </div>
              ) : (
                <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                  <p className="text-sm font-medium">Choose how to proceed:</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCreateTicket}
                      className="flex-1"
                    >
                      <Ticket className="h-4 w-4 mr-2" />
                      Create RFQ Ticket
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleCreateQuotation}
                      disabled={creatingQuotation}
                      className="flex-1"
                    >
                      {creatingQuotation ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4 mr-2" />
                      )}
                      Create Quotation
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreateOptions(false)}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {/* Existing Quotations List */}
              {loadingQuotations ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading quotations...</span>
                </div>
              ) : quotations.length > 0 ? (
                <div className="space-y-2">
                  {quotations.map((quotation, index) => (
                    <div
                      key={quotation.id}
                      className="flex items-center justify-between p-3 border rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/customer-quotations/${quotation.id}`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {quotation.quotation_number}
                            <span className="text-xs text-muted-foreground ml-2">
                              ({getQuotationSequenceLabel(quotation.sequence_number || index + 1)} Quotation)
                            </span>
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge
                              variant={
                                quotation.status === 'accepted' ? 'default' :
                                quotation.status === 'rejected' ? 'destructive' :
                                quotation.status === 'sent' ? 'secondary' : 'outline'
                              }
                              className={
                                quotation.status === 'accepted' ? 'bg-green-500' : ''
                              }
                            >
                              {quotation.status}
                            </Badge>
                            {quotation.total_selling_rate && (
                              <span>
                                {quotation.currency} {Number(quotation.total_selling_rate).toLocaleString('id-ID')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No quotations yet
                </p>
              )}

              {/* Quotation Status Summary */}
              {lead.quotation_status && (
                <div className="p-3 rounded-lg bg-muted/50 text-sm">
                  <span className="text-muted-foreground">Latest status: </span>
                  <Badge variant={
                    lead.quotation_status === 'accepted' ? 'default' :
                    lead.quotation_status === 'rejected' ? 'destructive' :
                    lead.quotation_status === 'sent' ? 'secondary' : 'outline'
                  } className={lead.quotation_status === 'accepted' ? 'bg-green-500' : ''}>
                    Quotation {lead.quotation_status}
                  </Badge>
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground border-b pb-2">
              Metadata
            </h4>
            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Created At</Label>
                <p>{formatDate(lead.created_at)}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Created By</Label>
                <p>
                  {lead.creator_name
                    ? `${lead.creator_name}${lead.creator_department ? ` - ${lead.creator_department}` : ''}`
                    : '-'}
                </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Updated At</Label>
                <p>{formatDate(lead.updated_at)}</p>
              </div>
              {lead.claimed_by_name && (
                <div>
                  <Label className="text-xs text-muted-foreground">Claimed By</Label>
                  <p>{lead.claimed_by_name}</p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {isEditing ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditing(false)
                  // Reset to original data
                  if (lead) {
                    setEditData({
                      company_name: lead.company_name || '',
                      contact_name: lead.contact_name || '',
                      contact_email: lead.contact_email || '',
                      contact_phone: lead.contact_phone || '',
                      industry: lead.industry || '',
                      source: lead.source || '',
                      source_detail: lead.source_detail || '',
                      priority: lead.priority || 2,
                      notes: lead.notes || '',
                      potential_revenue: lead.potential_revenue?.toString() || '',
                    })
                  }
                  setError(null)
                }}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto">
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
