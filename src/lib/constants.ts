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

// Service Scope (Network) - defines the category/scope of service
export type ServiceScope = 'Domestics' | 'Export' | 'Import' | 'Import DTD'

// Service Scope to Department Owner Mapping
export const SERVICE_SCOPE_OWNERS: Record<ServiceScope, string> = {
  'Domestics': 'Domestics Ops Dept',
  'Export': 'Exim Ops Dept',
  'Import': 'Exim Ops Dept',
  'Import DTD': 'Import DTD Ops Dept',
}

// Service Scope to Ticketing Department Mapping
export const SERVICE_SCOPE_TO_TICKETING_DEPT: Record<ServiceScope, string> = {
  'Domestics': 'DOM',
  'Export': 'EXI',
  'Import': 'EXI',
  'Import DTD': 'DTD',
}

// Service Types with Scope and Department Mapping
// Format: [Scope] | [Service Name]
export const SERVICE_TYPES = [
  // Domestics Service (owner: Domestics Ops Dept)
  { code: 'DOM_AIRFREIGHT', scope: 'Domestics' as ServiceScope, name: 'Airfreight', department: 'Domestics Ops Dept', ticketingDept: 'DOM' },
  { code: 'DOM_LTL', scope: 'Domestics' as ServiceScope, name: 'LTL (Less than Truck Load)', department: 'Domestics Ops Dept', ticketingDept: 'DOM' },
  { code: 'DOM_FTL', scope: 'Domestics' as ServiceScope, name: 'FTL (Full Trucking Load)', department: 'Domestics Ops Dept', ticketingDept: 'DOM' },
  { code: 'DOM_SEAFREIGHT_LCL', scope: 'Domestics' as ServiceScope, name: 'Seafreight LCL', department: 'Domestics Ops Dept', ticketingDept: 'DOM' },
  { code: 'DOM_SEAFREIGHT_FCL', scope: 'Domestics' as ServiceScope, name: 'Seafreight FCL', department: 'Domestics Ops Dept', ticketingDept: 'DOM' },
  { code: 'DOM_WAREHOUSING', scope: 'Domestics' as ServiceScope, name: 'Warehousing', department: 'Domestics Ops Dept', ticketingDept: 'DOM' },
  { code: 'DOM_FULFILLMENT', scope: 'Domestics' as ServiceScope, name: 'Fulfillment', department: 'Domestics Ops Dept', ticketingDept: 'DOM' },
  { code: 'DOM_WAREHOUSING_FULFILLMENT', scope: 'Domestics' as ServiceScope, name: 'Warehousing-Fulfillment', department: 'Domestics Ops Dept', ticketingDept: 'DOM' },

  // Export (owner: Exim Ops Dept)
  { code: 'EXP_AIRFREIGHT', scope: 'Export' as ServiceScope, name: 'Airfreight', department: 'Exim Ops Dept', ticketingDept: 'EXI' },
  { code: 'EXP_SEAFREIGHT_LCL', scope: 'Export' as ServiceScope, name: 'Seafreight LCL', department: 'Exim Ops Dept', ticketingDept: 'EXI' },
  { code: 'EXP_SEAFREIGHT_FCL', scope: 'Export' as ServiceScope, name: 'Seafreight FCL', department: 'Exim Ops Dept', ticketingDept: 'EXI' },
  { code: 'EXP_CUSTOMS_CLEARANCE', scope: 'Export' as ServiceScope, name: 'Customs Clearance', department: 'Exim Ops Dept', ticketingDept: 'EXI' },

  // Import (owner: Exim Ops Dept)
  { code: 'IMP_AIRFREIGHT', scope: 'Import' as ServiceScope, name: 'Airfreight', department: 'Exim Ops Dept', ticketingDept: 'EXI' },
  { code: 'IMP_SEAFREIGHT_LCL', scope: 'Import' as ServiceScope, name: 'Seafreight LCL', department: 'Exim Ops Dept', ticketingDept: 'EXI' },
  { code: 'IMP_SEAFREIGHT_FCL', scope: 'Import' as ServiceScope, name: 'Seafreight FCL', department: 'Exim Ops Dept', ticketingDept: 'EXI' },
  { code: 'IMP_CUSTOMS_CLEARANCE', scope: 'Import' as ServiceScope, name: 'Customs Clearance', department: 'Exim Ops Dept', ticketingDept: 'EXI' },

  // Import DTD (owner: Import DTD Ops Dept)
  { code: 'DTD_AIRFREIGHT', scope: 'Import DTD' as ServiceScope, name: 'Airfreight', department: 'Import DTD Ops Dept', ticketingDept: 'DTD' },
  { code: 'DTD_SEAFREIGHT_LCL', scope: 'Import DTD' as ServiceScope, name: 'Seafreight LCL', department: 'Import DTD Ops Dept', ticketingDept: 'DTD' },
  { code: 'DTD_SEAFREIGHT_FCL', scope: 'Import DTD' as ServiceScope, name: 'Seafreight FCL', department: 'Import DTD Ops Dept', ticketingDept: 'DTD' },
] as const

