// =====================================================
// API Route: /api/crm/users/sales
// Get sales users for account owner dropdown
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { UserRole } from '@/types/database'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// Sales-related roles that can own accounts
const SALES_ROLES: UserRole[] = [
  'salesperson',
  'sales manager',
  'sales support',
  'Director',
  'super admin'
]

// GET /api/crm/users/sales - Get sales users for dropdown
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all active users who can own accounts (sales roles)
    const { data: users, error } = await (adminClient as any)
      .from('profiles')
      .select('user_id, name, email, role, department')
      .eq('is_active', true)
      .in('role', SALES_ROLES)
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching sales users:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: users || [] })
  } catch (error) {
    console.error('Error fetching sales users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
