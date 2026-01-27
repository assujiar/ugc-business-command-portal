'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatCurrency } from '@/lib/utils'
import { LEAD_STATUS_ACTIONS, LEAD_SOURCES } from '@/lib/constants'
import type { LeadTriageStatus, UserRole, LeadSource } from '@/types/database'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LeadDetailDialog } from '@/components/crm/lead-detail-dialog'
import { PipelineDetailDialog } from '@/components/crm/pipeline-detail-dialog'
import {
  MoreVertical,
  Inbox,
  Search,
  CheckCircle,
  XCircle,
  Leaf,
  ArrowRight,
  Users,
  Clock,
  Eye,
  TrendingUp,
} from 'lucide-react'

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
  triage_status: LeadTriageStatus
  source: LeadSource
  source_detail: string | null
  priority: number
  notes: string | null
  potential_revenue: number | null
  claim_status: string | null
  claimed_by_name: string | null
  created_at: string
  updated_at: string
  marketing_owner_user_id: string | null
  sales_owner_user_id: string | null
  created_by: string | null
  disqualified_at: string | null
  disqualified_reason: string | null
  // Creator info for MACX access check (from v_lead_management view)
  creator_name?: string | null
  creator_department?: string | null
  creator_role?: UserRole | null
  creator_is_marketing?: boolean | null
  // Shipment details (fetched separately)
  shipment_details?: ShipmentDetails | null
  // Opportunity/Pipeline info
  opportunity_id?: string | null
}

interface StatusCounts {
  total: number
  new: number
  in_review: number
  qualified: number
  assigned_to_sales: number
  nurture: number
  disqualified: number
}

interface LeadManagementDashboardProps {
  leads: Lead[]
  statusCounts: StatusCounts
  isManager: boolean
  currentUserId: string
  userRole: UserRole | null
}

type StatusFilter = 'all' | LeadTriageStatus
type SourceFilter = 'all' | LeadSource

const STATUS_CARDS: { key: keyof StatusCounts; status: StatusFilter; label: string; icon: typeof Inbox; color: string }[] = [
  { key: 'total', status: 'all', label: 'Total Leads', icon: Inbox, color: 'bg-blue-500' },
  { key: 'new', status: 'New', label: 'New Lead', icon: Clock, color: 'bg-slate-500' },
  { key: 'in_review', status: 'In Review', label: 'In Review', icon: Search, color: 'bg-yellow-500' },
  { key: 'qualified', status: 'Qualified', label: 'Qualified', icon: CheckCircle, color: 'bg-green-500' },
  { key: 'assigned_to_sales', status: 'Assign to Sales', label: 'Assign to Sales', icon: Users, color: 'bg-purple-500' },
  { key: 'nurture', status: 'Nurture', label: 'Nurture', icon: Leaf, color: 'bg-teal-500' },
  { key: 'disqualified', status: 'Disqualified', label: 'Disqualified', icon: XCircle, color: 'bg-red-500' },
]

