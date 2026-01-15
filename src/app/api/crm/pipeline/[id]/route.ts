// =====================================================
// API Route: /api/crm/pipeline/[id]
// Get Pipeline Details with updates and stage history
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessPipeline, canViewPipeline, canUpdatePipeline } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

interface Profile {
  user_id: string
  name: string
  email: string
  role: UserRole
  department?: string | null
}

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// GET /api/crm/pipeline/[id] - Get pipeline details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const { id: opportunityId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    const profile = profileData as Profile | null

    if (!profile || !canAccessPipeline(profile.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get opportunity with account info
    const { data: opportunity, error: oppError } = await (adminClient as any)
      .from('opportunities')
      .select(`
        *,
        accounts(account_id, company_name, account_status),
        leads(lead_id, company_name, created_by, marketing_owner_user_id, sales_owner_user_id)
      `)
      .eq('opportunity_id', opportunityId)
      .single()

    if (oppError || !opportunity) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 })
    }

    // Check if user can view this pipeline based on role-based access
    const canView = canViewPipeline(profile.role, user.id, {
      owner_user_id: opportunity.owner_user_id,
      lead_created_by: opportunity.leads?.created_by,
      lead_marketing_owner: opportunity.leads?.marketing_owner_user_id,
      lead_sales_owner: opportunity.leads?.sales_owner_user_id,
    })

    if (!canView) {
      return NextResponse.json({ error: 'Access denied to this pipeline' }, { status: 403 })
    }

    // Get owner profile
    let ownerName: string | null = null
    if (opportunity.owner_user_id) {
      const { data: ownerData } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', opportunity.owner_user_id)
        .single()
      const owner = ownerData as { name: string } | null
      ownerName = owner?.name || null
    }

    // Get pipeline updates with updater names
    const { data: pipelineUpdates } = await (adminClient as any)
      .from('pipeline_updates')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('updated_at', { ascending: false })

    // Get updater names
    const updaterIds = [...new Set((pipelineUpdates || []).map((u: any) => u.updated_by).filter(Boolean))]
    let updaterMap: Record<string, string> = {}

    if (updaterIds.length > 0) {
      const { data: updatersData } = await supabase
        .from('profiles')
        .select('user_id, name')
        .in('user_id', updaterIds)

      const updaters = updatersData as Array<{ user_id: string; name: string }> | null
      updaterMap = (updaters || []).reduce((acc: Record<string, string>, u) => {
        acc[u.user_id] = u.name
        return acc
      }, {})
    }

    const updatesWithNames = (pipelineUpdates || []).map((update: any) => ({
      ...update,
      updater_name: updaterMap[update.updated_by] || null,
    }))

    // Get stage history with changer names
    const { data: stageHistory } = await (adminClient as any)
      .from('opportunity_stage_history')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('changed_at', { ascending: true })

    const changerIds = [...new Set((stageHistory || []).map((h: any) => h.changed_by).filter(Boolean))]
    let changerMap: Record<string, string> = {}

    if (changerIds.length > 0) {
      const { data: changersData } = await supabase
        .from('profiles')
        .select('user_id, name')
        .in('user_id', changerIds)

      const changers = changersData as Array<{ user_id: string; name: string }> | null
      changerMap = (changers || []).reduce((acc: Record<string, string>, c) => {
        acc[c.user_id] = c.name
        return acc
      }, {})
    }

    const historyWithNames = (stageHistory || []).map((history: any) => ({
      ...history,
      changer_name: changerMap[history.changed_by] || null,
    }))

    // Transform response
    const responseData = {
      opportunity_id: opportunity.opportunity_id,
      name: opportunity.name,
      stage: opportunity.stage,
      estimated_value: opportunity.estimated_value,
      currency: opportunity.currency,
      probability: opportunity.probability,
      expected_close_date: opportunity.expected_close_date,
      next_step: opportunity.next_step,
      next_step_due_date: opportunity.next_step_due_date,
      close_reason: opportunity.close_reason,
      lost_reason: opportunity.lost_reason,
      competitor_price: opportunity.competitor_price,
      customer_budget: opportunity.customer_budget,
      closed_at: opportunity.closed_at,
      notes: opportunity.notes,
      owner_user_id: opportunity.owner_user_id,
      owner_name: ownerName,
      account_id: opportunity.account_id,
      account_name: opportunity.accounts?.company_name || null,
      account_status: opportunity.accounts?.account_status || null,
      lead_id: opportunity.lead_id,
      created_at: opportunity.created_at,
      updated_at: opportunity.updated_at,
      pipeline_updates: updatesWithNames,
      stage_history: historyWithNames,
      can_update: canUpdatePipeline(profile.role, user.id, {
        owner_user_id: opportunity.owner_user_id,
        lead_created_by: opportunity.leads?.created_by,
        lead_sales_owner: opportunity.leads?.sales_owner_user_id,
      }),
    }

    return NextResponse.json({ data: responseData })
  } catch (error) {
    console.error('Error fetching pipeline details:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
