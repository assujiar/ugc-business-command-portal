// =====================================================
// API Route: /api/crm/leads/claim
// Lead Claim Workflow - Creates Account + Pipeline
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateIdempotencyKey } from '@/lib/utils'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// POST /api/crm/leads/claim - Claim lead from pool
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile for name
    const { data: profile } = await (adminClient as any)
      .from('profiles')
      .select('name, role')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const body = await request.json()
    const { pool_id, create_account = true, create_opportunity = true } = body

    if (!pool_id) {
      return NextResponse.json({ error: 'pool_id is required' }, { status: 400 })
    }

    // Get pool entry and lead info
    const { data: poolEntry, error: poolError } = await (adminClient as any)
      .from('lead_handover_pool')
      .select(`
        pool_id,
        lead_id,
        claimed_by,
        claimed_at,
        leads (
          lead_id,
          company_name,
          contact_name,
          contact_email,
          contact_phone,
          industry,
          potential_revenue,
          claim_status
        )
      `)
      .eq('pool_id', pool_id)
      .single() as { data: any; error: any }

    if (poolError || !poolEntry) {
      return NextResponse.json({ error: 'Pool entry not found' }, { status: 404 })
    }

    // Check if already claimed
    if (poolEntry.claimed_by) {
      return NextResponse.json({ error: 'Lead already claimed' }, { status: 400 })
    }

    const lead = poolEntry.leads
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Check if lead is already claimed
    if (lead.claim_status === 'claimed') {
      return NextResponse.json({ error: 'Lead already claimed' }, { status: 400 })
    }

    let accountId: string | null = null
    let opportunityId: string | null = null

    // 1. Create Account if requested
    if (create_account) {
      const accountData = {
        company_name: lead.company_name,
        pic_name: lead.contact_name,
        pic_email: lead.contact_email,
        pic_phone: lead.contact_phone,
        industry: lead.industry,
        owner_user_id: user.id,
        created_by: user.id,
        account_status: 'calon_account',
        lead_id: lead.lead_id,
      }

      const { data: newAccount, error: accountError } = await (adminClient as any)
        .from('accounts')
        .insert(accountData)
        .select('account_id')
        .single()

      if (accountError) {
        console.error('Error creating account:', accountError)
        // Continue without account if there's a duplicate
        if (!accountError.message.includes('duplicate')) {
          return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
        }
      } else {
        accountId = newAccount?.account_id
      }
    }

    // 2. Create Opportunity (Pipeline) if requested and account was created
    if (create_opportunity && accountId) {
      const opportunityData = {
        name: `Pipeline - ${lead.company_name}`,
        account_id: accountId,
        lead_id: lead.lead_id,
        stage: 'Prospecting',
        estimated_value: lead.potential_revenue || 0,
        currency: 'IDR',
        probability: 10,
        owner_user_id: user.id,
        created_by: user.id,
      }

      const { data: newOpportunity, error: oppError } = await (adminClient as any)
        .from('opportunities')
        .insert(opportunityData)
        .select('opportunity_id')
        .single()

      if (oppError) {
        console.error('Error creating opportunity:', oppError)
      } else {
        opportunityId = newOpportunity?.opportunity_id
      }
    }

    // 3. Update pool entry
    const { error: updatePoolError } = await (adminClient as any)
      .from('lead_handover_pool')
      .update({
        claimed_by: user.id,
        claimed_at: new Date().toISOString(),
      })
      .eq('pool_id', pool_id)

    if (updatePoolError) {
      console.error('Error updating pool entry:', updatePoolError)
    }

    // 4. Update lead - status stays as 'Assign to Sales', only claim_status changes
    // Lead remains in 'Assign to Sales' status but with claim_status = 'claimed'
    const leadUpdateData: Record<string, unknown> = {
      claim_status: 'claimed',
      claimed_by_name: profile.name,
      claimed_at: new Date().toISOString(),
      sales_owner_user_id: user.id,
      updated_at: new Date().toISOString(),
    }

    if (accountId) {
      leadUpdateData.account_id = accountId
    }

    if (opportunityId) {
      leadUpdateData.opportunity_id = opportunityId
    }

    const { error: updateLeadError } = await (adminClient as any)
      .from('leads')
      .update(leadUpdateData)
      .eq('lead_id', lead.lead_id)

    if (updateLeadError) {
      console.error('Error updating lead:', updateLeadError)
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        success: true,
        lead_id: lead.lead_id,
        account_id: accountId,
        opportunity_id: opportunityId,
        claimed_by: user.id,
        claimed_by_name: profile.name,
      }
    })
  } catch (error) {
    console.error('Error claiming lead:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