export type ServiceType = typeof SERVICE_TYPES[number]

// Helper function to get display label: "[Scope] | [Service Name]"
export function getServiceTypeDisplayLabel(code: string): string {
  const service = SERVICE_TYPES.find(s => s.code === code)
  if (!service) return code
  return `${service.scope} | ${service.name}`
}

// Helper function to get service by code
export function getServiceByCode(code: string): ServiceType | undefined {
  return SERVICE_TYPES.find(s => s.code === code)
}

// Helper function to get ticketing department by service code
export function getTicketingDeptByServiceCode(code: string): string | undefined {
  const service = SERVICE_TYPES.find(s => s.code === code)
  return service?.ticketingDept
}

// Service Scopes for grouping in UI
export const SERVICE_SCOPES: { value: ServiceScope; label: string; owner: string }[] = [
  { value: 'Domestics', label: 'Domestics Service', owner: 'Domestics Ops Dept' },
  { value: 'Export', label: 'Export', owner: 'Exim Ops Dept' },
  { value: 'Import', label: 'Import', owner: 'Exim Ops Dept' },
  { value: 'Import DTD', label: 'Import DTD', owner: 'Import DTD Ops Dept' },
]

// Get services by scope
export function getServicesByScope(scope: ServiceScope): ServiceType[] {
  return SERVICE_TYPES.filter(s => s.scope === scope)
}

// Domestics service codes for conditional rendering (shows fleet type)
export const DOMESTICS_SERVICE_CODES = [
  'DOM_AIRFREIGHT', 'DOM_LTL', 'DOM_FTL', 'DOM_SEAFREIGHT_LCL', 'DOM_SEAFREIGHT_FCL',
  'DOM_WAREHOUSING', 'DOM_FULFILLMENT', 'DOM_WAREHOUSING_FULFILLMENT'
] as const

// Export/Import service codes for conditional rendering (shows incoterms)
export const EXIM_SERVICE_CODES = [
  'EXP_AIRFREIGHT', 'EXP_SEAFREIGHT_LCL', 'EXP_SEAFREIGHT_FCL', 'EXP_CUSTOMS_CLEARANCE',
  'IMP_AIRFREIGHT', 'IMP_SEAFREIGHT_LCL', 'IMP_SEAFREIGHT_FCL', 'IMP_CUSTOMS_CLEARANCE',
  'DTD_AIRFREIGHT', 'DTD_SEAFREIGHT_LCL', 'DTD_SEAFREIGHT_FCL'
] as const

