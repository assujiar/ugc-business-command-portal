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

// Check if user has MACX role
export function isMACX(role: UserRole | null | undefined): boolean {
  if (!role) return false
  return role === 'MACX'
}

// Marketing roles for department check (excluding admin roles)
const MARKETING_DEPARTMENT_ROLES: UserRole[] = ['Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO']

// Check if a creator is in marketing department (by role or department field)
export function isCreatorInMarketingDepartment(
  creatorRole: UserRole | null | undefined,
  creatorDepartment: string | null | undefined
): boolean {
  // Check by department field (case insensitive)
  if (creatorDepartment && creatorDepartment.toLowerCase().includes('marketing')) {
    return true
  }
  // Check by marketing role
  if (creatorRole && MARKETING_DEPARTMENT_ROLES.includes(creatorRole)) {
    return true
  }
  return false
}

// Can user access lead inbox (marketing queue)?
export function canAccessLeadInbox(role: UserRole | null | undefined): boolean {
  return isAdmin(role) || isMarketing(role)
}

// Can user access lead management page?
// All roles that can VIEW leads should have access
export function canAccessLeadManagement(role: UserRole | null | undefined): boolean {
  if (!role) return false
  // Admin, Director - can see all leads
  if (isAdmin(role)) return true
  // Marketing roles - can see their leads / department leads
  if (isMarketing(role)) return true
  // Sales roles - can see leads they created or claimed
  if (isSales(role)) return true
  return false
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

// Can user import data? (Super admin only)
export function canImportData(role: UserRole | null | undefined): boolean {
  return role === 'super admin'
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
    // Optional creator info for MACX access check
    creator_role?: UserRole | null
    creator_department?: string | null
    creator_is_marketing?: boolean | null
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

  // MACX can edit leads created by marketing department users
  if (isMACX(role)) {
    // If creator_is_marketing flag is available (from view), use it
    if (lead.creator_is_marketing === true) return true
    // Otherwise, check using creator_role and creator_department
    if (isCreatorInMarketingDepartment(lead.creator_role, lead.creator_department)) return true
  }

  return false
}

// Check if MACX user can access lead (view/edit) based on creator info
export function canMACXAccessLead(
  role: UserRole | null | undefined,
  lead: {
    creator_role?: UserRole | null
    creator_department?: string | null
    creator_is_marketing?: boolean | null
  }
): boolean {
  if (!isMACX(role)) return false

  // If creator_is_marketing flag is available (from view), use it
  if (lead.creator_is_marketing === true) return true

  // Otherwise, check using creator_role and creator_department
  return isCreatorInMarketingDepartment(lead.creator_role, lead.creator_department)
}

// =====================================================
// Pipeline Permissions
// =====================================================

// Pipeline View Access Rules:
// - Salesperson: Pipeline from leads they created or claimed
// - Sales Manager: Pipeline from leads created/claimed by sales department users
// - Marketing (Marcomm, VSDO, DGO): Pipeline from leads they created
// - Marketing Manager, MACX: Pipeline from leads created by marketing department
// - Director, Admin: All pipelines

// Sales Manager role for viewing sales department pipelines
const SALES_MANAGER_ROLE: UserRole = 'sales manager'
const MARKETING_MANAGER_ROLE: UserRole = 'Marketing Manager'

// Check if user can view a specific pipeline
export function canViewPipeline(
  role: UserRole | null | undefined,
  userId: string,
  pipeline: {
    owner_user_id?: string | null
    lead_created_by?: string | null
    lead_marketing_owner?: string | null
    lead_sales_owner?: string | null
  }
): boolean {
  if (!role) return false

  // Admin and Director can see all pipelines
  if (isAdmin(role)) return true

  // Salesperson: Can view pipelines from leads they created or claimed
  if (role === 'salesperson') {
    // Created the lead
    if (pipeline.lead_created_by === userId) return true
    // Claimed the lead (sales owner)
    if (pipeline.lead_sales_owner === userId) return true
    // Owner of the opportunity
    if (pipeline.owner_user_id === userId) return true
    return false
  }

  // Sales Manager: Can view pipelines from all sales department leads
  if (role === SALES_MANAGER_ROLE) {
    return true // Will be filtered at query level for sales department
  }

  // Sales Support: Same as salesperson but also can view team pipelines
  if (role === 'sales support') {
    if (pipeline.lead_created_by === userId) return true
    if (pipeline.lead_sales_owner === userId) return true
    if (pipeline.owner_user_id === userId) return true
    return true // Allow viewing but not updating
  }

  // Marketing roles (Marcomm, VSDO, DGO): Can view pipelines from leads they created
  if (role === 'Marcomm' || role === 'VSDO' || role === 'DGO') {
    if (pipeline.lead_created_by === userId) return true
    if (pipeline.lead_marketing_owner === userId) return true
    return false
  }

  // Marketing Manager, MACX: Can view pipelines from marketing department leads
  if (role === MARKETING_MANAGER_ROLE || role === 'MACX') {
    return true // Will be filtered at query level for marketing department
  }

  return false
}

// Check if user can update a specific pipeline
export function canUpdatePipeline(
  role: UserRole | null | undefined,
  userId: string,
  pipeline: {
    owner_user_id?: string | null
    lead_created_by?: string | null
    lead_sales_owner?: string | null
  }
): boolean {
  if (!role) return false

  // Admin and Director can update all pipelines
  if (isAdmin(role)) return true

  // Salesperson: Can update pipelines from leads they created or claimed
  if (role === 'salesperson') {
    // Created the lead
    if (pipeline.lead_created_by === userId) return true
    // Claimed the lead (sales owner)
    if (pipeline.lead_sales_owner === userId) return true
    // Owner of the opportunity
    if (pipeline.owner_user_id === userId) return true
    return false
  }

  // Other roles cannot update pipelines (view-only)
  return false
}

// Check if the user is a sales role that can have pipelines
export function isSalesPipelineUser(role: UserRole | null | undefined): boolean {
  if (!role) return false
  return role === 'salesperson' || role === 'sales manager' || role === 'sales support'
}

// Check if the user is a marketing role that can view pipelines
export function isMarketingPipelineViewer(role: UserRole | null | undefined): boolean {
  if (!role) return false
  return role === 'Marketing Manager' || role === 'Marcomm' || role === 'DGO' || role === 'MACX' || role === 'VSDO'
}

// =====================================================
// Sales Plan & Activities Permissions
// =====================================================

// Can user access Sales Plan page?
export function canAccessSalesPlan(role: UserRole | null | undefined): boolean {
  if (!role) return false
  return isAdmin(role) || isSales(role) || role === 'Marketing Manager' || role === 'MACX'
}

// Can user access Activities page?
export function canAccessActivities(role: UserRole | null | undefined): boolean {
  if (!role) return false
  return isAdmin(role) || isSales(role) || role === 'Marketing Manager' || role === 'MACX'
}

// Can user create sales plans?
export function canCreateSalesPlan(role: UserRole | null | undefined): boolean {
  if (!role) return false
  return isAdmin(role) || role === 'salesperson'
}

// Can user edit sales plans?
export function canEditSalesPlan(
  role: UserRole | null | undefined,
  userId: string,
  plan: { owner_user_id?: string | null }
): boolean {
  if (!role) return false
  // Admin can edit all
  if (isAdmin(role)) return true
  // Salesperson can edit own plans
  if (role === 'salesperson' && plan.owner_user_id === userId) return true
  return false
}

// Can user delete sales plans?
export function canDeleteSalesPlan(role: UserRole | null | undefined): boolean {
  if (!role) return false
  return isAdmin(role) || role === 'sales manager' || role === 'sales support'
}
