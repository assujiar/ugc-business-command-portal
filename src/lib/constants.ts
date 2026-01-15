// =====================================================
// Application Constants
// SOURCE: PDF Section 6 - Role Definitions
// =====================================================

import type { UserRole, LeadTriageStatus, OpportunityStage, ActivityTypeV2, ProspectingTargetStatus, AccountStatus, LostReason, ApproachMethod } from '@/types/database'

// All 15 fixed roles from PDF
export const USER_ROLES: UserRole[] = [
  'Director',
  'super admin',
  'Marketing Manager',
  'Marcomm',
  'DGO',
  'MACX',
  'VSDO',
  'sales manager',
  'salesperson',
  'sales support',
  'EXIM Ops',
  'domestics Ops',
  'Import DTD Ops',
  'traffic & warehous',
  'finance',
]

// Role groups for permission checks
export const ADMIN_ROLES: UserRole[] = ['Director', 'super admin']
export const MARKETING_ROLES: UserRole[] = ['Director', 'super admin', 'Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO']
export const SALES_ROLES: UserRole[] = ['Director', 'super admin', 'sales manager', 'salesperson', 'sales support']

// Lead triage statuses - valid statuses only
// Flow: New -> In Review -> Qualified -> Assign to Sales (manual) -> Claimed by Sales
export const LEAD_TRIAGE_STATUSES: LeadTriageStatus[] = [
  'New',
  'In Review',
  'Qualified',
  'Assign to Sales',
  'Nurture',
  'Disqualified',
]

// Marketing visible statuses (for Lead Management page)
export const MARKETING_VISIBLE_STATUSES: LeadTriageStatus[] = [
  'New',
  'In Review',
  'Qualified',
  'Assign to Sales',
  'Nurture',
  'Disqualified',
]

// Status actions mapping - which actions are available for each status
// Flow: New -> In Review -> Qualified -> Assign to Sales (manual) -> Claimed by Sales
export const LEAD_STATUS_ACTIONS: Record<LeadTriageStatus, LeadTriageStatus[]> = {
  'New': ['In Review', 'Qualified', 'Nurture', 'Disqualified'],
  'In Review': ['Qualified', 'Nurture', 'Disqualified'],
  'Qualified': ['Assign to Sales', 'Nurture', 'Disqualified'], // Manual assign to sales action
  'Nurture': ['In Review', 'Qualified', 'Disqualified'],
  'Disqualified': [],
  'Assign to Sales': [], // Final status before sales claim - no further actions
}

// Opportunity stages
export const OPPORTUNITY_STAGES: OpportunityStage[] = [
  'Prospecting',
  'Discovery',
  'Quote Sent',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
  'On Hold',
]

// Activity types
export const ACTIVITY_TYPES: ActivityTypeV2[] = [
  'Call',
  'Email',
  'Meeting',
  'Site Visit',
  'WhatsApp',
  'Task',
  'Proposal',
  'Contract Review',
  'Online Meeting',
  'Phone Call',
  'Texting',
]

// Target statuses
export const TARGET_STATUSES: ProspectingTargetStatus[] = [
  'new',
  'researching',
  'outreach_planned',
  'contacted',
  'meeting_scheduled',
  'converted',
  'dropped',
]

// Lead sources
export const LEAD_SOURCES = [
  'Webform (SEM)',
  'Webform (Organic)',
  'Instagram',
  'TikTok',
  'Facebook',
  'Event',
  'Referral',
  'Outbound',
  'Lainnya',
] as const

// Industry options
export const INDUSTRIES = [
  'Manufacturing',
  'Retail',
  'Technology',
  'Healthcare',
  'Finance',
  'Education',
  'Real Estate',
  'Logistics',
  'Food & Beverage',
  'Automotive',
  'Energy',
  'Telecommunications',
  'Agriculture',
  'Construction',
  'Other',
] as const

// Priority levels
export const PRIORITY_LEVELS = [
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
  { value: 4, label: 'Critical' },
] as const

// =====================================================
// SHIPMENT RELATED CONSTANTS
// =====================================================

