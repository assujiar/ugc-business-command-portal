// =====================================================
// API Route: /api/crm/accounts/my-accounts
// Get accounts owned by current user for pipeline creation
// =====================================================

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// GET /api/crm/accounts/my-accounts - Get user's accounts
export async function GET() {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to check role
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const profile = profileData as { role: string } | null

    // Admin and managers can see all accounts
    const isManager = profile?.role === 'Director' ||
                      profile?.role === 'super admin' ||
                      profile?.role === 'sales manager'

    let query = (adminClient as any)
      .from('accounts')
      .select('account_id, company_name, account_status, pic_name, pic_email, pic_phone, industry')
      .order('company_name', { ascending: true })

    // Non-managers only see their own accounts
    if (!isManager) {
      query = query.eq('owner_user_id', user.id)
    }

    const { data: accounts, error } = await query

    if (error) {
      console.error('Error fetching accounts:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: accounts || [] })
  } catch (error) {
    console.error('Error fetching my accounts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
