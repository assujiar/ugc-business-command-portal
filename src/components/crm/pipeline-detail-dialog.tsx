'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { formatDate, formatCurrency } from '@/lib/utils'
import {
  APPROACH_METHODS,
  PIPELINE_STAGE_CONFIG,
} from '@/lib/constants'
import type { OpportunityStage, ApproachMethod, LostReason } from '@/types/database'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  Download,
  ExternalLink,
  Calendar,
  TrendingUp,
  Briefcase,
  UserCircle,
  Circle,
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
  created_at: string
  updated_at: string
  // Company info
  account_id: string | null
  company_name: string | null
  industry: string | null
  address: string | null
  city: string | null
  account_status: string | null
  // PIC info
  pic_name: string | null
  pic_email: string | null
  pic_phone: string | null
  // Lead info
  lead_id: string | null
  potential_revenue: number | null
  lead_source: string | null
  lead_creator_name: string | null
  lead_creator_department: string | null
  // Owner info
  owner_user_id: string | null
  owner_name: string | null
  owner_email: string | null
  owner_department: string | null
  // Activities
  pipeline_updates: PipelineUpdate[]
  stage_history: StageHistory[]
  can_update: boolean
}

interface PipelineDetailDialogProps {
  opportunityId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Helper to check if URL is an image
function isImageUrl(url: string | null): boolean {
  if (!url) return false
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
  const lowerUrl = url.toLowerCase()
  return imageExtensions.some(ext => lowerUrl.includes(ext))
}

// Get stage config for due date calculation
function getStageDaysAllowed(stage: OpportunityStage): number {
  const config = PIPELINE_STAGE_CONFIG.find(s => s.stage === stage)
  return config?.daysAllowed || 7
}

// Build timeline items from stage history and updates
interface TimelineItem {
  id: string
  type: 'stage_change' | 'activity'
  stage: OpportunityStage
  date: string
  dueDate?: string
  status: 'done' | 'current' | 'upcoming' | 'overdue'
  title: string
  subtitle?: string
  approachMethod?: ApproachMethod
  evidenceUrl?: string | null
  evidenceFileName?: string | null
  locationAddress?: string | null
  notes?: string | null
  actorName?: string | null
}

function buildTimeline(
  data: PipelineDetailData,
  currentStage: OpportunityStage
): TimelineItem[] {
  const items: TimelineItem[] = []
  const now = new Date()

  // Active stages in order
  const activeStages: OpportunityStage[] = ['Prospecting', 'Discovery', 'Quote Sent', 'Negotiation']
  const currentStageIndex = activeStages.indexOf(currentStage)
  const isClosed = currentStage === 'Closed Won' || currentStage === 'Closed Lost'

  // Create stage entries with their updates
  const stageUpdateMap: Record<string, PipelineUpdate[]> = {}

  // Group updates by new_stage
  data.pipeline_updates.forEach(update => {
    if (!stageUpdateMap[update.new_stage]) {
      stageUpdateMap[update.new_stage] = []
    }
    stageUpdateMap[update.new_stage].push(update)
  })

  // Build stage history map
  const stageEntryMap: Record<string, string> = {}
  stageEntryMap['Prospecting'] = data.created_at

  data.stage_history.forEach(history => {
    stageEntryMap[history.new_stage] = history.changed_at
  })

  // Add pipeline creation
  items.push({
    id: 'created',
    type: 'stage_change',
    stage: 'Prospecting',
    date: data.created_at,
    status: 'done',
    title: 'Pipeline Created',
    subtitle: 'Prospecting stage started',
    actorName: data.lead_creator_name,
  })

  // Add stage transitions and activities
  activeStages.forEach((stage, index) => {
    const stageUpdates = stageUpdateMap[stage] || []
    const entryDate = stageEntryMap[stage]

    // Calculate due date for this stage
    let dueDate: Date | null = null
    if (entryDate) {
      dueDate = new Date(entryDate)
      dueDate.setDate(dueDate.getDate() + getStageDaysAllowed(stage))
    }

    // Determine status
    let status: 'done' | 'current' | 'upcoming' | 'overdue' = 'upcoming'
    if (isClosed || index < currentStageIndex) {
      status = 'done'
    } else if (index === currentStageIndex) {
      status = dueDate && dueDate < now ? 'overdue' : 'current'
    }

    // Add stage entry if not Prospecting (already added as creation)
    if (stage !== 'Prospecting' && entryDate) {
      const historyEntry = data.stage_history.find(h => h.new_stage === stage)
      items.push({
        id: `stage-${stage}`,
        type: 'stage_change',
        stage,
        date: entryDate,
        dueDate: dueDate?.toISOString(),
        status,
        title: `Moved to ${stage}`,
        actorName: historyEntry?.changer_name,
      })
    }

    // Add activities for this stage
    stageUpdates.forEach(update => {
      items.push({
        id: update.update_id,
        type: 'activity',
        stage: update.new_stage,
        date: update.updated_at,
        status: 'done',
        title: APPROACH_METHODS.find(m => m.value === update.approach_method)?.label || update.approach_method,
        subtitle: update.notes || undefined,
        approachMethod: update.approach_method,
        evidenceUrl: update.evidence_url,
        evidenceFileName: update.evidence_file_name,
        locationAddress: update.location_address,
        notes: update.notes,
        actorName: update.updater_name,
      })
    })
  })

  // Add closed stage if applicable
  if (isClosed && data.closed_at) {
    items.push({
      id: 'closed',
      type: 'stage_change',
      stage: currentStage,
      date: data.closed_at,
      status: 'done',
      title: currentStage === 'Closed Won' ? 'Deal Won!' : 'Deal Lost',
      subtitle: data.lost_reason ? `Reason: ${data.lost_reason.replace(/_/g, ' ')}` : undefined,
    })
  }

  // Sort by date
  items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return items
}

export function PipelineDetailDialog({
  opportunityId,
  open,
  onOpenChange,
}: PipelineDetailDialogProps) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PipelineDetailData | null>(null)

