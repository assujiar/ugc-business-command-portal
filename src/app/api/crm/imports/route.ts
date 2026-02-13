// =====================================================
// API Route: /api/crm/imports
// SOURCE: PDF Section 1 - Import Functionality
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { LeadSource } from '@/types/database'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// Valid lead sources for validation
const VALID_LEAD_SOURCES: LeadSource[] = [
  'Webform (SEM)',
  'Webform (Organic)',
  'Instagram',
  'TikTok',
  'Facebook',
  'Event',
  'Referral',
  'Outbound',
  'Lainnya',
]

interface ImportRow {
  [key: string]: string | number | null | undefined
}

// GET /api/crm/imports - Get import history
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('import_batches')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching imports:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/crm/imports - Process import
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user permissions (Marketing Manager, Sales Manager, or Admin)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single() as { data: { role: string } | null }

    const allowedRoles = ['Director', 'super admin', 'Marketing Manager', 'sales manager']
    if (!profile || !allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json()
    const { entityType, data: importData, fileName } = body as {
      entityType: 'leads' | 'accounts' | 'contacts'
      data: ImportRow[]
      fileName?: string
    }

    if (!entityType || !importData || !Array.isArray(importData)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Create import batch record
    const { data: batch, error: batchError } = await (supabase as any)
      .from('import_batches')
      .insert({
        entity_type: entityType,
        file_name: fileName || null,
        total_rows: importData.length,
        status: 'processing',
        imported_by: user.id,
      })
      .select()
      .single() as { data: { batch_id: number } | null; error: Error | null }

    if (batchError || !batch) {
      console.error('Error creating batch:', batchError)
      return NextResponse.json({ error: 'Failed to create import batch' }, { status: 500 })
    }

    let successCount = 0
    let errorCount = 0
    const errorDetails: string[] = []

    // Process each row
    for (let i = 0; i < importData.length; i++) {
      const row = importData[i]
      try {
        if (entityType === 'leads') {
          await importLead(supabase, row, user.id)
        } else if (entityType === 'accounts') {
          await importAccount(supabase, row, user.id)
        } else if (entityType === 'contacts') {
          await importContact(supabase, row, user.id)
        }
        successCount++
      } catch (err) {
        errorCount++
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        errorDetails.push(`Row ${i + 1}: ${errorMsg}`)
      }
    }

    // Update batch status
    await (supabase as any)
      .from('import_batches')
      .update({
        success_count: successCount,
        error_count: errorCount,
        status: errorCount === 0 ? 'completed' : errorCount === importData.length ? 'failed' : 'partial',
        error_details: errorDetails.length > 0 ? errorDetails : null,
        completed_at: new Date().toISOString(),
      })
      .eq('batch_id', batch.batch_id)

    return NextResponse.json({
      success: successCount,
      errors: errorCount,
      total: importData.length,
      errorDetails: errorDetails.slice(0, 10), // Return first 10 errors
      batchId: batch.batch_id,
    })
  } catch (error) {
    console.error('Error processing import:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Helper function to import a lead
async function importLead(supabase: Awaited<ReturnType<typeof createClient>>, row: ImportRow, userId: string) {
  if (!row.company_name) {
    throw new Error('Company name is required')
  }

  // Validate and normalize source
  let source: LeadSource = 'Lainnya'
  if (row.source && typeof row.source === 'string') {
    const normalizedSource = row.source.trim()
    if (VALID_LEAD_SOURCES.includes(normalizedSource as LeadSource)) {
      source = normalizedSource as LeadSource
    }
  }

  // Validate priority (1-4)
  let priority = 2
  if (row.priority) {
    const parsedPriority = typeof row.priority === 'number' ? row.priority : parseInt(row.priority as string)
    if (!isNaN(parsedPriority) && parsedPriority >= 1 && parsedPriority <= 4) {
      priority = parsedPriority
    }
  }

  const { error } = await (supabase as any)
    .from('leads')
    .insert({
      company_name: String(row.company_name).trim(),
      contact_name: row.contact_name ? String(row.contact_name).trim() : null,
      contact_email: row.contact_email ? String(row.contact_email).trim() : null,
      contact_phone: row.contact_phone ? String(row.contact_phone).trim() : null,
      contact_mobile: row.contact_mobile ? String(row.contact_mobile).trim() : null,
      job_title: row.job_title ? String(row.job_title).trim() : null,
      industry: row.industry ? String(row.industry).trim() : null,
      source,
      source_detail: row.source_detail ? String(row.source_detail).trim() : null,
      priority,
      service_description: row.service_description ? String(row.service_description).trim() : null,
      route: row.route ? String(row.route).trim() : null,
      origin: row.origin ? String(row.origin).trim() : null,
      destination: row.destination ? String(row.destination).trim() : null,
      volume_estimate: row.volume_estimate ? String(row.volume_estimate).trim() : null,
      notes: row.inquiry_text ? String(row.inquiry_text).trim() : null,
      triage_status: 'New',
      marketing_owner_user_id: userId,
      created_by: userId,
    })

  if (error) {
    throw new Error(error.message)
  }
}

// Helper function to import an account
async function importAccount(supabase: Awaited<ReturnType<typeof createClient>>, row: ImportRow, userId: string) {
  if (!row.company_name) {
    throw new Error('Company name is required')
  }

  const { error } = await (supabase as any)
    .from('accounts')
    .insert({
      company_name: String(row.company_name).trim(),
      pic_name: row.pic_name ? String(row.pic_name).trim() : null,
      pic_email: row.pic_email ? String(row.pic_email).trim() : null,
      pic_phone: row.pic_phone ? String(row.pic_phone).trim() : null,
      industry: row.industry ? String(row.industry).trim() : null,
      address: row.address ? String(row.address).trim() : null,
      city: row.city ? String(row.city).trim() : null,
      province: row.province ? String(row.province).trim() : null,
      website: row.website ? String(row.website).trim() : null,
      owner_user_id: userId,
      created_by: userId,
    })

  if (error) {
    throw new Error(error.message)
  }
}

// Helper function to import a contact
async function importContact(supabase: Awaited<ReturnType<typeof createClient>>, row: ImportRow, userId: string) {
  if (!row.first_name) {
    throw new Error('First name is required')
  }

  const { error } = await (supabase as any)
    .from('contacts')
    .insert({
      first_name: String(row.first_name).trim(),
      last_name: row.last_name ? String(row.last_name).trim() : null,
      email: row.email ? String(row.email).trim() : null,
      phone: row.phone ? String(row.phone).trim() : null,
      job_title: row.job_title ? String(row.job_title).trim() : null,
      department: row.department ? String(row.department).trim() : null,
      created_by: userId,
    })

  if (error) {
    throw new Error(error.message)
  }
}
