// =====================================================
// Application Constants
// SOURCE: PDF Section 6 - Role Definitions
// =====================================================

import type { UserRole, LeadTriageStatus, OpportunityStage, ActivityTypeV2, ProspectingTargetStatus } from '@/types/database'

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

// Lead triage statuses
export const LEAD_TRIAGE_STATUSES: LeadTriageStatus[] = [
  'New',
  'In Review',
  'Qualified',
  'Nurture',
  'Disqualified',
  'Handed Over',
]

// Marketing visible statuses
export const MARKETING_VISIBLE_STATUSES: LeadTriageStatus[] = ['New', 'In Review', 'Nurture', 'Disqualified']

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

// Additional Services
export const ADDITIONAL_SERVICES = [
  { code: 'LOADING', name: 'Loading' },
  { code: 'UNLOADING', name: 'Unloading' },
  { code: 'HANDLING', name: 'Handling' },
  { code: 'PACKING', name: 'Packing' },
  { code: 'WRAPPING', name: 'Wrapping' },
  { code: 'LABELING', name: 'Labeling' },
  { code: 'PALLETIZING', name: 'Palletizing' },
  { code: 'FUMIGATION', name: 'Fumigation' },
  { code: 'INSURANCE', name: 'Insurance' },
  { code: 'CUSTOMS_DOC', name: 'Customs Documentation' },
  { code: 'WAREHOUSE', name: 'Warehouse Storage' },
  { code: 'CROSS_DOCK', name: 'Cross Docking' },
  { code: 'DOOR_TO_DOOR', name: 'Door to Door' },
  { code: 'EXPRESS', name: 'Express Delivery' },
  { code: 'TEMP_CONTROL', name: 'Temperature Controlled' },
  { code: 'HAZMAT', name: 'Hazmat Handling' },
  { code: 'LASHING', name: 'Lashing' },
  { code: 'INSPECTION', name: 'Inspection' },
  { code: 'REPACKING', name: 'Repacking' },
  { code: 'ASSEMBLY', name: 'Assembly' },
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
