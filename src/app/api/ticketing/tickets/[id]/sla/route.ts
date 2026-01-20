// =====================================================
// Ticketing API - Ticket SLA Details
// GET: Get comprehensive SLA details for a ticket
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, canViewAllTickets } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

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

    // Get ticket to check access
    const { data: ticket } = await (supabase as any)
      .from('tickets')
      .select('created_by, assigned_to')
      .eq('id', id)
      .single() as { data: { created_by: string; assigned_to: string | null } | null }

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Check access
    if (!canViewAllTickets(profile.role) &&
        ticket.created_by !== user.id &&
        ticket.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Call RPC to get SLA details
    const { data: slaDetails, error } = await (supabase as any).rpc('rpc_get_ticket_sla_details', {
      p_ticket_id: id,
    })

    if (error) {
      console.error('Error fetching SLA details:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!slaDetails?.success) {
      return NextResponse.json(
        { error: slaDetails?.error || 'Failed to fetch SLA details' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      data: slaDetails,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
