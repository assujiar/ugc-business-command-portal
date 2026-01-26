// =====================================================
// API Route: /api/crm/opportunities/[id]
// SOURCE: PDF Section 5 - Opportunity Operations
// Pipeline cycle target: 7 days from Prospecting to Closed
//
// SYNC BEHAVIOR:
// - Stage changes to Closed Won/Lost trigger account status updates
// - Closing syncs to quotations, tickets, and account via DB triggers
// - Additional explicit sync in API for consistency
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStageConfig, calculateNextStepDueDate } from '@/lib/constants'
import type { OpportunityStage } from '@/types/database'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// GET /api/crm/opportunities/[id] - Get single opportunity
export async function GET(
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

    const { data, error } = await (supabase as any)
      .from('opportunities' as any as any)
      .select('*, accounts(company_name, pic_name), profiles!opportunities_owner_user_id_fkey(name, email)')
      .eq('opportunity_id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching opportunity:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/crm/opportunities/[id] - Update opportunity
// Auto-sets next_step_due_date and probability when stage changes
// SYNC: Closing (Won/Lost) triggers account status update and quotation sync
export async function PATCH(
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

    // Get current opportunity to check if stage is changing
    const { data: currentOpp } = await (supabase as any)
      .from('opportunities')
      .select('stage, account_id')
      .eq('opportunity_id', id)
      .single()

    const isClosing = body.stage &&
      (body.stage === 'Closed Won' || body.stage === 'Closed Lost') &&
      currentOpp?.stage !== body.stage

    // Build update data
    const updateData: Record<string, unknown> = {
      ...body,
      updated_at: new Date().toISOString(),
    }

    // If stage is being updated, auto-set next_step_due_date, probability, and next_step
    if (body.stage) {
      const stageConfig = getStageConfig(body.stage as OpportunityStage)
      if (stageConfig) {
        // Calculate next step due date based on stage timeline
        const nextDueDate = calculateNextStepDueDate(body.stage as OpportunityStage)
        updateData.next_step_due_date = nextDueDate.toISOString().split('T')[0]
        updateData.probability = stageConfig.probability

        // Only set next_step if not provided in request
        if (!body.next_step) {
          updateData.next_step = stageConfig.nextStep
        }

        // If closing the opportunity, set closed_at
        if (body.stage === 'Closed Won' || body.stage === 'Closed Lost') {
          updateData.closed_at = new Date().toISOString()
        }
      }
    }

    // Use adminClient for the update to ensure triggers fire with proper permissions
    const { data, error } = await (adminClient as any)
      .from('opportunities')
      .update(updateData)
      .eq('opportunity_id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If closing, explicitly call sync functions for redundancy
    // (DB triggers should handle this, but explicit call ensures consistency)
    let syncResults: { quotation?: unknown; account?: unknown } = {}
    if (isClosing && currentOpp?.account_id) {
      const outcome = body.stage === 'Closed Won' ? 'won' : 'lost'

      // Sync quotations and tickets
      const { data: quotationSync, error: quotationSyncError } = await adminClient.rpc(
        'sync_opportunity_to_quotation',
        { p_opportunity_id: id, p_outcome: outcome }
      )
      if (!quotationSyncError) {
        syncResults.quotation = quotationSync
      }

      // Sync account status
      const { data: accountSync, error: accountSyncError } = await adminClient.rpc(
        'sync_opportunity_to_account',
        { p_opportunity_id: id, p_outcome: outcome }
      )
      if (!accountSyncError) {
        syncResults.account = accountSync
      }
    }

    return NextResponse.json({
      data,
      sync: isClosing ? syncResults : undefined
    })
  } catch (error) {
    console.error('Error updating opportunity:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
