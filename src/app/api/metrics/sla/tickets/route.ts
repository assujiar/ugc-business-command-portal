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

// GET /api/metrics/sla/tickets - Get tickets for SLA compliance drill-down
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
    const userId = searchParams.get('user_id')
    const slaType = searchParams.get('sla_type') || 'first_response' // 'first_response', 'stage_response', 'resolution'
    const status = searchParams.get('status') || 'all' // 'met', 'breached', 'all'
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Validate sla_type
    const validSlaTypes = ['first_response', 'stage_response', 'resolution']
    if (!validSlaTypes.includes(slaType)) {
      return NextResponse.json({
        success: false,
        error: `Invalid sla_type: ${slaType}. Valid values are: ${validSlaTypes.join(', ')}`
      }, { status: 400 })
    }

    // Validate status
    const validStatuses = ['met', 'breached', 'all']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({
        success: false,
        error: `Invalid status: ${status}. Valid values are: ${validStatuses.join(', ')}`
      }, { status: 400 })
    }

    // Only admins and managers can view metrics for other users
    const canViewAll = canViewAllTickets(profileData.role) || isAdmin(profileData.role)
    const effectiveUserId = canViewAll ? userId : user.id

    // Use admin client to call RPC
    const adminClient = createAdminClient()
    const { data: result, error: rpcError } = await (adminClient as any).rpc('rpc_get_sla_compliance_tickets', {
      p_user_id: effectiveUserId || null,
      p_sla_type: slaType,
      p_status: status,
      p_limit: limit,
      p_offset: offset,
    })

    if (rpcError) {
      console.error('Error fetching SLA compliance tickets:', rpcError)
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
