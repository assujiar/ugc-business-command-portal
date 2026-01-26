import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, isAdmin, canViewAllTickets } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
}

// GET /api/ticketing/analytics/cost-rejections - Get operational cost rejection analytics
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

    // Only admins and managers can view analytics
    if (!canViewAllTickets(profileData.role) && !isAdmin(profileData.role)) {
      return NextResponse.json({ error: 'Access denied - requires manager or admin role' }, { status: 403 })
    }

    // Fetch from the analytics view
    const { data, error } = await (supabase as any)
      .from('vw_operational_cost_rejection_analytics')
      .select('*')
      .order('month', { ascending: false })

    if (error) {
      console.error('Error fetching cost rejection analytics:', error)
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
