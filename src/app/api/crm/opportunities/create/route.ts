// =====================================================
// API Route: /api/crm/opportunities/create
// Create new opportunity/pipeline from existing account
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStageConfig, calculateNextStepDueDate } from '@/lib/constants'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// POST /api/crm/opportunities/create - Create new pipeline from account
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      account_id,
      name,
      estimated_value,
      notes,
      shipment_details,
    } = body

    if (!account_id) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    // Fetch account to get original_creator_id and lead_id
    const { data: account, error: accountError } = await (adminClient as any)
      .from('accounts')
      .select('account_id, company_name, lead_id, original_lead_id, original_creator_id, created_by')
      .eq('account_id', account_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Determine original_creator_id for marketing visibility
    // Priority: account.original_creator_id > lead.created_by > account.created_by > user.id
    let originalCreatorId = account.original_creator_id

    if (!originalCreatorId) {
      // Try to get from lead
      const leadId = account.lead_id || account.original_lead_id
      if (leadId) {
        const { data: lead } = await (adminClient as any)
          .from('leads')
          .select('created_by')
          .eq('lead_id', leadId)
          .single()
        if (lead?.created_by) {
          originalCreatorId = lead.created_by
        }
      }
    }

    // Fallback to account.created_by or current user
    if (!originalCreatorId) {
      originalCreatorId = account.created_by || user.id
    }

    // Create opportunity
    const initialStage = 'Prospecting'
    const stageConfig = getStageConfig(initialStage)
    const nextStepDueDate = calculateNextStepDueDate(initialStage)

    const opportunityData: Record<string, unknown> = {
      name,
      account_id,
      source_lead_id: account.lead_id || account.original_lead_id || null, // Use existing lead, not lead_id
      stage: initialStage,
      estimated_value: estimated_value || 0,
      currency: 'IDR',
      probability: stageConfig?.probability || 10,
      owner_user_id: user.id,
      created_by: user.id,
      next_step: stageConfig?.nextStep || 'Initial Contact',
      next_step_due_date: nextStepDueDate.toISOString().split('T')[0],
      original_creator_id: originalCreatorId,
    }

    // Add notes if provided
    if (notes) {
      opportunityData.description = notes
    }

    // Add shipment_details if provided (JSONB field)
    if (shipment_details) {
      opportunityData.shipment_details = shipment_details
    }

    const { data: newOpportunity, error: oppError } = await (adminClient as any)
      .from('opportunities')
      .insert(opportunityData)
      .select('opportunity_id, name, stage')
      .single()

    if (oppError) {
      console.error('Error creating opportunity:', oppError)
      return NextResponse.json({ error: oppError.message }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        success: true,
        opportunity_id: newOpportunity.opportunity_id,
        name: newOpportunity.name,
        stage: newOpportunity.stage,
        account_id,
        original_creator_id: originalCreatorId,
      }
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating pipeline:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
