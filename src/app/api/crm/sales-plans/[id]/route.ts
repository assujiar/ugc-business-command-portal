// =====================================================
// API Route: /api/crm/sales-plans/[id]
// Individual sales plan operations (target planning)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canEditSalesPlan, canDeleteSalesPlan } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

// GET /api/crm/sales-plans/[id] - Get single sales plan
export async function GET(
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

    const { data: plan, error } = await (adminClient as any)
      .from('sales_plans')
      .select(`
        *,
        profiles:owner_user_id(name, email),
        source_account:source_account_id(company_name)
      `)
      .eq('plan_id', id)
      .single()

    if (error || !plan) {
      return NextResponse.json({ error: 'Sales plan not found' }, { status: 404 })
    }

    return NextResponse.json({
      data: {
        ...plan,
        owner_name: plan.profiles?.name || null,
        account_name: plan.source_account?.company_name || plan.company_name || null,
      }
    })
  } catch (error) {
    console.error('Error in GET /api/crm/sales-plans/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/crm/sales-plans/[id] - Update sales plan
export async function PATCH(
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

    // Get user profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const profile = profileData as { role: UserRole } | null

    // Get existing plan to check ownership
    const { data: existingPlan } = await (adminClient as any)
      .from('sales_plans')
      .select('owner_user_id, planned_activity_method')
      .eq('plan_id', id)
      .single()

    if (!existingPlan) {
      return NextResponse.json({ error: 'Sales plan not found' }, { status: 404 })
    }

    if (!profile || !canEditSalesPlan(profile.role, user.id, existingPlan)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()

    // Build update object
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Update plan details (Edit action)
    if (body.company_name !== undefined) updateData.company_name = body.company_name
    if (body.pic_name !== undefined) updateData.pic_name = body.pic_name
    if (body.pic_phone !== undefined) updateData.pic_phone = body.pic_phone
    if (body.pic_email !== undefined) updateData.pic_email = body.pic_email
    if (body.planned_date !== undefined) updateData.planned_date = body.planned_date
    if (body.planned_activity_method !== undefined) updateData.planned_activity_method = body.planned_activity_method
    if (body.plan_notes !== undefined) updateData.plan_notes = body.plan_notes

    // Handle status update
    if (body.status) updateData.status = body.status

    // Handle realization (Update Realization action)
    if (body.status === 'completed') {
      updateData.realized_at = new Date().toISOString()
      if (body.actual_activity_method) updateData.actual_activity_method = body.actual_activity_method
      if (body.method_change_reason !== undefined) updateData.method_change_reason = body.method_change_reason
      if (body.realization_notes !== undefined) updateData.realization_notes = body.realization_notes
      if (body.evidence_url !== undefined) updateData.evidence_url = body.evidence_url
      if (body.evidence_file_name !== undefined) updateData.evidence_file_name = body.evidence_file_name
      if (body.location_lat !== undefined) updateData.location_lat = body.location_lat
      if (body.location_lng !== undefined) updateData.location_lng = body.location_lng
      if (body.location_address !== undefined) updateData.location_address = body.location_address
    }

    const { data: plan, error } = await (adminClient as any)
      .from('sales_plans')
      .update(updateData)
      .eq('plan_id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating sales plan:', error)
      return NextResponse.json({ error: 'Failed to update sales plan' }, { status: 500 })
    }

    return NextResponse.json({ data: plan })
  } catch (error) {
    console.error('Error in PATCH /api/crm/sales-plans/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/crm/sales-plans/[id] - Delete sales plan
export async function DELETE(
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

    // Get user profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const profile = profileData as { role: UserRole } | null

    if (!profile || !canDeleteSalesPlan(profile.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { error } = await (adminClient as any)
      .from('sales_plans')
      .delete()
      .eq('plan_id', id)

    if (error) {
      console.error('Error deleting sales plan:', error)
      return NextResponse.json({ error: 'Failed to delete sales plan' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/crm/sales-plans/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
