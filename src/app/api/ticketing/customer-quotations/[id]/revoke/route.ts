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

// POST /api/ticketing/customer-quotations/[id]/revoke - Revoke accepted quotation
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

    // Parse optional reason from request body
    let reason: string | null = null
    try {
      const body = await request.json()
      reason = body?.reason || null
    } catch {
      // No body is fine, reason is optional
    }

    const adminClient = createAdminClient()
    const { data: result, error: rpcError } = await (adminClient as any).rpc('rpc_customer_quotation_revoke_acceptance', {
      p_quotation_id: id,
      p_reason: reason,
      p_actor_user_id: user.id,
      p_correlation_id: correlationId
    })

    if (rpcError) {
      console.error('Error revoking quotation:', rpcError, 'correlation_id:', correlationId)
      return NextResponse.json({
        success: false,
        error: rpcError.message,
        error_code: 'RPC_ERROR',
        detail: rpcError.details || rpcError.hint,
        correlation_id: correlationId
      }, { status: 500 })
    }

    if (!result?.success) {
      const statusCode = result?.error_code === 'QUOTATION_NOT_FOUND' ? 404 :
                         result?.error_code === 'INVALID_STATUS_TRANSITION' ? 409 :
                         result?.error_code?.startsWith('CONFLICT_') ? 409 : 400
      console.error('Quotation revoke failed:', result, 'correlation_id:', correlationId)
      return NextResponse.json({
        success: false,
        error: result?.error || 'Failed to revoke quotation',
        error_code: result?.error_code || 'UNKNOWN_ERROR',
        correlation_id: correlationId
      }, { status: statusCode })
    }

    console.log('Quotation revoked successfully:', result, 'correlation_id:', correlationId)

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Quotation acceptance revoked. Pipeline reopened to Negotiation.',
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
