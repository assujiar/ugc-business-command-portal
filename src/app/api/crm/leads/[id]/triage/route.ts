// =====================================================
// API Route: /api/crm/leads/[id]/triage
// SOURCE: PDF Section 7 - Lead Triage Workflow
// Uses RPC for atomic operation
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'
import { generateIdempotencyKey } from '@/lib/utils'

// POST /api/crm/leads/[id]/triage - Triage lead (atomic)
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
    const { new_status, notes, idempotency_key } = body

    if (!new_status) {
      return NextResponse.json({ error: 'new_status is required' }, { status: 400 })
    }

    // Call atomic RPC function
    const { data, error } = await (supabase.rpc as any)('rpc_lead_triage', {
      p_lead_id: id,
      p_new_status: new_status,
      p_notes: notes || null,
      p_idempotency_key: idempotency_key || generateIdempotencyKey('triage'),
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error triaging lead:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
