'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { formatDateTimeFull, formatCurrency } from '@/lib/utils'
import {
  APPROACH_METHODS,
  PIPELINE_STAGE_CONFIG,
} from '@/lib/constants'
import { getStaticMapUrl, getGoogleMapsUrl, isMapEnabled } from '@/lib/map'
import { getQuotationSequenceLabel } from '@/lib/utils/quotation-utils'
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
  Plus,
  Ticket,
  Loader2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface PipelineUpdate {
  update_id: string
  opportunity_id: string
  old_stage: OpportunityStage | null
  new_stage: OpportunityStage
  approach_method: ApproachMethod
  notes: string | null
  evidence_url: string | null
  evidence_file_name: string | null
  location_lat: number | null
  location_lng: number | null
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

interface Activity {
  activity_id: string
  activity_type: string
  subject: string
  description: string | null
  status: string
  due_date: string | null
  completed_at: string | null
  related_opportunity_id: string | null
  related_lead_id: string | null
  owner_user_id: string
  created_by: string
  created_at: string
  owner_name?: string | null
  creator_name?: string | null
}

interface PipelineDetailData {
  opportunity_id: string
  name: string
  stage: OpportunityStage
  estimated_value: number | null
  deal_value: number | null
  currency: string
  probability: number | null
  expected_close_date: string | null
  next_step: string | null
  next_step_due_date: string | null
  close_reason: string | null
  lost_reason: LostReason | null
  competitor: string | null
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
  activities: Activity[]
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
  locationLat?: number | null
  locationLng?: number | null
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

    // Add activities for this stage (from pipeline_updates)
    // Skip quotation-related updates (they have correlation ID prefix) since we'll show richer activities from activities table
    stageUpdates.forEach(update => {
      const isQuotationUpdate = update.notes &&
        (update.notes.match(/^\[[\w-]+\]/) &&
         (update.notes.toLowerCase().includes('quotation') || update.notes.toLowerCase().includes('deal')))

      // Skip quotation updates - they'll be shown from activities table with richer info
      if (isQuotationUpdate) {
        return
      }

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
        locationLat: update.location_lat,
        locationLng: update.location_lng,
        locationAddress: update.location_address,
        notes: update.notes,
        actorName: update.updater_name,
      })
    })
  })

  // Add quotation-related activities from activities table
  // These have rich subjects like "1st Quotation Rejected → Stage moved to Negotiation"
  if (data.activities && data.activities.length > 0) {
    data.activities.forEach(activity => {
      // Only include quotation-related activities (check subject for keywords)
      const isQuotationActivity = activity.subject &&
        (activity.subject.includes('Quotation') ||
         activity.subject.includes('quotation') ||
         activity.subject.includes('Deal Won') ||
         activity.subject.includes('Deal Lost'))

      if (isQuotationActivity) {
        // Determine which stage this activity relates to based on subject
        let activityStage: OpportunityStage = 'Negotiation'

        // Check for "(Negotiation in progress)" first - these stay in Negotiation stage
        if (activity.subject.includes('Negotiation in progress')) {
          activityStage = 'Negotiation'
        } else if (activity.subject.includes('→ Stage moved to Quote Sent') ||
                   (activity.subject.includes('Quotation Sent') && !activity.subject.includes('Rejected'))) {
          activityStage = 'Quote Sent'
        } else if (activity.subject.includes('Negotiation') || activity.subject.includes('Rejected')) {
          activityStage = 'Negotiation'
        } else if (activity.subject.includes('Deal Won') || activity.subject.includes('Accepted')) {
          activityStage = 'Closed Won'
        } else if (activity.subject.includes('Deal Lost')) {
          activityStage = 'Closed Lost'
        }

        // Strip correlation ID prefix from description for cleaner display
        let cleanDescription = activity.description || ''
        const correlationMatch = cleanDescription.match(/^\[[\w-]+\]\s*/)
        if (correlationMatch) {
          cleanDescription = cleanDescription.substring(correlationMatch[0].length)
        }

        items.push({
          id: activity.activity_id,
          type: 'activity',
          stage: activityStage,
          date: activity.completed_at || activity.created_at,
          status: 'done',
          title: activity.subject,
          subtitle: cleanDescription || undefined,
          actorName: activity.creator_name || activity.owner_name,
        })
      }
    })
  }

  // Add stage transitions from stage_history as fallback
  // stage_history was previously only used for date calculations, not shown in timeline.
  // This ensures stage transitions (e.g., Quote Sent → Negotiation) always appear,
  // even when the corresponding activities record is missing (old data before migration 151).
  if (data.stage_history && data.stage_history.length > 0) {
    data.stage_history.forEach(history => {
      if (!history.old_stage || !history.new_stage || history.old_stage === history.new_stage) return

      // Check if there's already a timeline item covering this transition
      // (from activities table - e.g., "Quotation Rejected → Stage moved to Negotiation")
      const transitionTime = new Date(history.changed_at).getTime()
      const alreadyCovered = items.some(item => {
        if (item.type !== 'activity') return false
        const itemTime = new Date(item.date).getTime()
        // Match if same stage and within 2 minutes of the transition
        return item.stage === history.new_stage && Math.abs(itemTime - transitionTime) < 120000
      })

      if (!alreadyCovered) {
        // Strip correlation ID prefix from notes
        let cleanNotes = history.notes || ''
        const correlationMatch = cleanNotes.match(/^\[[\w-]+\]\s*/)
        if (correlationMatch) {
          cleanNotes = cleanNotes.substring(correlationMatch[0].length)
        }

        items.push({
          id: `stage-history-${history.history_id}`,
          type: 'stage_change',
          stage: history.new_stage,
          date: history.changed_at,
          status: 'done',
          title: `${history.old_stage} → ${history.new_stage}`,
          subtitle: cleanNotes || undefined,
          actorName: history.changer_name,
        })
      }
    })
  }

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
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PipelineDetailData | null>(null)
  const [mounted, setMounted] = useState(false)

  // Quotation state
  const [quotations, setQuotations] = useState<any[]>([])
  const [loadingQuotations, setLoadingQuotations] = useState(false)
  const [showCreateOptions, setShowCreateOptions] = useState(false)
  const [creatingQuotation, setCreatingQuotation] = useState(false)

  // Linked tickets state
  const [linkedTickets, setLinkedTickets] = useState<any[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)

  // Shipment details from linked lead (supports multi-shipment)
  const [shipmentDetails, setShipmentDetails] = useState<any>(null)
  const [allShipments, setAllShipments] = useState<any[]>([])

  // Prevent hydration mismatch - only render dynamic content after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Refresh function to refetch all data with cache busting
  const refreshData = async () => {
    if (opportunityId) {
      await Promise.all([
        fetchPipelineDetails(opportunityId, true),
        fetchQuotations(opportunityId, true),
        fetchLinkedTickets(opportunityId, true),
      ])
    }
  }

  useEffect(() => {
    if (open && opportunityId) {
      // Always force refresh when dialog opens to get latest data
      // This ensures stage updates are immediately visible after quotation operations
      fetchPipelineDetails(opportunityId, true)
      fetchQuotations(opportunityId, true)
      fetchLinkedTickets(opportunityId, true)
    } else {
      setData(null)
      setQuotations([])
      setLinkedTickets([])
      setShipmentDetails(null)
      setAllShipments([])
      setShowCreateOptions(false)
    }
  }, [open, opportunityId])

  // Refresh data when dialog opens and quotations might have changed
  // This ensures the latest stage is shown after quotation operations
  useEffect(() => {
    if (!open || !opportunityId) return

    // Refetch pipeline details when visibility changes (user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && open) {
        fetchPipelineDetails(opportunityId, true)
        fetchQuotations(opportunityId, true)
      }
    }

    // Also listen for focus events on the dialog to catch when user switches between dialogs
    const handleFocus = () => {
      if (open) {
        fetchPipelineDetails(opportunityId, true)
        fetchQuotations(opportunityId, true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    // Poll for updates every 15 seconds while dialog is open (reduced from 30s for faster updates)
    // This helps catch external changes to quotation status
    const pollInterval = setInterval(() => {
      if (open && opportunityId) {
        fetchPipelineDetails(opportunityId, true)
      }
    }, 15000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      clearInterval(pollInterval)
    }
  }, [open, opportunityId])

  // Fetch shipment details from opportunity when data is loaded
  // Shipment data is now copied to opportunity during lead claim (auto-create)
  useEffect(() => {
    const fetchShipmentDetails = async () => {
      if (!opportunityId) {
        console.log('[PipelineDetail] No opportunity_id, skipping shipment fetch')
        setShipmentDetails(null)
        return
      }
      try {
        console.log('[PipelineDetail] Fetching shipment details for opportunity:', opportunityId)
        const response = await fetch(`/api/crm/opportunities/${opportunityId}`)
        if (response.ok) {
          const result = await response.json()
          console.log('[PipelineDetail] Opportunity data received:', result.data)
          console.log('[PipelineDetail] Shipment details:', result.data?.shipment_details)
          console.log('[PipelineDetail] All shipments:', result.data?.shipments)
          setShipmentDetails(result.data?.shipment_details || null)
          // Store all shipments for multi-shipment support
          setAllShipments(result.data?.shipments || [])
        } else {
          console.error('[PipelineDetail] Failed to fetch opportunity:', response.status)
        }
      } catch (error) {
        console.error('[PipelineDetail] Error fetching shipment details:', error)
      }
    }
    fetchShipmentDetails()
  }, [opportunityId])

  const fetchPipelineDetails = async (oppId: string, forceRefresh = false) => {
    setLoading(true)
    try {
      // Add cache-busting parameter to ensure fresh data
      const url = forceRefresh
        ? `/api/crm/pipeline/${oppId}?_t=${Date.now()}`
        : `/api/crm/pipeline/${oppId}`
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      })
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

  const fetchQuotations = async (oppId: string, forceRefresh = false) => {
    setLoadingQuotations(true)
    console.log('[PipelineDetail] Fetching quotations for opportunity_id:', oppId)
    try {
      // Add cache-busting parameter to ensure fresh data
      const url = forceRefresh
        ? `/api/ticketing/customer-quotations?opportunity_id=${oppId}&_t=${Date.now()}`
        : `/api/ticketing/customer-quotations?opportunity_id=${oppId}`
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      })
      console.log('[PipelineDetail] Quotations API response status:', response.status)
      if (response.ok) {
        const result = await response.json()
        console.log('[PipelineDetail] Quotations API result:', result)
        console.log('[PipelineDetail] Quotations data:', result.data)
        setQuotations(result.data || [])
      } else {
        const errorText = await response.text()
        console.error('[PipelineDetail] Quotations API error:', errorText)
      }
    } catch (error) {
      console.error('Error fetching quotations:', error)
    } finally {
      setLoadingQuotations(false)
    }
  }

  const fetchLinkedTickets = async (oppId: string, forceRefresh = false) => {
    setLoadingTickets(true)
    try {
      const url = forceRefresh
        ? `/api/ticketing/tickets?opportunity_id=${oppId}&_t=${Date.now()}`
        : `/api/ticketing/tickets?opportunity_id=${oppId}`
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      })
      if (response.ok) {
        const result = await response.json()
        setLinkedTickets(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching linked tickets:', error)
    } finally {
      setLoadingTickets(false)
    }
  }

  // Create RFQ ticket from opportunity
  const handleCreateTicket = () => {
    if (!data) return

    console.log('[PipelineDetail] handleCreateTicket called')
    console.log('[PipelineDetail] data.lead_id:', data.lead_id)
    console.log('[PipelineDetail] shipmentDetails:', shipmentDetails)
    console.log('[PipelineDetail] allShipments:', allShipments)

    // Store ALL shipment data in sessionStorage for ticket form to read (multi-shipment support)
    if (allShipments.length > 0) {
      // Store all shipments as array
      const shipmentsToStore = allShipments.map(s => ({
        shipment_order: s.shipment_order,
        shipment_label: s.shipment_label,
        service_type_code: s.service_type_code,
        department: s.department,
        fleet_type: s.fleet_type,
        fleet_quantity: s.fleet_quantity,
        incoterm: s.incoterm,
        cargo_category: s.cargo_category,
        cargo_description: s.cargo_description,
        origin_address: s.origin_address,
        origin_city: s.origin_city,
        origin_country: s.origin_country,
        destination_address: s.destination_address,
        destination_city: s.destination_city,
        destination_country: s.destination_country,
        quantity: s.quantity,
        unit_of_measure: s.unit_of_measure,
        weight_per_unit_kg: s.weight_per_unit_kg,
        weight_total_kg: s.weight_total_kg,
        length_cm: s.length_cm,
        width_cm: s.width_cm,
        height_cm: s.height_cm,
        volume_total_cbm: s.volume_total_cbm,
        scope_of_work: s.scope_of_work,
        additional_services: s.additional_services,
      }))
      sessionStorage.setItem('prefill_ticket_shipments', JSON.stringify(shipmentsToStore))
      console.log('[PipelineDetail] Stored', shipmentsToStore.length, 'shipments in sessionStorage')
    } else if (shipmentDetails) {
      // Fallback to single shipment for backward compatibility
      sessionStorage.setItem('prefill_ticket_shipment', JSON.stringify({
        service_type_code: shipmentDetails.service_type_code,
        department: shipmentDetails.department,
        fleet_type: shipmentDetails.fleet_type,
        fleet_quantity: shipmentDetails.fleet_quantity,
        incoterm: shipmentDetails.incoterm,
        cargo_category: shipmentDetails.cargo_category,
        cargo_description: shipmentDetails.cargo_description,
        origin_address: shipmentDetails.origin_address,
        origin_city: shipmentDetails.origin_city,
        origin_country: shipmentDetails.origin_country,
        destination_address: shipmentDetails.destination_address,
        destination_city: shipmentDetails.destination_city,
        destination_country: shipmentDetails.destination_country,
        quantity: shipmentDetails.quantity,
        unit_of_measure: shipmentDetails.unit_of_measure,
        weight_per_unit_kg: shipmentDetails.weight_per_unit_kg,
        weight_total_kg: shipmentDetails.weight_total_kg,
        length_cm: shipmentDetails.length_cm,
        width_cm: shipmentDetails.width_cm,
        height_cm: shipmentDetails.height_cm,
        volume_total_cbm: shipmentDetails.volume_total_cbm,
        scope_of_work: shipmentDetails.scope_of_work,
        additional_services: shipmentDetails.additional_services,
      }))
    }

    const params = new URLSearchParams({
      from: 'opportunity',
      opportunity_id: data.opportunity_id,
      company_name: data.company_name || '',
      contact_name: data.pic_name || '',
      contact_email: data.pic_email || '',
      contact_phone: data.pic_phone || '',
    })
    // Add account_id and lead_id if available (for linking ticket to account)
    if (data.account_id) {
      params.set('account_id', data.account_id)
    }
    if (data.lead_id) {
      params.set('lead_id', data.lead_id)
    }
    router.push(`/tickets/new?${params.toString()}`)
    onOpenChange(false)
  }

  // Create quotation directly from opportunity
  const handleCreateQuotation = async () => {
    if (!data) return

    setCreatingQuotation(true)
    try {
      const response = await fetch('/api/ticketing/customer-quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: data.opportunity_id,
          lead_id: data.lead_id,
          source_type: 'opportunity',
          direct_quotation: true, // Skip cost validation - quotation from pipeline without ops cost
          customer_name: data.pic_name || data.company_name || '',
          customer_company: data.company_name,
          customer_email: data.pic_email,
          customer_phone: data.pic_phone,
          customer_address: [data.address, data.city].filter(Boolean).join(', '),
          // Shipment details from first shipment (backward compatibility)
          service_type: shipmentDetails?.service_type_code,
          department: shipmentDetails?.department,
          fleet_type: shipmentDetails?.fleet_type,
          fleet_quantity: shipmentDetails?.fleet_quantity,
          incoterm: shipmentDetails?.incoterm,
          commodity: shipmentDetails?.cargo_category,
          cargo_description: shipmentDetails?.cargo_description,
          cargo_weight: shipmentDetails?.weight_total_kg,
          cargo_weight_unit: 'kg',
          cargo_volume: shipmentDetails?.volume_total_cbm,
          cargo_volume_unit: 'cbm',
          cargo_quantity: shipmentDetails?.quantity,
          cargo_quantity_unit: shipmentDetails?.unit_of_measure,
          origin_address: shipmentDetails?.origin_address,
          origin_city: shipmentDetails?.origin_city,
          origin_country: shipmentDetails?.origin_country,
          destination_address: shipmentDetails?.destination_address,
          destination_city: shipmentDetails?.destination_city,
          destination_country: shipmentDetails?.destination_country,
          scope_of_work: shipmentDetails?.scope_of_work,
          // All shipments for multi-shipment support
          shipments: allShipments.length > 0 ? allShipments : undefined,
        }),
      })

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        throw new Error(errBody.error || `Server error (${response.status})`)
      }

      const result = await response.json()

      if (result.success) {
        toast({
          title: 'Quotation Created',
          description: `Quotation ${result.quotation_number} created successfully`,
        })
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

  // Check if stage allows quotation creation
  const canCreateQuotation = data && !['Closed Won', 'Closed Lost'].includes(data.stage)

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

  // Stage-specific colors for colorful timeline
  const getStageColors = (stage: OpportunityStage) => {
    const colors: Record<string, { icon: string; bg: string; border: string; text: string }> = {
      'Prospecting': {
        icon: 'bg-blue-500 shadow-blue-500/50',
        bg: 'bg-blue-50 dark:bg-blue-950/30',
        border: 'border-blue-500',
        text: 'text-blue-700 dark:text-blue-400'
      },
      'Discovery': {
        icon: 'bg-cyan-500 shadow-cyan-500/50',
        bg: 'bg-cyan-50 dark:bg-cyan-950/30',
        border: 'border-cyan-500',
        text: 'text-cyan-700 dark:text-cyan-400'
      },
      'Quote Sent': {
        icon: 'bg-amber-500 shadow-amber-500/50',
        bg: 'bg-amber-50 dark:bg-amber-950/30',
        border: 'border-amber-500',
        text: 'text-amber-700 dark:text-amber-400'
      },
      'Negotiation': {
        icon: 'bg-orange-500 shadow-orange-500/50',
        bg: 'bg-orange-50 dark:bg-orange-950/30',
        border: 'border-orange-500',
        text: 'text-orange-700 dark:text-orange-400'
      },
      'Closed Won': {
        icon: 'bg-emerald-500 shadow-emerald-500/50',
        bg: 'bg-emerald-50 dark:bg-emerald-950/30',
        border: 'border-emerald-500',
        text: 'text-emerald-700 dark:text-emerald-400'
      },
      'Closed Lost': {
        icon: 'bg-red-500 shadow-red-500/50',
        bg: 'bg-red-50 dark:bg-red-950/30',
        border: 'border-red-500',
        text: 'text-red-700 dark:text-red-400'
      },
      'On Hold': {
        icon: 'bg-gray-500 shadow-gray-500/50',
        bg: 'bg-gray-50 dark:bg-gray-950/30',
        border: 'border-gray-500',
        text: 'text-gray-700 dark:text-gray-400'
      },
    }
    return colors[stage] || colors['On Hold']
  }

  const getStatusIcon = (status: string, stage: OpportunityStage) => {
    const stageColors = getStageColors(stage)
    switch (status) {
      case 'done':
        return (
          <div className={`w-8 h-8 rounded-full ${stageColors.icon} flex items-center justify-center shadow-lg`}>
            <CheckCircle2 className="h-5 w-5 text-white drop-shadow" />
          </div>
        )
      case 'current':
        return (
          <div className={`w-8 h-8 rounded-full ${stageColors.icon} flex items-center justify-center shadow-lg ring-4 ring-offset-2 ring-offset-background ${stageColors.border.replace('border', 'ring')}/30 animate-pulse`}>
            <Circle className="h-4 w-4 text-white fill-white drop-shadow" />
          </div>
        )
      case 'overdue':
        return (
          <div className="w-8 h-8 rounded-full bg-red-500 shadow-red-500/50 flex items-center justify-center shadow-lg ring-4 ring-offset-2 ring-offset-background ring-red-500/30 animate-pulse">
            <AlertCircle className="h-5 w-5 text-white drop-shadow" />
          </div>
        )
      case 'upcoming':
        return (
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shadow ring-2 ring-offset-2 ring-offset-background ring-muted-foreground/20">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
        )
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <Circle className="h-4 w-4 text-muted-foreground" />
          </div>
        )
    }
  }

  const getStatusColor = (status: string, stage: OpportunityStage) => {
    const stageColors = getStageColors(stage)
    switch (status) {
      case 'done':
        return `${stageColors.border} ${stageColors.bg} border-l-4`
      case 'current':
        return `${stageColors.border} ${stageColors.bg} border-l-4 shadow-md`
      case 'overdue':
        return 'border-red-500 bg-red-50 dark:bg-red-950/30 border-l-4 shadow-md'
      default:
        return 'border-muted-foreground/30 bg-muted/50 border-l-4'
    }
  }

  // Only build timeline after mount to avoid hydration mismatch (new Date() differs server vs client)
  const timeline = mounted && data ? buildTimeline(data, data.stage) : []

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
                  {data.deal_value ? (
                    <>
                      <p className="text-lg lg:text-xl font-bold text-green-600">
                        {formatCurrency(data.deal_value)}
                      </p>
                      <p className="text-xs text-muted-foreground">Deal Value</p>
                      {data.estimated_value && data.estimated_value !== data.deal_value && (
                        <p className="text-xs text-muted-foreground">
                          Est: {formatCurrency(data.estimated_value)}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-lg lg:text-xl font-bold text-brand">
                        {formatCurrency(data.potential_revenue || data.estimated_value)}
                      </p>
                      <p className="text-xs text-muted-foreground">Potential Revenue</p>
                    </>
                  )}
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

              {/* Customer Quotations Section */}
              {canCreateQuotation && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Customer Quotations
                        {quotations.length > 0 && (
                          <Badge variant="secondary" className="ml-2">{quotations.length}</Badge>
                        )}
                      </h3>
                      {!showCreateOptions && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCreateOptions(true)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Create
                        </Button>
                      )}
                    </div>

                    {/* Create Options */}
                    {showCreateOptions && (
                      <div className="p-4 border rounded-lg bg-muted/30 mb-4 space-y-3">
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

                    {/* Quotation List */}
                    {loadingQuotations ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                      </div>
                    ) : quotations.length > 0 ? (
                      <div className="space-y-2">
                        {quotations.map((quotation, index) => (
                          <div
                            key={quotation.id}
                            onClick={() => {
                              router.push(`/customer-quotations/${quotation.id}`)
                              onOpenChange(false)
                            }}
                            className="flex items-center justify-between p-3 border rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
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
                                    className={quotation.status === 'accepted' ? 'bg-green-500' : ''}
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
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No quotations yet. Create one to proceed.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Linked Tickets Section */}
              {(linkedTickets.length > 0 || loadingTickets) && (
                <Card className="overflow-hidden">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                      <Ticket className="h-4 w-4" />
                      Linked Tickets
                    </h3>

                    {loadingTickets ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                      </div>
                    ) : linkedTickets.length > 0 ? (
                      <div className="space-y-2">
                        {linkedTickets.map((ticket) => (
                          <div
                            key={ticket.id}
                            onClick={() => {
                              router.push(`/tickets/${ticket.id}`)
                              onOpenChange(false)
                            }}
                            className="flex items-center justify-between p-3 border rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Ticket className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{ticket.ticket_code}</p>
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {ticket.subject}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge
                                    variant={
                                      ticket.status === 'resolved' || ticket.status === 'completed' ? 'default' :
                                      ticket.status === 'cancelled' ? 'destructive' :
                                      ticket.status === 'in_progress' ? 'secondary' : 'outline'
                                    }
                                    className={
                                      ticket.status === 'resolved' || ticket.status === 'completed' ? 'bg-green-500' :
                                      ticket.status === 'in_progress' ? 'bg-blue-500 text-white' : ''
                                    }
                                  >
                                    {ticket.status?.replace(/_/g, ' ')}
                                  </Badge>
                                  {ticket.priority && (
                                    <Badge
                                      variant="outline"
                                      className={
                                        ticket.priority === 'urgent' ? 'border-red-500 text-red-500' :
                                        ticket.priority === 'high' ? 'border-orange-500 text-orange-500' :
                                        ticket.priority === 'medium' ? 'border-yellow-500 text-yellow-600' :
                                        'border-gray-400 text-gray-500'
                                      }
                                    >
                                      {ticket.priority}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No linked tickets.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Pipeline Activity Timeline */}
              <Card className="overflow-hidden">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Pipeline Activity
                  </h3>

                  {timeline.length > 0 ? (
                    <div className="relative">
                      {/* Gradient Vertical Timeline Line */}
                      <div className="absolute left-[15px] top-4 bottom-4 w-1 rounded-full bg-gradient-to-b from-blue-500 via-purple-500 via-amber-500 to-orange-500 opacity-30 dark:opacity-20" />

                      <div className="space-y-4">
                        {timeline.map((item, index) => {
                          const stageColors = getStageColors(item.stage)
                          return (
                          <div key={item.id} className="relative flex gap-4">
                            {/* Status Icon */}
                            <div className="relative z-10 flex-shrink-0">
                              {getStatusIcon(item.status, item.stage)}
                            </div>

                            {/* Content */}
                            <div className={`flex-1 pb-4 ${index === timeline.length - 1 ? 'pb-0' : ''}`}>
                              <div className={`rounded-lg border p-3 transition-all duration-200 hover:shadow-lg ${getStatusColor(item.status, item.stage)}`}>
                                {/* Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`font-medium text-sm ${stageColors.text}`}>{item.title}</span>
                                    <Badge
                                      className={`text-xs ${stageColors.bg} ${stageColors.text} border ${stageColors.border}`}
                                    >
                                      {item.stage}
                                    </Badge>
                                    {item.status === 'overdue' && (
                                      <Badge variant="destructive" className="text-xs animate-pulse">Overdue</Badge>
                                    )}
                                    {item.status === 'current' && (
                                      <Badge className={`text-xs ${stageColors.icon.split(' ')[0]} text-white`}>Current</Badge>
                                    )}
                                  </div>
                                  <span className="text-xs text-muted-foreground font-medium">
                                    {formatDateTimeFull(item.date)}
                                  </span>
                                </div>

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

                                {/* Location with Map Preview */}
                                {item.locationAddress && (
                                  <div className="mb-2">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                                      <MapPin className="h-3 w-3 flex-shrink-0" />
                                      <span className="break-words">{item.locationAddress}</span>
                                    </p>
                                    {item.locationLat && item.locationLng && (
                                      <div className="space-y-2">
                                        {/* Static Map Preview */}
                                        {(() => {
                                          const mapUrl = getStaticMapUrl(item.locationLat, item.locationLng)
                                          if (mapUrl) {
                                            return (
                                              <div className="relative rounded-lg overflow-hidden border">
                                                <Image
                                                  src={mapUrl}
                                                  alt="Location Map"
                                                  width={400}
                                                  height={128}
                                                  className="w-full h-32 object-cover"
                                                  unoptimized
                                                  onError={(e) => {
                                                    // Hide the image container if map fails to load
                                                    const target = e.target as HTMLImageElement
                                                    const parent = target.parentElement
                                                    if (parent) {
                                                      parent.innerHTML = '<div class="h-32 flex items-center justify-center bg-muted"><p class="text-xs text-muted-foreground">Peta tidak tersedia</p></div>'
                                                    }
                                                  }}
                                                />
                                              </div>
                                            )
                                          }
                                          // Fallback placeholder when no map provider is configured
                                          return (
                                            <div className="relative rounded-lg overflow-hidden border">
                                              <div className="h-32 flex items-center justify-center bg-muted">
                                                <div className="text-center">
                                                  <MapPin className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                                                  <p className="text-xs text-muted-foreground">Peta tidak tersedia</p>
                                                </div>
                                              </div>
                                            </div>
                                          )
                                        })()}
                                        {/* View Location Button */}
                                        <a
                                          href={getGoogleMapsUrl(item.locationLat, item.locationLng)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-2 text-xs text-brand hover:underline"
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                          View Location in Maps
                                        </a>
                                      </div>
                                    )}
                                  </div>
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
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
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
                          )
                        })}
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
                <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-3">Lost Information</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-red-600 dark:text-red-500">Lost Reason</p>
                        <p className="font-medium text-red-800 dark:text-red-300 capitalize">
                          {data.lost_reason?.replace(/_/g, ' ') || '-'}
                        </p>
                      </div>
                      {data.competitor && (
                        <div>
                          <p className="text-xs text-red-600 dark:text-red-500">Competitor</p>
                          <p className="font-medium text-red-800 dark:text-red-300">
                            {data.competitor}
                          </p>
                        </div>
                      )}
                      {data.competitor_price != null && data.competitor_price > 0 && (
                        <div>
                          <p className="text-xs text-red-600 dark:text-red-500">Competitor Price</p>
                          <p className="font-medium text-red-800 dark:text-red-300">
                            {formatCurrency(data.competitor_price)}
                          </p>
                        </div>
                      )}
                      {data.customer_budget != null && data.customer_budget > 0 && (
                        <div>
                          <p className="text-xs text-red-600 dark:text-red-500">Customer Budget</p>
                          <p className="font-medium text-red-800 dark:text-red-300">
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