// Service Types with Department Mapping
export const SERVICE_TYPES = [
  // Domestics Operations
  { code: 'LTL', name: 'LTL', department: 'Domestics Operations' },
  { code: 'FTL', name: 'FTL', department: 'Domestics Operations' },
  { code: 'AF', name: 'AF', department: 'Domestics Operations' },
  { code: 'LCL', name: 'LCL', department: 'Domestics Operations' },
  { code: 'FCL', name: 'FCL', department: 'Domestics Operations' },
  { code: 'WAREHOUSING', name: 'WAREHOUSING', department: 'Domestics Operations' },
  { code: 'FULFILLMENT', name: 'FULFILLMENT', department: 'Domestics Operations' },
  // Exim Operations
  { code: 'LCL_EXPORT', name: 'LCL Export', department: 'Exim Operations' },
  { code: 'FCL_EXPORT', name: 'FCL Export', department: 'Exim Operations' },
  { code: 'AIRFREIGHT_EXPORT', name: 'Airfreight Export', department: 'Exim Operations' },
  { code: 'LCL_IMPORT', name: 'LCL Import', department: 'Exim Operations' },
  { code: 'FCL_IMPORT', name: 'FCL Import', department: 'Exim Operations' },
  { code: 'AIRFREIGHT_IMPORT', name: 'Airfreight Import', department: 'Exim Operations' },
  { code: 'CUSTOMS_CLEARANCE', name: 'Customs Clearance', department: 'Exim Operations' },
  // Import DTD Operations
  { code: 'LCL_DTD', name: 'LCL DTD', department: 'Import DTD Operations' },
  { code: 'FCL_DTD', name: 'FCL DTD', department: 'Import DTD Operations' },
  { code: 'AIRFREIGHT_DTD', name: 'Airfreight DTD', department: 'Import DTD Operations' },
] as const

export type ServiceType = typeof SERVICE_TYPES[number]

// Domestics service codes for conditional rendering
export const DOMESTICS_SERVICE_CODES = ['LTL', 'FTL', 'AF', 'LCL', 'FCL', 'WAREHOUSING', 'FULFILLMENT'] as const

// Export/Import service codes for conditional rendering (shows incoterms)
export const EXIM_SERVICE_CODES = [
  'LCL_EXPORT', 'FCL_EXPORT', 'AIRFREIGHT_EXPORT',
  'LCL_IMPORT', 'FCL_IMPORT', 'AIRFREIGHT_IMPORT',
  'CUSTOMS_CLEARANCE', 'LCL_DTD', 'FCL_DTD', 'AIRFREIGHT_DTD'
] as const

// Fleet Types (for Domestics Operations)
export const FLEET_TYPES = [
  'Blindvan',
  'Pickup',
  'CDE Box',
  'CDE Bak',
  'CDD Box',
  'CDD Bak',
  'CDD Long',
  'CDD Refer',
  'Fuso Box',
  'Fuso Bak',
  'TWB',
  'Trailer 20 Feet',
  'Trailer 40 Feet',
  'Flatbed',
  'Lainnya',
] as const

// Incoterms (for Export/Import services)
export const INCOTERMS = [
  { code: 'EXW', name: 'EXW - Ex Works' },
  { code: 'FCA', name: 'FCA - Free Carrier' },
  { code: 'CPT', name: 'CPT - Carriage Paid To' },
  { code: 'CIP', name: 'CIP - Carriage and Insurance Paid To' },
  { code: 'DAP', name: 'DAP - Delivered at Place' },
  { code: 'DPU', name: 'DPU - Delivered at Place Unloaded' },
  { code: 'DDP', name: 'DDP - Delivered Duty Paid' },
  { code: 'FAS', name: 'FAS - Free Alongside Ship' },
  { code: 'FOB', name: 'FOB - Free on Board' },
  { code: 'CFR', name: 'CFR - Cost and Freight' },
  { code: 'CIF', name: 'CIF - Cost, Insurance and Freight' },
] as const

// Cargo Categories
export const CARGO_CATEGORIES = [
  'General Cargo',
  'Dangerous Goods',
] as const

// Unit of Measure
export const UNITS_OF_MEASURE = [
  'Boxes',
  'Drum',
  'Wood Package',
  'Pallet',
  'Carton',
  'Bag',
  'Bundle',
  'Roll',
  'Piece',
  'Crate',
  'Container',
  'Sack',
  'Tank',
  'Cylinder',
  'Other',
] as const