// Legacy code mapping for backward compatibility
export const LEGACY_SERVICE_CODE_MAP: Record<string, string> = {
  'LTL': 'DOM_LTL',
  'FTL': 'DOM_FTL',
  'AF': 'DOM_AIRFREIGHT',
  'LCL': 'DOM_SEAFREIGHT_LCL',
  'FCL': 'DOM_SEAFREIGHT_FCL',
  'WAREHOUSING': 'DOM_WAREHOUSING',
  'FULFILLMENT': 'DOM_FULFILLMENT',
  'LCL_EXPORT': 'EXP_SEAFREIGHT_LCL',
  'FCL_EXPORT': 'EXP_SEAFREIGHT_FCL',
  'AIRFREIGHT_EXPORT': 'EXP_AIRFREIGHT',
  'LCL_IMPORT': 'IMP_SEAFREIGHT_LCL',
  'FCL_IMPORT': 'IMP_SEAFREIGHT_FCL',
  'AIRFREIGHT_IMPORT': 'IMP_AIRFREIGHT',
  'CUSTOMS_CLEARANCE': 'IMP_CUSTOMS_CLEARANCE',
  'LCL_DTD': 'DTD_SEAFREIGHT_LCL',
  'FCL_DTD': 'DTD_SEAFREIGHT_FCL',
  'AIRFREIGHT_DTD': 'DTD_AIRFREIGHT',
}

// Convert legacy code to new code
export function convertLegacyServiceCode(legacyCode: string): string {
  return LEGACY_SERVICE_CODE_MAP[legacyCode] || legacyCode
}

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

// Approach Methods for Pipeline Updates and Sales Plans
export const APPROACH_METHODS: { value: ApproachMethod; label: string; icon: string; requiresCamera: boolean }[] = [
  { value: 'Site Visit', label: 'Site Visit', icon: 'map-pin', requiresCamera: true },
  { value: 'Online Meeting', label: 'Online Meeting', icon: 'video', requiresCamera: false },
  { value: 'Phone Call', label: 'Phone Call', icon: 'phone', requiresCamera: false },
  { value: 'WhatsApp', label: 'WhatsApp', icon: 'message-circle', requiresCamera: false },
  { value: 'Texting', label: 'Texting', icon: 'message-square', requiresCamera: false },
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

// Pipeline step status:
// - on_schedule: Completed before/on due date, OR not yet due
// - overdue: Completed AFTER due date (late completion)
// - need_attention: Due date passed but not completed yet
export type PipelineStepStatus = 'on_schedule' | 'overdue' | 'need_attention'

export interface PipelineTimelineStep {
  stage: OpportunityStage
  label: string
  dueDate: Date | null
  status: PipelineStepStatus
  completedAt: Date | null
  daysAllowed: number
  isCompleted: boolean // Whether the stage has been completed
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

    let status: PipelineStepStatus = 'on_schedule'
    let dueDate: Date | null = null
    let completedAt: Date | null = null
    let isCompleted = false
    const daysAllowed = isClosedStage ? 0 : (config?.daysAllowed || 0)

    // Calculate due date from creation date (sequential)
    const cumulativeDays = getCumulativeDaysFromStart(i)
    dueDate = new Date(createdAt.getTime() + cumulativeDays * 24 * 60 * 60 * 1000)

    // Determine if stage is completed and get completion time
    if (i === 0) {
      // PROSPECTING: Always completed when pipeline is created
      isCompleted = true
      completedAt = createdAt
    } else if (isClosed) {
      // Pipeline is closed - all stages are completed
      isCompleted = true
      completedAt = stageEntryTimes[stage] || (opportunity.closed_at ? new Date(opportunity.closed_at) : null)
      if (isClosedStage && opportunity.closed_at) {
        completedAt = new Date(opportunity.closed_at)
      }
    } else if (isOnHold) {
      // On hold - check if this stage was reached
      if (stageEntryTimes[stage]) {
        isCompleted = true
        completedAt = stageEntryTimes[stage]
      }
    } else {
      // Active pipeline
      if (i <= currentStageIndex) {
        // Past or current stage - completed
        isCompleted = true
        completedAt = stageEntryTimes[stage] || null
        // If we have entry time for next stage, use that as completion time
        if (i < currentStageIndex && i < ALL_PIPELINE_STAGES.length - 1 && stageEntryTimes[ALL_PIPELINE_STAGES[i + 1]]) {
          completedAt = stageEntryTimes[ALL_PIPELINE_STAGES[i + 1]]
        }
      }
    }

    // Determine status based on completion and due date
    // Status logic:
    // - on_schedule: Completed before/on due date, OR not yet due
    // - overdue: Completed AFTER due date (late completion)
    // - need_attention: Due date passed but not completed yet
    if (isCompleted && completedAt && dueDate) {
      // Stage is completed - check if on time or late
      if (completedAt <= dueDate) {
        status = 'on_schedule'
      } else {
        status = 'overdue' // Late completion
      }
    } else if (!isCompleted && dueDate) {
      // Stage not completed - check if past due
      if (now > dueDate) {
        status = 'need_attention' // Past due, needs action
      } else {
        status = 'on_schedule' // Still have time
      }
    }

    timeline.push({
      stage: isClosedStage ? (isClosed && currentStage === 'Closed Lost' ? 'Closed Lost' : 'Closed Won') : stage,
      label: isClosedStage ? 'Closed' : stage,
      dueDate,
      status,
      completedAt,
      daysAllowed,
      isCompleted,
    })
  }

  return timeline
}

