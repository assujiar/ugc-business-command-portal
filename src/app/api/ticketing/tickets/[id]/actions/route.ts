// =====================================================
// Ticketing API - Ticket Actions
// POST: Execute ticket actions (submit-quote, request-adjustment, etc.)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ProfileData {
  user_id: string
  role: UserRole
}

type TicketAction =
  | 'submit_quote'
  | 'request_adjustment'
  | 'quote_sent_to_customer'
  | 'mark_won'
  | 'mark_lost'

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

    // Parse request body
    const body = await request.json()
    const { action, ...actionData } = body as { action: TicketAction; [key: string]: any }

    if (!action) {
      return NextResponse.json({ error: 'Missing action parameter' }, { status: 400 })
    }

    let result
    let error

    switch (action) {
      case 'submit_quote':
        // Assignee submits quote to creator
        ({ data: result, error } = await (supabase as any).rpc('rpc_ticket_submit_quote', {
          p_ticket_id: id,
          p_amount: actionData.amount,
          p_currency: actionData.currency || 'IDR',
          p_valid_until: actionData.valid_until || null,
          p_terms: actionData.terms || null,
        }))
        break

      case 'request_adjustment':
        // Creator requests price adjustment
        ({ data: result, error } = await (supabase as any).rpc('rpc_ticket_request_adjustment', {
          p_ticket_id: id,
          p_reason: actionData.reason || null,
        }))
        break

      case 'quote_sent_to_customer':
        // Creator marks quote as sent to their customer
        ({ data: result, error } = await (supabase as any).rpc('rpc_ticket_quote_sent_to_customer', {
          p_ticket_id: id,
          p_notes: actionData.notes || null,
        }))
        break

      case 'mark_won':
        // Creator marks ticket as won
        ({ data: result, error } = await (supabase as any).rpc('rpc_ticket_mark_won', {
          p_ticket_id: id,
          p_notes: actionData.notes || null,
        }))
        break

      case 'mark_lost':
        // Creator marks ticket as lost
        ({ data: result, error } = await (supabase as any).rpc('rpc_ticket_mark_lost', {
          p_ticket_id: id,
          p_reason: actionData.reason || null,
          p_competitor_name: actionData.competitor_name || null,
          p_competitor_cost: actionData.competitor_cost || null,
        }))
        break

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    if (error) {
      console.error(`Error executing action ${action}:`, error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!result?.success) {
      return NextResponse.json(
        { error: result?.error || `Failed to execute action: ${action}` },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