export function LeadManagementDashboard({
  leads,
  statusCounts,
  isManager,
  currentUserId,
  userRole,
}: LeadManagementDashboardProps) {
  const router = useRouter()
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all')
  const [selectedSource, setSelectedSource] = useState<SourceFilter>('all')
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [actionDialog, setActionDialog] = useState<{
    open: boolean
    lead: Lead | null
    targetStatus: LeadTriageStatus | null
  }>({ open: false, lead: null, targetStatus: null })
  const [potentialRevenue, setPotentialRevenue] = useState('')
  const [notes, setNotes] = useState('')

  // State for lead detail dialog
  const [detailDialog, setDetailDialog] = useState<{
    open: boolean
    lead: Lead | null
    loading: boolean
  }>({ open: false, lead: null, loading: false })

  // State for pipeline detail dialog
  const [pipelineDialog, setPipelineDialog] = useState<{
    open: boolean
    opportunityId: string | null
  }>({ open: false, opportunityId: null })

  // Function to fetch full lead details including shipment
  const fetchLeadDetails = async (leadId: string) => {
    setDetailDialog({ open: true, lead: null, loading: true })
    try {
      const response = await fetch(`/api/crm/leads/${leadId}`)
      if (response.ok) {
        const { data } = await response.json()
        setDetailDialog({ open: true, lead: data, loading: false })
      } else {
        setDetailDialog({ open: false, lead: null, loading: false })
      }
    } catch (error) {
      console.error('Error fetching lead:', error)
      setDetailDialog({ open: false, lead: null, loading: false })
    }
  }

  // Listen for viewLeadDetail event from add-lead-dialog
  useEffect(() => {
    const handleViewLeadDetail = (event: Event) => {
      const customEvent = event as CustomEvent<{ leadId: string }>
      const { leadId } = customEvent.detail
      // Always fetch full lead details including shipment
      fetchLeadDetails(leadId)
    }

    window.addEventListener('viewLeadDetail', handleViewLeadDetail)
    return () => {
      window.removeEventListener('viewLeadDetail', handleViewLeadDetail)
    }
  }, [])

  // Filter leads based on selected status and source
  const filteredLeads = leads.filter(lead => {
    const statusMatch = selectedStatus === 'all' || lead.triage_status === selectedStatus
    const sourceMatch = selectedSource === 'all' || lead.source === selectedSource
    return statusMatch && sourceMatch
  })

  const handleStatusChange = async () => {
    if (!actionDialog.lead || !actionDialog.targetStatus) return

    setIsLoading(actionDialog.lead.lead_id)

    try {
      const body: Record<string, unknown> = {
        new_status: actionDialog.targetStatus,
        notes: notes || undefined,
      }

      // If changing to Assign to Sales, require potential revenue
      if (actionDialog.targetStatus === 'Assign to Sales') {
        if (!potentialRevenue || parseFloat(potentialRevenue) <= 0) {
          alert('Potential Revenue wajib diisi untuk status Assign to Sales')
          setIsLoading(null)
          return
        }
        body.potential_revenue = parseFloat(potentialRevenue)
      }

      const response = await fetch(`/api/crm/leads/${actionDialog.lead.lead_id}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        router.refresh()
        setActionDialog({ open: false, lead: null, targetStatus: null })
        setPotentialRevenue('')
        setNotes('')
      } else {
        const error = await response.json()
        alert(error.error || 'Gagal mengubah status')
      }
    } catch (error) {
      console.error('Error changing status:', error)
      alert('Terjadi kesalahan')
    } finally {
      setIsLoading(null)
    }
  }

  const getAvailableActions = (status: LeadTriageStatus): LeadTriageStatus[] => {
    return LEAD_STATUS_ACTIONS[status] || []
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

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 1:
        return 'Low'
      case 2:
        return 'Medium'
      case 3:
        return 'High'
      case 4:
        return 'Critical'
      default:
        return 'Unknown'
    }
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Status Cards - Horizontal scroll on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        <div className="flex lg:grid lg:grid-cols-7 gap-3 min-w-max lg:min-w-0">
          {STATUS_CARDS.map((card) => {
            const Icon = card.icon
            const count = statusCounts[card.key]
            const isActive = selectedStatus === card.status

            return (
              <Card
                key={card.key}
                className={`cursor-pointer transition-all hover:shadow-md flex-shrink-0 w-[120px] lg:w-auto ${
                  isActive ? 'ring-2 ring-brand' : ''
                }`}
                onClick={() => setSelectedStatus(card.status)}
              >
                <CardContent className="p-3 lg:p-4">
                  <div className="flex items-center justify-between">
                    <div className={`p-1.5 lg:p-2 rounded-lg ${card.color}`}>
                      <Icon className="h-3 w-3 lg:h-4 lg:w-4 text-white" />
                    </div>
                    <span className="text-xl lg:text-2xl font-bold">{count}</span>
                  </div>
                  <p className="text-[10px] lg:text-xs text-muted-foreground mt-2 truncate">{card.label}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Leads Table */}
      <Card>
        <CardHeader className="pb-3 lg:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base lg:text-lg">
              {selectedStatus === 'all' ? 'All Leads' : `${selectedStatus} Leads`}
              {selectedSource !== 'all' && ` from ${selectedSource}`}
              {' '}({filteredLeads.length})
            </CardTitle>

            {/* Source Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Source:</span>
              <Select
                value={selectedSource}
                onValueChange={(value) => setSelectedSource(value as SourceFilter)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {LEAD_SOURCES.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 lg:px-6">
          {filteredLeads.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Potential Revenue</TableHead>
                      <TableHead>Pipeline</TableHead>
                      <TableHead>Created By</TableHead>
                      {selectedStatus === 'Assign to Sales' && (
                        <>
                          <TableHead>Claim Status</TableHead>
                          <TableHead>Claimed By</TableHead>
                        </>
                      )}
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[80px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.map((lead) => {
                      const actions = getAvailableActions(lead.triage_status)

                      return (
                        <TableRow key={lead.lead_id}>
                          <TableCell className="font-medium">{lead.company_name}</TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm">{lead.contact_name || '-'}</p>
                              <p className="text-xs text-muted-foreground">{lead.contact_email || '-'}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(lead.triage_status)}>
                              {lead.triage_status}
                            </Badge>
                          </TableCell>
                          <TableCell>{lead.source || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{getPriorityLabel(lead.priority)}</Badge>
                          </TableCell>
                          <TableCell>
                            {lead.potential_revenue
                              ? formatCurrency(lead.potential_revenue)
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {lead.opportunity_id ? (
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-brand"
                                onClick={() => setPipelineDialog({ open: true, opportunityId: lead.opportunity_id! })}
                              >
                                <TrendingUp className="h-3 w-3 mr-1" />
                                View Pipeline
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {lead.creator_name
                              ? `${lead.creator_name}${lead.creator_department ? ` - ${lead.creator_department}` : ''}`
                              : '-'}
                          </TableCell>
                          {selectedStatus === 'Assign to Sales' && (
                            <>
                              <TableCell>
                                <Badge
                                  variant={lead.claim_status === 'claimed' ? 'default' : 'secondary'}
                                >
                                  {lead.claim_status || 'unclaimed'}
                                </Badge>
                              </TableCell>
                              <TableCell>{lead.claimed_by_name || '-'}</TableCell>
                            </>
                          )}
                          <TableCell>{formatDate(lead.created_at)}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={isLoading === lead.lead_id}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {/* View Detail Action - Always Available */}
                                <DropdownMenuItem
                                  onClick={() => {
                                    // Fetch full lead details including shipment
                                    fetchLeadDetails(lead.lead_id)
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Detail
                                </DropdownMenuItem>
                                {/* View Pipeline Action - Only if opportunity exists */}
                                {lead.opportunity_id && (
                                  <DropdownMenuItem
                                    onClick={() => setPipelineDialog({ open: true, opportunityId: lead.opportunity_id! })}
                                  >
                                    <TrendingUp className="h-4 w-4 mr-2" />
                                    View Pipeline
                                  </DropdownMenuItem>
                                )}
                                {actions.length > 0 && (
                                  <>
                                    <DropdownMenuSeparator />
                                    {actions.map((action) => (
                                      <DropdownMenuItem
                                        key={action}
                                        onClick={() => {
                                          setActionDialog({
                                            open: true,
                                            lead,
                                            targetStatus: action,
                                          })
                                          // Prefill potential_revenue for "Assign to Sales" action
                                          if (action === 'Assign to Sales' && lead.potential_revenue) {
                                            setPotentialRevenue(lead.potential_revenue.toString())
                                          } else {
                                            setPotentialRevenue('')
                                          }
                                          setNotes('')
                                        }}
                                      >
                                        <ArrowRight className="h-4 w-4 mr-2" />
                                        {action}
                                      </DropdownMenuItem>
                                    ))}
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3 px-4">
                {filteredLeads.map((lead) => {
                  const actions = getAvailableActions(lead.triage_status)

                  return (
                    <Card key={lead.lead_id} className="bg-muted/30">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-medium text-sm truncate">{lead.company_name}</h4>
                            <p className="text-xs text-muted-foreground truncate">
                              {lead.contact_name || 'No contact'}
                            </p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 flex-shrink-0"
                                disabled={isLoading === lead.lead_id}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => fetchLeadDetails(lead.lead_id)}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Detail
                              </DropdownMenuItem>
                              {actions.length > 0 && (
                                <>
                                  <DropdownMenuSeparator />
                                  {actions.map((action) => (
                                    <DropdownMenuItem
                                      key={action}
                                      onClick={() => {
                                        setActionDialog({
                                          open: true,
                                          lead,
                                          targetStatus: action,
                                        })
                                        // Prefill potential_revenue for "Assign to Sales" action
                                        if (action === 'Assign to Sales' && lead.potential_revenue) {
                                          setPotentialRevenue(lead.potential_revenue.toString())
                                        } else {
                                          setPotentialRevenue('')
                                        }
                                        setNotes('')
                                      }}
                                    >
                                      <ArrowRight className="h-4 w-4 mr-2" />
                                      {action}
                                    </DropdownMenuItem>
                                  ))}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <Badge variant={getStatusBadgeVariant(lead.triage_status)} className="text-xs">
                            {lead.triage_status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {getPriorityLabel(lead.priority)}
                          </Badge>
                          {lead.source && (
                            <Badge variant="secondary" className="text-xs">
                              {lead.source}
                            </Badge>
                          )}
                        </div>

                        <div className="mt-3 text-xs text-muted-foreground space-y-1">
                          <div className="flex items-center justify-between">
                            <span>{formatDate(lead.created_at)}</span>
                            {lead.potential_revenue && (
                              <span className="font-medium text-foreground">
                                {formatCurrency(lead.potential_revenue)}
                              </span>
                            )}
                          </div>
                          {lead.creator_name && (
                            <div>
                              <span>Created by: {lead.creator_name}{lead.creator_department ? ` - ${lead.creator_department}` : ''}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-12 px-4">
              <p className="text-muted-foreground">No leads found</p>
              <p className="text-sm text-muted-foreground mt-2">
                {selectedStatus === 'all'
                  ? 'Create a new lead to get started'
                  : `No leads with status "${selectedStatus}"`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog
        open={actionDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setActionDialog({ open: false, lead: null, targetStatus: null })
            setPotentialRevenue('')
            setNotes('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Update Status to {actionDialog.targetStatus}
            </DialogTitle>
            <DialogDescription>
              Lead: {actionDialog.lead?.company_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {actionDialog.targetStatus === 'Assign to Sales' && (
              <div className="space-y-2">
                <Label htmlFor="potential_revenue">
                  Potential Revenue <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="potential_revenue"
                  type="number"
                  placeholder="Enter potential revenue"
                  value={potentialRevenue}
                  onChange={(e) => setPotentialRevenue(e.target.value)}
                  min={1}
                />
                <p className="text-xs text-muted-foreground">
                  {actionDialog.lead?.potential_revenue
                    ? `Nilai sebelumnya: ${actionDialog.lead.potential_revenue.toLocaleString('id-ID')}`
                    : 'Wajib diisi untuk Assign to Sales (harus lebih dari 0)'}
                </p>
              </div>
            )}

            {actionDialog.targetStatus === 'Disqualified' && (
              <div className="space-y-2">
                <Label htmlFor="notes">Reason for Disqualification</Label>
                <Textarea
                  id="notes"
                  placeholder="Enter reason for disqualification"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            )}

            {actionDialog.targetStatus !== 'Disqualified' && actionDialog.targetStatus !== 'Assign to Sales' && (
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add notes for this status change"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActionDialog({ open: false, lead: null, targetStatus: null })
                setPotentialRevenue('')
                setNotes('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStatusChange}
              disabled={
                isLoading === actionDialog.lead?.lead_id ||
                (actionDialog.targetStatus === 'Assign to Sales' && (!potentialRevenue || parseFloat(potentialRevenue) <= 0))
              }
            >
              {isLoading === actionDialog.lead?.lead_id ? 'Updating...' : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Detail Dialog */}
      <LeadDetailDialog
        lead={detailDialog.lead}
        open={detailDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setDetailDialog({ open: false, lead: null, loading: false })
          }
        }}
        currentUserId={currentUserId}
        userRole={userRole}
      />

      {/* Pipeline Detail Dialog */}
      <PipelineDetailDialog
        opportunityId={pipelineDialog.opportunityId}
        open={pipelineDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setPipelineDialog({ open: false, opportunityId: null })
          }
        }}
      />
    </div>
  )
}
