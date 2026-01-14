// =====================================================
// API Route: /api/crm/leads/[id]/triage
// SOURCE: PDF Section 7 - Lead Triage Workflow
// Uses direct update with fallback (RPC optional)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Database, LeadTriageStatus } from '@/types/database'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

type LeadUpdate = Database['public']['Tables']['leads']['Update']

// POST /api/crm/leads/[id]/triage - Triage lead
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
    const { new_status, notes } = body

    if (!new_status) {
      return NextResponse.json({ error: 'new_status is required' }, { status: 400 })
    }

    // Valid triage statuses
    const validStatuses: LeadTriageStatus[] = ['New', 'In Review', 'Qualified', 'Nurture', 'Disqualified', 'Handed Over']
    if (!validStatuses.includes(new_status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
    }

    // First, get current lead to validate transition
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('lead_id, triage_status')
      .eq('lead_id', id)
      .single()

    if (fetchError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if ((lead as { triage_status: LeadTriageStatus }).triage_status === 'Handed Over') {
      return NextResponse.json({ error: 'Cannot change status of handed over lead' }, { status: 400 })
    }

    // Update lead status
    const updateData: LeadUpdate = {
      triage_status: new_status as LeadTriageStatus,
      updated_at: new Date().toISOString(),
    }

    // Handle disqualification
    if (new_status === 'Disqualified') {
      updateData.disqualified_at = new Date().toISOString()
      if (notes) {
        updateData.disqualification_reason = notes
      }
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update(updateData)
      .eq('lead_id', id)

    if (updateError) {
      console.error('Error updating lead:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // If qualified, create handover pool entry and update to Handed Over
    if (new_status === 'Qualified') {
      // Create handover pool entry
      const { error: poolError } = await supabase
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

      // Update lead to Handed Over
      const handoverUpdate: LeadUpdate = {
        triage_status: 'Handed Over',
        handover_eligible: true,
        updated_at: new Date().toISOString(),
      }
      await supabase
        .from('leads')
        .update(handoverUpdate)
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
