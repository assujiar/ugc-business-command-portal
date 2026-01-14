// =====================================================
// API Route: /api/crm/leads/[id]/triage
// SOURCE: PDF Section 7 - Lead Triage Workflow
// Uses direct update with fallback (RPC optional)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// Valid triage statuses
const VALID_STATUSES = ['New', 'In Review', 'Qualified', 'Nurture', 'Disqualified', 'Handed Over'] as const

// POST /api/crm/leads/[id]/triage - Triage lead
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { new_status, notes } = body

    if (!new_status) {
      return NextResponse.json({ error: 'new_status is required' }, { status: 400 })
    }

    if (!VALID_STATUSES.includes(new_status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
    }

    // First, get current lead to validate transition (use admin client to bypass RLS)
    const { data: lead, error: fetchError } = await adminClient
      .from('leads')
      .select('lead_id, triage_status')
      .eq('lead_id', id)
      .single()

    if (fetchError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((lead as any).triage_status === 'Handed Over') {
      return NextResponse.json({ error: 'Cannot change status of handed over lead' }, { status: 400 })
    }

    // Build update data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {
      triage_status: new_status,
      updated_at: new Date().toISOString(),
    }

    // Handle disqualification
    if (new_status === 'Disqualified') {
      updateData.disqualified_at = new Date().toISOString()
      if (notes) {
        updateData.disqualification_reason = notes
      }
    }

    // Use admin client to bypass RLS for the update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (adminClient as any)
      .from('leads')
      .update(updateData)
      .eq('lead_id', id)

    if (updateError) {
      console.error('Error updating lead:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // If qualified, create handover pool entry and update to Handed Over
    if (new_status === 'Qualified') {
      // Create handover pool entry using admin client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: poolError } = await (adminClient as any)
        .from('lead_handover_pool')
        .insert({
          lead_id: id,
          handed_over_by: user.id,
          handover_notes: notes || null,
          priority: 1,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        })

      if (poolError) {
        // If duplicate key error, lead already in pool - that's ok
        if (!poolError.message.includes('duplicate')) {
          console.error('Error creating handover pool entry:', poolError)
        }
      }

      // Update lead to Handed Over using admin client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adminClient as any)
        .from('leads')
        .update({
          triage_status: 'Handed Over',
          handover_eligible: true,
          updated_at: new Date().toISOString(),
        })
        .eq('lead_id', id)
    }

    return NextResponse.json({
      data: {
        success: true,
        lead_id: id,
        new_status: new_status === 'Qualified' ? 'Handed Over' : new_status,
      }
    })
  } catch (error) {
    console.error('Error triaging lead:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
