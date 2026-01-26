import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessTicketing, isAdmin, canViewAllTickets } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
}

// GET /api/metrics/sla - Get SLA metrics
export async function GET(request: NextRequest) {
  try {
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

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const department = searchParams.get('department')
    const userId = searchParams.get('user_id')
    const ticketType = searchParams.get('ticket_type')

    // Only admins and managers can view metrics for other users/departments
    const canViewAll = canViewAllTickets(profileData.role) || isAdmin(profileData.role)
    const effectiveUserId = canViewAll ? userId : user.id

    // Use admin client to call RPC
    const adminClient = createAdminClient()
    const { data: result, error: rpcError } = await (adminClient as any).rpc('rpc_get_sla_metrics', {
      p_start_date: startDate || null,
      p_end_date: endDate || null,
      p_department: department || null,
      p_user_id: effectiveUserId || null,
      p_ticket_type: ticketType || null,
    })

    if (rpcError) {
      console.error('Error fetching SLA metrics:', rpcError)
      return NextResponse.json({
        success: false,
        error: rpcError.message
      }, { status: 500 })
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
