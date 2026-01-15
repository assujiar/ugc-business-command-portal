// =====================================================
// API Route: /api/crm/pipeline/update
// Pipeline Update with Evidence Upload + Watermarking
// Creates activity record and updates account status
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Dynamic import for watermark to avoid serverless issues with sharp
let addWatermark: ((buffer: Buffer | Uint8Array, data: any) => Promise<Uint8Array>) | null = null
let isImageFile: ((mimeType: string) => boolean) | null = null

// Try to load watermark module (may fail on some serverless environments)
try {
  const watermarkModule = require('@/lib/watermark')
  addWatermark = watermarkModule.addWatermark
  isImageFile = watermarkModule.isImageFile
} catch (e) {
  console.warn('Watermark module not available, watermarking disabled')
}

// Fallback isImageFile function
const checkIsImageFile = (mimeType: string): boolean => {
  if (isImageFile) return isImageFile(mimeType)
  return mimeType.startsWith('image/')
}

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

    // 1. Upload evidence file if provided (with watermark for images)
    if (evidenceFile) {
      const timestamp = Date.now()
      const fileExtension = evidenceFile.name.split('.').pop()
      const baseFileName = evidenceFile.name.replace(/\.[^/.]+$/, '')
      const originalFileName = `${timestamp}_original_${evidenceFile.name}`
      const watermarkedFileName = `${timestamp}_${baseFileName}_watermarked.jpg`

      const arrayBuffer = await evidenceFile.arrayBuffer()
      let buffer: Uint8Array = new Uint8Array(arrayBuffer)

      // Check if it's an image file
      if (checkIsImageFile(evidenceFile.type)) {
        // Upload original file first (for audit purposes)
        const originalFilePath = `evidence/${opportunityId}/${originalFileName}`
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

        // Add watermark to image (if watermark module is available)
        if (addWatermark) {
          const watermarkData = {
            updateTime,
            companyName,
            pipelineStage: newStage,
            salesName,
            location: {
              lat: locationLat ? parseFloat(locationLat) : null,
              lng: locationLng ? parseFloat(locationLng) : null,
              address: locationAddress || null,
            },
          }

          try {
            buffer = await addWatermark(buffer, watermarkData)
          } catch (err) {
            console.error('Watermark failed, using original:', err)
          }
        }

        // Upload watermarked image
        const watermarkedFilePath = `evidence/${opportunityId}/${watermarkedFileName}`
        const { error: uploadError } = await adminClient.storage
          .from('attachments')
          .upload(watermarkedFilePath, buffer, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          console.error('Error uploading watermarked evidence:', uploadError)
        } else {
          const { data: signedUrl } = await adminClient.storage
            .from('attachments')
            .createSignedUrl(watermarkedFilePath, 60 * 60 * 24 * 365) // 1 year

          evidenceUrl = signedUrl?.signedUrl || null
          evidenceFileName = `${baseFileName}_watermarked.jpg`
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
            first_transaction_date: updateTime.toISOString(),
            last_transaction_date: updateTime.toISOString(),
            updated_at: updateTime.toISOString(),
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
            updated_at: updateTime.toISOString(),
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
        evidence_original_url: evidenceOriginalUrl,
      }
    })
  } catch (error) {
    console.error('Error updating pipeline:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
