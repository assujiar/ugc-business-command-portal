'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatCurrency } from '@/lib/utils'
import { OPPORTUNITY_STAGES, APPROACH_METHODS, LOST_REASONS } from '@/lib/constants'
import type { OpportunityStage, ApproachMethod, LostReason } from '@/types/database'
import {
  TrendingUp,
  Search,
  FileText,
  Users2,
  CheckCircle,
  XCircle,
  Pause,
  MoreVertical,
  AlertCircle,
  Upload,
  MapPin,
} from 'lucide-react'

interface Opportunity {
  opportunity_id: string
  name: string
  stage: OpportunityStage
  estimated_value: number | null
  currency: string
  probability: number | null
  expected_close_date: string | null
  next_step: string | null
  next_step_due_date: string | null
  close_reason: string | null
  lost_reason: LostReason | null
  competitor_price: number | null
  customer_budget: number | null
  closed_at: string | null
  notes: string | null
  owner_user_id: string | null
  account_id: string | null
  lead_id: string | null
  created_at: string
  updated_at: string
  account_name: string | null
  account_status: string | null
  owner_name: string | null
  is_overdue: boolean
}

interface PipelineDashboardProps {
  opportunities: Opportunity[]
  currentUserId: string
}

const STAGE_CONFIG: { stage: OpportunityStage; label: string; icon: typeof TrendingUp; color: string }[] = [
  { stage: 'Prospecting', label: 'Prospecting', icon: Search, color: 'bg-blue-500' },
  { stage: 'Discovery', label: 'Discovery', icon: TrendingUp, color: 'bg-cyan-500' },
  { stage: 'Quote Sent', label: 'Quote Sent', icon: FileText, color: 'bg-yellow-500' },
  { stage: 'Negotiation', label: 'Negotiation', icon: Users2, color: 'bg-orange-500' },
  { stage: 'Closed Won', label: 'Won', icon: CheckCircle, color: 'bg-green-500' },
  { stage: 'Closed Lost', label: 'Lost', icon: XCircle, color: 'bg-red-500' },
  { stage: 'On Hold', label: 'On Hold', icon: Pause, color: 'bg-gray-500' },
]

