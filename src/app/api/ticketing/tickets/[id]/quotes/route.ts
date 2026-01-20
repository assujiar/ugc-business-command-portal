import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, canViewAllTickets, canCreateQuotes } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ProfileData {
  user_id: string
  role: UserRole
}

// GET /api/ticketing/tickets/[id]/quotes - List quotes for a ticket
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
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

    // Get ticket to check access
    const { data: ticket } = await (supabase as any)
      .from('tickets')
      .select('created_by, assigned_to, ticket_type')
      .eq('id', id)
      .single() as { data: { created_by: string; assigned_to: string | null; ticket_type: string } | null }

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Check access
    if (!canViewAllTickets(profile.role) &&
        ticket.created_by !== user.id &&
        ticket.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch quotes
    const { data: quotes, error } = await (supabase as any)
      .from('ticket_rate_quotes')
      .select(`
        *,
        creator:profiles!ticket_rate_quotes_created_by_fkey(user_id, name, email)
      `)
      .eq('ticket_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching quotes:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: quotes || [],
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/ticketing/tickets/[id]/quotes - Create quote for a ticket
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
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

    // Check if user can create quotes
    if (!canCreateQuotes(profile.role)) {
      return NextResponse.json({ error: 'Not authorized to create quotes' }, { status: 403 })
    }

    // Get ticket to validate
    const { data: ticket } = await (supabase as any)
      .from('tickets')
      .select('id, ticket_code, ticket_type, status')
      .eq('id', id)
      .single()

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Only RFQ tickets can have quotes
    if (ticket.ticket_type !== 'RFQ') {
      return NextResponse.json({ error: 'Quotes can only be created for RFQ tickets' }, { status: 400 })
    }

    // Parse request body
    const body = await request.json()
    const { amount, currency, valid_until, terms, notes } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 })
    }

    if (!valid_until) {
      return NextResponse.json({ error: 'Valid until date is required' }, { status: 400 })
    }

    // Call RPC to create quote atomically
    const { data: result, error } = await (supabase as any).rpc('rpc_ticket_create_quote', {
      p_ticket_id: id,
      p_amount: amount,
      p_currency: currency || 'IDR',
      p_valid_until: valid_until,
      p_terms: terms || null,
    })

    if (error) {
      console.error('Error creating quote:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Parse RPC result
    const rpcResult = typeof result === 'string' ? JSON.parse(result) : result

    if (!rpcResult.success) {
      return NextResponse.json({ error: rpcResult.error || 'Failed to create quote' }, { status: 400 })
    }

    // Update quote with notes if provided
    if (notes) {
      await (supabase as any)
        .from('ticket_rate_quotes')
        .update({ notes })
        .eq('id', rpcResult.quote_id)
    }

    return NextResponse.json({
      success: true,
      quote_id: rpcResult.quote_id,
      quote_number: rpcResult.quote_number,
    }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
