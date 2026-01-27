import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ticketing/overview/v2
 *
 * Comprehensive Overview Ticketing V2 API - BUG #11
 *
 * Returns all dashboard data in a single call with role-based scoping.
 *
 * Query params:
 * - period: number of days (default 30)
 *
 * Response sections:
 * - counts_by_type (RFQ/GEN/TOTAL with active/completed/today stats)
 * - status_cards (by status, priority, and type combinations)
 * - response_time_metrics (first response, stage response, distribution)
 * - sla_compliance (first response, first quote, resolution with pending counts)
 * - quotation_analytics (sent/accepted/rejected, values, conversion, rejection reasons)
 * - ops_cost_analytics (submitted/approved/rejected, turnaround, rejection reasons)
 * - leaderboards (by completion, response speed, quotes, win rate)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user profile
    const { data: profileData, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('user_id, role, department')
      .eq('user_id', user.id)
      .single()

    if (profileError || !profileData) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      )
    }

    const profile = profileData as { user_id: string; role: string; department: string | null }

    // Get query params
    const { searchParams } = new URL(request.url)
    const period = parseInt(searchParams.get('period') || '30', 10)

    // Call the comprehensive RPC
    const { data, error } = await (supabase as any).rpc('rpc_ticketing_overview_v2', {
      p_period_days: period,
      p_user_id: profile.user_id,
      p_department: profile.department,
      p_role: profile.role
    })

    if (error) {
      console.error('Error calling rpc_ticketing_overview_v2:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // Check for RPC-level error
    if (data?.error) {
      console.error('RPC error:', data.message)
      return NextResponse.json(
        { success: false, error: data.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (err: any) {
    console.error('Overview V2 API error:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
