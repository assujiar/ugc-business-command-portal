// =====================================================
// Ticketing API - Transition Ticket Status
// POST: Change ticket status (atomic with validation)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, canTransitionTickets } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ProfileData {
  user_id: string
  role: UserRole
}

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

    // Get current ticket to check access
    const { data: ticket } = await (supabase as any)
      .from('tickets')
      .select('created_by, assigned_to')
      .eq('id', id)
      .single() as { data: { created_by: string; assigned_to: string | null } | null }

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Check transition permission
    // Ops/Admin can always transition
    // Creator/assignee can transition only if they have permission
    const isCreatorOrAssignee = ticket.created_by === user.id || ticket.assigned_to === user.id
    if (!canTransitionTickets(profile.role) && !isCreatorOrAssignee) {
      return NextResponse.json(
        { error: 'Access denied: Cannot transition this ticket' },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const {
      new_status,
      notes,
      close_outcome,
      close_reason,
      competitor_name,
      competitor_cost,
    } = body

    if (!new_status) {
      return NextResponse.json(
        { error: 'Missing required field: new_status' },
        { status: 400 }
      )
    }

    // Call RPC to transition ticket atomically
    const { data: result, error } = await (supabase as any).rpc('rpc_ticket_transition', {
      p_ticket_id: id,
      p_new_status: new_status,
      p_notes: notes || null,
      p_close_outcome: close_outcome || null,
      p_close_reason: close_reason || null,
      p_competitor_name: competitor_name || null,
      p_competitor_cost: competitor_cost || null,
    })

    if (error) {
      console.error('Error transitioning ticket:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rpcResult = result as { success: boolean; ticket_id?: string; old_status?: string; new_status?: string; error?: string }

    if (!rpcResult.success) {
      return NextResponse.json({ error: rpcResult.error || 'Failed to transition ticket' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      ticket_id: rpcResult.ticket_id,
      old_status: rpcResult.old_status,
      new_status: rpcResult.new_status,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
