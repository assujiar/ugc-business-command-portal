// =====================================================
// API Route: /api/crm/activities/[id]/complete
// SOURCE: PDF Section 7 - Activity Complete Workflow
// Uses RPC for atomic operation with optional follow-up
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateIdempotencyKey } from '@/lib/utils'

// POST /api/crm/activities/[id]/complete - Complete activity
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
    const {
      outcome,
      create_follow_up,
      follow_up_days,
      follow_up_type,
      follow_up_subject,
      idempotency_key,
    } = body

    // Call atomic RPC function
    const { data, error } = await (supabase.rpc as any)('rpc_activity_complete_and_next', {
      p_activity_id: id,
      p_outcome: outcome || null,
      p_create_follow_up: create_follow_up === true,
      p_follow_up_days: follow_up_days || 7,
      p_follow_up_type: follow_up_type || 'Task',
      p_follow_up_subject: follow_up_subject || null,
      p_idempotency_key: idempotency_key || generateIdempotencyKey('complete'),
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error completing activity:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
