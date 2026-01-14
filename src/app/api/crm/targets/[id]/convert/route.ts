// =====================================================
// API Route: /api/crm/targets/[id]/convert
// SOURCE: PDF Section 7 - Target Conversion Workflow
// Uses RPC for atomic operation
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'
import { generateIdempotencyKey } from '@/lib/utils'

// POST /api/crm/targets/[id]/convert - Convert target to account/opportunity
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
    const { create_opportunity, opportunity_name, idempotency_key } = body

    // Call atomic RPC function
    const { data, error } = await (supabase.rpc as any)('rpc_target_convert', {
      p_target_id: id,
      p_create_opportunity: create_opportunity !== false,
      p_opportunity_name: opportunity_name || null,
      p_idempotency_key: idempotency_key || generateIdempotencyKey('target_convert'),
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error converting target:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
