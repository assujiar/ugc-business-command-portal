// =====================================================
// Lead Detail Dialog - View and Edit Lead Details
// =====================================================

'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Eye, Pencil, X, Check, FileText, Download, Paperclip, Package, MapPin, Truck } from 'lucide-react'
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
  // Creator info
  creator_name?: string | null
  creator_role?: UserRole | null
  creator_department?: string | null
  creator_is_marketing?: boolean | null
  // Shipment details
  shipment_details?: ShipmentDetails | null
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
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
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

          {/* Shipment Details */}
          {lead.shipment_details && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground border-b pb-2 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Shipment Details
              </h4>

              {/* Service Information */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Service Type</Label>
                  <p className="text-sm font-medium">{lead.shipment_details.service_type_code || '-'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Department</Label>
                  <p className="text-sm">{lead.shipment_details.department || '-'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fleet Type</Label>
                  <p className="text-sm">{lead.shipment_details.fleet_type || '-'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fleet Quantity</Label>
                  <p className="text-sm">{lead.shipment_details.fleet_quantity || '-'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Incoterm</Label>
                  <p className="text-sm">{lead.shipment_details.incoterm || '-'}</p>
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
                    <p className="text-sm">{lead.shipment_details.cargo_category || '-'}</p>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Cargo Description</Label>
                    <p className="text-sm bg-muted p-2 rounded">{lead.shipment_details.cargo_description || '-'}</p>
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
                      <p className="text-sm">{lead.shipment_details.origin_address || '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">City</Label>
                      <p className="text-sm">{lead.shipment_details.origin_city || '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Country</Label>
                      <p className="text-sm">{lead.shipment_details.origin_country || '-'}</p>
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
                      <p className="text-sm">{lead.shipment_details.destination_address || '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">City</Label>
                      <p className="text-sm">{lead.shipment_details.destination_city || '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Country</Label>
                      <p className="text-sm">{lead.shipment_details.destination_country || '-'}</p>
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
                    <p className="text-sm">{lead.shipment_details.quantity || '-'} {lead.shipment_details.unit_of_measure || ''}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Weight/Unit</Label>
                    <p className="text-sm">{lead.shipment_details.weight_per_unit_kg ? `${lead.shipment_details.weight_per_unit_kg} Kg` : '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Total Weight</Label>
                    <p className="text-sm">{lead.shipment_details.weight_total_kg ? `${lead.shipment_details.weight_total_kg} Kg` : '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Total Volume</Label>
                    <p className="text-sm">{lead.shipment_details.volume_total_cbm ? `${lead.shipment_details.volume_total_cbm} CBM` : '-'}</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Length</Label>
                    <p className="text-sm">{lead.shipment_details.length_cm ? `${lead.shipment_details.length_cm} cm` : '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Width</Label>
                    <p className="text-sm">{lead.shipment_details.width_cm ? `${lead.shipment_details.width_cm} cm` : '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Height</Label>
                    <p className="text-sm">{lead.shipment_details.height_cm ? `${lead.shipment_details.height_cm} cm` : '-'}</p>
                  </div>
                </div>
              </div>

              {/* Scope of Work */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Scope of Work</Label>
                <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">
                  {lead.shipment_details.scope_of_work || '-'}
                </p>
              </div>

              {/* Additional Services */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Additional Services</Label>
                {lead.shipment_details.additional_services && lead.shipment_details.additional_services.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {lead.shipment_details.additional_services.map((service, index) => (
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
          )}

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
