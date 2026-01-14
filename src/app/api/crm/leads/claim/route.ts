// =====================================================
// API Route: /api/crm/leads/claim
// SOURCE: PDF Section 7 - Lead Claim Workflow
// Uses RPC for atomic + race-safe operation
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'
import { generateIdempotencyKey } from '@/lib/utils'

// POST /api/crm/leads/claim - Claim lead from pool (race-safe)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { pool_id, create_account, create_opportunity, idempotency_key } = body

    if (!pool_id) {
      return NextResponse.json({ error: 'pool_id is required' }, { status: 400 })
    }

    // Call atomic + race-safe RPC function
    const { data, error } = await (supabase.rpc as any)('rpc_sales_claim_lead', {
      p_pool_id: pool_id,
      p_create_account: create_account !== false,
      p_create_opportunity: create_opportunity === true,
      p_idempotency_key: idempotency_key || generateIdempotencyKey('claim'),
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error claiming lead:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
