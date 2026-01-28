import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessTicketing } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
}

/**
 * POST /api/ticketing/customer-quotations/from-pipeline
 *
 * Creates a customer quotation directly from a pipeline/opportunity.
 * Automatically resolves lead_id from opportunity.source_lead_id.
 * Uses the database RPC create_quotation_from_pipeline for atomicity.
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[FromPipeline POST] Starting quotation creation from pipeline...')
    const supabase = await createClient()

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.log('[FromPipeline POST] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.log('[FromPipeline POST] User authenticated:', user.id)

    // Check permissions
    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    if (!profileData || !canAccessTicketing(profileData.role)) {
      console.log('[FromPipeline POST] Access denied for role:', profileData?.role)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    console.log('[FromPipeline POST] Request body:', JSON.stringify({
      opportunity_id: body.opportunity_id,
      customer_name: body.customer_name,
    }))

    // Validate required fields
    if (!body.opportunity_id) {
      return NextResponse.json(
        { error: 'opportunity_id is required', code: 'VALIDATION_ERROR' },
        { status: 422 }
      )
    }

    if (!body.customer_name) {
      return NextResponse.json(
        { error: 'customer_name is required', code: 'VALIDATION_ERROR' },
        { status: 422 }
      )
    }

    // Use admin client for RPC call to ensure proper permissions
    const adminSupabase = createAdminClient()

    // Call the RPC function to create quotation from pipeline
    const { data: result, error: rpcError } = await (adminSupabase as any).rpc('create_quotation_from_pipeline', {
      p_opportunity_id: body.opportunity_id,
      p_customer_name: body.customer_name,
      p_customer_company: body.customer_company || null,
      p_customer_email: body.customer_email || null,
      p_customer_phone: body.customer_phone || null,
      p_customer_address: body.customer_address || null,
      p_service_type: body.service_type || null,
      p_service_type_code: body.service_type_code || body.service_type || null, // FIX: Pass service_type_code
      p_incoterm: body.incoterm || null,
      p_fleet_type: body.fleet_type || null,
      p_fleet_quantity: body.fleet_quantity || null,
      p_commodity: body.commodity || null,
      p_cargo_description: body.cargo_description || null,
      p_cargo_weight: body.cargo_weight || null,
      p_cargo_weight_unit: body.cargo_weight_unit || 'kg',
      p_cargo_volume: body.cargo_volume || null,
      p_cargo_volume_unit: body.cargo_volume_unit || 'cbm',
      p_cargo_quantity: body.cargo_quantity || null,
      p_cargo_quantity_unit: body.cargo_quantity_unit || null,
      p_origin_address: body.origin_address || null,
      p_origin_city: body.origin_city || null,
      p_origin_country: body.origin_country || null,
      p_origin_port: body.origin_port || null,
      p_destination_address: body.destination_address || null,
      p_destination_city: body.destination_city || null,
      p_destination_country: body.destination_country || null,
      p_destination_port: body.destination_port || null,
      p_rate_structure: body.rate_structure || 'bundling',
      p_total_cost: body.total_cost || 0,
      p_target_margin_percent: body.target_margin_percent || 0,
      p_total_selling_rate: body.total_selling_rate || 0,
      p_currency: body.currency || 'IDR',
      p_scope_of_work: body.scope_of_work || null,
      p_terms_includes: body.terms_includes || [],
      p_terms_excludes: body.terms_excludes || [],
      p_terms_notes: body.terms_notes || null,
      p_validity_days: body.validity_days || 14,
    })

    if (rpcError) {
      console.error('[FromPipeline POST] RPC error:', rpcError)
      return NextResponse.json(
        { error: rpcError.message, code: 'RPC_ERROR' },
        { status: 500 }
      )
    }

    console.log('[FromPipeline POST] RPC result:', result)

    if (!result.success) {
      console.error('[FromPipeline POST] RPC returned error:', result.error)
      return NextResponse.json(
        { error: result.error, code: 'RPC_FAILURE' },
        { status: 400 }
      )
    }

    // Insert breakdown items if any
    if (body.items && body.items.length > 0) {
      const itemsToInsert = body.items.map((item: any, index: number) => ({
        quotation_id: result.quotation_id,
        component_type: item.component_type,
        component_name: item.component_name || null,
        description: item.description || null,
        cost_amount: item.cost_amount || 0,
        target_margin_percent: item.target_margin_percent || 0,
        selling_rate: item.selling_rate || 0,
        quantity: item.quantity || null,
        unit: item.unit || null,
        sort_order: item.sort_order ?? index,
      }))

      const { error: itemsError } = await (adminSupabase as any)
        .from('customer_quotation_items')
        .insert(itemsToInsert)

      if (itemsError) {
        console.error('[FromPipeline POST] Error inserting quotation items:', itemsError)
        // Continue even if items fail - quotation is created
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.quotation_id,
        quotation_number: result.quotation_number,
        sequence_number: result.sequence_number,
        sequence_label: result.sequence_label,
        lead_id: result.lead_id,
        opportunity_id: result.opportunity_id,
      },
      quotation_id: result.quotation_id,
      quotation_number: result.quotation_number,
      sequence_number: result.sequence_number,
      sequence_label: result.sequence_label,
    }, { status: 201 })
  } catch (err) {
    console.error('[FromPipeline POST] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
