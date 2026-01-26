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

// Valid operational cost rejection reason types (must match operational_cost_rejection_reason_type enum)
const validReasonTypes = [
  'harga_terlalu_tinggi',
  'margin_tidak_mencukupi',
  'vendor_tidak_sesuai',
  'waktu_tidak_sesuai',
  'perlu_revisi',
  'tarif_tidak_masuk',
  'kompetitor_lebih_murah',
  'budget_customer_tidak_cukup',
  'other',
]

// Reasons that require numeric input
const financialReasons = [
  'tarif_tidak_masuk',
  'kompetitor_lebih_murah',
  'budget_customer_tidak_cukup',
  'harga_terlalu_tinggi',
  'margin_tidak_mencukupi'
]

// POST /api/ticketing/tickets/[id]/request-adjustment - Request rate adjustment
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
      competitor_name,
      competitor_amount,
      customer_budget,
      currency = 'IDR',
      notes,
    } = body

    // Validate reason_type is required
    if (!reason_type) {
      return NextResponse.json({
        success: false,
        error: 'Adjustment reason is required',
        error_code: 'VALIDATION_ERROR',
        field_errors: { reason_type: 'Required' },
        correlation_id: correlationId
      }, { status: 422 })
    }

    // Validate reason_type is valid enum
    if (!validReasonTypes.includes(reason_type)) {
      return NextResponse.json({
        success: false,
        error: `Invalid reason type: ${reason_type}. Valid values are: ${validReasonTypes.join(', ')}`,
        error_code: 'VALIDATION_ERROR',
        field_errors: { reason_type: `Must be one of: ${validReasonTypes.join(', ')}` },
        correlation_id: correlationId
      }, { status: 422 })
    }

    // Validate numeric fields for financial reasons
    if (financialReasons.includes(reason_type)) {
      if (reason_type === 'kompetitor_lebih_murah' && !competitor_name && !competitor_amount) {
        return NextResponse.json({
          success: false,
          error: 'Competitor name or amount is required when reason is "kompetitor_lebih_murah"',
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

      if (reason_type === 'tarif_tidak_masuk' && !competitor_amount && !customer_budget) {
        return NextResponse.json({
          success: false,
          error: 'Either competitor amount or customer budget is required when reason is "tarif_tidak_masuk"',
          error_code: 'VALIDATION_ERROR',
          field_errors: { competitor_amount: 'Either this or customer_budget required' },
          correlation_id: correlationId
        }, { status: 422 })
      }

      if ((reason_type === 'harga_terlalu_tinggi' || reason_type === 'margin_tidak_mencukupi') && !competitor_amount && !customer_budget) {
        return NextResponse.json({
          success: false,
          error: 'Target amount (competitor_amount or customer_budget) is recommended for this reason',
          error_code: 'VALIDATION_WARNING',
          field_errors: { competitor_amount: 'Recommended for analytics' },
          correlation_id: correlationId
        }, { status: 422 })
      }
    }

    // Use admin client to call atomic RPC
    const adminClient = createAdminClient()
    const { data: result, error: rpcError } = await (adminClient as any).rpc('rpc_ticket_request_adjustment', {
      p_ticket_id: id,
      p_reason_type: reason_type,
      p_competitor_name: competitor_name || null,
      p_competitor_amount: competitor_amount || null,
      p_customer_budget: customer_budget || null,
      p_currency: currency,
      p_notes: notes || null,
      p_actor_user_id: user.id,
      p_correlation_id: correlationId
    })

    if (rpcError) {
      console.error('Error requesting adjustment:', rpcError, 'correlation_id:', correlationId)
      return NextResponse.json({
        success: false,
        error: rpcError.message,
        error_code: 'RPC_ERROR',
        detail: rpcError.details || rpcError.hint,
        correlation_id: correlationId
      }, { status: 500 })
    }

    if (!result?.success) {
      // Return structured error with appropriate status code (409 for all conflict scenarios)
      const statusCode = result?.error_code === 'TICKET_NOT_FOUND' ? 404 :
                         result?.error_code === 'INVALID_STATUS_TRANSITION' ? 409 :
                         result?.error_code?.startsWith('CONFLICT_') ? 409 : 400
      console.error('Request adjustment failed:', result, 'correlation_id:', correlationId)
      return NextResponse.json({
        success: false,
        error: result?.error || 'Failed to request adjustment',
        error_code: result?.error_code || 'UNKNOWN_ERROR',
        correlation_id: correlationId
      }, { status: statusCode })
    }

    console.log('Request adjustment succeeded:', result, 'correlation_id:', correlationId)

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Adjustment requested successfully. Ticket moved to need_adjustment.',
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
