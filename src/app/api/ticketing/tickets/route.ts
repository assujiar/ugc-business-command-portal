// =====================================================
// Ticketing API - Tickets List & Create
// GET: List tickets with filters
// POST: Create new ticket
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, canViewAllTickets } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

interface ProfileData {
  user_id: string
  role: UserRole
}

export async function GET(request: NextRequest) {
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

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const ticketType = searchParams.get('ticket_type')
    const department = searchParams.get('department')
    const search = searchParams.get('search')
    const accountId = searchParams.get('account_id')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = (supabase as any)
      .from('tickets')
      .select(`
        *,
        creator:profiles!tickets_created_by_fkey(user_id, name, email),
        assignee:profiles!tickets_assigned_to_fkey(user_id, name, email),
        account:accounts!tickets_account_id_fkey(account_id, company_name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })

    // Apply filters
    if (status) query = query.eq('status', status)
    if (priority) query = query.eq('priority', priority)
    if (ticketType) query = query.eq('ticket_type', ticketType)
    if (department) query = query.eq('department', department)
    if (accountId) query = query.eq('account_id', accountId)
    if (search) {
      query = query.or(`ticket_code.ilike.%${search}%,subject.ilike.%${search}%`)
    }

    // If user cannot view all tickets, filter by ownership
    if (!canViewAllTickets(profile.role)) {
      query = query.or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`)
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: tickets, error, count } = await query

    if (error) {
      console.error('Error fetching tickets:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: tickets,
      count,
      limit,
      offset,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

    // Parse request body
    const body = await request.json()
    const {
      ticket_type,
      subject,
      description,
      department,
      priority = 'medium',
      account_id,
      contact_id,
      rfq_data,
    } = body

    // Validate required fields
    if (!ticket_type || !subject || !department) {
      return NextResponse.json(
        { error: 'Missing required fields: ticket_type, subject, department' },
        { status: 400 }
      )
    }

    // Call RPC to create ticket atomically
    const { data: result, error } = await (supabase as any).rpc('rpc_ticket_create', {
      p_ticket_type: ticket_type,
      p_subject: subject,
      p_description: description || null,
      p_department: department,
      p_priority: priority,
      p_account_id: account_id || null,
      p_contact_id: contact_id || null,
      p_rfq_data: rfq_data || null,
    })

    if (error) {
      console.error('Error creating ticket:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rpcResult = result as { success: boolean; ticket_id?: string; ticket_code?: string; error?: string }

    if (!rpcResult.success) {
      return NextResponse.json({ error: rpcResult.error || 'Failed to create ticket' }, { status: 400 })
    }

    // Auto-assign to department ops/manager
    // Department to Role mapping based on actual UserRole enum
    const departmentRoleMap: Record<string, string> = {
      MKT: 'Marketing Manager',
      SAL: 'sales manager',
      DOM: 'domestics Ops',
      EXI: 'EXIM Ops',
      DTD: 'Import DTD Ops',
      TRF: 'traffic & warehous',
    }

    const targetRole = departmentRoleMap[department]
    if (targetRole && rpcResult.ticket_id) {
      // Find the department manager/ops user
      const { data: deptManager } = await (supabase as any)
        .from('profiles')
        .select('user_id, name')
        .eq('role', targetRole)
        .eq('is_active', true)
        .limit(1)
        .single()

      if (deptManager) {
        // Assign ticket to department manager/ops
        await (supabase as any)
          .from('tickets')
          .update({ assigned_to: deptManager.user_id })
          .eq('id', rpcResult.ticket_id)

        // Create assignment event
        await (supabase as any)
          .from('ticket_events')
          .insert({
            ticket_id: rpcResult.ticket_id,
            event_type: 'assigned',
            actor_user_id: user.id,
            old_value: null,
            new_value: deptManager.user_id,
            notes: `Auto-assigned to ${deptManager.name} (${department} department)`,
          })
      }
    }

    return NextResponse.json({
      success: true,
      ticket_id: rpcResult.ticket_id,
      ticket_code: rpcResult.ticket_code,
    }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