// Get stage order index (for comparison)
export function getStageIndex(stage: OpportunityStage): number {
  const order = ['Prospecting', 'Discovery', 'Quote Sent', 'Negotiation', 'Closed Won', 'Closed Lost', 'On Hold']
  return order.indexOf(stage)
}

// =====================================================
// TICKETING STATUS CONSTANTS (SSOT)
// These are the exact enum values used in the database
// IMPORTANT: These must match database enum definitions exactly
// =====================================================

// Ticket Status (ticket_status enum) - must match database exactly
export const TICKET_STATUS = {
  OPEN: 'open',
  NEED_RESPONSE: 'need_response',
  IN_PROGRESS: 'in_progress',
  WAITING_CUSTOMER: 'waiting_customer',
  NEED_ADJUSTMENT: 'need_adjustment',
  PENDING: 'pending',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const

export type TicketStatusCode = typeof TICKET_STATUS[keyof typeof TICKET_STATUS]

export const TICKET_STATUS_LIST: TicketStatusCode[] = Object.values(TICKET_STATUS)

// Ticket Status Labels for UI display
export const TICKET_STATUS_LABELS: Record<TicketStatusCode, string> = {
  [TICKET_STATUS.OPEN]: 'Open',
  [TICKET_STATUS.NEED_RESPONSE]: 'Need Response',
  [TICKET_STATUS.IN_PROGRESS]: 'In Progress',
  [TICKET_STATUS.WAITING_CUSTOMER]: 'Waiting Customer',
  [TICKET_STATUS.NEED_ADJUSTMENT]: 'Request Adjustment',
  [TICKET_STATUS.PENDING]: 'Pending',
  [TICKET_STATUS.RESOLVED]: 'Resolved',
  [TICKET_STATUS.CLOSED]: 'Closed',
}

// Customer Quotation Status (customer_quotation_status enum) - must match database exactly
export const QUOTATION_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
} as const

export type QuotationStatusCode = typeof QUOTATION_STATUS[keyof typeof QUOTATION_STATUS]

export const QUOTATION_STATUS_LIST: QuotationStatusCode[] = Object.values(QUOTATION_STATUS)

// Quotation Status Labels for UI display
export const QUOTATION_STATUS_LABELS: Record<QuotationStatusCode, string> = {
  [QUOTATION_STATUS.DRAFT]: 'Draft',
  [QUOTATION_STATUS.SENT]: 'Sent',
  [QUOTATION_STATUS.ACCEPTED]: 'Accepted',
  [QUOTATION_STATUS.REJECTED]: 'Rejected',
  [QUOTATION_STATUS.EXPIRED]: 'Expired',
  [QUOTATION_STATUS.REVOKED]: 'Revoked',
}

