// =====================================================
// API Route: /api/crm/leads
// SOURCE: PDF Section 5 - Lead Operations
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSales } from '@/lib/permissions'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// GET /api/crm/leads - List leads (filtered by RLS)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('leads' as any as any)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('triage_status', status)
    }

    const { data, count, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, count })
  } catch (error) {
    console.error('Error fetching leads:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/crm/leads - Create new lead with optional shipment details
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's profile to check role
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single() as { data: { role: string } | null }

    const userRole = profile?.role as string | undefined
    const isSalesUser = isSales(userRole)

    const body = await request.json()
    const { shipment_details, ...leadData } = body

    // Map form fields to database columns
    // If salesperson creates lead, auto-assign to them and mark as claimed
    const mappedLeadData: Record<string, any> = {
      company_name: leadData.company_name,
      contact_name: leadData.pic_name || null,
      contact_email: leadData.pic_email || null,
      contact_phone: leadData.pic_phone || null,
      source: leadData.source,
      source_detail: leadData.source_detail || null,
      notes: leadData.inquiry_text || null,
      created_by: user.id,
    }

    if (isSalesUser) {
      // Salesperson creating lead - auto-assign to themselves
      mappedLeadData.sales_owner_user_id = user.id
      mappedLeadData.claimed_at = new Date().toISOString()
      mappedLeadData.triage_status = 'Qualified' // Skip triage, go straight to sales
      mappedLeadData.qualified_at = new Date().toISOString()
    } else {
      // Marketing creating lead - set marketing owner
      mappedLeadData.marketing_owner_user_id = user.id
    }

    // Create lead
    const { data: leadResult, error: leadError } = await (supabase as any)
      .from('leads' as any as any)
      .insert(mappedLeadData)
      .select()
      .single()

    if (leadError) {
      return NextResponse.json({ error: leadError.message }, { status: 500 })
    }

    // Create shipment details if provided
    if (shipment_details && shipment_details.service_type_code) {
      const shipmentInsertData = {
        lead_id: leadResult.lead_id,
        service_type_code: shipment_details.service_type_code,
        department: shipment_details.department || null,
        fleet_type: shipment_details.fleet_type || null,
        fleet_quantity: shipment_details.fleet_quantity || 1,
        incoterm: shipment_details.incoterm || null,
        cargo_category: shipment_details.cargo_category || 'General Cargo',
        cargo_description: shipment_details.cargo_description || null,
        origin_address: shipment_details.origin_address || null,
        origin_city: shipment_details.origin_city || null,
        origin_country: shipment_details.origin_country || 'Indonesia',
        destination_address: shipment_details.destination_address || null,
        destination_city: shipment_details.destination_city || null,
        destination_country: shipment_details.destination_country || 'Indonesia',
        quantity: shipment_details.quantity || 1,
        unit_of_measure: shipment_details.unit_of_measure || 'Boxes',
        weight_per_unit_kg: shipment_details.weight_per_unit_kg || null,
        length_cm: shipment_details.length_cm || null,
        width_cm: shipment_details.width_cm || null,
        height_cm: shipment_details.height_cm || null,
        scope_of_work: shipment_details.scope_of_work || null,
        additional_services: shipment_details.additional_services || [],
        created_by: user.id,
      }

      const { error: shipmentError } = await (supabase as any)
        .from('shipment_details' as any)
        .insert(shipmentInsertData)

      if (shipmentError) {
        console.error('Error creating shipment details:', shipmentError)
        // Don't fail the whole request, just log the error
      }
    }

    return NextResponse.json({ data: leadResult }, { status: 201 })
  } catch (error) {
    console.error('Error creating lead:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
