'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatCurrency } from '@/lib/utils'
import {
  calculatePipelineTimeline,
  APPROACH_METHODS,
  type PipelineTimelineStep,
} from '@/lib/constants'
import type { OpportunityStage, ApproachMethod, LostReason } from '@/types/database'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  Building2,
  User,
  TrendingUp,
  FileText,
  MapPin,
  ExternalLink,
  XCircle,
} from 'lucide-react'

interface PipelineUpdate {
  update_id: string
  opportunity_id: string
  old_stage: OpportunityStage | null
  new_stage: OpportunityStage
  approach_method: ApproachMethod
  notes: string | null
  evidence_url: string | null
  evidence_file_name: string | null
  location_address: string | null
  updated_by: string | null
  updated_at: string
  updater_name?: string | null
}

interface StageHistory {
  history_id: number
  opportunity_id: string
  old_stage: OpportunityStage | null
  new_stage: OpportunityStage
  changed_by: string | null
  changed_at: string
  notes: string | null
  changer_name?: string | null
}

interface PipelineDetailData {
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
  owner_name: string | null
  account_id: string | null
  account_name: string | null
  account_status: string | null
  lead_id: string | null
  created_at: string
  updated_at: string
  pipeline_updates: PipelineUpdate[]
  stage_history: StageHistory[]
}

interface PipelineDetailDialogProps {
  opportunityId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PipelineDetailDialog({
  opportunityId,
  open,
  onOpenChange,
}: PipelineDetailDialogProps) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PipelineDetailData | null>(null)
  const [timeline, setTimeline] = useState<PipelineTimelineStep[]>([])

  useEffect(() => {
    if (open && opportunityId) {
      fetchPipelineDetails(opportunityId)
    } else {
      setData(null)
      setTimeline([])
    }
  }, [open, opportunityId])