// Opportunity Stage (opportunity_stage enum) - must match database exactly
// IMPORTANT: These use Title Case, NOT snake_case
export const OPPORTUNITY_STAGE = {
  PROSPECTING: 'Prospecting',
  DISCOVERY: 'Discovery',
  QUOTE_SENT: 'Quote Sent',
  NEGOTIATION: 'Negotiation',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
  ON_HOLD: 'On Hold',
} as const

export type OpportunityStageCode = typeof OPPORTUNITY_STAGE[keyof typeof OPPORTUNITY_STAGE]

export const OPPORTUNITY_STAGE_LIST: OpportunityStageCode[] = Object.values(OPPORTUNITY_STAGE)

// Quote Status for Operational Costs (quote_status enum) - must match database exactly
export const QUOTE_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  SENT: 'sent',
  SENT_TO_CUSTOMER: 'sent_to_customer',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WON: 'won',
  REVISE_REQUESTED: 'revise_requested',
} as const

export type QuoteStatusCode = typeof QUOTE_STATUS[keyof typeof QUOTE_STATUS]

export const QUOTE_STATUS_LIST: QuoteStatusCode[] = Object.values(QUOTE_STATUS)

// Quote Status Labels for UI display
export const QUOTE_STATUS_LABELS: Record<QuoteStatusCode, string> = {
  [QUOTE_STATUS.DRAFT]: 'Draft',
  [QUOTE_STATUS.SUBMITTED]: 'Submitted',
  [QUOTE_STATUS.SENT]: 'Sent',
  [QUOTE_STATUS.SENT_TO_CUSTOMER]: 'Sent to Customer',
  [QUOTE_STATUS.ACCEPTED]: 'Accepted',
  [QUOTE_STATUS.REJECTED]: 'Rejected',
  [QUOTE_STATUS.WON]: 'Won',
  [QUOTE_STATUS.REVISE_REQUESTED]: 'Revision Requested',
}

// Quotation Rejection Reason Types (quotation_rejection_reason_type enum)
export const QUOTATION_REJECTION_REASON = {
  TARIF_TIDAK_MASUK: 'tarif_tidak_masuk',
  KOMPETITOR_LEBIH_MURAH: 'kompetitor_lebih_murah',
  BUDGET_CUSTOMER_TIDAK_CUKUP: 'budget_customer_tidak_cukup',
  SERVICE_TIDAK_SESUAI: 'service_tidak_sesuai',
  WAKTU_TIDAK_SESUAI: 'waktu_tidak_sesuai',
  OTHER: 'other',
} as const

export type QuotationRejectionReasonCode = typeof QUOTATION_REJECTION_REASON[keyof typeof QUOTATION_REJECTION_REASON]

export const QUOTATION_REJECTION_REASON_LIST: QuotationRejectionReasonCode[] = Object.values(QUOTATION_REJECTION_REASON)

// Rejection Reason Labels for UI display
export const QUOTATION_REJECTION_REASON_LABELS: Record<QuotationRejectionReasonCode, string> = {
  [QUOTATION_REJECTION_REASON.TARIF_TIDAK_MASUK]: 'Tarif Tidak Masuk',
  [QUOTATION_REJECTION_REASON.KOMPETITOR_LEBIH_MURAH]: 'Kompetitor Lebih Murah',
  [QUOTATION_REJECTION_REASON.BUDGET_CUSTOMER_TIDAK_CUKUP]: 'Budget Customer Tidak Cukup',
  [QUOTATION_REJECTION_REASON.SERVICE_TIDAK_SESUAI]: 'Service Tidak Sesuai',
  [QUOTATION_REJECTION_REASON.WAKTU_TIDAK_SESUAI]: 'Waktu Tidak Sesuai',
  [QUOTATION_REJECTION_REASON.OTHER]: 'Lainnya',
}

// Reasons that require numeric input (competitor_amount or customer_budget)
export const FINANCIAL_REJECTION_REASONS: QuotationRejectionReasonCode[] = [
  QUOTATION_REJECTION_REASON.TARIF_TIDAK_MASUK,
  QUOTATION_REJECTION_REASON.KOMPETITOR_LEBIH_MURAH,
  QUOTATION_REJECTION_REASON.BUDGET_CUSTOMER_TIDAK_CUKUP,
]

