// =====================================================
// API Route: /api/crm/leads/attachments
// Handle file uploads for shipment attachments
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// POST /api/crm/leads/attachments - Upload attachments for a lead
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const leadId = formData.get('lead_id') as string
    const files = formData.getAll('files') as File[]

    if (!leadId) {
      return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 })
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    // Get shipment detail for this lead
    const { data: shipmentDetail, error: shipmentError } = await (supabase as any)
      .from('shipment_details')
      .select('shipment_detail_id')
      .eq('lead_id', leadId)
      .single()

    if (shipmentError || !shipmentDetail) {
      // Create a shipment detail entry if it doesn't exist
      const { data: newShipment, error: createError } = await (supabase as any)
        .from('shipment_details')
        .insert({
          lead_id: leadId,
          created_by: user.id,
        })
        .select('shipment_detail_id')
        .single()

      if (createError) {
        return NextResponse.json(
          { error: 'Failed to create shipment detail for attachments' },
          { status: 500 }
        )
      }

      var shipmentDetailId = newShipment.shipment_detail_id
    } else {
      var shipmentDetailId = shipmentDetail.shipment_detail_id
    }

    const uploadedFiles = []

    for (const file of files) {
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const filePath = `shipments/${leadId}/${fileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file)

      if (uploadError) {
        console.error('Upload error:', uploadError)
        continue
      }

      // Record in database
      const { data: attachment, error: dbError } = await (supabase as any)
        .from('shipment_attachments')
        .insert({
          shipment_detail_id: shipmentDetailId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          uploaded_by: user.id,
        })
        .select()
        .single()

      if (!dbError && attachment) {
        uploadedFiles.push(attachment)
      }
    }

    return NextResponse.json({
      data: uploadedFiles,
      message: `${uploadedFiles.length} file(s) uploaded successfully`
    }, { status: 201 })
  } catch (error) {
    console.error('Error uploading attachments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/crm/leads/attachments?lead_id=xxx - Get attachments for a lead
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const leadId = searchParams.get('lead_id')

    if (!leadId) {
      return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 })
    }

    // Get shipment detail
    const { data: shipmentDetail } = await (supabase as any)
      .from('shipment_details')
      .select('shipment_detail_id')
      .eq('lead_id', leadId)
      .single()

    if (!shipmentDetail) {
      return NextResponse.json({ data: [] })
    }

    // Get attachments
    const { data: attachments, error } = await (supabase as any)
      .from('shipment_attachments')
      .select('*')
      .eq('shipment_detail_id', shipmentDetail.shipment_detail_id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Generate signed URLs for each attachment
    const attachmentsWithUrls = await Promise.all(
      (attachments || []).map(async (att: any) => {
        const { data: signedUrl } = await supabase.storage
          .from('attachments')
          .createSignedUrl(att.file_path, 3600) // 1 hour expiry

        return {
          ...att,
          url: signedUrl?.signedUrl || null,
        }
      })
    )

    return NextResponse.json({ data: attachmentsWithUrls })
  } catch (error) {
    console.error('Error fetching attachments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
