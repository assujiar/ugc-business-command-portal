// =====================================================
// API Route: /api/crm/pipeline/update
// Pipeline Update with Evidence Upload + Watermarking
// Creates activity record and updates account status
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addWatermark, isImageFile, type WatermarkData } from '@/lib/watermark'

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
    const locationLat = formData.get('location_lat') as string | null
    const locationLng = formData.get('location_lng') as string | null
    const locationAddress = formData.get('location_address') as string
    const lostReason = formData.get('lost_reason') as string | null
    const competitorPrice = formData.get('competitor_price') as string | null
    const customerBudget = formData.get('customer_budget') as string | null
    const evidenceFile = formData.get('evidence') as File | null

    if (!opportunityId || !newStage || !approachMethod) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate On Hold requires notes (reason)
    if (newStage === 'On Hold' && (!notes || notes.trim() === '')) {
      return NextResponse.json({ error: 'Reason (notes) is required when putting an opportunity on hold' }, { status: 400 })
    }

    // Get current opportunity with account info for watermark
    // Note: leads join won't work with source_lead_id, need to fetch separately
    const { data: opportunity, error: oppError } = await (adminClient as any)
      .from('opportunities')
      .select(`
        *,
        accounts(account_id, account_status, company_name)
      `)
      .eq('opportunity_id', opportunityId)
      .single() as { data: any; error: any }

    if (oppError || !opportunity) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })
    }

    // Get lead info separately using source_lead_id (for company name in watermark)
    let leadCompanyName: string | null = null
    if (opportunity.source_lead_id) {
      const { data: leadData } = await (adminClient as any)
        .from('leads')
        .select('company_name')
        .eq('lead_id', opportunity.source_lead_id)
        .single()
      leadCompanyName = leadData?.company_name || null
    }

    // Get sales user profile for watermark
    const { data: salesProfile } = await supabase
      .from('profiles')
      .select('name')
      .eq('user_id', user.id)
      .single()

    const oldStage = opportunity.stage
    const companyName = opportunity.accounts?.company_name || leadCompanyName || opportunity.name
    const salesName = (salesProfile as { name: string } | null)?.name || 'Unknown'
    const updateTime = new Date()

    let evidenceUrl: string | null = null
    let evidenceOriginalUrl: string | null = null
    let evidenceFileName: string | null = null

    // 1. Upload evidence file if provided
    if (evidenceFile) {
      const timestamp = Date.now()
      const arrayBuffer = await evidenceFile.arrayBuffer()
      const buffer: Uint8Array = new Uint8Array(arrayBuffer)

      // Check if it's an image file - apply watermark
      if (isImageFile(evidenceFile.type)) {
        try {
          // First, upload original image (for audit purposes)
          const originalFilePath = `evidence/${opportunityId}/${timestamp}_original_${evidenceFile.name}`
          const { error: originalUploadError } = await adminClient.storage
            .from('attachments')
            .upload(originalFilePath, buffer, {
              contentType: evidenceFile.type,
              upsert: false,
            })

          if (!originalUploadError) {
            const { data: originalSignedUrl } = await adminClient.storage
              .from('attachments')
              .createSignedUrl(originalFilePath, 60 * 60 * 24 * 365) // 1 year
            evidenceOriginalUrl = originalSignedUrl?.signedUrl || null
          }

          // Prepare watermark data
          const watermarkData: WatermarkData = {
            updateTime: updateTime,
            companyName: companyName,
            pipelineStage: newStage,
            salesName: salesName,
            location: {
              lat: locationLat ? parseFloat(locationLat) : null,
              lng: locationLng ? parseFloat(locationLng) : null,
              address: locationAddress || null,
            },
          }

          // Apply watermark to image
          const watermarkedBuffer = await addWatermark(buffer, watermarkData)

          // Upload watermarked image
          const watermarkedFilePath = `evidence/${opportunityId}/${timestamp}_${evidenceFile.name}`
          const { error: uploadError } = await adminClient.storage
            .from('attachments')
            .upload(watermarkedFilePath, watermarkedBuffer, {
              contentType: 'image/jpeg', // Watermarked images are converted to JPEG
              upsert: false,
            })

          if (uploadError) {
            console.error('Error uploading watermarked evidence:', uploadError)
            // Fallback: use original URL if watermarked upload fails
            evidenceUrl = evidenceOriginalUrl
          } else {
            const { data: signedUrl } = await adminClient.storage
              .from('attachments')
              .createSignedUrl(watermarkedFilePath, 60 * 60 * 24 * 365) // 1 year
            evidenceUrl = signedUrl?.signedUrl || null
          }

          evidenceFileName = evidenceFile.name
        } catch (watermarkError) {
          console.error('Error processing watermark:', watermarkError)
          // Fallback: upload original image without watermark
          const filePath = `evidence/${opportunityId}/${timestamp}_${evidenceFile.name}`
          const { error: uploadError } = await adminClient.storage
            .from('attachments')
            .upload(filePath, buffer, {
              contentType: evidenceFile.type,
              upsert: false,
            })

          if (!uploadError) {
            const { data: signedUrl } = await adminClient.storage
              .from('attachments')
              .createSignedUrl(filePath, 60 * 60 * 24 * 365) // 1 year
            evidenceUrl = signedUrl?.signedUrl || null
          }
          evidenceFileName = evidenceFile.name
        }
      } else {
        // Non-image files - upload as-is
        const filePath = `evidence/${opportunityId}/${timestamp}_${evidenceFile.name}`

        const { error: uploadError } = await adminClient.storage
          .from('attachments')
          .upload(filePath, buffer, {
            contentType: evidenceFile.type,
            upsert: false,
          })

        if (uploadError) {
          console.error('Error uploading evidence:', uploadError)
        } else {
          const { data: signedUrl } = await adminClient.storage
            .from('attachments')
            .createSignedUrl(filePath, 60 * 60 * 24 * 365) // 1 year

          evidenceUrl = signedUrl?.signedUrl || null
          evidenceFileName = evidenceFile.name
        }
      }
    }

    // 2. Create pipeline update record
    const updateData: Record<string, unknown> = {
      opportunity_id: opportunityId,
      old_stage: oldStage,
      new_stage: newStage,
      approach_method: approachMethod,
      notes: notes || null,
      evidence_url: evidenceUrl,
      evidence_file_name: evidenceFileName,
      location_lat: locationLat ? parseFloat(locationLat) : null,
      location_lng: locationLng ? parseFloat(locationLng) : null,
      location_address: locationAddress || null,
      updated_by: user.id,
      updated_at: updateTime.toISOString(),
    }

    // Add original URL if we have a watermarked image
    if (evidenceOriginalUrl) {
      updateData.evidence_original_url = evidenceOriginalUrl
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
      updated_at: updateTime.toISOString(),
    }

    if (newStage === 'Closed Won' || newStage === 'Closed Lost') {
      oppUpdateData.closed_at = updateTime.toISOString()
    }

    if (newStage === 'Closed Lost' && lostReason) {
      oppUpdateData.lost_reason = lostReason
      oppUpdateData.outcome = lostReason // Column is "outcome" not "close_reason"
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
      due_date: updateTime.toISOString().split('T')[0],
      completed_at: updateTime.toISOString(),
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

    // 5. Account status is handled by the database trigger
    // trigger_sync_quotation_on_opportunity_close fires on opportunity stage change
    // and calls sync_opportunity_to_account which handles:
    // - Closed Won: calon/failed → new_account (with transaction dates)
    // - Closed Won: existing accounts → update last_transaction_date only
    // - Closed Lost: calon → failed (only if no existing Closed Won opportunities)
    // No direct account_status update needed here to avoid double-update conflicts.

    // 6. Create stage history record
    // Note: The table originally has from_stage/to_stage columns.
    // Migration 023 adds old_stage/new_stage columns.
    // Try with all columns first, fallback to original columns only if it fails.
    let historyError = null

    // First try: Insert with all columns (works if migration 023 has been run)
    const { error: historyError1 } = await (adminClient as any)
      .from('opportunity_stage_history')
      .insert({
        opportunity_id: opportunityId,
        from_stage: oldStage,
        to_stage: newStage,
        old_stage: oldStage,
        new_stage: newStage,
        changed_by: user.id,
        notes: notes || null,
      })

    if (historyError1) {
      console.error('Stage history insert (attempt 1 - all columns):', historyError1)

      // Fallback: Try with original columns only (works before migration 023)
      const { error: historyError2 } = await (adminClient as any)
        .from('opportunity_stage_history')
        .insert({
          opportunity_id: opportunityId,
          from_stage: oldStage,
          to_stage: newStage,
          changed_by: user.id,
          notes: notes || null,
        })

      if (historyError2) {
        console.error('Stage history insert (attempt 2 - original columns):', historyError2)
        historyError = historyError2
      }
    }

    if (historyError) {
      console.error('Error creating stage history (all attempts failed):', historyError)
    }

    // 7. Sync tickets when pipeline is Closed Lost or On Hold
    let ticketsSynced = 0
    if (newStage === 'Closed Lost' || newStage === 'On Hold') {
      // Build close reason
      let closeReason = newStage === 'Closed Lost'
        ? `Pipeline closed as lost. Reason: ${lostReason || 'Not specified'}`
        : `Pipeline put on hold. Reason: ${notes || 'Not specified'}`

      // Close all linked tickets
      const { data: linkedTickets, error: ticketsQueryError } = await (adminClient as any)
        .from('tickets')
        .select('id, ticket_code, status')
        .eq('opportunity_id', opportunityId)
        .not('status', 'in', '("closed","resolved")')

      if (!ticketsQueryError && linkedTickets && linkedTickets.length > 0) {
        for (const ticket of linkedTickets) {
          const { error: ticketUpdateError } = await (adminClient as any)
            .from('tickets')
            .update({
              status: 'closed',
              close_outcome: 'lost',
              close_reason: closeReason,
              closed_at: updateTime.toISOString(),
              resolved_at: updateTime.toISOString(),
              updated_at: updateTime.toISOString(),
            })
            .eq('id', ticket.id)

          if (!ticketUpdateError) {
            ticketsSynced++

            // Create ticket event for audit trail
            await (adminClient as any)
              .from('ticket_events')
              .insert({
                ticket_id: ticket.id,
                event_type: 'status_change',
                actor_user_id: user.id,
                old_value: { status: ticket.status },
                new_value: { status: 'closed', close_outcome: 'lost' },
                notes: `Auto-closed due to pipeline ${newStage}. ${closeReason}`,
              })
          } else {
            console.error('Error updating ticket:', ticket.id, ticketUpdateError)
          }
        }
      }
    }

    return NextResponse.json({
      data: {
        success: true,
        opportunity_id: opportunityId,
        old_stage: oldStage,
        new_stage: newStage,
        evidence_url: evidenceUrl,
        evidence_original_url: evidenceOriginalUrl,
        tickets_synced: ticketsSynced,
      }
    })
  } catch (error) {
    console.error('Error updating pipeline:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