// Operational Cost Rejection Reason Types (operational_cost_rejection_reason_type enum)
export const OPERATIONAL_COST_REJECTION_REASON = {
  HARGA_TERLALU_TINGGI: 'harga_terlalu_tinggi',
  MARGIN_TIDAK_MENCUKUPI: 'margin_tidak_mencukupi',
  VENDOR_TIDAK_SESUAI: 'vendor_tidak_sesuai',
  WAKTU_TIDAK_SESUAI: 'waktu_tidak_sesuai',
  PERLU_REVISI: 'perlu_revisi',
  TARIF_TIDAK_MASUK: 'tarif_tidak_masuk',
  KOMPETITOR_LEBIH_MURAH: 'kompetitor_lebih_murah',
  BUDGET_CUSTOMER_TIDAK_CUKUP: 'budget_customer_tidak_cukup',
  OTHER: 'other',
} as const

export type OperationalCostRejectionReasonCode = typeof OPERATIONAL_COST_REJECTION_REASON[keyof typeof OPERATIONAL_COST_REJECTION_REASON]

export const OPERATIONAL_COST_REJECTION_REASON_LIST: OperationalCostRejectionReasonCode[] = Object.values(OPERATIONAL_COST_REJECTION_REASON)

// Operational Cost Rejection Reason Labels for UI display
export const OPERATIONAL_COST_REJECTION_REASON_LABELS: Record<OperationalCostRejectionReasonCode, string> = {
  [OPERATIONAL_COST_REJECTION_REASON.HARGA_TERLALU_TINGGI]: 'Harga Terlalu Tinggi',
  [OPERATIONAL_COST_REJECTION_REASON.MARGIN_TIDAK_MENCUKUPI]: 'Margin Tidak Mencukupi',
  [OPERATIONAL_COST_REJECTION_REASON.VENDOR_TIDAK_SESUAI]: 'Vendor Tidak Sesuai',
  [OPERATIONAL_COST_REJECTION_REASON.WAKTU_TIDAK_SESUAI]: 'Waktu Tidak Sesuai',
  [OPERATIONAL_COST_REJECTION_REASON.PERLU_REVISI]: 'Perlu Revisi',
  [OPERATIONAL_COST_REJECTION_REASON.TARIF_TIDAK_MASUK]: 'Tarif Tidak Masuk',
  [OPERATIONAL_COST_REJECTION_REASON.KOMPETITOR_LEBIH_MURAH]: 'Kompetitor Lebih Murah',
  [OPERATIONAL_COST_REJECTION_REASON.BUDGET_CUSTOMER_TIDAK_CUKUP]: 'Budget Customer Tidak Cukup',
  [OPERATIONAL_COST_REJECTION_REASON.OTHER]: 'Lainnya',
}

// Reasons that require numeric input for operational cost adjustment
export const FINANCIAL_OPERATIONAL_COST_REASONS: OperationalCostRejectionReasonCode[] = [
  OPERATIONAL_COST_REJECTION_REASON.HARGA_TERLALU_TINGGI,
  OPERATIONAL_COST_REJECTION_REASON.MARGIN_TIDAK_MENCUKUPI,
  OPERATIONAL_COST_REJECTION_REASON.TARIF_TIDAK_MASUK,
  OPERATIONAL_COST_REJECTION_REASON.KOMPETITOR_LEBIH_MURAH,
  OPERATIONAL_COST_REJECTION_REASON.BUDGET_CUSTOMER_TIDAK_CUKUP,
]

// Ticket Type (ticket_type enum)
export const TICKET_TYPE = {
  RFQ: 'RFQ',
  GEN: 'GEN',
} as const

export type TicketTypeCode = typeof TICKET_TYPE[keyof typeof TICKET_TYPE]

