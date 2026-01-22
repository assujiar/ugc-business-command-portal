// =====================================================
// API Route: /api/crm/leads/[id]/handover
// SOURCE: PDF Section 7 - Lead Handover Workflow
// Uses RPC for atomic operation
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'
import { generateIdempotencyKey } from '@/lib/utils'
import { sendNewLeadAssignmentEmail } from '@/lib/crm-notification-service'

// POST /api/crm/leads/[id]/handover - Handover lead to sales pool
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
    const { notes, priority, idempotency_key } = body

    // Call atomic RPC function
    const { data, error } = await (supabase.rpc as any)('rpc_lead_handover_to_sales_pool', {
      p_lead_id: id,
      p_notes: notes || null,
      p_priority: priority || 1,
      p_idempotency_key: idempotency_key || generateIdempotencyKey('handover'),
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Send email notification to all salespersons about the new lead
    // This is done asynchronously to not block the response
    sendNewLeadAssignmentEmail(id, user.id)
      .then(result => {
        if (result.success) {
          console.log(`[Lead Handover] Email notification sent for lead ${id}`)
        } else {
          console.error(`[Lead Handover] Failed to send email notification for lead ${id}:`, result.error)
        }
      })
      .catch(err => {
        console.error(`[Lead Handover] Error sending email notification for lead ${id}:`, err)
      })

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error handing over lead:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
