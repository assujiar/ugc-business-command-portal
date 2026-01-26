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

// Valid rejection reason types (must match operational_cost_rejection_reason_type enum)
const validReasonTypes = [
  'harga_terlalu_tinggi',
  'margin_tidak_mencukupi',
  'vendor_tidak_sesuai',
  'waktu_tidak_sesuai',
  'perlu_revisi',
  'other',
]

// POST /api/ticketing/operational-costs/[id]/reject - Reject operational cost with reason
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
      suggested_amount,
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

    // Get operational cost to verify it exists and can be rejected
    const { data: cost } = await (supabase as any)
      .from('ticket_rate_quotes')
      .select('*')
      .eq('id', id)
      .single()

    if (!cost) {
      return NextResponse.json({
        success: false,
        error: 'Operational cost not found'
      }, { status: 404 })
    }

    if (cost.status !== 'sent') {
      return NextResponse.json({
        success: false,
        error: `Operational cost cannot be rejected in current status: ${cost.status}`
      }, { status: 400 })
    }

    // Use admin client to call RPC
    const adminClient = createAdminClient()
    const { data: result, error: rpcError } = await (adminClient as any).rpc('rpc_reject_operational_cost_with_reason', {
      p_cost_id: id,
      p_reason_type: reason_type,
      p_suggested_amount: suggested_amount || null,
      p_currency: currency,
      p_notes: notes || null,
    })

    if (rpcError) {
      console.error('Error rejecting operational cost:', rpcError)
      return NextResponse.json({
        success: false,
        error: rpcError.message
      }, { status: 500 })
    }

    if (!result?.success) {
      return NextResponse.json({
        success: false,
        error: result?.error || 'Failed to reject operational cost'
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Operational cost rejected successfully',
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