// Ticketing Department (ticketing_department enum)
export const TICKETING_DEPARTMENT = {
  MKT: 'MKT',
  SAL: 'SAL',
  DOM: 'DOM',
  EXI: 'EXI',
  DTD: 'DTD',
  TRF: 'TRF',
} as const

export type TicketingDepartmentCode = typeof TICKETING_DEPARTMENT[keyof typeof TICKETING_DEPARTMENT]

// Department Labels
export const TICKETING_DEPARTMENT_LABELS: Record<TicketingDepartmentCode, string> = {
  [TICKETING_DEPARTMENT.MKT]: 'Marketing',
  [TICKETING_DEPARTMENT.SAL]: 'Sales',
  [TICKETING_DEPARTMENT.DOM]: 'Domestics Ops',
  [TICKETING_DEPARTMENT.EXI]: 'EXIM Ops',
  [TICKETING_DEPARTMENT.DTD]: 'Import DTD Ops',
  [TICKETING_DEPARTMENT.TRF]: 'Traffic & Warehouse',
}

// =====================================================
// WORKFLOW TRANSITION MAPPINGS (SSOT)
// These define the expected state changes for each action
// =====================================================

// When quotation is sent:
// - Quotation: draft -> sent
// - Opportunity: Discovery/Prospecting -> Quote Sent
// - Ticket: -> waiting_customer
// - Operational Cost: -> sent_to_customer
export const WORKFLOW_QUOTATION_SENT = {
  quotation_status: QUOTATION_STATUS.SENT,
  opportunity_stage: OPPORTUNITY_STAGE.QUOTE_SENT,
  ticket_status: TICKET_STATUS.WAITING_CUSTOMER,
  quote_status: QUOTE_STATUS.SENT_TO_CUSTOMER,
} as const

// When quotation is rejected:
// - Quotation: sent -> rejected
// - Opportunity: Quote Sent/Discovery/Prospecting -> Negotiation
// - Ticket: -> need_adjustment
// - Operational Cost: -> revise_requested
export const WORKFLOW_QUOTATION_REJECTED = {
  quotation_status: QUOTATION_STATUS.REJECTED,
  opportunity_stage: OPPORTUNITY_STAGE.NEGOTIATION,
  ticket_status: TICKET_STATUS.NEED_ADJUSTMENT,
  quote_status: QUOTE_STATUS.REVISE_REQUESTED,
} as const

// When quotation is accepted:
// - Quotation: sent -> accepted (terminal)
// - Opportunity: -> Closed Won (terminal)
// - Ticket: -> closed (won)
// - Operational Cost: -> won (terminal, NOT accepted)
export const WORKFLOW_QUOTATION_ACCEPTED = {
  quotation_status: QUOTATION_STATUS.ACCEPTED,
  opportunity_stage: OPPORTUNITY_STAGE.CLOSED_WON,
  ticket_status: TICKET_STATUS.CLOSED,
  quote_status: QUOTE_STATUS.WON,  // Terminal state for cost
} as const

// =====================================================
// STATE MACHINE DEFINITIONS (SSOT)
// These define valid transitions for each entity
// =====================================================

// Ticket Status State Machine
// Terminal: closed (no transitions out unless admin reopen)
export const TICKET_STATUS_TRANSITIONS: Record<TicketStatusCode, TicketStatusCode[]> = {
  [TICKET_STATUS.OPEN]: [TICKET_STATUS.NEED_RESPONSE, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.WAITING_CUSTOMER, TICKET_STATUS.NEED_ADJUSTMENT, TICKET_STATUS.PENDING, TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED],
  [TICKET_STATUS.NEED_RESPONSE]: [TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.WAITING_CUSTOMER, TICKET_STATUS.NEED_ADJUSTMENT, TICKET_STATUS.PENDING, TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED],
  [TICKET_STATUS.IN_PROGRESS]: [TICKET_STATUS.NEED_RESPONSE, TICKET_STATUS.WAITING_CUSTOMER, TICKET_STATUS.NEED_ADJUSTMENT, TICKET_STATUS.PENDING, TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED],
  [TICKET_STATUS.WAITING_CUSTOMER]: [TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.NEED_RESPONSE, TICKET_STATUS.NEED_ADJUSTMENT, TICKET_STATUS.PENDING, TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED],
  [TICKET_STATUS.NEED_ADJUSTMENT]: [TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.WAITING_CUSTOMER, TICKET_STATUS.NEED_RESPONSE, TICKET_STATUS.PENDING, TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED],
  [TICKET_STATUS.PENDING]: [TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.WAITING_CUSTOMER, TICKET_STATUS.NEED_ADJUSTMENT, TICKET_STATUS.NEED_RESPONSE, TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED],
  [TICKET_STATUS.RESOLVED]: [TICKET_STATUS.CLOSED, TICKET_STATUS.IN_PROGRESS],
  [TICKET_STATUS.CLOSED]: [],  // Terminal - no transitions
}

