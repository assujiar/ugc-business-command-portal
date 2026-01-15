// =====================================================
// API Route: /api/crm/leads/[id]
// SOURCE: PDF Section 5 - Lead Operations
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// Roles that can edit any lead
const MANAGER_ROLES: UserRole[] = ['Director', 'super admin', 'Marketing Manager', 'sales manager']

// GET /api/crm/leads/[id] - Get single lead with shipment details
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

    // Fetch lead data from view (includes creator info)
    const { data, error } = await (supabase as any)
      .from('v_lead_management')
      .select('*')
      .eq('lead_id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    // Fetch shipment details for this lead
    const { data: shipmentDetails } = await (supabase as any)
      .from('shipment_details')
      .select('*')
      .eq('lead_id', id)
      .single()

    // Return lead with shipment details
    return NextResponse.json({
      data: {
        ...data,
        shipment_details: shipmentDetails || null
      }
    })
  } catch (error) {
    console.error('Error fetching lead:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/crm/leads/[id] - Update lead
// Permission: Manager, Admin, or the creator/owner of the lead
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

    // Get user profile to check role
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single() as { data: { role: UserRole } | null }

    const userRole = profile?.role

    // Get the existing lead to check ownership
    const { data: existingLead, error: fetchError } = await (supabase as any)
      .from('leads')
      .select('created_by, marketing_owner_user_id, sales_owner_user_id')
      .eq('lead_id', id)
      .single()

    if (fetchError) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Check permission: Manager/Admin can always edit, otherwise check ownership
    const isManager = userRole && MANAGER_ROLES.includes(userRole)
    const isCreator = existingLead.created_by === user.id
    const isMarketingOwner = existingLead.marketing_owner_user_id === user.id
    const isSalesOwner = existingLead.sales_owner_user_id === user.id

    if (!isManager && !isCreator && !isMarketingOwner && !isSalesOwner) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this lead' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Prevent updating certain fields unless admin/manager
    const restrictedFields = ['created_by', 'created_at', 'lead_id']
    for (const field of restrictedFields) {
      delete body[field]
    }

    const { data, error } = await (supabase as any)
      .from('leads')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('lead_id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error updating lead:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
