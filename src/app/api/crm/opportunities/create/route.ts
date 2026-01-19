// =====================================================
// API Route: /api/crm/opportunities/create
// Create new opportunity/pipeline with shipment details
// Includes original_creator_id for marketing visibility
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStageConfig, calculateNextStepDueDate } from '@/lib/constants'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// POST /api/crm/opportunities/create - Create opportunity with shipment details
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { account_id, name, estimated_value, notes, shipment_details } = body

    if (!account_id || !name) {
      return NextResponse.json(
        { error: 'Account ID and opportunity name are required' },
        { status: 400 }
      )
    }

    // Fetch account to get original_creator_id and lead_id
    const { data: account, error: accountError } = await (adminClient as any)
      .from('accounts')
      .select('account_id, company_name, owner_user_id, lead_id, original_lead_id, original_creator_id, created_by, account_status')
      .eq('account_id', account_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      )
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

    // Create opportunity with stage config
    const initialStage = 'Prospecting'
    const stageConfig = getStageConfig(initialStage)
    const nextStepDueDate = calculateNextStepDueDate(initialStage)

    const opportunityData: Record<string, unknown> = {
      name,
      account_id,
      source_lead_id: account.lead_id || account.original_lead_id || null,
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

    const { data: opportunity, error: oppError } = await (adminClient as any)
      .from('opportunities')
      .insert(opportunityData)
      .select()
      .single()

    if (oppError) {
      console.error('Error creating opportunity:', oppError)
      return NextResponse.json(
        { error: oppError.message },
        { status: 500 }
      )
    }

    // Create shipment details if provided
    if (shipment_details && shipment_details.service_type_code) {
      const shipmentInsertData = {
        lead_id: account.lead_id || null,
        opportunity_id: opportunity.opportunity_id,
        service_type_code: shipment_details.service_type_code || null,
        department: shipment_details.department || null,
        fleet_type: shipment_details.fleet_type || null,
        fleet_quantity: shipment_details.fleet_quantity || 1,
        incoterm: shipment_details.incoterm || null,
        cargo_category: shipment_details.cargo_category || 'General Cargo',
        cargo_description: shipment_details.cargo_description || null,
        origin_address: shipment_details.origin_address || null,
        origin_city: shipment_details.origin_city || null,
        origin_country: shipment_details.origin_country || 'Indonesia',
        destination_address: shipment_details.destination_address || null,
        destination_city: shipment_details.destination_city || null,
        destination_country: shipment_details.destination_country || 'Indonesia',
        quantity: shipment_details.quantity || 1,
        unit_of_measure: shipment_details.unit_of_measure || 'Boxes',
        weight_per_unit_kg: shipment_details.weight_per_unit_kg || null,
        weight_total_kg: shipment_details.weight_total_kg || null,
        length_cm: shipment_details.length_cm || null,
        width_cm: shipment_details.width_cm || null,
        height_cm: shipment_details.height_cm || null,
        volume_total_cbm: shipment_details.volume_total_cbm || null,
        scope_of_work: shipment_details.scope_of_work || null,
        additional_services: shipment_details.additional_services || [],
        created_by: user.id,
      }

      const { error: shipmentError } = await (adminClient as any)
        .from('shipment_details')
        .insert(shipmentInsertData)

      if (shipmentError) {
        console.error('Error creating shipment details:', shipmentError)
        // Don't fail the whole request, just log the error
      }
    }

    // Update account status to calon_account if failed or not set
    if (!account.account_status || account.account_status === 'failed_account') {
      await (adminClient as any)
        .from('accounts')
        .update({ account_status: 'calon_account' })
        .eq('account_id', account_id)
    }

    return NextResponse.json({
      data: opportunity,
      message: 'Pipeline created successfully',
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating opportunity:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
