// =====================================================
// Permission Helpers
// SOURCE: PDF Section 6, Pages 25-27
// =====================================================

import type { UserRole } from '@/types/database'
import { ADMIN_ROLES, MARKETING_ROLES, SALES_ROLES } from './constants'

export function isAdmin(role: UserRole | null | undefined): boolean {
  if (!role) return false
  return ADMIN_ROLES.includes(role)
}

export function isMarketing(role: UserRole | null | undefined): boolean {
  if (!role) return false
  return MARKETING_ROLES.includes(role)
}

export function isSales(role: UserRole | null | undefined): boolean {
  if (!role) return false
  return SALES_ROLES.includes(role)
}

// Can user access lead inbox (marketing queue)?
export function canAccessLeadInbox(role: UserRole | null | undefined): boolean {
  return isAdmin(role) || isMarketing(role)
}

// Can user access sales inbox (handover pool)?
export function canAccessSalesInbox(role: UserRole | null | undefined): boolean {
  return isAdmin(role) || isSales(role)
}

// Can user access pipeline?
export function canAccessPipeline(role: UserRole | null | undefined): boolean {
  return isAdmin(role) || isSales(role) || isMarketing(role)
}

// Can user triage leads?
export function canTriageLeads(role: UserRole | null | undefined): boolean {
  return isAdmin(role) || isMarketing(role)
}

// Can user claim leads?
export function canClaimLeads(role: UserRole | null | undefined): boolean {
  return isAdmin(role) || isSales(role)
}

// Can user create opportunities?
export function canCreateOpportunities(role: UserRole | null | undefined): boolean {
  return isAdmin(role) || isSales(role)
}

// Can user manage cadences?
export function canManageCadences(role: UserRole | null | undefined): boolean {
  return isAdmin(role)
}

// Can user import data?
export function canImportData(role: UserRole | null | undefined): boolean {
  if (!role) return false
  return isAdmin(role) || role === 'Marketing Manager' || role === 'sales manager'
}

// Can user view audit logs?
export function canViewAuditLogs(role: UserRole | null | undefined): boolean {
  return isAdmin(role)
}

// Manager roles that can edit any lead
const MANAGER_ROLES: UserRole[] = ['Director', 'super admin', 'Marketing Manager', 'sales manager']

// Check if user can edit a specific lead
export function canEditLead(
  role: UserRole | null | undefined,
  userId: string,
  lead: {
    created_by: string | null
    marketing_owner_user_id: string | null
    sales_owner_user_id: string | null
  }
): boolean {
  if (!role) return false

  // Admin and managers can always edit
  if (MANAGER_ROLES.includes(role)) return true

  // Creator can edit their own lead
  if (lead.created_by === userId) return true

  // Marketing owner can edit
  if (lead.marketing_owner_user_id === userId) return true

  // Sales owner can edit
  if (lead.sales_owner_user_id === userId) return true

  return false
}