// Quote Status State Machine (ticket_rate_quotes)
// Terminal: won, rejected
// Snapshot: revise_requested (cannot transition, must create NEW quote)
export const QUOTE_STATUS_TRANSITIONS: Record<QuoteStatusCode, QuoteStatusCode[]> = {
  [QUOTE_STATUS.DRAFT]: [QUOTE_STATUS.SUBMITTED],
  [QUOTE_STATUS.SUBMITTED]: [QUOTE_STATUS.ACCEPTED, QUOTE_STATUS.REVISE_REQUESTED, QUOTE_STATUS.REJECTED, QUOTE_STATUS.SENT_TO_CUSTOMER],
  [QUOTE_STATUS.ACCEPTED]: [QUOTE_STATUS.SENT_TO_CUSTOMER, QUOTE_STATUS.WON],
  [QUOTE_STATUS.SENT_TO_CUSTOMER]: [QUOTE_STATUS.WON, QUOTE_STATUS.REJECTED],
  [QUOTE_STATUS.REVISE_REQUESTED]: [],  // Snapshot - create new quote
  [QUOTE_STATUS.WON]: [],  // Terminal
  [QUOTE_STATUS.REJECTED]: [],  // Terminal
  [QUOTE_STATUS.SENT]: [QUOTE_STATUS.SENT_TO_CUSTOMER, QUOTE_STATUS.ACCEPTED, QUOTE_STATUS.REJECTED],  // Legacy
}

// Terminal states for quote_status (no transitions allowed)
export const QUOTE_STATUS_TERMINAL: QuoteStatusCode[] = [
  QUOTE_STATUS.WON,
  QUOTE_STATUS.REJECTED,
  QUOTE_STATUS.REVISE_REQUESTED,  // Snapshot - cannot modify
]

// Customer Quotation Status State Machine
// Terminal: accepted, rejected, expired, revoked
// Snapshot: After status != draft, core fields are immutable
export const QUOTATION_STATUS_TRANSITIONS: Record<QuotationStatusCode, QuotationStatusCode[]> = {
  [QUOTATION_STATUS.DRAFT]: [QUOTATION_STATUS.SENT, QUOTATION_STATUS.REVOKED],
  [QUOTATION_STATUS.SENT]: [QUOTATION_STATUS.ACCEPTED, QUOTATION_STATUS.REJECTED, QUOTATION_STATUS.EXPIRED, QUOTATION_STATUS.REVOKED],
  [QUOTATION_STATUS.ACCEPTED]: [],  // Terminal
  [QUOTATION_STATUS.REJECTED]: [],  // Terminal
  [QUOTATION_STATUS.EXPIRED]: [],  // Terminal
  [QUOTATION_STATUS.REVOKED]: [],  // Terminal
}

// Terminal states for customer_quotation_status
export const QUOTATION_STATUS_TERMINAL: QuotationStatusCode[] = [
  QUOTATION_STATUS.ACCEPTED,
  QUOTATION_STATUS.REJECTED,
  QUOTATION_STATUS.EXPIRED,
  QUOTATION_STATUS.REVOKED,
]
