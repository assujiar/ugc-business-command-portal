import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing } from '@/lib/permissions'
import { getServiceTypeDisplayLabel } from '@/lib/constants'
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
    console.log('[CustomerQuotations POST] Starting quotation creation...')
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.log('[CustomerQuotations POST] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.log('[CustomerQuotations POST] User authenticated:', user.id)

    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    if (!profileData || !canAccessTicketing(profileData.role)) {
      console.log('[CustomerQuotations POST] Access denied for role:', profileData?.role)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    console.log('[CustomerQuotations POST] User has ticketing access')

    const body = await request.json()
    console.log('[CustomerQuotations POST] Request body:', JSON.stringify({
      ticket_id: body.ticket_id,
      lead_id: body.lead_id,
      opportunity_id: body.opportunity_id,
      source_type: body.source_type,
      customer_name: body.customer_name,
    }))

    let ticket_id = body.ticket_id || null
    let lead_id = body.lead_id || null
    let opportunity_id = body.opportunity_id || null
    let operational_cost_id = body.operational_cost_id || null

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

    // FIX Issue 2: If lead_id exists but opportunity_id doesn't, derive opportunity_id from lead
    // This ensures pipeline sync works correctly when quotation is sent
    if (lead_id && !opportunity_id) {
      const { data: lead } = await (supabase as any)
        .from('leads')
        .select('opportunity_id, account_id')
        .eq('lead_id', lead_id)
        .single()

      if (lead && lead.opportunity_id) {
        opportunity_id = lead.opportunity_id
        console.log('[CustomerQuotations POST] Derived opportunity_id from lead:', opportunity_id)
      }

      // FIX: If lead has account_id but still no opportunity_id, find existing opportunity by account
      if (!opportunity_id && lead && lead.account_id) {
        console.log('[CustomerQuotations POST] Looking for existing opportunity by account_id:', lead.account_id)
        const { data: existingOpp } = await (supabase as any)
          .from('opportunities')
          .select('opportunity_id')
          .eq('account_id', lead.account_id)
          .not('stage', 'in', '("Closed Won","Closed Lost")')
          .order('updated_at', { ascending: false })
          .limit(1)
          .single()

        if (existingOpp && existingOpp.opportunity_id) {
          opportunity_id = existingOpp.opportunity_id
          console.log('[CustomerQuotations POST] Found existing opportunity by account:', opportunity_id)

          // Also update the lead to link it to this opportunity
          await (supabase as any)
            .from('leads')
            .update({ opportunity_id: opportunity_id })
            .eq('lead_id', lead_id)
            .is('opportunity_id', null)
        }
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

    // FIX: Properly handle service_type and service_type_code
    // service_type_code is the canonical identifier, service_type is the display label
    const service_type_code = body.service_type_code || body.service_type || null
    // Derive label from code if not explicitly provided, or use code as fallback
    const service_type = body.service_type_label || (service_type_code ? getServiceTypeDisplayLabel(service_type_code) : null) || body.service_type || null
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
    const cargo_quantity_unit = body.cargo_quantity_unit || 'units'

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

    // Validation - use 422 for validation errors
    if (!customer_name) {
      return NextResponse.json(
        { error: 'Customer name is required', code: 'VALIDATION_ERROR', field: 'customer_name' },
        { status: 422 }
      )
    }

    // Validate source_type consistency
    if (source_type === 'ticket' && !ticket_id) {
      return NextResponse.json(
        { error: 'ticket_id is required when source_type is ticket', code: 'VALIDATION_ERROR', field: 'ticket_id' },
        { status: 422 }
      )
    }
    if (source_type === 'lead' && !lead_id) {
      return NextResponse.json(
        { error: 'lead_id is required when source_type is lead', code: 'VALIDATION_ERROR', field: 'lead_id' },
        { status: 422 }
      )
    }
    if (source_type === 'opportunity' && !opportunity_id) {
      return NextResponse.json(
        { error: 'opportunity_id is required when source_type is opportunity', code: 'VALIDATION_ERROR', field: 'opportunity_id' },
        { status: 422 }
      )
    }

    // ============================================
    // BUG #9 FIX: Resolve latest operational cost
    // Server-side guard to ensure quotation always uses latest submitted cost
    // ============================================
    if (ticket_id || lead_id || opportunity_id) {
      console.log('[CustomerQuotations POST] Resolving latest operational cost...')
      const { data: costResult, error: costError } = await (supabase as any).rpc('fn_resolve_latest_operational_cost', {
        p_ticket_id: ticket_id,
        p_lead_id: lead_id,
        p_opportunity_id: opportunity_id,
        p_provided_cost_id: operational_cost_id
      })

      if (costError) {
        console.error('[CustomerQuotations POST] Error resolving operational cost:', costError)
        // Don't fail on RPC error - continue with provided cost_id
      } else if (costResult) {
        console.log('[CustomerQuotations POST] Operational cost resolution:', costResult)

        if (!costResult.success) {
          // RFQ ticket without submitted cost - reject
          return NextResponse.json(
            {
              error: costResult.error || 'Failed to resolve operational cost',
              code: costResult.error_code || 'COST_RESOLUTION_ERROR',
              details: costResult
            },
            { status: 400 }
          )
        }

        if (costResult.resolved && costResult.operational_cost_id) {
          // Use resolved cost_id (may be different from provided)
          if (costResult.was_stale) {
            console.log('[CustomerQuotations POST] Overriding stale operational_cost_id:', {
              provided: operational_cost_id,
              latest: costResult.operational_cost_id
            })
          }
          operational_cost_id = costResult.operational_cost_id
        }
      }
    }

    // Generate quotation number using RPC
    console.log('[CustomerQuotations POST] Generating quotation number...')
    const { data: quotation_number, error: seqError } = await (supabase as any)
      .rpc('generate_customer_quotation_number')

    if (seqError || !quotation_number) {
      console.error('[CustomerQuotations POST] Error generating quotation number:', seqError)
      return NextResponse.json(
        { error: `Failed to generate quotation number: ${seqError?.message || 'Unknown error'}`, code: 'SEQUENCE_ERROR' },
        { status: 500 }
      )
    }
    console.log('[CustomerQuotations POST] Generated quotation number:', quotation_number)

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
    console.log('[CustomerQuotations POST] Inserting quotation with:', JSON.stringify({
      ticket_id, lead_id, opportunity_id, source_type, sequence_number, customer_name, quotation_number
    }))
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
        service_type_code,
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
      console.error('[CustomerQuotations POST] Error inserting customer quotation:', insertError)
      console.error('[CustomerQuotations POST] Insert error details:', JSON.stringify(insertError))

      // Handle specific error types
      if (insertError.code === '23503') {
        // Foreign key violation
        return NextResponse.json(
          { error: 'Invalid reference: the specified ticket, lead, or opportunity does not exist', code: 'FOREIGN_KEY_ERROR', details: insertError.message },
          { status: 422 }
        )
      }
      if (insertError.code === '23505') {
        // Unique violation
        return NextResponse.json(
          { error: 'A quotation with this number already exists', code: 'UNIQUE_VIOLATION', details: insertError.message },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { error: insertError.message, code: 'INSERT_ERROR', details: insertError.details, hint: insertError.hint },
        { status: 500 }
      )
    }

    console.log('[CustomerQuotations POST] Quotation inserted successfully:', quotation)
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
      console.log('[CustomerQuotations POST] Syncing to lead:', lead_id)
      const { error: leadSyncError } = await (supabase as any).rpc('sync_quotation_to_lead', {
        p_quotation_id: quotation_id,
        p_new_status: 'draft',
        p_actor_user_id: user.id,
      })
      if (leadSyncError) {
        console.error('[CustomerQuotations POST] Lead sync error:', leadSyncError)
      }
    }

    // Sync quotation status to opportunity if linked
    if (opportunity_id) {
      console.log('[CustomerQuotations POST] Syncing to opportunity:', opportunity_id)
      const { error: oppSyncError } = await (supabase as any).rpc('sync_quotation_to_opportunity', {
        p_quotation_id: quotation_id,
        p_new_status: 'draft',
        p_actor_user_id: user.id,
      })
      if (oppSyncError) {
        console.error('[CustomerQuotations POST] Opportunity sync error:', oppSyncError)
      }
    }

    // Helper to get sequence label
    const getSequenceLabel = (n: number): string => {
      const labels = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth']
      if (n <= 10) return labels[n - 1]
      return `${n}th`
    }

    return NextResponse.json({
      success: true,
      data: {
        id: quotation_id,
        quotation_number,
        sequence_number,
        sequence_label: getSequenceLabel(sequence_number),
      },
      quotation_id,
      quotation_number,
      sequence_number,
      sequence_label: getSequenceLabel(sequence_number),
    }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
