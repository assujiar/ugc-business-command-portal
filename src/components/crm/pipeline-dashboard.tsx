'use client'

import { useState, useRef, useEffect } from 'react'
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
import { formatDateTimeFull, formatCurrency } from '@/lib/utils'
import {
  OPPORTUNITY_STAGES,
  APPROACH_METHODS,
  LOST_REASONS,
  calculatePipelineTimeline,
  type PipelineTimelineStep,
} from '@/lib/constants'
import type { OpportunityStage, ApproachMethod, LostReason, UserRole } from '@/types/database'
import { PipelineDetailDialog } from '@/components/crm/pipeline-detail-dialog'
import { CreatePipelineDialog } from '@/components/crm/create-pipeline-dialog'
import { TrendingUp,
  Search,
  FileText,
  Users2,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Pause,
  AlertCircle,
  Upload,
  MapPin,
  Clock,
  Camera,
  Eye,
  Loader2,
  Navigation,
  Plus,
  Ticket,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface StageHistory {
  new_stage: OpportunityStage
  changed_at: string
}

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
  stage_history?: StageHistory[]
}

interface PipelineDashboardProps {
  opportunities: Opportunity[]
  currentUserId: string
  userRole?: UserRole | null
  canUpdate?: boolean
}

interface GeoLocation {
  lat: number
  lng: number
  address: string
  accuracy: number
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

export function PipelineDashboard({ opportunities, currentUserId, userRole, canUpdate = true }: PipelineDashboardProps) {
  const router = useRouter()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [selectedStage, setSelectedStage] = useState<OpportunityStage | 'all'>('all')
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [currentTime, setCurrentTime] = useState<Date | undefined>(undefined)
  const [updateDialog, setUpdateDialog] = useState<{
    open: boolean
    opportunity: Opportunity | null
  }>({ open: false, opportunity: null })

  // Quotation creation state
  const [showQuotationOptions, setShowQuotationOptions] = useState(false)
  const [creatingQuotation, setCreatingQuotation] = useState(false)

  // Shipment details from linked lead (for update dialog)
  const [updateDialogShipment, setUpdateDialogShipment] = useState<any>(null)

  // Set current time only on client-side to avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
    setCurrentTime(new Date())
  }, [])

  // Helper to check if opportunity is overdue
  // Uses pre-calculated is_overdue from database (v_pipeline_with_updates view)
  // Only shows after mount to avoid hydration mismatch (server time != client time during SSR)
  const isOverdue = (opp: Opportunity): boolean => {
    if (!mounted) return false // Prevent hydration mismatch
    return opp.is_overdue // Use database-calculated value from view
  }

  // Detail dialog state
  const [detailDialog, setDetailDialog] = useState<{
    open: boolean
    opportunityId: string | null
  }>({ open: false, opportunityId: null })

  // Update form state
  const [newStage, setNewStage] = useState<OpportunityStage | ''>('')
  const [approachMethod, setApproachMethod] = useState<ApproachMethod | ''>('')
  const [notes, setNotes] = useState('')
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)
  const [lostReason, setLostReason] = useState<LostReason | ''>('')
  const [competitorPrice, setCompetitorPrice] = useState('')
  const [customerBudget, setCustomerBudget] = useState('')

  // Geolocation state
  const [geoLocation, setGeoLocation] = useState<GeoLocation | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  // Check if current approach method requires camera only
  const requiresCamera = approachMethod === 'Site Visit'
  const selectedMethod = APPROACH_METHODS.find(m => m.value === approachMethod)

  // Calculate counts per stage
  const stageCounts = STAGE_CONFIG.reduce((acc, { stage }) => {
    acc[stage] = opportunities.filter(opp => opp.stage === stage).length
    return acc
  }, {} as Record<OpportunityStage, number>)

  // Filter opportunities
  const filteredOpportunities = selectedStage === 'all'
    ? opportunities
    : opportunities.filter(opp => opp.stage === selectedStage)

  // Get current location automatically
  const getCurrentLocation = async () => {
    setGeoLoading(true)
    setGeoError(null)

    if (!navigator.geolocation) {
      setGeoError('Geolocation tidak didukung browser')
      setGeoLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords

        // Try to get address from coordinates using reverse geocoding
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            { headers: { 'Accept-Language': 'id' } }
          )
          const data = await response.json()
          const address = data.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`

          setGeoLocation({
            lat: latitude,
            lng: longitude,
            address,
            accuracy,
          })
        } catch {
          // Fallback to coordinates only
          setGeoLocation({
            lat: latitude,
            lng: longitude,
            address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
            accuracy,
          })
        }
        setGeoLoading(false)
      },
      (error) => {
        let message = 'Gagal mendapatkan lokasi'
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Akses lokasi ditolak. Silakan izinkan akses lokasi di browser.'
            break
          case error.POSITION_UNAVAILABLE:
            message = 'Lokasi tidak tersedia'
            break
          case error.TIMEOUT:
            message = 'Request lokasi timeout'
            break
        }
        setGeoError(message)
        setGeoLoading(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )
  }

  const resetForm = () => {
    setNewStage('')
    setApproachMethod('')
    setNotes('')
    setEvidenceFile(null)
    setLostReason('')
    setCompetitorPrice('')
    setCustomerBudget('')
    setGeoLocation(null)
    setGeoError(null)
    setShowQuotationOptions(false)
    setCreatingQuotation(false)
    setUpdateDialogShipment(null)
  }

  const openUpdateDialog = async (opportunity: Opportunity) => {
    resetForm()
    setUpdateDialogShipment(null)
    setUpdateDialog({ open: true, opportunity })
    // Auto-get location when dialog opens
    getCurrentLocation()

    // Fetch shipment details from linked lead if available
    if (opportunity.lead_id) {
      try {
        const response = await fetch(`/api/crm/leads/${opportunity.lead_id}`)
        if (response.ok) {
          const result = await response.json()
          console.log('[PipelineDashboard] Fetched shipment from lead:', result.data?.shipment_details)
          setUpdateDialogShipment(result.data?.shipment_details || null)
        }
      } catch (error) {
        console.error('[PipelineDashboard] Error fetching lead shipment:', error)
      }
    }
  }

  const openDetailDialog = (opportunityId: string) => {
    setDetailDialog({ open: true, opportunityId })
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

    // Validate evidence for Site Visit
    if (approachMethod === 'Site Visit' && !evidenceFile) {
      alert('Bukti foto wajib diupload untuk Site Visit')
      return
    }

    setIsLoading(updateDialog.opportunity.opportunity_id)

    try {
      const formData = new FormData()
      formData.append('opportunity_id', updateDialog.opportunity.opportunity_id)
      formData.append('new_stage', newStage)
      formData.append('approach_method', approachMethod)
      formData.append('notes', notes)

      // Send geolocation data
      if (geoLocation) {
        formData.append('location_lat', geoLocation.lat.toString())
        formData.append('location_lng', geoLocation.lng.toString())
        formData.append('location_address', geoLocation.address)
      }

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

  // Create RFQ ticket from opportunity (when updating to Quote Sent)
  const handleCreateTicketFromUpdate = () => {
    if (!updateDialog.opportunity) return
    const opp = updateDialog.opportunity

    // Store shipment data in sessionStorage for ticket form to read
    if (updateDialogShipment) {
      console.log('[PipelineDashboard] Storing shipment for ticket:', updateDialogShipment)
      sessionStorage.setItem('prefill_ticket_shipment', JSON.stringify({
        service_type_code: updateDialogShipment.service_type_code,
        department: updateDialogShipment.department,
        fleet_type: updateDialogShipment.fleet_type,
        fleet_quantity: updateDialogShipment.fleet_quantity,
        incoterm: updateDialogShipment.incoterm,
        cargo_category: updateDialogShipment.cargo_category,
        cargo_description: updateDialogShipment.cargo_description,
        origin_address: updateDialogShipment.origin_address,
        origin_city: updateDialogShipment.origin_city,
        origin_country: updateDialogShipment.origin_country,
        destination_address: updateDialogShipment.destination_address,
        destination_city: updateDialogShipment.destination_city,
        destination_country: updateDialogShipment.destination_country,
        quantity: updateDialogShipment.quantity,
        unit_of_measure: updateDialogShipment.unit_of_measure,
        weight_per_unit_kg: updateDialogShipment.weight_per_unit_kg,
        weight_total_kg: updateDialogShipment.weight_total_kg,
        length_cm: updateDialogShipment.length_cm,
        width_cm: updateDialogShipment.width_cm,
        height_cm: updateDialogShipment.height_cm,
        volume_total_cbm: updateDialogShipment.volume_total_cbm,
        scope_of_work: updateDialogShipment.scope_of_work,
        additional_services: updateDialogShipment.additional_services,
      }))
    }

    const params = new URLSearchParams({
      from: 'opportunity',
      opportunity_id: opp.opportunity_id,
      company_name: opp.account_name || opp.name || '',
    })
    setUpdateDialog({ open: false, opportunity: null })
    resetForm()
    router.push(`/tickets/new?${params.toString()}`)
  }

  // Create quotation directly from opportunity (when updating to Quote Sent)
  const handleCreateQuotationFromUpdate = async () => {
    if (!updateDialog.opportunity) return
    const opp = updateDialog.opportunity

    setCreatingQuotation(true)
    try {
      const response = await fetch('/api/ticketing/customer-quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: opp.opportunity_id,
          lead_id: opp.lead_id,
          source_type: 'opportunity',
          customer_name: opp.account_name || opp.name || '',
          customer_company: opp.account_name,
          // Shipment details from linked lead
          service_type: updateDialogShipment?.service_type_code,
          department: updateDialogShipment?.department,
          fleet_type: updateDialogShipment?.fleet_type,
          fleet_quantity: updateDialogShipment?.fleet_quantity,
          incoterm: updateDialogShipment?.incoterm,
          commodity: updateDialogShipment?.cargo_category,
          cargo_description: updateDialogShipment?.cargo_description,
          cargo_weight: updateDialogShipment?.weight_total_kg,
          cargo_weight_unit: 'kg',
          cargo_volume: updateDialogShipment?.volume_total_cbm,
          cargo_volume_unit: 'cbm',
          cargo_quantity: updateDialogShipment?.quantity,
          cargo_quantity_unit: updateDialogShipment?.unit_of_measure,
          origin_address: updateDialogShipment?.origin_address,
          origin_city: updateDialogShipment?.origin_city,
          origin_country: updateDialogShipment?.origin_country,
          destination_address: updateDialogShipment?.destination_address,
          destination_city: updateDialogShipment?.destination_city,
          destination_country: updateDialogShipment?.destination_country,
          scope_of_work: updateDialogShipment?.scope_of_work,
        }),
      })

      const result = await response.json()

      if (result.success) {
        toast({
          title: 'Quotation Created',
          description: `Quotation ${result.quotation_number} berhasil dibuat`,
        })
        setUpdateDialog({ open: false, opportunity: null })
        resetForm()
        router.push(`/customer-quotations/${result.quotation_id}`)
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

  // Get timeline for an opportunity
  const getOpportunityTimeline = (opp: Opportunity): PipelineTimelineStep[] => {
    return calculatePipelineTimeline(
      {
        stage: opp.stage,
        created_at: opp.created_at,
        closed_at: opp.closed_at,
      },
      opp.stage_history,
      currentTime // Pass current time to avoid hydration mismatch
    )
  }

  const getStepStatusBadge = (status: string) => {
    switch (status) {
      case 'on_schedule':
        return (
          <Badge variant="outline" className="text-green-600 border-green-600 text-[10px] px-1">
            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
            On Schedule
          </Badge>
        )
      case 'overdue':
        return (
          <Badge variant="destructive" className="text-[10px] px-1">
            <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
            Overdue
          </Badge>
        )
      case 'need_attention':
        return (
          <Badge variant="outline" className="text-amber-600 border-amber-600 text-[10px] px-1 animate-pulse">
            <Clock className="h-2.5 w-2.5 mr-0.5" />
            Need Attention
          </Badge>
        )
      default:
        return null
    }
  }

  // Handle file selection (for non-Site Visit methods)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setEvidenceFile(file)
    }
  }

  // Handle camera capture (for Site Visit)
  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate that it's an image
      if (!file.type.startsWith('image/')) {
        alert('Hanya file gambar yang diizinkan untuk Site Visit')
        return
      }
      setEvidenceFile(file)
    }
  }

  // Reset evidence when approach method changes
  useEffect(() => {
    setEvidenceFile(null)
  }, [approachMethod])

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header with Create Button */}
      {canUpdate && (
        <div className="flex justify-end">
          <CreatePipelineDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Pipeline
              </Button>
            }
          />
        </div>
      )}

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
                const timeline = getOpportunityTimeline(opp)

                return (
                  <Card key={opp.opportunity_id} className="bg-muted/50">
                    <CardContent className="p-3 lg:p-4">
                      <div className="flex flex-col gap-3">
                        {/* Header */}
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-sm lg:text-base truncate">{opp.name}</h3>
                              {isOverdue(opp) && (
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

                            {opp.owner_name && (
                              <p className="text-[10px] lg:text-xs text-muted-foreground mt-1">
                                Owner: {opp.owner_name}
                              </p>
                            )}
                          </div>

                          <div className="flex gap-2 flex-shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openDetailDialog(opp.opportunity_id)}
                              className="w-full lg:w-auto"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View Detail
                            </Button>
                            {canUpdate && nextStages.length > 0 && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => openUpdateDialog(opp)}
                                disabled={isLoading === opp.opportunity_id}
                                className="w-full lg:w-auto"
                              >
                                Update Status
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Timeline - Horizontal milestone for pipeline cards */}
                        {!['Closed Won', 'Closed Lost'].includes(opp.stage) && timeline.length > 0 && (
                          <div className="border-t border-border/50 pt-3 mt-1">
                            <p className="text-xs font-medium text-muted-foreground mb-3">Pipeline Timeline</p>
                            {/* Horizontal timeline with connecting line */}
                            <div className="relative">
                              {/* Gradient connecting line */}
                              <div className="absolute top-4 left-6 right-6 h-1 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-orange-500 opacity-30 dark:opacity-20" />
                              {/* Progress line */}
                              <div
                                className="absolute top-4 left-6 h-1 rounded-full bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500"
                                style={{
                                  width: `${Math.max(0, (timeline.filter(s => s.isCompleted).length / timeline.length) * 100 - 10)}%`
                                }}
                              />
                              <div className="flex justify-between overflow-x-auto pb-1">
                                {timeline.map((step, index) => {
                                  // Stage-specific colors
                                  const stageColors: Record<string, { bg: string; ring: string; text: string }> = {
                                    'Prospecting': { bg: 'bg-blue-500', ring: 'ring-blue-400', text: 'text-blue-600 dark:text-blue-400' },
                                    'Discovery': { bg: 'bg-cyan-500', ring: 'ring-cyan-400', text: 'text-cyan-600 dark:text-cyan-400' },
                                    'Quote Sent': { bg: 'bg-amber-500', ring: 'ring-amber-400', text: 'text-amber-600 dark:text-amber-400' },
                                    'Negotiation': { bg: 'bg-orange-500', ring: 'ring-orange-400', text: 'text-orange-600 dark:text-orange-400' },
                                  }
                                  const colors = stageColors[step.stage] || { bg: 'bg-gray-500', ring: 'ring-gray-400', text: 'text-gray-600' }

                                  return (
                                    <div
                                      key={step.stage}
                                      className="flex flex-col items-center relative z-10 min-w-[80px] px-1"
                                    >
                                      {/* Status dot with ring effect */}
                                      <div
                                        className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
                                          step.isCompleted && step.status === 'on_schedule'
                                            ? `${colors.bg} ring-2 ${colors.ring} ring-offset-2 ring-offset-background`
                                            : step.status === 'overdue'
                                            ? 'bg-red-500 ring-2 ring-red-400 ring-offset-2 ring-offset-background'
                                            : step.status === 'need_attention'
                                            ? 'bg-amber-500 ring-2 ring-amber-400 ring-offset-2 ring-offset-background animate-pulse'
                                            : 'bg-muted ring-2 ring-muted-foreground/20 ring-offset-2 ring-offset-background'
                                        }`}
                                      >
                                        {step.isCompleted && step.status === 'on_schedule' ? (
                                          <CheckCircle2 className="h-5 w-5 text-white drop-shadow" />
                                        ) : step.status === 'overdue' ? (
                                          <AlertCircle className="h-5 w-5 text-white drop-shadow" />
                                        ) : step.status === 'need_attention' ? (
                                          <AlertCircle className="h-5 w-5 text-white drop-shadow" />
                                        ) : (
                                          <Clock className="h-4 w-4 text-muted-foreground" />
                                        )}
                                      </div>
                                      {/* Stage label with color */}
                                      <span className={`text-[10px] font-semibold mt-2 text-center ${
                                        step.isCompleted && step.status === 'on_schedule' ? colors.text :
                                        step.status === 'overdue' ? 'text-red-500 dark:text-red-400' :
                                        step.status === 'need_attention' ? 'text-amber-500 dark:text-amber-400' :
                                        'text-muted-foreground'
                                      }`}>
                                        {step.label}
                                      </span>
                                      {/* Status badge */}
                                      <span className={`text-[8px] font-medium mt-1 px-1.5 py-0.5 rounded-full ${
                                        step.isCompleted && step.status === 'on_schedule'
                                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                          : step.status === 'overdue'
                                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                          : step.status === 'need_attention'
                                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                      }`}>
                                        {step.isCompleted && step.status === 'on_schedule' ? 'On Schedule' :
                                         step.status === 'overdue' ? 'Overdue' :
                                         step.status === 'need_attention' ? 'Need Attention' : 'On Schedule'}
                                      </span>
                                      {/* Due date */}
                                      {step.dueDate && (
                                        <span className="text-[8px] text-muted-foreground mt-0.5">
                                          Due: {step.dueDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                                        </span>
                                      )}
                                      {/* Activity/Completed date */}
                                      {step.isCompleted && step.completedAt && (
                                        <span className={`text-[8px] ${step.status === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                          Done: {step.completedAt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                                        </span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
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

            {/* Location Status - Auto Geotagging */}
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Navigation className="h-4 w-4" />
                  Location Update
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={getCurrentLocation}
                  disabled={geoLoading}
                >
                  {geoLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Refresh'
                  )}
                </Button>
              </div>
              {geoLoading && (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Mendapatkan lokasi...
                </p>
              )}
              {geoError && (
                <p className="text-xs text-red-500">{geoError}</p>
              )}
              {geoLocation && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground break-words">{geoLocation.address}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Coordinates: {geoLocation.lat.toFixed(6)}, {geoLocation.lng.toFixed(6)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Accuracy: {geoLocation.accuracy.toFixed(0)}m
                  </p>
                </div>
              )}
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

            {/* Quote Sent - Quotation/Ticket Creation Options */}
            {newStage === 'Quote Sent' && (
              <div className="p-4 border border-amber-500/50 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    Buat Ticket/Quotation untuk status Quote Sent
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sebelum update ke Quote Sent, pastikan sudah ada quotation yang dikirim ke customer.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCreateTicketFromUpdate}
                    className="flex-1"
                  >
                    <Ticket className="h-4 w-4 mr-2" />
                    Buat RFQ Ticket
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={handleCreateQuotationFromUpdate}
                    disabled={creatingQuotation}
                    className="flex-1 bg-amber-600 hover:bg-amber-700"
                  >
                    {creatingQuotation ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    {creatingQuotation ? 'Creating...' : 'Buat Quotation Langsung'}
                  </Button>
                </div>
              </div>
            )}

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

            {/* Evidence Upload - Different behavior based on approach method */}
            <div className="space-y-2">
              <Label>
                Evidence {requiresCamera && <span className="text-red-500">*</span>}
              </Label>

              {requiresCamera ? (
                // Camera only for Site Visit
                <div className="space-y-2">
                  <input
                    ref={cameraInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    capture="environment"
                    onChange={handleCameraCapture}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => cameraInputRef.current?.click()}
                    className="w-full"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    {evidenceFile ? evidenceFile.name : 'Take Photo'}
                  </Button>
                  <p className="text-xs text-amber-600">
                    Site Visit wajib mengambil foto langsung dari kamera (tidak bisa upload dari device)
                  </p>
                  {evidenceFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEvidenceFile(null)}
                    >
                      Remove Photo
                    </Button>
                  )}
                </div>
              ) : (
                // File upload or camera for other methods
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={handleFileSelect}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    capture="environment"
                    onChange={handleCameraCapture}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload File
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex-1"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Take Photo
                    </Button>
                  </div>
                  {evidenceFile && (
                    <div className="flex items-center justify-between bg-muted p-2 rounded">
                      <span className="text-sm truncate">{evidenceFile.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEvidenceFile(null)}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Upload screenshot, photo, or document as proof
                  </p>
                </div>
              )}
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
                (requiresCamera && !evidenceFile) ||
                (newStage === 'Closed Lost' && !lostReason)
              }
            >
              {isLoading === updateDialog.opportunity?.opportunity_id ? 'Updating...' : 'Update Pipeline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline Detail Dialog */}
      <PipelineDetailDialog
        opportunityId={detailDialog.opportunityId}
        open={detailDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setDetailDialog({ open: false, opportunityId: null })
          }
        }}
      />
    </div>
  )
}