// Additional Services (code must match database enum exactly)
export const ADDITIONAL_SERVICES = [
  { code: 'Loading', name: 'Loading' },
  { code: 'Unloading', name: 'Unloading' },
  { code: 'Handling', name: 'Handling' },
  { code: 'Packing', name: 'Packing' },
  { code: 'Wrapping', name: 'Wrapping' },
  { code: 'Labeling', name: 'Labeling' },
  { code: 'Palletizing', name: 'Palletizing' },
  { code: 'Fumigation', name: 'Fumigation' },
  { code: 'Insurance', name: 'Insurance' },
  { code: 'Customs Documentation', name: 'Customs Documentation' },
  { code: 'Warehouse Storage', name: 'Warehouse Storage' },
  { code: 'Cross Docking', name: 'Cross Docking' },
  { code: 'Door to Door', name: 'Door to Door' },
  { code: 'Express Delivery', name: 'Express Delivery' },
  { code: 'Temperature Controlled', name: 'Temperature Controlled' },
  { code: 'Hazmat Handling', name: 'Hazmat Handling' },
  { code: 'Lashing', name: 'Lashing' },
  { code: 'Inspection', name: 'Inspection' },
  { code: 'Repacking', name: 'Repacking' },
  { code: 'Assembly', name: 'Assembly' },
] as const

// Common Countries
export const COUNTRIES = [
  'Indonesia',
  'Singapore',
  'Malaysia',
  'Thailand',
  'Vietnam',
  'Philippines',
  'China',
  'Hong Kong',
  'Taiwan',
  'Japan',
  'South Korea',
  'India',
  'Australia',
  'United States',
  'Germany',
  'Netherlands',
  'United Kingdom',
  'Other',
] as const

// =====================================================
// LEAD MANAGEMENT ENHANCEMENT CONSTANTS
// =====================================================

// Account Statuses
export const ACCOUNT_STATUSES: { value: AccountStatus; label: string; description: string }[] = [
  { value: 'calon_account', label: 'Calon Account', description: 'Pipeline belum closed' },
  { value: 'new_account', label: 'New Account', description: 'Pipeline closed win, berlaku 3 bulan' },
  { value: 'failed_account', label: 'Failed Account', description: 'Pipeline closed lost' },
  { value: 'active_account', label: 'Active Account', description: 'Aktif bertransaksi mulai bulan ke-4' },
  { value: 'passive_account', label: 'Passive Account', description: 'Tidak ada transaksi >1 bulan' },
  { value: 'lost_account', label: 'Lost Account', description: 'Tidak ada transaksi >3 bulan' },
]

// Lost Reasons for Pipeline
export const LOST_REASONS: { value: LostReason; label: string; requiresPrice: boolean }[] = [
  { value: 'harga_tidak_masuk', label: 'Harga Tidak Masuk', requiresPrice: true },
  { value: 'kompetitor_lebih_murah', label: 'Kompetitor Lebih Murah', requiresPrice: true },
  { value: 'budget_tidak_cukup', label: 'Budget Tidak Cukup', requiresPrice: true },
  { value: 'timing_tidak_tepat', label: 'Timing Tidak Tepat', requiresPrice: false },
  { value: 'tidak_ada_kebutuhan', label: 'Tidak Ada Kebutuhan', requiresPrice: false },
  { value: 'kompetitor_lebih_baik', label: 'Kompetitor Service Lebih Baik', requiresPrice: false },
  { value: 'service_tidak_sesuai', label: 'Service Tidak Sesuai Kebutuhan', requiresPrice: false },
  { value: 'lokasi_tidak_terjangkau', label: 'Lokasi Tidak Terjangkau', requiresPrice: false },
  { value: 'lainnya', label: 'Lainnya', requiresPrice: false },
]

// Approach Methods for Pipeline Updates
export const APPROACH_METHODS: { value: ApproachMethod; label: string; icon: string; requiresCamera: boolean }[] = [
  { value: 'Site Visit', label: 'Site Visit', icon: 'map-pin', requiresCamera: true },
  { value: 'Online Meeting', label: 'Online Meeting', icon: 'video', requiresCamera: false },
  { value: 'Phone Call', label: 'Phone Call', icon: 'phone', requiresCamera: false },
  { value: 'Texting', label: 'Texting', icon: 'message-circle', requiresCamera: false },
  { value: 'Email', label: 'Email', icon: 'mail', requiresCamera: false },
]

