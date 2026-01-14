// =====================================================
// Lead Detail Dialog - View and Edit Lead Details
// =====================================================

'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Eye, Pencil, X, Check } from 'lucide-react'
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
  // Creator info for MACX access check
  creator_role?: UserRole | null
  creator_department?: string | null
  creator_is_marketing?: boolean | null
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
      case 'Assigned to Sales':
        return 'default'
      case 'Handed Over':
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Lead Detail
            </DialogTitle>
            {canEdit && !isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="mr-8"
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
          <DialogDescription>
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

        <DialogFooter>
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
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
