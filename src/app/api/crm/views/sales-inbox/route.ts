// =====================================================
// API Route: /api/crm/views/sales-inbox
// SOURCE: PDF Section 5 - Sales Handover Pool View
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// GET /api/crm/views/sales-inbox - Get sales handover pool
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const { data, count, error } = await (supabase as any)
      .from('v_sales_inbox' as any as any)
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, count })
  } catch (error) {
    console.error('Error fetching sales inbox:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
