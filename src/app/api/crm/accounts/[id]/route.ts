// =====================================================
// API Route: /api/crm/accounts/[id]
// SOURCE: PDF Section 5 - Account Operations
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyAccountAging } from '@/lib/account-status'
import type { UserRole } from '@/types/database'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// Roles that can edit account data
const EDIT_ACCOUNT_ROLES: UserRole[] = ['sales support', 'sales manager', 'super admin', 'MACX', 'Marketing Manager', 'Director']

// GET /api/crm/accounts/[id] - Get single account
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

    const { data, error } = await supabase
      .from('accounts')
      .select('*, profiles!accounts_owner_user_id_fkey(name, email), contacts(*)')
      .eq('account_id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    // Apply aging-based status computation (new→active, idle→passive/lost)
    if (data) applyAccountAging(data as Record<string, unknown>)

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching account:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/crm/accounts/[id] - Update account
// Only sales support, admin, and MACX can edit
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's role
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single() as { data: { role: UserRole } | null }

    const userRole = profile?.role

    // Check if user has permission to edit accounts
    if (!userRole || !EDIT_ACCOUNT_ROLES.includes(userRole)) {
      return NextResponse.json(
        { error: 'You do not have permission to edit account data' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Allowed fields to update
    const allowedFields = [
      'company_name', 'domain', 'npwp', 'industry',
      'address', 'city', 'province', 'country', 'postal_code', 'phone',
      'pic_name', 'pic_email', 'pic_phone', 'owner_user_id'
    ]

    // Filter only allowed fields
    const updateData: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // Add updated_at timestamp
    updateData.updated_at = new Date().toISOString()

    const { data, error } = await (adminClient as any)
      .from('accounts')
      .update(updateData)
      .eq('account_id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating account:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error updating account:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
