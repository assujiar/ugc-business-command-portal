// =====================================================
// API Route: /api/crm/leads/[id]/create-opportunity
// Create opportunity for claimed lead without pipeline
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStageConfig, calculateNextStepDueDate } from '@/lib/constants'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// POST /api/crm/leads/[id]/create-opportunity
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get lead data
    const { data: lead, error: leadError } = await (adminClient as any)
      .from('leads')
      .select('lead_id, company_name, potential_revenue, account_id, opportunity_id, claim_status, sales_owner_user_id')
      .eq('lead_id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Check if lead is claimed
    if (lead.claim_status !== 'claimed') {
      return NextResponse.json({ error: 'Lead must be claimed first' }, { status: 400 })
    }

    // NOTE: Multiple opportunities per lead are now allowed.
    // The lead.opportunity_id field stores the FIRST opportunity created (or the primary one).
    // Additional opportunities can be created and linked via source_lead_id.

    // Check if lead has account
    if (!lead.account_id) {
      return NextResponse.json({ error: 'Lead must have an account first' }, { status: 400 })
    }

    // Create opportunity with proper stage config
    const initialStage = 'Prospecting'
    const stageConfig = getStageConfig(initialStage)
    const nextStepDueDate = calculateNextStepDueDate(initialStage)

    const opportunityData = {
      name: `Pipeline - ${lead.company_name}`,
      account_id: lead.account_id,
      source_lead_id: lead.lead_id,
      stage: initialStage,
      estimated_value: lead.potential_revenue || 0,
      currency: 'IDR',
      probability: stageConfig?.probability || 10,
      owner_user_id: lead.sales_owner_user_id || user.id,
      created_by: user.id,
      next_step: stageConfig?.nextStep || 'Initial Contact',
      next_step_due_date: nextStepDueDate.toISOString().split('T')[0],
    }

    const { data: newOpportunity, error: oppError } = await (adminClient as any)
      .from('opportunities')
      .insert(opportunityData)
      .select('opportunity_id')
      .single()

    if (oppError) {
      console.error('Error creating opportunity:', oppError)
      return NextResponse.json({
        error: `Failed to create opportunity: ${oppError.message}`
      }, { status: 500 })
    }

    // Only update lead.opportunity_id if this is the first opportunity
    // (keeps the primary/first opportunity reference, additional opportunities are linked via source_lead_id)
    if (!lead.opportunity_id) {
      const { error: updateError } = await (adminClient as any)
        .from('leads')
        .update({
          opportunity_id: newOpportunity.opportunity_id,
          updated_at: new Date().toISOString()
        })
        .eq('lead_id', leadId)

      if (updateError) {
        console.error('Error updating lead:', updateError)
      }
    }

    return NextResponse.json({
      data: {
        success: true,
        lead_id: leadId,
        opportunity_id: newOpportunity.opportunity_id,
      }
    })
  } catch (error) {
    console.error('Error creating opportunity:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
