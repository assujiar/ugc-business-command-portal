import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessTicketing } from '@/lib/permissions'
import type { UserRole } from '@/types/database'
import { randomUUID } from 'crypto'
import {
  QUOTE_STATUS,
  OPERATIONAL_COST_REJECTION_REASON_LIST,
  FINANCIAL_OPERATIONAL_COST_REASONS,
} from '@/lib/constants'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ProfileData {
  user_id: string
  role: UserRole
}

// POST /api/ticketing/operational-costs/[id]/reject - Reject operational cost with reason
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
      reason_type,
      suggested_amount,
      competitor_amount,
      customer_budget,
      currency = 'IDR',
      notes,
    } = body

    // Validate reason_type is required
    if (!reason_type) {
      return NextResponse.json({
        success: false,
        error: 'Rejection reason is required',
        error_code: 'VALIDATION_ERROR',
        field_errors: { reason_type: 'Required' },
        correlation_id: correlationId
      }, { status: 422 })
    }

    // Validate reason_type is valid enum (use constants SSOT)
    if (!OPERATIONAL_COST_REJECTION_REASON_LIST.includes(reason_type)) {
      return NextResponse.json({
        success: false,
        error: `Invalid reason type: ${reason_type}. Valid values are: ${OPERATIONAL_COST_REJECTION_REASON_LIST.join(', ')}`,
        error_code: 'VALIDATION_ERROR',
        field_errors: { reason_type: `Must be one of: ${OPERATIONAL_COST_REJECTION_REASON_LIST.join(', ')}` },
        correlation_id: correlationId
      }, { status: 422 })
    }

    // Validate numeric fields for financial reasons
    if (FINANCIAL_OPERATIONAL_COST_REASONS.includes(reason_type)) {
      if (reason_type === 'kompetitor_lebih_murah' && !competitor_amount) {
        return NextResponse.json({
          success: false,
          error: 'Competitor amount is required when reason is "kompetitor_lebih_murah"',
          error_code: 'VALIDATION_ERROR',
          field_errors: { competitor_amount: 'Required for this reason' },
          correlation_id: correlationId
        }, { status: 422 })
      }

      if (reason_type === 'budget_customer_tidak_cukup' && !customer_budget) {
        return NextResponse.json({
          success: false,
          error: 'Customer budget is required when reason is "budget_customer_tidak_cukup"',
          error_code: 'VALIDATION_ERROR',
          field_errors: { customer_budget: 'Required for this reason' },
          correlation_id: correlationId
        }, { status: 422 })
      }
    }

    // Get operational cost to verify it exists and can be rejected
    const { data: cost } = await (supabase as any)
      .from('ticket_rate_quotes')
      .select('*')
      .eq('id', id)
      .single()

    if (!cost) {
      return NextResponse.json({
        success: false,
        error: 'Operational cost not found',
        error_code: 'NOT_FOUND',
        correlation_id: correlationId
      }, { status: 404 })
    }

    // State Machine: Valid states for rejection (pre-customer review states)
    // submitted: Ops submitted, sales can reject for adjustment
    // accepted: Sales accepted cost, can still reject before sending to customer
    // sent: Legacy status (backward compatibility)
    // sent_to_customer: After quotation sent, if customer rejects
    const REJECTABLE_STATUSES = [
      QUOTE_STATUS.SUBMITTED,
      QUOTE_STATUS.ACCEPTED,
      QUOTE_STATUS.SENT,
      QUOTE_STATUS.SENT_TO_CUSTOMER,
    ]

    if (!REJECTABLE_STATUSES.includes(cost.status)) {
      return NextResponse.json({
        success: false,
        error: `Operational cost cannot be rejected in current status: ${cost.status}. Must be one of: ${REJECTABLE_STATUSES.join(', ')}.`,
        error_code: 'INVALID_STATUS_TRANSITION',
        allowed_statuses: REJECTABLE_STATUSES,
        current_status: cost.status,
        correlation_id: correlationId
      }, { status: 409 })
    }

    // Use admin client to call RPC with actor_user_id and correlation_id
    const adminClient = createAdminClient()
    const { data: result, error: rpcError } = await (adminClient as any).rpc('rpc_reject_operational_cost_with_reason', {
      p_cost_id: id,
      p_reason_type: reason_type,
      p_suggested_amount: suggested_amount || competitor_amount || customer_budget || null,
      p_currency: currency,
      p_notes: notes || null,
      p_actor_user_id: user.id,
      p_correlation_id: correlationId
    })

    if (rpcError) {
      console.error('Error rejecting operational cost:', rpcError, 'correlation_id:', correlationId)
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
      const statusCode = result?.error_code === 'NOT_FOUND' ? 404 :
                         result?.error_code === 'INVALID_STATUS_TRANSITION' ? 409 :
                         result?.error_code?.startsWith('CONFLICT_') ? 409 : 400
      console.error('Operational cost rejection failed:', result, 'correlation_id:', correlationId)
      return NextResponse.json({
        success: false,
        error: result?.error || 'Failed to reject operational cost',
        error_code: result?.error_code || 'UNKNOWN_ERROR',
        correlation_id: correlationId
      }, { status: statusCode })
    }

    console.log('Operational cost rejected successfully:', result, 'correlation_id:', correlationId)

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Operational cost rejected successfully. Quote moved to revise_requested.',
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
