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

// Valid triage statuses - no Handed Over, use 'Assign to Sales'
const VALID_STATUSES = ['New', 'In Review', 'Qualified', 'Nurture', 'Disqualified', 'Assign to Sales'] as const

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
    const { new_status, notes, potential_revenue } = body

    if (!new_status) {
      return NextResponse.json({ error: 'new_status is required' }, { status: 400 })
    }

    if (!VALID_STATUSES.includes(new_status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
    }

    // First, get current lead to validate transition (use admin client to bypass RLS)
    // Also fetch potential_revenue to use as fallback for 'Assign to Sales'
    const { data: lead, error: fetchError } = await adminClient
      .from('leads')
      .select('lead_id, triage_status, potential_revenue')
      .eq('lead_id', id)
      .single()

    if (fetchError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((lead as any).triage_status === 'Assign to Sales') {
      return NextResponse.json({ error: 'Cannot change status of lead already assigned to sales' }, { status: 400 })
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

    // Handle Assign to Sales - requires potential_revenue
    // This creates entry in lead_handover_pool for sales to claim
    if (new_status === 'Assign to Sales') {
      // Use request potential_revenue, or fallback to existing lead.potential_revenue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingPotentialRevenue = (lead as any).potential_revenue
      const effectivePotentialRevenue = potential_revenue || existingPotentialRevenue

      if (!effectivePotentialRevenue || effectivePotentialRevenue <= 0) {
        return NextResponse.json({
          error: 'potential_revenue is required for Assign to Sales status. Please provide a value greater than 0.',
          error_code: 'MISSING_POTENTIAL_REVENUE'
        }, { status: 400 })
      }
      updateData.potential_revenue = effectivePotentialRevenue
      updateData.claim_status = 'unclaimed'
      updateData.qualified_at = new Date().toISOString()
      updateData.handover_eligible = true
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

    // If Assign to Sales, create handover pool entry for sales inbox/lead bidding
    if (new_status === 'Assign to Sales') {
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
    }

    // Note: Qualified status stays as Qualified - NO auto-transition
    // Assign to Sales is done manually via separate button action

    return NextResponse.json({
      data: {
        success: true,
        lead_id: id,
        new_status: new_status,
      }
    })
  } catch (error) {
    console.error('Error triaging lead:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
