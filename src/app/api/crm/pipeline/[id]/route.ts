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

    // Get opportunity with account and lead info
    const { data: opportunity, error: oppError } = await (adminClient as any)
      .from('opportunities')
      .select(`
        *,
        accounts(
          account_id,
          company_name,
          account_status,
          industry,
          pic_name,
          pic_email,
          pic_phone,
          address,
          city
        ),
        leads(
          lead_id,
          company_name,
          contact_name,
          contact_email,
          contact_phone,
          industry,
          source,
          potential_revenue,
          created_by,
          marketing_owner_user_id,
          sales_owner_user_id
        )
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

    // Get owner/sales profile
    let ownerInfo: { name: string; email?: string; department?: string } | null = null
    if (opportunity.owner_user_id) {
      const { data: ownerData } = await supabase
        .from('profiles')
        .select('name, email, department')
        .eq('user_id', opportunity.owner_user_id)
        .single()
      ownerInfo = ownerData as { name: string; email?: string; department?: string } | null
    }

    // Get lead creator profile (for lead source info)
    let creatorInfo: { name: string; department?: string } | null = null
    if (opportunity.leads?.created_by) {
      const { data: creatorData } = await supabase
        .from('profiles')
        .select('name, department')
        .eq('user_id', opportunity.leads.created_by)
        .single()
      creatorInfo = creatorData as { name: string; department?: string } | null
    }

    // Get pipeline updates with updater names
    const { data: pipelineUpdates } = await (adminClient as any)
      .from('pipeline_updates')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('updated_at', { ascending: true }) // Ascending for timeline

    // Get updater names
    const updaterIds = Array.from(new Set((pipelineUpdates || []).map((u: any) => u.updated_by).filter(Boolean))) as string[]
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

    const changerIds = Array.from(new Set((stageHistory || []).map((h: any) => h.changed_by).filter(Boolean))) as string[]
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

    // Transform response with complete info
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
      created_at: opportunity.created_at,
      updated_at: opportunity.updated_at,

      // Account info
      account_id: opportunity.account_id,
      company_name: opportunity.accounts?.company_name || opportunity.leads?.company_name || null,
      industry: opportunity.accounts?.industry || opportunity.leads?.industry || null,
      address: opportunity.accounts?.address || null,
      city: opportunity.accounts?.city || null,
      account_status: opportunity.accounts?.account_status || null,

      // PIC info (from account or lead)
      pic_name: opportunity.accounts?.pic_name || opportunity.leads?.contact_name || null,
      pic_email: opportunity.accounts?.pic_email || opportunity.leads?.contact_email || null,
      pic_phone: opportunity.accounts?.pic_phone || opportunity.leads?.contact_phone || null,

      // Lead info
      lead_id: opportunity.lead_id,
      potential_revenue: opportunity.leads?.potential_revenue || opportunity.estimated_value || null,
      lead_source: opportunity.leads?.source || null,

      // Creator/Source info
      lead_creator_name: creatorInfo?.name || null,
      lead_creator_department: creatorInfo?.department || null,

      // Sales owner info
      owner_user_id: opportunity.owner_user_id,
      owner_name: ownerInfo?.name || null,
      owner_email: ownerInfo?.email || null,
      owner_department: ownerInfo?.department || null,

      // Pipeline activities & history
      pipeline_updates: updatesWithNames,
      stage_history: historyWithNames,

      // Permissions
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