export function PipelineDashboard({ opportunities, currentUserId }: PipelineDashboardProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedStage, setSelectedStage] = useState<OpportunityStage | 'all'>('all')
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [updateDialog, setUpdateDialog] = useState<{
    open: boolean
    opportunity: Opportunity | null
  }>({ open: false, opportunity: null })

  // Update form state
  const [newStage, setNewStage] = useState<OpportunityStage | ''>('')
  const [approachMethod, setApproachMethod] = useState<ApproachMethod | ''>('')
  const [notes, setNotes] = useState('')
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)
  const [locationAddress, setLocationAddress] = useState('')
  const [lostReason, setLostReason] = useState<LostReason | ''>('')
  const [competitorPrice, setCompetitorPrice] = useState('')
  const [customerBudget, setCustomerBudget] = useState('')

  // Calculate counts per stage
  const stageCounts = STAGE_CONFIG.reduce((acc, { stage }) => {
    acc[stage] = opportunities.filter(opp => opp.stage === stage).length
    return acc
  }, {} as Record<OpportunityStage, number>)

  // Filter opportunities
  const filteredOpportunities = selectedStage === 'all'
    ? opportunities
    : opportunities.filter(opp => opp.stage === selectedStage)

  const resetForm = () => {
    setNewStage('')
    setApproachMethod('')
    setNotes('')
    setEvidenceFile(null)
    setLocationAddress('')
    setLostReason('')
    setCompetitorPrice('')
    setCustomerBudget('')
  }

  const openUpdateDialog = (opportunity: Opportunity) => {
    resetForm()
    setUpdateDialog({ open: true, opportunity })
  }

  const handleUpdatePipeline = async () => {
    if (!updateDialog.opportunity || !newStage || !approachMethod) return

    // Validate for Closed Lost
    if (newStage === 'Closed Lost' && !lostReason) {
      alert('Alasan lost wajib diisi')
      return
    }

    // Check if price is required for lost reason
    const lostReasonConfig = LOST_REASONS.find(r => r.value === lostReason)
    if (newStage === 'Closed Lost' && lostReasonConfig?.requiresPrice) {
      if (!competitorPrice && !customerBudget) {
        alert('Harga kompetitor atau budget customer wajib diisi untuk alasan ini')
        return
      }
    }

    setIsLoading(updateDialog.opportunity.opportunity_id)

    try {
      const formData = new FormData()
      formData.append('opportunity_id', updateDialog.opportunity.opportunity_id)
      formData.append('new_stage', newStage)
      formData.append('approach_method', approachMethod)
      formData.append('notes', notes)
      formData.append('location_address', locationAddress)

      if (newStage === 'Closed Lost') {
        formData.append('lost_reason', lostReason)
        if (competitorPrice) formData.append('competitor_price', competitorPrice)
        if (customerBudget) formData.append('customer_budget', customerBudget)
      }

      if (evidenceFile) {
        formData.append('evidence', evidenceFile)
      }

      const response = await fetch('/api/crm/pipeline/update', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        router.refresh()
        setUpdateDialog({ open: false, opportunity: null })
        resetForm()
      } else {
        const error = await response.json()
        alert(error.error || 'Gagal update pipeline')
      }
    } catch (error) {
      console.error('Error updating pipeline:', error)
      alert('Terjadi kesalahan')
    } finally {
      setIsLoading(null)
    }
  }

  const getAvailableNextStages = (currentStage: OpportunityStage): OpportunityStage[] => {
    const stageOrder = ['Prospecting', 'Discovery', 'Quote Sent', 'Negotiation', 'Closed Won', 'Closed Lost', 'On Hold']
    const currentIndex = stageOrder.indexOf(currentStage)

    // Can move to next stage, closed won/lost, or on hold
    const nextStages: OpportunityStage[] = []

    if (currentStage === 'On Hold') {
      // From On Hold can go to any stage
      return ['Prospecting', 'Discovery', 'Quote Sent', 'Negotiation', 'Closed Won', 'Closed Lost']
    }

    if (currentStage === 'Closed Won' || currentStage === 'Closed Lost') {
      return [] // Cannot change closed deals
    }

    // Add next stage if not at end
    if (currentIndex < 3) {
      nextStages.push(stageOrder[currentIndex + 1] as OpportunityStage)
    }

    // Always can go to Won, Lost, or On Hold
    nextStages.push('Closed Won', 'Closed Lost', 'On Hold')

    return Array.from(new Set(nextStages))
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Stage Cards - Horizontal scroll on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        <div className="flex lg:grid lg:grid-cols-7 gap-3 min-w-max lg:min-w-0">
          {STAGE_CONFIG.map(({ stage, label, icon: Icon, color }) => {
            const count = stageCounts[stage] || 0
            const isActive = selectedStage === stage

            return (
              <Card
                key={stage}
                className={`cursor-pointer transition-all hover:shadow-md flex-shrink-0 w-[100px] lg:w-auto ${
                  isActive ? 'ring-2 ring-brand' : ''
                }`}
                onClick={() => setSelectedStage(selectedStage === stage ? 'all' : stage)}
              >
                <CardContent className="p-3 lg:p-4">
                  <div className="flex items-center justify-between">
                    <div className={`p-1.5 lg:p-2 rounded-lg ${color}`}>
                      <Icon className="h-3 w-3 lg:h-4 lg:w-4 text-white" />
                    </div>
                    <span className="text-xl lg:text-2xl font-bold">{count}</span>
                  </div>
                  <p className="text-[10px] lg:text-xs text-muted-foreground mt-2 truncate">{label}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Pipeline List */}
      <Card>
        <CardHeader className="pb-3 lg:pb-6">
          <CardTitle className="text-base lg:text-lg">
            {selectedStage === 'all' ? 'All Pipeline' : `${selectedStage}`}
            {' '}({filteredOpportunities.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 lg:px-6">
          {filteredOpportunities.length > 0 ? (
            <div className="space-y-3 lg:space-y-4">
              {filteredOpportunities.map((opp) => {
                const nextStages = getAvailableNextStages(opp.stage)
                const stageConfig = STAGE_CONFIG.find(s => s.stage === opp.stage)

                return (
                  <Card key={opp.opportunity_id} className="bg-muted/50">
                    <CardContent className="p-3 lg:p-4">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-sm lg:text-base truncate">{opp.name}</h3>
                            {opp.is_overdue && (
                              <Badge variant="destructive" className="text-xs">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Overdue
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs lg:text-sm text-muted-foreground truncate">{opp.account_name}</p>

                          <div className="flex flex-wrap items-center gap-2 lg:gap-4 mt-2">
                            <Badge variant="outline" className={`text-xs ${stageConfig?.color.replace('bg-', 'border-')}`}>
                              {opp.stage}
                            </Badge>
                            <span className="text-xs lg:text-sm font-medium text-brand">
                              {formatCurrency(opp.estimated_value)}
                            </span>
                            {opp.probability && (
                              <span className="text-[10px] lg:text-xs text-muted-foreground">
                                {opp.probability}% probability
                              </span>
                            )}
                          </div>

                          {opp.next_step && (
                            <p className="text-xs lg:text-sm mt-2">
                              <span className="text-muted-foreground">Next Step:</span> {opp.next_step}
                              {opp.next_step_due_date && (
                                <span className="text-muted-foreground ml-2">
                                  (Due: {formatDate(opp.next_step_due_date)})
                                </span>
                              )}
                            </p>
                          )}

                          {opp.owner_name && (
                            <p className="text-[10px] lg:text-xs text-muted-foreground mt-1">
                              Owner: {opp.owner_name}
                            </p>
                          )}
                        </div>

                        {nextStages.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openUpdateDialog(opp)}
                            disabled={isLoading === opp.opportunity_id}
                            className="w-full lg:w-auto flex-shrink-0"
                          >
                            Update Status
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-12 px-4">
              <p className="text-muted-foreground">No opportunities found</p>
              <p className="text-sm text-muted-foreground mt-2">
                {selectedStage === 'all'
                  ? 'Claim leads from Lead Bidding to create pipeline opportunities'
                  : `No opportunities with status "${selectedStage}"`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Update Dialog */}
      <Dialog
        open={updateDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setUpdateDialog({ open: false, opportunity: null })
            resetForm()
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-base lg:text-lg">Update Pipeline</DialogTitle>
            <DialogDescription className="text-xs lg:text-sm truncate">
              {updateDialog.opportunity?.name} - {updateDialog.opportunity?.account_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 flex-1 overflow-y-auto">
            {/* Current Status */}
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Current Status</p>
              <Badge variant="outline" className="mt-1">
                {updateDialog.opportunity?.stage}
              </Badge>
            </div>

            {/* New Stage */}
            <div className="space-y-2">
              <Label>New Status <span className="text-red-500">*</span></Label>
              <Select value={newStage} onValueChange={(v) => setNewStage(v as OpportunityStage)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select new status" />
                </SelectTrigger>
                <SelectContent>
                  {updateDialog.opportunity && getAvailableNextStages(updateDialog.opportunity.stage).map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Approach Method */}
            <div className="space-y-2">
              <Label>Approach Method <span className="text-red-500">*</span></Label>
              <Select value={approachMethod} onValueChange={(v) => setApproachMethod(v as ApproachMethod)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select approach method" />
                </SelectTrigger>
                <SelectContent>
                  {APPROACH_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Add notes about this update"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Evidence Upload */}
            <div className="space-y-2">
              <Label>Evidence (Upload File) <span className="text-red-500">*</span></Label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {evidenceFile ? evidenceFile.name : 'Upload Evidence'}
                </Button>
                {evidenceFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEvidenceFile(null)}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Upload screenshot, photo, or document as proof
              </p>
            </div>

            {/* Location Tagging */}
            <div className="space-y-2">
              <Label>Location</Label>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter location address"
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                />
              </div>
            </div>

            {/* Lost Reason (only for Closed Lost) */}
            {newStage === 'Closed Lost' && (
              <>
                <div className="space-y-2">
                  <Label>Lost Reason <span className="text-red-500">*</span></Label>
                  <Select value={lostReason} onValueChange={(v) => setLostReason(v as LostReason)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {LOST_REASONS.map((reason) => (
                        <SelectItem key={reason.value} value={reason.value}>
                          {reason.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Price fields for price-related lost reasons */}
                {LOST_REASONS.find(r => r.value === lostReason)?.requiresPrice && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Competitor Price</Label>
                      <Input
                        type="number"
                        placeholder="Enter competitor price"
                        value={competitorPrice}
                        onChange={(e) => setCompetitorPrice(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Customer Budget</Label>
                      <Input
                        type="number"
                        placeholder="Enter customer budget"
                        value={customerBudget}
                        onChange={(e) => setCustomerBudget(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUpdateDialog({ open: false, opportunity: null })
                resetForm()
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdatePipeline}
              disabled={
                isLoading === updateDialog.opportunity?.opportunity_id ||
                !newStage ||
                !approachMethod ||
                !evidenceFile ||
                (newStage === 'Closed Lost' && !lostReason)
              }
            >
              {isLoading === updateDialog.opportunity?.opportunity_id ? 'Updating...' : 'Update Pipeline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
