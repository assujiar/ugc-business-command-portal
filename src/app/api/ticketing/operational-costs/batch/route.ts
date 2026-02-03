import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, canCreateOperationalCosts } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
}

interface ShipmentCost {
  shipment_detail_id: string | null
  shipment_label: string | null
  amount: number
  rate_structure: 'bundling' | 'breakdown'
  items?: Array<{
    component_type: string
    component_name?: string
    description?: string
    cost_amount: number
    quantity?: number | null
    unit?: string | null
  }>
}

/**
 * POST /api/ticketing/operational-costs/batch
 *
 * Batch create operational costs for multiple shipments in one request.
 * This is used when a ticket has multiple shipments and ops wants to submit
 * costs for all shipments at once.
 *
 * Request body:
 * {
 *   ticket_id: string (required)
 *   currency: string (default 'IDR')
 *   valid_until: string (ISO date, default 14 days from now)
 *   shipment_costs: Array<{
 *     shipment_detail_id: string | null
 *     shipment_label: string | null
 *     amount: number (for bundling mode)
 *     rate_structure: 'bundling' | 'breakdown'
 *     items?: Array<{ component_type, cost_amount, ... }> (for breakdown mode)
 *   }>
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    const profile = profileData

    if (!profile || !canAccessTicketing(profile.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check if user can create operational costs
    if (!canCreateOperationalCosts(profile.role)) {
      return NextResponse.json({ error: 'Not authorized to create operational costs' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { ticket_id, currency, valid_until, shipment_costs } = body

    // Validate required fields
    if (!ticket_id) {
      return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 })
    }

    if (!shipment_costs || !Array.isArray(shipment_costs) || shipment_costs.length === 0) {
      return NextResponse.json({ error: 'At least one shipment cost is required' }, { status: 400 })
    }

    // Validate ticket is RFQ
    const { data: ticket } = await (supabase as any)
      .from('tickets')
      .select('ticket_type, ticket_code')
      .eq('id', ticket_id)
      .single()

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (ticket.ticket_type !== 'RFQ') {
      return NextResponse.json({ error: 'Operational costs can only be created for RFQ tickets' }, { status: 400 })
    }

    // Validate each shipment cost
    const validatedCosts: ShipmentCost[] = []
    for (let i = 0; i < shipment_costs.length; i++) {
      const cost = shipment_costs[i]
      const rateStructure = cost.rate_structure === 'breakdown' ? 'breakdown' : 'bundling'

      // Calculate amount
      let amount = 0
      if (rateStructure === 'breakdown' && Array.isArray(cost.items) && cost.items.length > 0) {
        amount = cost.items.reduce((sum: number, item: any) => sum + (parseFloat(item.cost_amount) || 0), 0)

        // Validate breakdown items
        for (const item of cost.items) {
          if (!item.component_type) {
            return NextResponse.json({
              error: `Shipment ${i + 1}: Each breakdown item must have a component type`
            }, { status: 400 })
          }
        }
      } else {
        amount = parseFloat(cost.amount) || 0
      }

      // Skip shipments with zero cost (they might not need costing)
      if (amount <= 0) {
        console.log(`[BatchCost] Skipping shipment ${i + 1} - zero or invalid amount`)
        continue
      }

      validatedCosts.push({
        shipment_detail_id: cost.shipment_detail_id || null,
        shipment_label: cost.shipment_label || `Shipment ${i + 1}`,
        amount,
        rate_structure: rateStructure,
        items: rateStructure === 'breakdown' ? cost.items : undefined
      })
    }

    if (validatedCosts.length === 0) {
      return NextResponse.json({
        error: 'No valid costs to create. Please provide at least one shipment with a valid amount greater than 0.'
      }, { status: 400 })
    }

    // Format valid_until date
    let validUntilDate = valid_until
    if (!validUntilDate) {
      const date = new Date()
      date.setDate(date.getDate() + 14)
      validUntilDate = date.toISOString().split('T')[0]
    }

    // Call RPC to batch create costs atomically
    const { data: result, error } = await (supabase as any).rpc('rpc_batch_create_shipment_costs', {
      p_ticket_id: ticket_id,
      p_shipment_costs: validatedCosts,
      p_currency: currency || 'IDR',
      p_valid_until: validUntilDate
    })

    if (error) {
      console.error('Error batch creating operational costs:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Parse RPC result
    const rpcResult = typeof result === 'string' ? JSON.parse(result) : result

    if (!rpcResult.success) {
      return NextResponse.json({ error: rpcResult.error || 'Failed to create operational costs' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      batch: true,
      costs_count: rpcResult.costs_count,
      costs: rpcResult.costs,
      message: `Successfully created ${rpcResult.costs_count} operational cost(s) for ${ticket.ticket_code}`
    }, { status: 201 })

  } catch (err) {
    console.error('Unexpected error in batch cost creation:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/ticketing/operational-costs/batch?ticket_id=xxx
 *
 * Get all operational costs for a ticket grouped by shipment.
 * Useful for verifying which shipments have costs.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    if (!profileData || !canAccessTicketing(profileData.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const ticket_id = searchParams.get('ticket_id')
    const lead_id = searchParams.get('lead_id')
    const opportunity_id = searchParams.get('opportunity_id')

    if (!ticket_id && !lead_id && !opportunity_id) {
      return NextResponse.json({
        error: 'At least one of ticket_id, lead_id, or opportunity_id is required'
      }, { status: 400 })
    }

    // Call the resolution function
    const { data: result, error } = await (supabase as any).rpc('fn_resolve_all_shipment_costs', {
      p_ticket_id: ticket_id || null,
      p_lead_id: lead_id || null,
      p_opportunity_id: opportunity_id || null
    })

    if (error) {
      console.error('Error resolving shipment costs:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      ...result
    })

  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
