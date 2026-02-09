// =====================================================
// API Route: /api/crm/accounts
// SOURCE: PDF Section 5 - Account Operations
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyAccountAgingToList } from '@/lib/account-status'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// GET /api/crm/accounts - List accounts
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')
    const owner = searchParams.get('owner')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('accounts' as any as any)
      .select('*, profiles!accounts_owner_user_id_fkey(name)', { count: 'exact' })
      .order('company_name', { ascending: true })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.ilike('company_name', `%${search}%`)
    }

    if (owner) {
      query = query.eq('owner_user_id', owner)
    }

    const { data, count, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Apply aging-based status computation (new→active, idle→passive/lost)
    const accountsWithAging = applyAccountAgingToList(data || [])

    return NextResponse.json({ data: accountsWithAging, count })
  } catch (error) {
    console.error('Error fetching accounts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/crm/accounts - Create account
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Allowlist fields to prevent injection of sensitive columns
    const allowedFields = [
      'company_name', 'industry', 'pic_name', 'pic_email', 'pic_phone',
      'address', 'city', 'province', 'postal_code', 'country', 'phone',
      'domain', 'npwp', 'notes', 'account_status',
    ]
    const insertData: Record<string, unknown> = {
      owner_user_id: body.owner_user_id || user.id,
      created_by: user.id,
    }
    for (const key of allowedFields) {
      if (body[key] !== undefined) insertData[key] = body[key]
    }

    const { data, error } = await (supabase as any)
      .from('accounts' as any as any)
      .insert(insertData)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('Error creating account:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
