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