// Lead Claim Statuses
export const LEAD_CLAIM_STATUSES = [
  { value: 'unclaimed', label: 'Unclaimed' },
  { value: 'claimed', label: 'Claimed' },
] as const

// =====================================================
// PIPELINE STAGE CONFIGURATION
// Target: Complete pipeline cycle in 7 days maximum
// =====================================================

export type PipelineStageConfig = {
  stage: OpportunityStage
  daysAllowed: number
  probability: number
  nextStep: string
  nextStage: OpportunityStage | null
}

// Pipeline stage configuration with deadlines
// Total cycle: Prospecting(1d) → Discovery(2d) → Quote Sent(1d) → Negotiation(3d) = 7 days
export const PIPELINE_STAGE_CONFIG: PipelineStageConfig[] = [
  {
    stage: 'Prospecting',
    daysAllowed: 1,      // Max 1x24 jam to move to Discovery
    probability: 10,
    nextStep: 'Initial Contact - Schedule Discovery Meeting',
    nextStage: 'Discovery',
  },
  {
    stage: 'Discovery',
    daysAllowed: 2,      // Max 2x24 jam to move to Quote Sent
    probability: 25,
    nextStep: 'Understand Requirements - Prepare Quote',
    nextStage: 'Quote Sent',
  },
  {
    stage: 'Quote Sent',
    daysAllowed: 1,      // Max 1x24 jam to move to Negotiation
    probability: 50,
    nextStep: 'Follow Up Quote - Start Negotiation',
    nextStage: 'Negotiation',
  },
  {
    stage: 'Negotiation',
    daysAllowed: 3,      // Max 3x24 jam to close (Won/Lost)
    probability: 75,
    nextStep: 'Finalize Terms - Close Deal',
    nextStage: 'Closed Won',
  },
  {
    stage: 'Closed Won',
    daysAllowed: 0,
    probability: 100,
    nextStep: 'Handover to Operations',
    nextStage: null,
  },
  {
    stage: 'Closed Lost',
    daysAllowed: 0,
    probability: 0,
    nextStep: 'Document Lost Reason',
    nextStage: null,
  },
  {
    stage: 'On Hold',
    daysAllowed: 7,
    probability: 0,
    nextStep: 'Review and Reactivate',
    nextStage: null,
  },
]

// Helper function to get stage config
export function getStageConfig(stage: OpportunityStage): PipelineStageConfig | undefined {
  return PIPELINE_STAGE_CONFIG.find(s => s.stage === stage)
}

// Calculate next step due date based on stage
export function calculateNextStepDueDate(stage: OpportunityStage): Date {
  const config = getStageConfig(stage)
  const dueDate = new Date()
  if (config) {
    // Add the allowed days for the stage
    dueDate.setTime(dueDate.getTime() + config.daysAllowed * 24 * 60 * 60 * 1000)
  }
  return dueDate
}

// =====================================================
// PIPELINE TIMELINE TYPES AND HELPERS
// =====================================================

export type PipelineStepStatus = 'done' | 'upcoming' | 'overdue'

export interface PipelineTimelineStep {
  stage: OpportunityStage
  label: string
  dueDate: Date | null
  status: PipelineStepStatus
  completedAt: Date | null
  daysAllowed: number
}

// All pipeline stages in order (including terminal states for timeline)
const ALL_PIPELINE_STAGES: OpportunityStage[] = ['Prospecting', 'Discovery', 'Quote Sent', 'Negotiation', 'Closed Won']

// Get cumulative days from start for each stage
// Prospecting: 0 days (starts at creation)
// Discovery: 1 day (after Prospecting's 1 day)
// Quote Sent: 3 days (after Discovery's 2 days)
// Negotiation: 4 days (after Quote Sent's 1 day)
// Closed: 7 days (after Negotiation's 3 days)
function getCumulativeDaysFromStart(stageIndex: number): number {
  const cumulativeDays = [0, 1, 3, 4, 7] // Prospecting, Discovery, Quote Sent, Negotiation, Closed
  return cumulativeDays[stageIndex] || 0
}

