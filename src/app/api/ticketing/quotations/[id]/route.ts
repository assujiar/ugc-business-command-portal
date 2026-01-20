import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, canViewAllTickets, canCreateQuotes } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ProfileData {
  user_id: string
  role: UserRole
}

// GET /api/ticketing/quotations/[id] - Get a specific quotation
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

    // Fetch quotation with related data
    const { data: quotation, error } = await (supabase as any)
      .from('ticket_rate_quotes')
      .select(`
        *,
        ticket:tickets!ticket_rate_quotes_ticket_id_fkey(
          id,
          ticket_code,
          subject,
          description,
          status,
          priority,
          department,
          ticket_type,
          rfq_data,
          created_at,
          account:accounts!tickets_account_id_fkey(account_id, company_name, address, city, country),
          contact:contacts!tickets_contact_id_fkey(contact_id, first_name, last_name, email, phone),
          creator:profiles!tickets_created_by_fkey(user_id, name, email),
          assignee:profiles!tickets_assigned_to_fkey(user_id, name, email)
        ),
        creator:profiles!ticket_rate_quotes_created_by_fkey(user_id, name, email)
      `)
      .eq('id', id)
      .single()

    if (error || !quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    // Check access - user must have access to the ticket
    const ticket = quotation.ticket
    if (!canViewAllTickets(profile.role) &&
        ticket?.creator?.user_id !== user.id &&
        ticket?.assignee?.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      data: quotation,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/ticketing/quotations/[id] - Update a quotation
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

    // Check if user can manage quotes
    if (!canCreateQuotes(profile.role)) {
      return NextResponse.json({ error: 'Not authorized to manage quotes' }, { status: 403 })
    }

    // Get current quotation
    const { data: quotation } = await (supabase as any)
      .from('ticket_rate_quotes')
      .select('*, ticket:tickets!ticket_rate_quotes_ticket_id_fkey(id, ticket_code)')
      .eq('id', id)
      .single()

    if (!quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const { amount, currency, valid_until, terms, notes, status } = body

    // Build updates
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (amount !== undefined) updates.amount = amount
    if (currency !== undefined) updates.currency = currency
    if (valid_until !== undefined) updates.valid_until = valid_until
    if (terms !== undefined) updates.terms = terms
    if (notes !== undefined) updates.notes = notes

    // Status transitions validation
    if (status !== undefined) {
      const validTransitions: Record<string, string[]> = {
        draft: ['sent'],
        sent: ['accepted', 'rejected'],
        accepted: [],
        rejected: [],
      }

      const currentStatus = quotation.status
      if (!validTransitions[currentStatus]?.includes(status)) {
        return NextResponse.json({
          error: `Invalid status transition: ${currentStatus} → ${status}`,
        }, { status: 400 })
      }

      updates.status = status

      // Record sent_at timestamp
      if (status === 'sent') {
        updates.sent_at = new Date().toISOString()
      }
    }

    if (Object.keys(updates).length === 1) { // only updated_at
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Update quotation
    const { data: updatedQuotation, error } = await (supabase as any)
      .from('ticket_rate_quotes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating quotation:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Record event if status changed
    if (status) {
      await (supabase as any)
        .from('ticket_events')
        .insert({
          ticket_id: quotation.ticket_id,
          event_type: status === 'sent' ? 'quote_sent' : 'quote_updated',
          actor_id: user.id,
          old_value: { status: quotation.status },
          new_value: { status, quote_number: quotation.quote_number },
        })
    }

    return NextResponse.json({
      success: true,
      data: updatedQuotation,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/ticketing/quotations/[id] - Delete a quotation (only draft)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    // Check if user can manage quotes
    if (!canCreateQuotes(profile.role)) {
      return NextResponse.json({ error: 'Not authorized to manage quotes' }, { status: 403 })
    }

    // Get quotation
    const { data: quotation } = await (supabase as any)
      .from('ticket_rate_quotes')
      .select('*')
      .eq('id', id)
      .single()

    if (!quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    // Only draft quotes can be deleted
    if (quotation.status !== 'draft') {
      return NextResponse.json({
        error: 'Only draft quotations can be deleted',
      }, { status: 400 })
    }

    // Delete quotation
    const { error } = await (supabase as any)
      .from('ticket_rate_quotes')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting quotation:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Quotation deleted',
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
