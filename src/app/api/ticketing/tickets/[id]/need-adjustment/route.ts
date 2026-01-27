// =====================================================
// API Route: /api/ticketing/tickets/[id]/need-adjustment
// BUG #7 Fix: Manual need adjustment endpoint
// Works for both creator→ops and ops→creator scenarios
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessTicketing } from '@/lib/permissions'
import type { UserRole } from '@/types/database'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ProfileData {
  user_id: string
  role: UserRole
}

// POST /api/ticketing/tickets/[id]/need-adjustment - Set ticket to need_adjustment
export async function POST(request: NextRequest, { params }: RouteParams) {
  const correlationId = randomUUID()

  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized',
        error_code: 'UNAUTHORIZED',
        correlation_id: correlationId
      }, { status: 401 })
    }

    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    if (!profileData || !canAccessTicketing(profileData.role)) {
      return NextResponse.json({
        success: false,
        error: 'Access denied',
        error_code: 'FORBIDDEN',
        correlation_id: correlationId
      }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const {
      notes,
      actor_role_mode = 'creator', // Default to creator mode
    } = body

    // Validate actor_role_mode
    if (!['creator', 'ops'].includes(actor_role_mode)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid actor_role_mode. Must be "creator" or "ops"',
        error_code: 'VALIDATION_ERROR',
        field_errors: { actor_role_mode: 'Must be "creator" or "ops"' },
        correlation_id: correlationId
      }, { status: 422 })
    }

    // Use admin client to call atomic RPC
    const adminClient = createAdminClient()
    const { data: result, error: rpcError } = await (adminClient as any).rpc('rpc_ticket_set_need_adjustment', {
      p_ticket_id: id,
      p_notes: notes || null,
      p_actor_role_mode: actor_role_mode,
      p_actor_user_id: user.id,
      p_correlation_id: correlationId
    })

    if (rpcError) {
      console.error('Error setting need_adjustment:', rpcError, 'correlation_id:', correlationId)
      return NextResponse.json({
        success: false,
        error: rpcError.message,
        error_code: 'RPC_ERROR',
        detail: rpcError.details || rpcError.hint,
        correlation_id: correlationId
      }, { status: 500 })
    }

    if (!result?.success) {
      // Return structured error with appropriate status code
      const statusCode = result?.error_code === 'TICKET_NOT_FOUND' ? 404 :
                         result?.error_code === 'INVALID_STATUS_TRANSITION' ? 409 :
                         result?.error_code?.startsWith('CONFLICT_') ? 409 : 400
      console.error('Set need_adjustment failed:', result, 'correlation_id:', correlationId)
      return NextResponse.json({
        success: false,
        error: result?.error || 'Failed to set need_adjustment',
        error_code: result?.error_code || 'UNKNOWN_ERROR',
        correlation_id: correlationId
      }, { status: statusCode })
    }

    console.log('Set need_adjustment succeeded:', result, 'correlation_id:', correlationId)

    return NextResponse.json({
      success: true,
      data: result,
      message: actor_role_mode === 'creator'
        ? 'Adjustment requested. Ticket moved to need_adjustment, awaiting ops response.'
        : 'More information requested. Ticket moved to need_adjustment, awaiting customer response.',
      correlation_id: correlationId
    })
  } catch (err) {
    console.error('Unexpected error:', err, 'correlation_id:', correlationId)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
      correlation_id: correlationId
    }, { status: 500 })
  }
}
