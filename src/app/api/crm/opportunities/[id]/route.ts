// =====================================================
// API Route: /api/crm/opportunities/[id]
// SOURCE: PDF Section 5 - Opportunity Operations
// Pipeline cycle target: 7 days from Prospecting to Closed
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
export async function PATCH(
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

    const { data, error } = await (supabase as any)
      .from('opportunities' as any as any)
      .update(updateData)
      .eq('opportunity_id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error updating opportunity:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
