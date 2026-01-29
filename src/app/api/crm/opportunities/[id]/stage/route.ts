// =====================================================
// API Route: /api/crm/opportunities/[id]/stage
// SOURCE: PDF Section 7 - Opportunity Stage Change
// Uses RPC for atomic operation
// UPDATED: Requires lost_reason when closing as lost
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
    const {
      new_stage,
      notes,
      close_reason,
      lost_reason,
      competitor,
      competitor_price,
      idempotency_key
    } = body

    if (!new_stage) {
      return NextResponse.json({ error: 'new_stage is required' }, { status: 400 })
    }

    // ENFORCE: lost_reason is required when closing as lost
    if (new_stage === 'Closed Lost' && !lost_reason) {
      return NextResponse.json(
        { error: 'lost_reason is required when closing an opportunity as lost' },
        { status: 400 }
      )
    }

    // ENFORCE: notes is required when putting on hold
    if (new_stage === 'On Hold' && (!notes || notes.trim() === '')) {
      return NextResponse.json(
        { error: 'Reason (notes) is required when putting an opportunity on hold' },
        { status: 400 }
      )
    }

    // Call atomic RPC function with extended parameters
    const { data, error } = await (supabase.rpc as any)('rpc_opportunity_change_stage', {
      p_opportunity_id: id,
      p_new_stage: new_stage,
      p_notes: notes || null,
      p_close_reason: close_reason || null,
      p_lost_reason: lost_reason || null,
      p_competitor: competitor || null,
      p_competitor_price: competitor_price || null,
      p_idempotency_key: idempotency_key || generateIdempotencyKey('stage'),
    })

    if (error) {
      // Handle the lost_reason requirement error from RPC
      if (error.message && error.message.includes('lost_reason is required')) {
        return NextResponse.json(
          { error: 'Lost reason is required when closing an opportunity as lost' },
          { status: 400 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error changing stage:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
