// =====================================================
// Ticketing API - Assign Ticket
// POST: Assign ticket to user (atomic + race-safe)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, canAssignTickets } from '@/lib/permissions'
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

    // Check assign permission
    if (!canAssignTickets(profile.role)) {
      return NextResponse.json(
        { error: 'Access denied: Only Ops or Admin can assign tickets' },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { assigned_to, notes } = body

    if (!assigned_to) {
      return NextResponse.json(
        { error: 'Missing required field: assigned_to' },
        { status: 400 }
      )
    }

    // Call RPC to assign ticket atomically
    const { data: result, error } = await (supabase as any).rpc('rpc_ticket_assign', {
      p_ticket_id: id,
      p_assigned_to: assigned_to,
      p_notes: notes || null,
    })

    if (error) {
      console.error('Error assigning ticket:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rpcResult = result as { success: boolean; ticket_id?: string; assigned_to?: string; error?: string }

    if (!rpcResult.success) {
      return NextResponse.json({ error: rpcResult.error || 'Failed to assign ticket' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      ticket_id: rpcResult.ticket_id,
      assigned_to: rpcResult.assigned_to,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
