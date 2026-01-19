// =====================================================
// API Route: /api/crm/sales-plans/[id]/evidence
// Upload evidence for sales plan realization
// Supports camera and gallery uploads
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addWatermark, isImageFile, type WatermarkData } from '@/lib/watermark'

export const dynamic = 'force-dynamic'

// POST /api/crm/sales-plans/[id]/evidence - Upload evidence file
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const { id } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get existing plan
    const { data: plan, error: planError } = await (adminClient as any)
      .from('sales_plans')
      .select('*, profiles:owner_user_id(name)')
      .eq('plan_id', id)
      .single()

    if (planError || !plan) {
      return NextResponse.json({ error: 'Sales plan not found' }, { status: 404 })
    }

    // Check ownership
    if (plan.owner_user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const formData = await request.formData()
    const evidenceFile = formData.get('evidence') as File | null
    const locationLat = formData.get('location_lat') as string | null
    const locationLng = formData.get('location_lng') as string | null
    const locationAddress = formData.get('location_address') as string | null

    if (!evidenceFile) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const timestamp = Date.now()
    const arrayBuffer = await evidenceFile.arrayBuffer()
    const buffer: Uint8Array = new Uint8Array(arrayBuffer)

    let evidenceUrl: string | null = null
    let evidenceOriginalUrl: string | null = null
    let evidenceFileName: string | null = null

    const salesName = plan.profiles?.name || 'Unknown'
    const updateTime = new Date()

    // Check if it's an image file - apply watermark
    if (isImageFile(evidenceFile.type)) {
      try {
        // First, upload original image (for audit purposes)
        const originalFilePath = `sales-plans/${id}/${timestamp}_original_${evidenceFile.name}`
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
          companyName: plan.company_name,
          pipelineStage: `Sales Plan: ${plan.plan_type}`,
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
        const watermarkedFilePath = `sales-plans/${id}/${timestamp}_${evidenceFile.name}`
        const { error: uploadError } = await adminClient.storage
          .from('attachments')
          .upload(watermarkedFilePath, watermarkedBuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          console.error('Error uploading watermarked evidence:', uploadError)
          evidenceUrl = evidenceOriginalUrl
        } else {
          const { data: signedUrl } = await adminClient.storage
            .from('attachments')
            .createSignedUrl(watermarkedFilePath, 60 * 60 * 24 * 365)
          evidenceUrl = signedUrl?.signedUrl || null
        }

        evidenceFileName = evidenceFile.name
      } catch (watermarkError) {
        console.error('Error processing watermark:', watermarkError)
        // Fallback: upload original image without watermark
        const filePath = `sales-plans/${id}/${timestamp}_${evidenceFile.name}`
        const { error: uploadError } = await adminClient.storage
          .from('attachments')
          .upload(filePath, buffer, {
            contentType: evidenceFile.type,
            upsert: false,
          })

        if (!uploadError) {
          const { data: signedUrl } = await adminClient.storage
            .from('attachments')
            .createSignedUrl(filePath, 60 * 60 * 24 * 365)
          evidenceUrl = signedUrl?.signedUrl || null
        }
        evidenceFileName = evidenceFile.name
      }
    } else {
      // Non-image files - upload as-is
      const filePath = `sales-plans/${id}/${timestamp}_${evidenceFile.name}`

      const { error: uploadError } = await adminClient.storage
        .from('attachments')
        .upload(filePath, buffer, {
          contentType: evidenceFile.type,
          upsert: false,
        })

      if (uploadError) {
        console.error('Error uploading evidence:', uploadError)
        return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
      }

      const { data: signedUrl } = await adminClient.storage
        .from('attachments')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365)

      evidenceUrl = signedUrl?.signedUrl || null
      evidenceFileName = evidenceFile.name
    }

    return NextResponse.json({
      data: {
        evidence_url: evidenceUrl,
        evidence_original_url: evidenceOriginalUrl,
        evidence_file_name: evidenceFileName,
      }
    })
  } catch (error) {
    console.error('Error in POST /api/crm/sales-plans/[id]/evidence:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