  useEffect(() => {
    if (open && opportunityId) {
      fetchPipelineDetails(opportunityId)
    } else {
      setData(null)
    }
  }, [open, opportunityId])

  const fetchPipelineDetails = async (oppId: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/crm/pipeline/${oppId}`)
      if (response.ok) {
        const { data: pipelineData } = await response.json()
        setData(pipelineData)
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'current':
        return <Circle className="h-5 w-5 text-blue-500 fill-blue-500" />
      case 'overdue':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      case 'upcoming':
        return <Clock className="h-5 w-5 text-gray-400" />
      default:
        return <Circle className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
        return 'border-green-500 bg-green-50'
      case 'current':
        return 'border-blue-500 bg-blue-50'
      case 'overdue':
        return 'border-red-500 bg-red-50'
      default:
        return 'border-gray-300 bg-gray-50'
    }
  }

  const timeline = data ? buildTimeline(data, data.stage) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-4 pt-4 pb-2 lg:px-6 lg:pt-6">
          <DialogTitle className="text-lg lg:text-xl">
            Pipeline Detail
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 p-4 lg:p-6">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : data ? (
          <ScrollArea className="flex-1 px-4 pb-4 lg:px-6 lg:pb-6">
            <div className="space-y-4 lg:space-y-6">
              {/* Header with Stage Badge */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg lg:text-xl font-bold truncate">{data.name}</h2>
                  <Badge className={`${getStageColor(data.stage)} text-white mt-1`}>
                    {data.stage}
                  </Badge>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg lg:text-xl font-bold text-brand">
                    {formatCurrency(data.potential_revenue || data.estimated_value)}
                  </p>
                  <p className="text-xs text-muted-foreground">Potential Revenue</p>
                </div>
              </div>

              {/* Company & Contact Info */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  {/* Company Info */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Company Information
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Company Name</p>
                        <p className="font-medium">{data.company_name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Industry</p>
                        <p className="font-medium">{data.industry || '-'}</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* PIC Info */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <UserCircle className="h-4 w-4" />
                      PIC Information
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Name</p>
                        <p className="font-medium">{data.pic_name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> Phone
                        </p>
                        <p className="font-medium">{data.pic_phone || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" /> Email
                        </p>
                        <p className="font-medium text-sm break-all">{data.pic_email || '-'}</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Lead Source & Sales Owner */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Lead Source
                      </h3>
                      <p className="font-medium">
                        {data.lead_creator_name
                          ? `${data.lead_creator_name}${data.lead_creator_department ? ` - ${data.lead_creator_department}` : ''}`
                          : data.lead_source || '-'}
                      </p>
                      {data.lead_source && data.lead_creator_name && (
                        <p className="text-xs text-muted-foreground">via {data.lead_source}</p>
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        Sales Owner
                      </h3>
                      <p className="font-medium">
                        {data.owner_name
                          ? `${data.owner_name}${data.owner_department ? ` - ${data.owner_department}` : ''}`
                          : '-'}
                      </p>
                      {data.owner_email && (
                        <p className="text-xs text-muted-foreground">{data.owner_email}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Pipeline Activity Timeline */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Pipeline Activity
                  </h3>

                  {timeline.length > 0 ? (
                    <div className="relative">
                      {/* Vertical Timeline Line */}
                      <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-gray-200" />

                      <div className="space-y-4">
                        {timeline.map((item, index) => (
                          <div key={item.id} className="relative flex gap-4">
                            {/* Status Icon */}
                            <div className="relative z-10 flex-shrink-0 bg-background">
                              {getStatusIcon(item.status)}
                            </div>

                            {/* Content */}
                            <div className={`flex-1 pb-4 ${index === timeline.length - 1 ? 'pb-0' : ''}`}>
                              <div className={`rounded-lg border p-3 ${getStatusColor(item.status)}`}>
                                {/* Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm">{item.title}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {item.stage}
                                    </Badge>
                                    {item.status === 'overdue' && (
                                      <Badge variant="destructive" className="text-xs">Overdue</Badge>
                                    )}
                                    {item.status === 'current' && (
                                      <Badge className="bg-blue-500 text-xs">Current</Badge>
                                    )}
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(item.date)}
                                  </span>
                                </div>

                                {/* Due Date */}
                                {item.dueDate && item.status !== 'done' && (
                                  <p className={`text-xs mb-2 ${item.status === 'overdue' ? 'text-red-600' : 'text-muted-foreground'}`}>
                                    Due: {formatDate(item.dueDate)}
                                  </p>
                                )}

                                {/* Subtitle/Notes */}
                                {item.subtitle && (
                                  <p className="text-sm text-muted-foreground mb-2">{item.subtitle}</p>
                                )}

                                {/* Actor */}
                                {item.actorName && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                                    <User className="h-3 w-3" />
                                    {item.actorName}
                                  </p>
                                )}

                                {/* Location */}
                                {item.locationAddress && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                                    <MapPin className="h-3 w-3" />
                                    {item.locationAddress}
                                  </p>
                                )}

                                {/* Evidence */}
                                {item.evidenceUrl && (
                                  <div className="mt-2">
                                    {isImageUrl(item.evidenceUrl) ? (
                                      <div className="relative">
                                        <a
                                          href={item.evidenceUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="block"
                                        >
                                          <img
                                            src={item.evidenceUrl}
                                            alt="Evidence"
                                            className="rounded-lg max-h-40 object-cover border"
                                          />
                                        </a>
                                        <p className="text-xs text-muted-foreground mt-1">
                                          {item.evidenceFileName || 'Evidence Image'}
                                        </p>
                                      </div>
                                    ) : (
                                      <a
                                        href={item.evidenceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 text-sm text-brand hover:underline"
                                      >
                                        <FileText className="h-4 w-4" />
                                        <span>{item.evidenceFileName || 'Download Evidence'}</span>
                                        <Download className="h-3 w-3" />
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      No activity recorded yet
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Lost Info (if applicable) */}
              {data.stage === 'Closed Lost' && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold text-red-700 mb-3">Lost Information</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-red-600">Lost Reason</p>
                        <p className="font-medium text-red-800 capitalize">
                          {data.lost_reason?.replace(/_/g, ' ') || '-'}
                        </p>
                      </div>
                      {data.competitor_price && (
                        <div>
                          <p className="text-xs text-red-600">Competitor Price</p>
                          <p className="font-medium text-red-800">
                            {formatCurrency(data.competitor_price)}
                          </p>
                        </div>
                      )}
                      {data.customer_budget && (
                        <div>
                          <p className="text-xs text-red-600">Customer Budget</p>
                          <p className="font-medium text-red-800">
                            {formatCurrency(data.customer_budget)}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No pipeline data available</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
