// =====================================================
// API Route: /api/crm/opportunities
// SOURCE: PDF Section 5 - Opportunity Operations
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// GET /api/crm/opportunities - List opportunities
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const stage = searchParams.get('stage')
    const owner = searchParams.get('owner')
    const originalCreator = searchParams.get('original_creator_id')  // For marketing visibility filter
    const sourceLeadId = searchParams.get('source_lead_id')  // For listing opportunities from a lead
    const accountId = searchParams.get('account_id')  // For listing opportunities from an account
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('opportunities' as any as any)
      .select('*, accounts(company_name), profiles!opportunities_owner_user_id_fkey(name)', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (stage) {
      query = query.eq('stage', stage)
    }

    if (owner) {
      query = query.eq('owner_user_id', owner)
    }

    // Marketing visibility: filter by original_creator_id
    if (originalCreator) {
      query = query.eq('original_creator_id', originalCreator)
    }

    // Filter by source lead
    if (sourceLeadId) {
      query = query.eq('source_lead_id', sourceLeadId)
    }

    // Filter by account
    if (accountId) {
      query = query.eq('account_id', accountId)
    }

    const { data, count, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, count })
  } catch (error) {
    console.error('Error fetching opportunities:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/crm/opportunities - Create opportunity
// Sets original_creator_id from account for marketing visibility tracking
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Determine original_creator_id for marketing visibility
    // Priority: body.original_creator_id > account.original_creator_id > account.created_by > user.id
    let originalCreatorId = body.original_creator_id || null

    if (!originalCreatorId && body.account_id) {
      // Fetch account to get original_creator_id
      const { data: account } = await (supabase as any)
        .from('accounts')
        .select('original_creator_id, created_by')
        .eq('account_id', body.account_id)
        .single()

      if (account) {
        originalCreatorId = account.original_creator_id || account.created_by
      }
    }

    // If still no original_creator_id, use current user (for self-created pipelines)
    if (!originalCreatorId) {
      originalCreatorId = user.id
    }

    const { data, error } = await (supabase as any)
      .from('opportunities' as any as any)
      .insert({
        ...body,
        owner_user_id: body.owner_user_id || user.id,
        created_by: user.id,
        original_creator_id: originalCreatorId,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('Error creating opportunity:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
