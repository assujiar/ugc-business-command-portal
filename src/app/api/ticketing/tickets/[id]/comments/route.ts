// =====================================================
// Ticketing API - Ticket Comments
// GET: List comments for a ticket
// POST: Add comment to ticket
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, canViewAllTickets, canCreateInternalComments } from '@/lib/permissions'
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

    // Build query - filter internal comments for non-ops users
    let query = (supabase as any)
      .from('ticket_comments')
      .select(`
        *,
        user:profiles!ticket_comments_user_id_fkey(user_id, name, email)
      `)
      .eq('ticket_id', id)
      .order('created_at', { ascending: true })

    // Hide internal comments from non-ops users
    if (!canCreateInternalComments(profile.role)) {
      query = query.eq('is_internal', false)
    }

    const { data: comments, error } = await query

    if (error) {
      console.error('Error fetching comments:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: comments,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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

    // Parse request body
    const body = await request.json()
    const { content, is_internal = false } = body

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: 'Missing required field: content' },
        { status: 400 }
      )
    }

    // Check internal comment permission
    if (is_internal && !canCreateInternalComments(profile.role)) {
      return NextResponse.json(
        { error: 'Access denied: Cannot create internal comments' },
        { status: 403 }
      )
    }

    // Call RPC to add comment atomically
    const { data: result, error } = await (supabase as any).rpc('rpc_ticket_add_comment', {
      p_ticket_id: id,
      p_content: content.trim(),
      p_is_internal: is_internal,
    })

    if (error) {
      console.error('Error adding comment:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rpcResult = result as { success: boolean; comment_id?: string; ticket_id?: string; error?: string }

    if (!rpcResult.success) {
      return NextResponse.json({ error: rpcResult.error || 'Failed to add comment' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      comment_id: rpcResult.comment_id,
      ticket_id: rpcResult.ticket_id,
    }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
