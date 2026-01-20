// =====================================================
// Insight Scope Resolver
// Determines data access scope based on user role
// =====================================================

import type { UserRole } from '@/types/database'
import type { InsightScope, InsightScopeType } from '@/types/insights'
import { isAdmin, isSales, isMarketing } from '@/lib/permissions'

export interface UserProfile {
  user_id: string
  role: UserRole
  department?: string | null
}

/**
 * Resolves the insight scope based on user profile
 *
 * Rules:
 * - salesperson → SELF (only their own data)
 * - sales manager → TEAM (all sales team members)
 * - director/admin/superadmin → ORG (entire organization)
 * - marketing roles → ORG (consistent with their visibility needs)
 */
export function resolveInsightScope(profile: UserProfile): InsightScope {
  const { user_id, role } = profile

  // Salesperson - SELF scope
  if (role === 'salesperson') {
    return {
      scope_type: 'SELF',
      scope_key: `SELF:${user_id}`,
    }
  }

  // Sales Manager - TEAM scope
  if (role === 'sales manager') {
    return {
      scope_type: 'TEAM',
      scope_key: `TEAM:${user_id}`,
    }
  }

  // Sales Support - TEAM scope (can view team data but limited actions)
  if (role === 'sales support') {
    return {
      scope_type: 'TEAM',
      scope_key: `TEAM:sales_support`,
    }
  }

  // Admin/Director - ORG scope
  if (isAdmin(role)) {
    return {
      scope_type: 'ORG',
      scope_key: 'ORG:default',
    }
  }

  // Marketing roles - ORG scope (they need visibility across the org for insights)
  if (isMarketing(role)) {
    return {
      scope_type: 'ORG',
      scope_key: 'ORG:marketing',
    }
  }

  // Default fallback - SELF scope for any other role
  return {
    scope_type: 'SELF',
    scope_key: `SELF:${user_id}`,
  }
}

/**
 * Check if user has permission to generate insights for a given scope
 */
export function canGenerateInsightForScope(
  profile: UserProfile,
  requestedScope: InsightScopeType
): boolean {
  const { role } = profile

  // Admin/Director can generate any scope
  if (isAdmin(role)) {
    return true
  }

  // Sales manager can generate TEAM or SELF
  if (role === 'sales manager') {
    return requestedScope === 'TEAM' || requestedScope === 'SELF'
  }

  // Marketing Manager/MACX can generate ORG
  if (role === 'Marketing Manager' || role === 'MACX') {
    return requestedScope === 'ORG' || requestedScope === 'SELF'
  }

  // Individual marketing roles - ORG only (their perspective)
  if (isMarketing(role)) {
    return requestedScope === 'ORG' || requestedScope === 'SELF'
  }

  // Salesperson - SELF only
  if (role === 'salesperson') {
    return requestedScope === 'SELF'
  }

  // Sales support - TEAM scope
  if (role === 'sales support') {
    return requestedScope === 'TEAM' || requestedScope === 'SELF'
  }

  // Default: SELF only
  return requestedScope === 'SELF'
}

/**
 * Get user IDs that should be included in TEAM scope
 * This would typically query the database for team members
 */
export async function getTeamMemberIds(
  managerId: string,
  supabaseAdmin: any
): Promise<string[]> {
  // For sales manager, get all salesperson user IDs
  const { data: salespeople } = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .eq('role', 'salesperson')
    .eq('is_active', true)

  if (salespeople) {
    // Include the manager's own ID as well
    return [managerId, ...salespeople.map((p: { user_id: string }) => p.user_id)]
  }

  return [managerId]
}

/**
 * Get friendly scope description for UI
 */
export function getScopeDescription(scope: InsightScope, role: UserRole): string {
  switch (scope.scope_type) {
    case 'SELF':
      return 'Your personal performance data'
    case 'TEAM':
      if (role === 'sales manager') {
        return 'Sales team performance data'
      }
      return 'Team performance data'
    case 'ORG':
      if (isMarketing(role)) {
        return 'Organization-wide marketing & sales data'
      }
      return 'Organization-wide performance data'
    default:
      return 'Performance data'
  }
}
