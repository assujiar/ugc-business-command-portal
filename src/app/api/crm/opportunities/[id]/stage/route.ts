// =====================================================
// API Route: /api/crm/opportunities/[id]/stage
// SOURCE: PDF Section 7 - Opportunity Stage Change
// Uses RPC for atomic operation
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'
import { generateIdempotencyKey } from '@/lib/utils'

// POST /api/crm/opportunities/[id]/stage - Change opportunity stage
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { new_stage, notes, close_reason, idempotency_key } = body

    if (!new_stage) {
      return NextResponse.json({ error: 'new_stage is required' }, { status: 400 })
    }

    // Call atomic RPC function
    const { data, error } = await (supabase.rpc as any)('rpc_opportunity_change_stage', {
      p_opportunity_id: id,
      p_new_stage: new_stage,
      p_notes: notes || null,
      p_close_reason: close_reason || null,
      p_idempotency_key: idempotency_key || generateIdempotencyKey('stage'),
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error changing stage:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
