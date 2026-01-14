// =====================================================
// API Route: /api/crm/leads/[id]/convert
// SOURCE: PDF Section 7 - Lead Conversion Workflow
// Uses RPC for atomic operation
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateIdempotencyKey } from '@/lib/utils'

// POST /api/crm/leads/[id]/convert - Convert lead to opportunity
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
    const { opportunity_name, estimated_value, idempotency_key } = body

    if (!opportunity_name) {
      return NextResponse.json({ error: 'opportunity_name is required' }, { status: 400 })
    }

    // Call atomic RPC function
    const { data, error } = await (supabase.rpc as any)('rpc_lead_convert', {
      p_lead_id: id,
      p_opportunity_name: opportunity_name,
      p_estimated_value: estimated_value || null,
      p_idempotency_key: idempotency_key || generateIdempotencyKey('convert'),
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error converting lead:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