// Calculate pipeline timeline based on opportunity data and stage history
// Key Logic:
// - Prospecting is DONE when pipeline is created (claim lead/create lead)
// - Due dates are sequential from creation date
// - Timeline includes Closed stage
export function calculatePipelineTimeline(
  opportunity: {
    stage: OpportunityStage
    created_at: string
    closed_at?: string | null
  },
  stageHistory?: Array<{
    new_stage: OpportunityStage
    changed_at: string
  }>,
  currentTime?: Date // Pass current time to avoid hydration mismatch
): PipelineTimelineStep[] {
  const timeline: PipelineTimelineStep[] = []
  const currentStage = opportunity.stage
  const createdAt = new Date(opportunity.created_at)
  const now = currentTime || new Date()

  // Build a map of when each stage was entered
  const stageEntryTimes: Record<string, Date> = {}

  // Initial stage is Prospecting at created_at - and it's immediately DONE
  stageEntryTimes['Prospecting'] = createdAt

  // Build entry times from history
  if (stageHistory && stageHistory.length > 0) {
    stageHistory.forEach(history => {
      stageEntryTimes[history.new_stage] = new Date(history.changed_at)
    })
  }

  // Determine current stage index
  const currentStageIndex = ALL_PIPELINE_STAGES.indexOf(currentStage)
  const isClosed = currentStage === 'Closed Won' || currentStage === 'Closed Lost'
  const isOnHold = currentStage === 'On Hold'

  for (let i = 0; i < ALL_PIPELINE_STAGES.length; i++) {
    const stage = ALL_PIPELINE_STAGES[i]
    const isClosedStage = stage === 'Closed Won'

    // For closed stage, use different config
    const config = getStageConfig(isClosedStage ? 'Negotiation' : stage)
    if (!config && !isClosedStage) continue

    let status: PipelineStepStatus = 'upcoming'
    let dueDate: Date | null = null
    let completedAt: Date | null = null
    const daysAllowed = isClosedStage ? 0 : (config?.daysAllowed || 0)

    // Calculate due date from creation date (sequential)
    const cumulativeDays = getCumulativeDaysFromStart(i)
    dueDate = new Date(createdAt.getTime() + cumulativeDays * 24 * 60 * 60 * 1000)

    if (i === 0) {
      // PROSPECTING: Always DONE when pipeline is created
      // This is because claiming a lead or creating a lead automatically creates pipeline in Prospecting
      status = 'done'
      completedAt = createdAt
    } else if (isClosed) {
      // Pipeline is closed - all stages are done
      status = 'done'
      completedAt = stageEntryTimes[stage] || (opportunity.closed_at ? new Date(opportunity.closed_at) : null)

      // For closed stage, use closed_at
      if (isClosedStage && opportunity.closed_at) {
        completedAt = new Date(opportunity.closed_at)
      }
    } else if (isOnHold) {
      // On hold - check if this stage was reached
      if (stageEntryTimes[stage]) {
        status = 'done'
        completedAt = stageEntryTimes[stage]
      } else {
        status = 'upcoming'
      }
    } else {
      // Active pipeline
      if (i <= currentStageIndex) {
        // Past or current stage - done (pipeline has reached this stage)
        status = 'done'
        completedAt = stageEntryTimes[stage] || null
        // If we have entry time for next stage, use that as completion time for past stages
        if (i < currentStageIndex && i < ALL_PIPELINE_STAGES.length - 1 && stageEntryTimes[ALL_PIPELINE_STAGES[i + 1]]) {
          completedAt = stageEntryTimes[ALL_PIPELINE_STAGES[i + 1]]
        }
      } else {
        // Future stage - check if overdue
        if (dueDate && dueDate < now) {
          status = 'overdue'
        } else {
          status = 'upcoming'
        }
      }
    }

    timeline.push({
      stage: isClosedStage ? (isClosed && currentStage === 'Closed Lost' ? 'Closed Lost' : 'Closed Won') : stage,
      label: isClosedStage ? 'Closed' : stage,
      dueDate,
      status,
      completedAt,
      daysAllowed,
    })
  }

  return timeline
}

// Get stage order index (for comparison)
export function getStageIndex(stage: OpportunityStage): number {
  const order = ['Prospecting', 'Discovery', 'Quote Sent', 'Negotiation', 'Closed Won', 'Closed Lost', 'On Hold']
  return order.indexOf(stage)
}
