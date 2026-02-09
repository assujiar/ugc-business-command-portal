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

// Valid rejection reason types (must match quotation_rejection_reason_type enum)
const validReasonTypes = [
  'tarif_tidak_masuk',
  'kompetitor_lebih_murah',
  'budget_customer_tidak_cukup',
  'service_tidak_sesuai',
  'waktu_tidak_sesuai',
  'other',
]

// Reasons that require numeric input
const financialReasons = [
  'tarif_tidak_masuk',
  'kompetitor_lebih_murah',
  'budget_customer_tidak_cukup',
]

// POST /api/ticketing/customer-quotations/[id]/reject - Reject quotation with reason
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
        error: 'Rejection reason is required',
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

    // Use admin client to call atomic RPC that updates quotation + opportunity + ticket in ONE transaction
    const adminClient = createAdminClient()
    const { data: result, error: rpcError } = await (adminClient as any).rpc('rpc_customer_quotation_mark_rejected', {
      p_quotation_id: id,
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
      console.error('[CustomerQuotation REJECT] RPC error:', JSON.stringify({ error: rpcError.message, details: rpcError.details, hint: rpcError.hint, code: rpcError.code }), 'correlation_id:', correlationId)
      return NextResponse.json({
        success: false,
        error: rpcError.message,
        error_code: 'RPC_ERROR',
        detail: rpcError.details || rpcError.hint,
        correlation_id: correlationId
      }, { status: 500 })
    }

    if (!result?.success) {
      // Return structured error with field-level details if available
      // Map error codes to appropriate HTTP status codes (409 for all conflict scenarios)
      const statusCode = result?.error_code === 'VALIDATION_ERROR' ? 422 :
                         result?.error_code === 'QUOTATION_NOT_FOUND' ? 404 :
                         result?.error_code === 'INVALID_STATUS_TRANSITION' ? 409 :
                         result?.error_code?.startsWith('CONFLICT_') ? 409 : 400
      console.error('[CustomerQuotation REJECT] RPC returned failure:', JSON.stringify({ error: result?.error, error_code: result?.error_code }), 'correlation_id:', correlationId)
      return NextResponse.json({
        success: false,
        error: result?.error || 'Failed to reject quotation',
        error_code: result?.error_code || 'UNKNOWN_ERROR',
        field_errors: result?.field_errors || null,
        correlation_id: correlationId
      }, { status: statusCode })
    }

    console.log('[CustomerQuotation REJECT] Success:', JSON.stringify({
      correlation_id: correlationId,
      quotation_id: result.quotation_id,
      quotation_number: result.quotation_number,
      rejection_reason: result.rejection_reason,
      ticket_id: result.ticket_id,
      ticket_status: result.ticket_status,
      ticket_events_created: result.ticket_events_created,
      ticket_comment_created: result.ticket_comment_created,
      opportunity_id: result.opportunity_id,
      old_stage: result.old_stage,
      new_stage: result.new_stage,
      sequence_label: result.sequence_label,
    }))

    // Build message with sequence info if available
    const sequenceLabel = result.sequence_label || ''
    const previousRejections = result.previous_rejected_count || 0
    const stageChanged = result.old_stage !== result.new_stage
    let successMessage = ''

    if (sequenceLabel && previousRejections > 0) {
      // This is not the first rejection - stage typically stays in Negotiation
      const stageInfo = stageChanged
        ? `Pipeline moved to ${result.new_stage}`
        : `Pipeline remains in ${result.new_stage || 'Negotiation'}`
      successMessage = `${sequenceLabel} quotation rejected. This is rejection #${previousRejections + 1} for this opportunity. ${stageInfo}.`
    } else if (sequenceLabel) {
      // First rejection - stage moves to Negotiation
      const stageInfo = stageChanged
        ? `Pipeline moved to ${result.new_stage || 'Negotiation'}`
        : `Pipeline remains in ${result.new_stage || 'Negotiation'}`
      successMessage = `${sequenceLabel} quotation rejected. ${stageInfo}, ticket moved to need_adjustment.`
    } else {
      const stageInfo = stageChanged
        ? `Pipeline moved to ${result.new_stage || 'Negotiation'}`
        : `Pipeline remains in ${result.new_stage || 'Negotiation'}`
      successMessage = `Quotation rejected successfully. ${stageInfo}, ticket moved to need_adjustment.`
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: successMessage,
      correlation_id: correlationId
    })
  } catch (err) {
    console.error('[CustomerQuotation REJECT] Unexpected error:', err instanceof Error ? err.message : err, 'correlation_id:', correlationId)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
      correlation_id: correlationId
    }, { status: 500 })
  }
}
