// =====================================================
// API Route: /api/crm/pipeline/update
// Pipeline Update with Evidence Upload
// Creates activity record and updates account status
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// POST /api/crm/pipeline/update - Update pipeline with evidence
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const opportunityId = formData.get('opportunity_id') as string
    const newStage = formData.get('new_stage') as string
    const approachMethod = formData.get('approach_method') as string
    const notes = formData.get('notes') as string
    const locationAddress = formData.get('location_address') as string
    const lostReason = formData.get('lost_reason') as string | null
    const competitorPrice = formData.get('competitor_price') as string | null
    const customerBudget = formData.get('customer_budget') as string | null
    const evidenceFile = formData.get('evidence') as File | null

    if (!opportunityId || !newStage || !approachMethod) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get current opportunity
    const { data: opportunity, error: oppError } = await (adminClient as any)
      .from('opportunities')
      .select('*, accounts(account_id, account_status)')
      .eq('opportunity_id', opportunityId)
      .single() as { data: any; error: any }

    if (oppError || !opportunity) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })
    }

    const oldStage = opportunity.stage
    let evidenceUrl: string | null = null
    let evidenceFileName: string | null = null

    // 1. Upload evidence file if provided
    if (evidenceFile) {
      const timestamp = Date.now()
      const fileName = `${timestamp}_${evidenceFile.name}`
      const filePath = `evidence/${opportunityId}/${fileName}`

      const arrayBuffer = await evidenceFile.arrayBuffer()
      const buffer = new Uint8Array(arrayBuffer)

      const { error: uploadError } = await adminClient.storage
        .from('attachments')
        .upload(filePath, buffer, {
          contentType: evidenceFile.type,
          upsert: false,
        })

      if (uploadError) {
        console.error('Error uploading evidence:', uploadError)
        // Continue without evidence if upload fails
      } else {
        const { data: signedUrl } = await adminClient.storage
          .from('attachments')
          .createSignedUrl(filePath, 60 * 60 * 24 * 365) // 1 year

        evidenceUrl = signedUrl?.signedUrl || null
        evidenceFileName = evidenceFile.name
      }
    }

    // 2. Create pipeline update record
    const updateData = {
      opportunity_id: opportunityId,
      old_stage: oldStage,
      new_stage: newStage,
      approach_method: approachMethod,
      notes: notes || null,
      evidence_url: evidenceUrl,
      evidence_file_name: evidenceFileName,
      location_address: locationAddress || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }

    const { error: pipelineUpdateError } = await (adminClient as any)
      .from('pipeline_updates')
      .insert(updateData)

    if (pipelineUpdateError) {
      console.error('Error creating pipeline update:', pipelineUpdateError)
    }

    // 3. Update opportunity
    const oppUpdateData: Record<string, unknown> = {
      stage: newStage,
      updated_at: new Date().toISOString(),
    }

    if (newStage === 'Closed Won' || newStage === 'Closed Lost') {
      oppUpdateData.closed_at = new Date().toISOString()
    }

    if (newStage === 'Closed Lost' && lostReason) {
      oppUpdateData.lost_reason = lostReason
      oppUpdateData.close_reason = lostReason
      if (competitorPrice) oppUpdateData.competitor_price = parseFloat(competitorPrice)
      if (customerBudget) oppUpdateData.customer_budget = parseFloat(customerBudget)
    }

    const { error: oppUpdateError } = await (adminClient as any)
      .from('opportunities')
      .update(oppUpdateData)
      .eq('opportunity_id', opportunityId)

    if (oppUpdateError) {
      console.error('Error updating opportunity:', oppUpdateError)
      return NextResponse.json({ error: 'Failed to update opportunity' }, { status: 500 })
    }

    // 4. Create activity record with completed status
    const activityData = {
      activity_type: approachMethod,
      subject: `Pipeline Update: ${oldStage} → ${newStage}`,
      description: notes || `Pipeline updated from ${oldStage} to ${newStage}`,
      outcome: `Completed via ${approachMethod}`,
      status: 'Done',
      due_date: new Date().toISOString().split('T')[0],
      completed_at: new Date().toISOString(),
      related_opportunity_id: opportunityId,
      related_account_id: opportunity.account_id,
      owner_user_id: user.id,
      assigned_to: user.id,
      created_by: user.id,
    }

    const { error: activityError } = await (adminClient as any)
      .from('activities')
      .insert(activityData)

    if (activityError) {
      console.error('Error creating activity:', activityError)
    }

    // 5. Update account status based on pipeline outcome
    if (opportunity.account_id) {
      let newAccountStatus: string | null = null

      if (newStage === 'Closed Won') {
        // Pipeline won - account becomes new_account
        newAccountStatus = 'new_account'

        const { error: accountUpdateError } = await (adminClient as any)
          .from('accounts')
          .update({
            account_status: newAccountStatus,
            first_transaction_date: new Date().toISOString(),
            last_transaction_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('account_id', opportunity.account_id)

        if (accountUpdateError) {
          console.error('Error updating account status:', accountUpdateError)
        }
      } else if (newStage === 'Closed Lost') {
        // Pipeline lost - account becomes failed_account
        newAccountStatus = 'failed_account'

        const { error: accountUpdateError } = await (adminClient as any)
          .from('accounts')
          .update({
            account_status: newAccountStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('account_id', opportunity.account_id)

        if (accountUpdateError) {
          console.error('Error updating account status:', accountUpdateError)
        }
      }
    }

    // 6. Create stage history record
    const { error: historyError } = await (adminClient as any)
      .from('opportunity_stage_history')
      .insert({
        opportunity_id: opportunityId,
        old_stage: oldStage,
        new_stage: newStage,
        changed_by: user.id,
        notes: notes || null,
      })

    if (historyError) {
      console.error('Error creating stage history:', historyError)
    }

    return NextResponse.json({
      data: {
        success: true,
        opportunity_id: opportunityId,
        old_stage: oldStage,
        new_stage: newStage,
        evidence_url: evidenceUrl,
      }
    })
  } catch (error) {
    console.error('Error updating pipeline:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
