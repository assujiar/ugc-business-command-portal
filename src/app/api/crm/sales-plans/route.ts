// =====================================================
// API Route: /api/crm/sales-plans
// CRUD operations for sales plans (target planning)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessSalesPlan, canCreateSalesPlan } from '@/lib/permissions'
import type { UserRole, ApproachMethod } from '@/types/database'

export const dynamic = 'force-dynamic'

// GET /api/crm/sales-plans - Get all sales plans
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role, user_id')
      .eq('user_id', user.id)
      .single()

    const profile = profileData as { role: UserRole; user_id: string } | null

    if (!profile || !canAccessSalesPlan(profile.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch sales plans with related data
    let query = (adminClient as any)
      .from('sales_plans')
      .select(`
        *,
        profiles:owner_user_id(name, email),
        source_account:source_account_id(company_name)
      `)
      .order('planned_date', { ascending: true })

    // Filter based on role
    if (profile.role === 'salesperson') {
      // Salesperson sees only own plans
      query = query.eq('owner_user_id', user.id)
    }
    // Managers and admins see all plans (no additional filter)

    const { data: plans, error } = await query

    if (error) {
      console.error('Error fetching sales plans:', error)
      return NextResponse.json({ error: 'Failed to fetch sales plans' }, { status: 500 })
    }

    // Transform data
    const transformedPlans = (plans || []).map((plan: any) => ({
      ...plan,
      owner_name: plan.profiles?.name || null,
      account_name: plan.source_account?.company_name || plan.company_name || null,
    }))

    return NextResponse.json({ data: transformedPlans })
  } catch (error) {
    console.error('Error in GET /api/crm/sales-plans:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/crm/sales-plans - Create new sales plan
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

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

    if (!profile || !canCreateSalesPlan(profile.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()

    // Validate required fields
    if (!body.plan_type || !body.company_name || !body.planned_date || !body.planned_activity_method) {
      return NextResponse.json({ error: 'Missing required fields: plan_type, company_name, planned_date, planned_activity_method' }, { status: 400 })
    }

    // Validate plan_type
    const validPlanTypes = ['maintenance_existing', 'hunting_new', 'winback_lost']
    if (!validPlanTypes.includes(body.plan_type)) {
      return NextResponse.json({ error: 'Invalid plan_type' }, { status: 400 })
    }

    // Create the sales plan using admin client to bypass RLS issues
    const { data: plan, error } = await (adminClient as any)
      .from('sales_plans')
      .insert({
        plan_type: body.plan_type,
        company_name: body.company_name,
        pic_name: body.pic_name || null,
        pic_phone: body.pic_phone || null,
        pic_email: body.pic_email || null,
        source_account_id: body.source_account_id || null,
        planned_date: body.planned_date,
        planned_activity_method: body.planned_activity_method,
        plan_notes: body.plan_notes || null,
        status: 'planned',
        potential_status: body.plan_type === 'hunting_new' ? 'pending' : null,
        owner_user_id: user.id,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating sales plan:', error)
      return NextResponse.json({ error: 'Failed to create sales plan' }, { status: 500 })
    }

    return NextResponse.json({ data: plan }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/crm/sales-plans:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
