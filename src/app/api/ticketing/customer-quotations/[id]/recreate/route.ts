import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ProfileData {
  user_id: string
  role: UserRole
}

// POST /api/ticketing/customer-quotations/[id]/recreate - Recreate quotation (request adjustment)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    if (!profileData || !canAccessTicketing(profileData.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const { reason } = body

    // Get current quotation
    const { data: quotation, error: fetchError } = await (supabase as any)
      .from('customer_quotations')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    // Only sent or rejected quotations can be recreated
    if (!['sent', 'rejected'].includes(quotation.status)) {
      return NextResponse.json({
        error: 'Only sent or rejected quotations can be recreated'
      }, { status: 400 })
    }

    // Call the request_quotation_adjustment RPC function
    // This will mark the current quotation as rejected and trigger adjustment in linked entities
    const { data: adjustmentResult, error: adjustmentError } = await (supabase as any).rpc(
      'request_quotation_adjustment',
      {
        p_quotation_id: id,
        p_actor_user_id: user.id,
        p_reason: reason || 'Customer requested adjustment',
      }
    )

    if (adjustmentError) {
      console.error('Error requesting adjustment:', adjustmentError)
      return NextResponse.json({ error: adjustmentError.message }, { status: 500 })
    }

    // Create a new quotation by copying the old one
    const { data: quotationNumber, error: seqError } = await (supabase as any)
      .rpc('generate_customer_quotation_number')

    if (seqError || !quotationNumber) {
      console.error('Error generating quotation number:', seqError)
      return NextResponse.json({ error: 'Failed to generate quotation number' }, { status: 500 })
    }

    // Calculate new validity
    const valid_until = new Date()
    valid_until.setDate(valid_until.getDate() + (quotation.validity_days || 14))
    const valid_until_str = valid_until.toISOString().split('T')[0]

    // Get next sequence number
    let sequence_number = quotation.sequence_number + 1
    if (quotation.ticket_id || quotation.lead_id || quotation.opportunity_id) {
      const { data: seqData } = await (supabase as any).rpc('get_next_quotation_sequence', {
        p_ticket_id: quotation.ticket_id,
        p_lead_id: quotation.lead_id,
        p_opportunity_id: quotation.opportunity_id,
      })
      if (seqData) {
        sequence_number = seqData
      }
    }

    // Insert new quotation (copy of the old one)
    const { data: newQuotation, error: insertError } = await (supabase as any)
      .from('customer_quotations')
      .insert({
        ticket_id: quotation.ticket_id,
        lead_id: quotation.lead_id,
        opportunity_id: quotation.opportunity_id,
        source_type: quotation.source_type,
        sequence_number,
        operational_cost_id: quotation.operational_cost_id,
        quotation_number: quotationNumber,
        customer_name: quotation.customer_name,
        customer_company: quotation.customer_company,
        customer_email: quotation.customer_email,
        customer_phone: quotation.customer_phone,
        customer_address: quotation.customer_address,
        service_type: quotation.service_type,
        fleet_type: quotation.fleet_type,
        fleet_quantity: quotation.fleet_quantity,
        incoterm: quotation.incoterm,
        commodity: quotation.commodity,
        cargo_description: quotation.cargo_description,
        cargo_weight: quotation.cargo_weight,
        cargo_weight_unit: quotation.cargo_weight_unit,
        cargo_volume: quotation.cargo_volume,
        cargo_volume_unit: quotation.cargo_volume_unit,
        cargo_quantity: quotation.cargo_quantity,
        cargo_quantity_unit: quotation.cargo_quantity_unit,
        estimated_leadtime: quotation.estimated_leadtime,
        estimated_cargo_value: quotation.estimated_cargo_value,
        cargo_value_currency: quotation.cargo_value_currency,
        origin_address: quotation.origin_address,
        origin_city: quotation.origin_city,
        origin_country: quotation.origin_country,
        origin_port: quotation.origin_port,
        destination_address: quotation.destination_address,
        destination_city: quotation.destination_city,
        destination_country: quotation.destination_country,
        destination_port: quotation.destination_port,
        rate_structure: quotation.rate_structure,
        total_cost: quotation.total_cost,
        target_margin_percent: quotation.target_margin_percent,
        total_selling_rate: quotation.total_selling_rate,
        currency: quotation.currency,
        scope_of_work: quotation.scope_of_work,
        terms_includes: quotation.terms_includes,
        terms_excludes: quotation.terms_excludes,
        terms_notes: quotation.terms_notes,
        validity_days: quotation.validity_days,
        valid_until: valid_until_str,
        status: 'draft', // New quotation starts as draft
        created_by: user.id,
      })
      .select('id, quotation_number, sequence_number')
      .single()

    if (insertError) {
      console.error('Error creating new quotation:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Copy items from old quotation
    const { data: oldItems } = await (supabase as any)
      .from('customer_quotation_items')
      .select('*')
      .eq('quotation_id', id)

    if (oldItems && oldItems.length > 0) {
      const newItems = oldItems.map((item: any, index: number) => ({
        quotation_id: newQuotation.id,
        component_type: item.component_type,
        component_name: item.component_name,
        description: item.description,
        cost_amount: item.cost_amount,
        target_margin_percent: item.target_margin_percent,
        selling_rate: item.selling_rate,
        unit_price: item.unit_price,
        quantity: item.quantity,
        unit: item.unit,
        sort_order: item.sort_order ?? index,
      }))

      await (supabase as any)
        .from('customer_quotation_items')
        .insert(newItems)
    }

    // Create ticket event if ticket is linked
    if (quotation.ticket_id) {
      await (supabase as any)
        .from('ticket_events')
        .insert({
          ticket_id: quotation.ticket_id,
          event_type: 'customer_quotation_created',
          actor_user_id: user.id,
          new_value: {
            quotation_id: newQuotation.id,
            quotation_number: newQuotation.quotation_number,
            sequence_number,
            previous_quotation_id: id,
            reason,
          },
          notes: `Customer quotation #${sequence_number} created (recreated from ${quotation.quotation_number})`,
        })
    }

    // Sync to lead if linked - update to draft
    if (quotation.lead_id) {
      await (supabase as any).rpc('sync_quotation_to_lead', {
        p_quotation_id: newQuotation.id,
        p_new_status: 'draft',
        p_actor_user_id: user.id,
      })
    }

    // Sync to opportunity if linked - update to draft
    if (quotation.opportunity_id) {
      await (supabase as any).rpc('sync_quotation_to_opportunity', {
        p_quotation_id: newQuotation.id,
        p_new_status: 'draft',
        p_actor_user_id: user.id,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Quotation recreated successfully',
      data: {
        original_quotation_id: id,
        new_quotation_id: newQuotation.id,
        new_quotation_number: newQuotation.quotation_number,
        sequence_number,
      },
      adjustment_result: adjustmentResult,
    }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
