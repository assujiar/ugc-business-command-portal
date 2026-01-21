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
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

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
    if (status) {
      query = query.eq('status', status)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

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

    // Support both flat and nested data structures
    const ticket_id = body.ticket_id
    const operational_cost_id = body.operational_cost_id || null

    if (!ticket_id) {
      return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 })
    }

    // Build customer_data from flat fields or use nested object
    const customer_data = body.customer_data || {
      customer_name: body.customer_name || '',
      customer_company: body.customer_company || null,
      customer_email: body.customer_email || null,
      customer_phone: body.customer_phone || null,
      customer_address: body.customer_address || null,
    }

    // Build service_data from flat fields or use nested object
    const service_data = body.service_data || {
      service_type: body.service_type || null,
      incoterm: body.incoterm || null,
      fleet_type: body.fleet_type || null,
      fleet_quantity: body.fleet_quantity || null,
      commodity: body.commodity || null,
      origin_address: body.origin_address || null,
      origin_city: body.origin_city || null,
      origin_country: body.origin_country || null,
      origin_port: body.origin_port || null,
      destination_address: body.destination_address || null,
      destination_city: body.destination_city || null,
      destination_country: body.destination_country || null,
      destination_port: body.destination_port || null,
      cargo_description: body.cargo_description || null,
      cargo_weight: body.cargo_weight || null,
      cargo_weight_unit: body.cargo_weight_unit || null,
      cargo_volume: body.cargo_volume || null,
      cargo_volume_unit: body.cargo_volume_unit || null,
      cargo_quantity: body.cargo_quantity || null,
      cargo_quantity_unit: body.cargo_quantity_unit || null,
    }

    // Build rate_data from flat fields or use nested object
    const rate_data = body.rate_data || {
      rate_structure: body.rate_structure || 'bundling',
      total_cost: body.total_cost || 0,
      target_margin_percent: body.target_margin_percent || 0,
      total_selling_rate: body.total_selling_rate || 0,
      currency: body.currency || 'IDR',
    }

    // Build terms_data from flat fields or use nested object
    const terms_data = body.terms_data || {
      scope_of_work: body.scope_of_work || null,
      terms_includes: body.terms_includes || [],
      terms_excludes: body.terms_excludes || [],
      terms_notes: body.terms_notes || null,
      validity_days: body.validity_days || 14,
    }

    const items = body.items || []

    // Call RPC to create quotation
    const { data: result, error } = await (supabase as any).rpc('rpc_create_customer_quotation', {
      p_ticket_id: ticket_id,
      p_operational_cost_id: operational_cost_id,
      p_customer_data: customer_data,
      p_service_data: service_data,
      p_rate_data: rate_data,
      p_terms_data: terms_data,
      p_items: items,
    })

    if (error) {
      console.error('Error creating customer quotation:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!result?.success) {
      return NextResponse.json({ error: result?.error || 'Failed to create quotation' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.quotation_id,
        quotation_number: result.quotation_number,
      },
      quotation_id: result.quotation_id,
      quotation_number: result.quotation_number,
    }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
