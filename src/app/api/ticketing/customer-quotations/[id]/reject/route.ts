import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

// Valid rejection reason types (must match quotation_rejection_reason_type enum)
const validReasonTypes = [
  'tarif_tidak_masuk',
  'kompetitor_lebih_murah',
  'budget_customer_tidak_cukup',
  'service_tidak_sesuai',
  'waktu_tidak_sesuai',
  'other',
]

// POST /api/ticketing/customer-quotations/[id]/reject - Reject quotation with reason
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    if (!profileData || !canAccessTicketing(profileData.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
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

    // Validate reason_type
    if (!reason_type) {
      return NextResponse.json({
        success: false,
        error: 'Rejection reason is required'
      }, { status: 400 })
    }

    if (!validReasonTypes.includes(reason_type)) {
      return NextResponse.json({
        success: false,
        error: `Invalid reason type: ${reason_type}. Valid values are: ${validReasonTypes.join(', ')}`
      }, { status: 400 })
    }

    // Validate competitor info if reason is kompetitor_lebih_murah
    if (reason_type === 'kompetitor_lebih_murah' && !competitor_name && !competitor_amount) {
      return NextResponse.json({
        success: false,
        error: 'Competitor name or amount is required when reason is "kompetitor_lebih_murah"'
      }, { status: 400 })
    }

    // Validate budget info if reason is budget_customer_tidak_cukup
    if (reason_type === 'budget_customer_tidak_cukup' && !customer_budget) {
      return NextResponse.json({
        success: false,
        error: 'Customer budget is required when reason is "budget_customer_tidak_cukup"'
      }, { status: 400 })
    }

    // Get quotation to verify it exists and can be rejected
    const { data: quotation } = await (supabase as any)
      .from('customer_quotations')
      .select('*')
      .eq('id', id)
      .single()

    if (!quotation) {
      return NextResponse.json({
        success: false,
        error: 'Quotation not found'
      }, { status: 404 })
    }

    if (!['sent', 'draft'].includes(quotation.status)) {
      return NextResponse.json({
        success: false,
        error: `Quotation cannot be rejected in current status: ${quotation.status}`
      }, { status: 400 })
    }

    // Use admin client to call RPC
    const adminClient = createAdminClient()
    const { data: result, error: rpcError } = await (adminClient as any).rpc('rpc_reject_quotation_with_reason', {
      p_quotation_id: id,
      p_reason_type: reason_type,
      p_competitor_name: competitor_name || null,
      p_competitor_amount: competitor_amount || null,
      p_customer_budget: customer_budget || null,
      p_currency: currency,
      p_notes: notes || null,
    })

    if (rpcError) {
      console.error('Error rejecting quotation:', rpcError)
      return NextResponse.json({
        success: false,
        error: rpcError.message
      }, { status: 500 })
    }

    if (!result?.success) {
      return NextResponse.json({
        success: false,
        error: result?.error || 'Failed to reject quotation'
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Quotation rejected successfully',
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