  const fetchPipelineDetails = async (oppId: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/crm/pipeline/${oppId}`)
      if (response.ok) {
        const { data: pipelineData } = await response.json()
        setData(pipelineData)

        // Calculate timeline from stage history
        const calculatedTimeline = calculatePipelineTimeline(
          {
            stage: pipelineData.stage,
            created_at: pipelineData.created_at,
            closed_at: pipelineData.closed_at,
          },
          pipelineData.stage_history?.map((h: StageHistory) => ({
            new_stage: h.new_stage,
            changed_at: h.changed_at,
          }))
        )
        setTimeline(calculatedTimeline)
      }
    } catch (error) {
      console.error('Error fetching pipeline details:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStageColor = (stage: OpportunityStage) => {
    switch (stage) {
      case 'Prospecting':
        return 'bg-blue-500'
      case 'Discovery':
        return 'bg-cyan-500'
      case 'Quote Sent':
        return 'bg-yellow-500'
      case 'Negotiation':
        return 'bg-orange-500'
      case 'Closed Won':
        return 'bg-green-500'
      case 'Closed Lost':
        return 'bg-red-500'
      case 'On Hold':
        return 'bg-gray-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case 'done':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'overdue':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      case 'upcoming':
        return <Clock className="h-5 w-5 text-gray-400" />
      default:
        return <Clock className="h-5 w-5 text-gray-400" />
    }
  }

  const getApproachMethodLabel = (method: ApproachMethod) => {
    return APPROACH_METHODS.find(m => m.value === method)?.label || method
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-lg lg:text-xl">
            Pipeline Detail
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : data ? (
          <div className="flex-1 overflow-y-auto py-4 space-y-6">
            {/* Header Info */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">{data.name}</h2>
                  <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
                    <Building2 className="h-4 w-4" />
                    {data.account_name || 'No Account'}
                  </p>
                </div>
                <Badge className={`${getStageColor(data.stage)} text-white`}>
                  {data.stage}
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Estimated Value</p>
                  <p className="text-lg font-semibold">{formatCurrency(data.estimated_value)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Probability</p>
                  <p className="text-lg font-semibold">{data.probability || 0}%</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Owner</p>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {data.owner_name || 'Unassigned'}
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm font-medium">{formatDate(data.created_at)}</p>
                </div>
              </div>
            </div>

            <Tabs defaultValue="timeline" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="updates">Updates ({data.pipeline_updates?.length || 0})</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>

              {/* Timeline Tab */}
              <TabsContent value="timeline" className="mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Pipeline Timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="relative">
                      {/* Timeline line */}
                      <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-muted" />

                      <div className="space-y-4">
                        {timeline.map((step, index) => (
                          <div key={step.stage} className="relative flex gap-4 items-start">
                            <div className="relative z-10 flex-shrink-0">
                              {getStepStatusIcon(step.status)}
                            </div>
                            <div className="flex-1 pb-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{step.label}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Max {step.daysAllowed} day{step.daysAllowed > 1 ? 's' : ''}
                                  </p>
                                </div>
                                <div className="text-right">
                                  {step.status === 'done' && step.completedAt && (
                                    <div>
                                      <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                                        Done
                                      </Badge>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {formatDate(step.completedAt.toISOString())}
                                      </p>
                                    </div>
                                  )}
                                  {step.status === 'overdue' && step.dueDate && (
                                    <div>
                                      <Badge variant="destructive" className="text-xs">
                                        Overdue
                                      </Badge>
                                      <p className="text-xs text-red-500 mt-1">
                                        Due: {formatDate(step.dueDate.toISOString())}
                                      </p>
                                    </div>
                                  )}
                                  {step.status === 'upcoming' && step.dueDate && (
                                    <div>
                                      <Badge variant="secondary" className="text-xs">
                                        Upcoming
                                      </Badge>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Due: {formatDate(step.dueDate.toISOString())}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Final step based on current stage */}
                        {(data.stage === 'Closed Won' || data.stage === 'Closed Lost') && (
                          <div className="relative flex gap-4 items-start">
                            <div className="relative z-10 flex-shrink-0">
                              {data.stage === 'Closed Won' ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                              ) : (
                                <XCircle className="h-5 w-5 text-red-500" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{data.stage}</p>
                                  {data.lost_reason && (
                                    <p className="text-xs text-muted-foreground">
                                      Reason: {data.lost_reason.replace(/_/g, ' ')}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <Badge
                                    variant={data.stage === 'Closed Won' ? 'default' : 'destructive'}
                                    className="text-xs"
                                  >
                                    {data.stage === 'Closed Won' ? 'Won' : 'Lost'}
                                  </Badge>
                                  {data.closed_at && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {formatDate(data.closed_at)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Updates Tab */}
              <TabsContent value="updates" className="mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Pipeline Updates History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {data.pipeline_updates && data.pipeline_updates.length > 0 ? (
                      <div className="space-y-4">
                        {data.pipeline_updates.map((update) => (
                          <div
                            key={update.update_id}
                            className="border rounded-lg p-4 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">
                                  {update.old_stage || 'New'} → {update.new_stage}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {getApproachMethodLabel(update.approach_method)}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(update.updated_at)}
                              </p>
                            </div>

                            {update.notes && (
                              <p className="text-sm text-muted-foreground">{update.notes}</p>
                            )}

                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              {update.updater_name && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {update.updater_name}
                                </span>
                              )}
                              {update.location_address && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {update.location_address}
                                </span>
                              )}
                              {update.evidence_url && (
                                <a
                                  href={update.evidence_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-brand hover:underline"
                                >
                                  <FileText className="h-3 w-3" />
                                  {update.evidence_file_name || 'View Evidence'}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No updates recorded yet
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Details Tab */}
              <TabsContent value="details" className="mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Pipeline Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Account</p>
                        <p className="text-sm font-medium">{data.account_name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Account Status</p>
                        <p className="text-sm font-medium capitalize">
                          {data.account_status?.replace(/_/g, ' ') || '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Next Step</p>
                        <p className="text-sm font-medium">{data.next_step || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Next Step Due</p>
                        <p className="text-sm font-medium">
                          {data.next_step_due_date ? formatDate(data.next_step_due_date) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Expected Close Date</p>
                        <p className="text-sm font-medium">
                          {data.expected_close_date ? formatDate(data.expected_close_date) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Currency</p>
                        <p className="text-sm font-medium">{data.currency}</p>
                      </div>
                    </div>

                    {data.stage === 'Closed Lost' && (
                      <div className="border-t pt-4 mt-4">
                        <h4 className="text-sm font-medium mb-3">Lost Information</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Lost Reason</p>
                            <p className="text-sm font-medium capitalize">
                              {data.lost_reason?.replace(/_/g, ' ') || '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Close Reason</p>
                            <p className="text-sm font-medium">{data.close_reason || '-'}</p>
                          </div>
                          {data.competitor_price && (
                            <div>
                              <p className="text-xs text-muted-foreground">Competitor Price</p>
                              <p className="text-sm font-medium">
                                {formatCurrency(data.competitor_price)}
                              </p>
                            </div>
                          )}
                          {data.customer_budget && (
                            <div>
                              <p className="text-xs text-muted-foreground">Customer Budget</p>
                              <p className="text-sm font-medium">
                                {formatCurrency(data.customer_budget)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {data.notes && (
                      <div className="border-t pt-4 mt-4">
                        <p className="text-xs text-muted-foreground mb-1">Notes</p>
                        <p className="text-sm">{data.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No pipeline data available</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
