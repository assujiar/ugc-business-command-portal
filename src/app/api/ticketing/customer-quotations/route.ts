import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
}

// GET /api/ticketing/customer-quotations - List customer quotations
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

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

    // Parse query params
    const ticketId = searchParams.get('ticket_id')
    const leadId = searchParams.get('lead_id')
    const opportunityId = searchParams.get('opportunity_id')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    console.log('[CustomerQuotations GET] Query params:', { ticketId, leadId, opportunityId, status, limit, offset })

    let query = (supabase as any)
      .from('customer_quotations')
      .select(`
        *,
        ticket:tickets!customer_quotations_ticket_id_fkey(id, ticket_code, subject),
        creator:profiles!customer_quotations_created_by_fkey(user_id, name, email)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })

    if (ticketId) {
      query = query.eq('ticket_id', ticketId)
    }
    if (leadId) {
      query = query.eq('lead_id', leadId)
    }
    if (opportunityId) {
      query = query.eq('opportunity_id', opportunityId)
    }
    if (status) {
      query = query.eq('status', status)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    console.log('[CustomerQuotations GET] Query result:', { count, error: error?.message, dataLength: data?.length })
    if (data && data.length > 0) {
      console.log('[CustomerQuotations GET] First quotation:', data[0])
    }

    if (error) {
      console.error('Error fetching customer quotations:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      total: count || 0,
      limit,
      offset,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/ticketing/customer-quotations - Create customer quotation
export async function POST(request: NextRequest) {
  try {
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

    let ticket_id = body.ticket_id || null
    let lead_id = body.lead_id || null
    let opportunity_id = body.opportunity_id || null
    const operational_cost_id = body.operational_cost_id || null

    // If ticket_id is provided, inherit lead_id and opportunity_id from ticket if not already set
    if (ticket_id && (!lead_id || !opportunity_id)) {
      const { data: ticket } = await (supabase as any)
        .from('tickets')
        .select('lead_id, opportunity_id')
        .eq('id', ticket_id)
        .single()

      if (ticket) {
        if (!lead_id && ticket.lead_id) lead_id = ticket.lead_id
        if (!opportunity_id && ticket.opportunity_id) opportunity_id = ticket.opportunity_id
      }
    }

    // If opportunity_id is provided but not lead_id, inherit lead_id from opportunity
    if (opportunity_id && !lead_id) {
      const { data: opportunity } = await (supabase as any)
        .from('opportunities')
        .select('source_lead_id')
        .eq('opportunity_id', opportunity_id)
        .single()

      if (opportunity && opportunity.source_lead_id) {
        lead_id = opportunity.source_lead_id
      }
    }

    // Determine source type: standalone if no source is provided
    const source_type = body.source_type || (ticket_id ? 'ticket' : lead_id ? 'lead' : opportunity_id ? 'opportunity' : 'standalone')

    // All sources are now optional - quotations can be created standalone

    // Get flat values directly from body (dialog sends flat fields)
    const customer_name = body.customer_name || ''
    const customer_company = body.customer_company || null
    const customer_email = body.customer_email || null
    const customer_phone = body.customer_phone || null
    const customer_address = body.customer_address || null

    const service_type = body.service_type || null
    const incoterm = body.incoterm || null
    const fleet_type = body.fleet_type || null
    const fleet_quantity = body.fleet_quantity || null
    const commodity = body.commodity || null

    const origin_address = body.origin_address || null
    const origin_city = body.origin_city || null
    const origin_country = body.origin_country || null
    const origin_port = body.origin_port || null

    const destination_address = body.destination_address || null
    const destination_city = body.destination_city || null
    const destination_country = body.destination_country || null
    const destination_port = body.destination_port || null

    const cargo_description = body.cargo_description || null
    const cargo_weight = body.cargo_weight ?? null
    const cargo_weight_unit = body.cargo_weight_unit || 'kg'
    const cargo_volume = body.cargo_volume ?? null
    const cargo_volume_unit = body.cargo_volume_unit || 'cbm'
    const cargo_quantity = body.cargo_quantity ?? null
    const cargo_quantity_unit = body.cargo_quantity_unit || null

    const estimated_leadtime = body.estimated_leadtime || null
    const estimated_cargo_value = body.estimated_cargo_value ?? null
    const cargo_value_currency = body.cargo_value_currency || 'IDR'

    const rate_structure = body.rate_structure || 'bundling'
    const total_cost = body.total_cost || 0
    const target_margin_percent = body.target_margin_percent || 0
    const total_selling_rate = body.total_selling_rate || 0
    const currency = body.currency || 'IDR'

    const scope_of_work = body.scope_of_work || null
    const terms_includes = body.terms_includes || []
    const terms_excludes = body.terms_excludes || []
    const terms_notes = body.terms_notes || null
    const validity_days = body.validity_days || 14

    const items = body.items || []

    // Validation
    if (!customer_name) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 })
    }

    // Generate quotation number using RPC
    const { data: quotation_number, error: seqError } = await (supabase as any)
      .rpc('generate_customer_quotation_number')

    if (seqError || !quotation_number) {
      console.error('Error generating quotation number:', seqError)
      return NextResponse.json({ error: 'Failed to generate quotation number' }, { status: 500 })
    }

    // Calculate valid_until date
    const valid_until = new Date()
    valid_until.setDate(valid_until.getDate() + validity_days)
    const valid_until_str = valid_until.toISOString().split('T')[0]

    // Get sequence number for the source (only if a source is provided)
    let sequence_number = 1
    if (ticket_id || lead_id || opportunity_id) {
      const { data: seqData } = await (supabase as any).rpc('get_next_quotation_sequence', {
        p_ticket_id: ticket_id,
        p_lead_id: lead_id,
        p_opportunity_id: opportunity_id,
      })
      if (seqData) {
        sequence_number = seqData
      }
    }
    // For standalone quotations, sequence_number remains 1

    // Insert quotation directly (bypass RPC to avoid JSONB serialization issues)
    const { data: quotation, error: insertError } = await (supabase as any)
      .from('customer_quotations')
      .insert({
        ticket_id,
        lead_id,
        opportunity_id,
        source_type,
        sequence_number,
        operational_cost_id,
        quotation_number,
        customer_name,
        customer_company,
        customer_email,
        customer_phone,
        customer_address,
        service_type,
        fleet_type,
        fleet_quantity,
        incoterm,
        commodity,
        cargo_description,
        cargo_weight,
        cargo_weight_unit,
        cargo_volume,
        cargo_volume_unit,
        cargo_quantity,
        cargo_quantity_unit,
        estimated_leadtime,
        estimated_cargo_value,
        cargo_value_currency,
        origin_address,
        origin_city,
        origin_country,
        origin_port,
        destination_address,
        destination_city,
        destination_country,
        destination_port,
        rate_structure,
        total_cost,
        target_margin_percent,
        total_selling_rate,
        currency,
        scope_of_work,
        terms_includes,
        terms_excludes,
        terms_notes,
        validity_days,
        valid_until: valid_until_str,
        created_by: user.id,
      })
      .select('id, quotation_number')
      .single()

    if (insertError) {
      console.error('Error inserting customer quotation:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    const quotation_id = quotation.id

    // Insert breakdown items if any
    if (items.length > 0) {
      const itemsToInsert = items.map((item: any, index: number) => ({
        quotation_id,
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

      const { error: itemsError } = await (supabase as any)
        .from('customer_quotation_items')
        .insert(itemsToInsert)

      if (itemsError) {
        console.error('Error inserting quotation items:', itemsError)
        // Continue even if items fail - quotation is created
      }
    }

    // Create ticket event if ticket is linked
    if (ticket_id) {
      await (supabase as any)
        .from('ticket_events')
        .insert({
          ticket_id,
          event_type: 'customer_quotation_created',
          actor_user_id: user.id,
          new_value: { quotation_id, quotation_number, sequence_number },
          notes: `Customer quotation #${sequence_number} created`,
        })
    }

    // Sync quotation status to lead if linked
    if (lead_id) {
      await (supabase as any).rpc('sync_quotation_to_lead', {
        p_quotation_id: quotation_id,
        p_new_status: 'draft',
        p_actor_user_id: user.id,
      })
    }

    // Sync quotation status to opportunity if linked
    if (opportunity_id) {
      await (supabase as any).rpc('sync_quotation_to_opportunity', {
        p_quotation_id: quotation_id,
        p_new_status: 'draft',
        p_actor_user_id: user.id,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: quotation_id,
        quotation_number,
        sequence_number,
      },
      quotation_id,
      quotation_number,
      sequence_number,
    }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
