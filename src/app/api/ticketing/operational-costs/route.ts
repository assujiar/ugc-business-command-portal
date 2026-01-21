import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, canViewAllTickets, canCreateOperationalCosts } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
}

// GET /api/ticketing/operational-costs - List all operational costs
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

    const profile = profileData

    if (!profile || !canAccessTicketing(profile.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Parse query params
    const status = searchParams.get('status')
    const ticketId = searchParams.get('ticket_id')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = (supabase as any)
      .from('ticket_rate_quotes')
      .select(`
        *,
        ticket:tickets!ticket_rate_quotes_ticket_id_fkey(
          id,
          ticket_code,
          subject,
          status,
          department,
          account:accounts!tickets_account_id_fkey(account_id, company_name)
        ),
        creator:profiles!ticket_rate_quotes_created_by_fkey(user_id, name, email)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }
    if (ticketId) {
      query = query.eq('ticket_id', ticketId)
    }
    if (search) {
      query = query.or(`quote_number.ilike.%${search}%`)
    }

    // If user cannot view all, only show costs for their tickets
    if (!canViewAllTickets(profile.role)) {
      // Get user's ticket IDs first
      const { data: userTickets } = await (supabase as any)
        .from('tickets')
        .select('id')
        .or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`)

      const ticketIds = userTickets?.map((t: { id: string }) => t.id) || []
      if (ticketIds.length > 0) {
        query = query.in('ticket_id', ticketIds)
      } else {
        return NextResponse.json({
          success: true,
          data: [],
          total: 0,
          limit,
          offset,
        })
      }
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: costs, error, count } = await query

    if (error) {
      console.error('Error fetching operational costs:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: costs || [],
      total: count || 0,
      limit,
      offset,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/ticketing/operational-costs - Create a new operational cost
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
    const { ticket_id, amount, currency, valid_until, terms, notes } = body

    if (!ticket_id) {
      return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 })
    }
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 })
    }
    if (!valid_until) {
      return NextResponse.json({ error: 'Valid until date is required' }, { status: 400 })
    }

    // Validate ticket is RFQ
    const { data: ticket } = await (supabase as any)
      .from('tickets')
      .select('ticket_type')
      .eq('id', ticket_id)
      .single()

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (ticket.ticket_type !== 'RFQ') {
      return NextResponse.json({ error: 'Operational costs can only be created for RFQ tickets' }, { status: 400 })
    }

    // Call RPC to create cost atomically
    const { data: result, error } = await (supabase as any).rpc('rpc_ticket_create_quote', {
      p_ticket_id: ticket_id,
      p_amount: amount,
      p_currency: currency || 'IDR',
      p_valid_until: valid_until,
      p_terms: terms || null,
    })

    if (error) {
      console.error('Error creating operational cost:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Parse RPC result
    const rpcResult = typeof result === 'string' ? JSON.parse(result) : result

    if (!rpcResult.success) {
      return NextResponse.json({ error: rpcResult.error || 'Failed to create operational cost' }, { status: 400 })
    }

    // Update cost with notes if provided
    if (notes) {
      await (supabase as any)
        .from('ticket_rate_quotes')
        .update({ notes })
        .eq('id', rpcResult.quote_id)
    }

    return NextResponse.json({
      success: true,
      cost_id: rpcResult.quote_id,
      cost_number: rpcResult.quote_number,
    }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
