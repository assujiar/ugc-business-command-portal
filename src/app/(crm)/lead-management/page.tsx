// =====================================================
// Lead Management Page - Consolidated Lead View
// Access Rules based on role:
// - Salesperson: leads they created OR claimed
// - Sales Manager: leads created/claimed by sales department
// - Marketing (Marcomm, VSDO, DGO): leads they created
// - Marketing Manager, MACX: leads created by marketing department
// - Director, Admin: all leads
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LeadManagementDashboard } from '@/components/crm/lead-management-dashboard'
import { AddLeadDialog } from '@/components/crm/add-lead-dialog'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet } from 'lucide-react'
import Link from 'next/link'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { canAccessLeadManagement, isAdmin, isMACX } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

// Helper to check if role is individual marketing (can only see own leads)
function isIndividualMarketingRole(role: UserRole): boolean {
  return role === 'Marcomm' || role === 'VSDO' || role === 'DGO'
}

// Helper to check if role is marketing manager level (can see all marketing dept leads)
function isMarketingManagerRole(role: UserRole): boolean {
  return role === 'Marketing Manager' || role === 'MACX'
}

// Helper to check if role is sales
function isSalesRole(role: UserRole): boolean {
  return role === 'salesperson' || role === 'sales manager' || role === 'sales support'
}

// Helper to check if creator is in sales department
function isCreatorInSalesDepartment(creatorRole: string | null, creatorDepartment: string | null): boolean {
  if (creatorDepartment && creatorDepartment.toLowerCase().includes('sales')) return true
  if (creatorRole && ['salesperson', 'sales manager', 'sales support'].includes(creatorRole)) return true
  return false
}

export default async function LeadManagementPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  // Check if user has access to lead management
  if (!canAccessLeadManagement(profile.role)) {
    redirect('/dashboard')
  }

  // Determine user type for description
  const isManagerLevel = ['Director', 'super admin', 'Marketing Manager', 'sales manager'].includes(profile.role)
  const isMACXUser = isMACX(profile.role)

  // Fetch ALL leads using admin client (bypass RLS) then filter based on role
  const { data: allLeads } = await (adminClient as any)
    .from('v_lead_management')
    .select('*')
    .order('created_at', { ascending: false })

  // Filter leads based on user role
  let leads: any[] = allLeads || []

  if (!isAdmin(profile.role)) {
    leads = (allLeads || []).filter((lead: any) => {
      // Salesperson: leads they created OR claimed (sales_owner_user_id)
      if (profile.role === 'salesperson') {
        if (lead.created_by === profile.user_id) return true
        if (lead.sales_owner_user_id === profile.user_id) return true
        return false
      }

      // Sales Support: same as salesperson
      if (profile.role === 'sales support') {
        if (lead.created_by === profile.user_id) return true
        if (lead.sales_owner_user_id === profile.user_id) return true
        return false
      }

      // Sales Manager: leads from sales department (created by sales OR claimed by anyone)
      if (profile.role === 'sales manager') {
        // Check if creator is in sales department
        if (isCreatorInSalesDepartment(lead.creator_role, lead.creator_department)) return true
        // Also include if sales_owner is set (lead was claimed by sales)
        if (lead.sales_owner_user_id) return true
        return false
      }

      // Individual Marketing (Marcomm, VSDO, DGO): leads they created
      if (isIndividualMarketingRole(profile.role)) {
        if (lead.created_by === profile.user_id) return true
        if (lead.marketing_owner_user_id === profile.user_id) return true
        return false
      }

      // Marketing Manager, MACX: leads created by marketing department
      if (isMarketingManagerRole(profile.role)) {
        return lead.creator_is_marketing === true
      }

      return false
    })
  }

  // Get status counts
  const statusCounts = {
    total: leads?.length || 0,
    new: leads?.filter((l: any) => l.triage_status === 'New').length || 0,
    in_review: leads?.filter((l: any) => l.triage_status === 'In Review').length || 0,
    qualified: leads?.filter((l: any) => l.triage_status === 'Qualified').length || 0,
    assigned_to_sales: leads?.filter((l: any) => l.triage_status === 'Assign to Sales').length || 0,
    nurture: leads?.filter((l: any) => l.triage_status === 'Nurture').length || 0,
    disqualified: leads?.filter((l: any) => l.triage_status === 'Disqualified').length || 0,
  }

  // Determine description based on role
  const getDescription = () => {
    if (isAdmin(profile.role)) return 'Manage all leads'
    if (profile.role === 'sales manager') return 'Manage leads from sales department'
    if (isMarketingManagerRole(profile.role)) return 'Manage leads from marketing department'
    if (isSalesRole(profile.role)) return 'Manage leads you created or claimed'
    return 'Manage leads you have created'
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold">Lead Management</h1>
          <p className="text-sm text-muted-foreground truncate">
            {getDescription()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" asChild className="hidden sm:flex">
            <Link href="/imports">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Import CSV
            </Link>
          </Button>
          <Button variant="outline" size="icon" asChild className="sm:hidden">
            <Link href="/imports">
              <FileSpreadsheet className="h-4 w-4" />
            </Link>
          </Button>
          <AddLeadDialog />
        </div>
      </div>

      <LeadManagementDashboard
        leads={leads || []}
        statusCounts={statusCounts}
        isManager={isManagerLevel || isMACXUser}
        currentUserId={profile.user_id}
        userRole={profile.role}
      />
    </div>
  )
}
