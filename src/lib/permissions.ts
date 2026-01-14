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
