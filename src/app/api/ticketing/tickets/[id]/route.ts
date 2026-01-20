// =====================================================
// Ticketing API - Single Ticket Operations
// GET: Get ticket details
// PATCH: Update ticket
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, canViewAllTickets } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ProfileData {
  user_id: string
  role: UserRole
}

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

    // Fetch ticket with relations
    const { data: ticket, error } = await (supabase as any)
      .from('tickets')
      .select(`
        *,
        creator:profiles!tickets_created_by_fkey(user_id, name, email),
        assignee:profiles!tickets_assigned_to_fkey(user_id, name, email),
        account:accounts!tickets_account_id_fkey(account_id, company_name),
        contact:contacts!tickets_contact_id_fkey(contact_id, first_name, last_name, email, phone)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
      }
      console.error('Error fetching ticket:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Check access (creator, assignee, or can view all)
    if (!canViewAllTickets(profile.role) &&
        ticket.created_by !== user.id &&
        ticket.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch SLA tracking
    const { data: slaTracking } = await (supabase as any)
      .from('ticket_sla_tracking')
      .select('*')
      .eq('ticket_id', id)
      .single()

    return NextResponse.json({
      success: true,
      data: {
        ...ticket,
        sla_tracking: slaTracking,
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

    // Get current ticket
    const { data: ticket, error: fetchError } = await (supabase as any)
      .from('tickets')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Check access (creator, assignee, or can view all)
    if (!canViewAllTickets(profile.role) &&
        ticket.created_by !== user.id &&
        ticket.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { subject, description, priority, rfq_data } = body

    // Build update object
    const updates: Record<string, unknown> = {}
    if (subject !== undefined) updates.subject = subject
    if (description !== undefined) updates.description = description
    if (priority !== undefined) updates.priority = priority
    if (rfq_data !== undefined) updates.rfq_data = rfq_data

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Update ticket
    const { data: updatedTicket, error } = await (supabase as any)
      .from('tickets')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating ticket:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: updatedTicket,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
