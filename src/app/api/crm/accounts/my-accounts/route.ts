// =====================================================
// API Route: /api/crm/accounts/my-accounts
// Fetch accounts owned by the current user for pipeline creation
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// GET /api/crm/accounts/my-accounts - List accounts owned by user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile for role check
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single() as { data: { role: UserRole } | null }

    const userRole = profile?.role as UserRole | undefined

    // Build query - admin sees all, others see only their accounts
    let query = (adminClient as any)
      .from('accounts')
      .select('account_id, company_name, pic_name, pic_email, pic_phone, industry, account_status, owner_user_id')
      .order('company_name', { ascending: true })

    // Filter by owner unless admin
    if (!isAdmin(userRole)) {
      query = query.eq('owner_user_id', user.id)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching my accounts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
