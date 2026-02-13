// =====================================================
// API Route: /api/admin/users
// User Management - List all users and create new users
// Only accessible by Director and super admin
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/permissions'
import type { UserRole } from '@/types/database'
import { USER_ROLES } from '@/lib/constants'

export const dynamic = 'force-dynamic'

// GET /api/admin/users - List all users
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin role
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single() as { data: { role: UserRole } | null }

    if (!profile || !isAdmin(profile.role)) {
      return NextResponse.json({ error: 'Only Director and super admin can manage users' }, { status: 403 })
    }

    // Fetch all profiles using admin client
    const { data: users, error } = await (adminClient as any)
      .from('profiles')
      .select('user_id, email, name, role, department, phone, is_active, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching users:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: users || [] })
  } catch (error) {
    console.error('Error in GET /api/admin/users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/users - Create a new user
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin role
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single() as { data: { role: UserRole } | null }

    if (!profile || !isAdmin(profile.role)) {
      return NextResponse.json({ error: 'Only Director and super admin can create users' }, { status: 403 })
    }

    const body = await request.json()
    const { email, password, name, role, department, phone } = body

    // Validate required fields
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!role || !USER_ROLES.includes(role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${USER_ROLES.join(', ')}` }, { status: 400 })
    }

    // Step 1: Create auth.users entry via Supabase Admin API
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true, // Auto-confirm email so user can login immediately
    })

    if (authError) {
      console.error('Error creating auth user:', authError)
      // Handle duplicate email
      if (authError.message?.includes('already been registered') || authError.message?.includes('duplicate')) {
        return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create auth user' }, { status: 500 })
    }

    const newUserId = authData.user.id

    // Step 2: Create profiles entry
    const profileData = {
      user_id: newUserId,
      email: email.trim(),
      name: name.trim(),
      role,
      department: department?.trim() || null,
      phone: phone?.trim() || null,
      is_active: true,
    }

    const { data: newProfile, error: profileError } = await (adminClient as any)
      .from('profiles')
      .insert(profileData)
      .select('user_id, email, name, role, department, phone, is_active, created_at')
      .single()

    if (profileError) {
      console.error('Error creating profile:', profileError)
      // Cleanup: delete auth user if profile creation fails
      await adminClient.auth.admin.deleteUser(newUserId)
      return NextResponse.json({ error: `Failed to create profile: ${profileError.message}` }, { status: 500 })
    }

    return NextResponse.json({ data: newProfile }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/admin/users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/admin/users - Update user (toggle active, change role)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin role
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single() as { data: { role: UserRole } | null }

    if (!profile || !isAdmin(profile.role)) {
      return NextResponse.json({ error: 'Only Director and super admin can update users' }, { status: 403 })
    }

    const body = await request.json()
    const { user_id, name, role, department, phone, is_active } = body

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }

    // Prevent deactivating yourself
    if (user_id === user.id && is_active === false) {
      return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (name !== undefined) updateData.name = name.trim()
    if (role !== undefined) {
      if (!USER_ROLES.includes(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }
      updateData.role = role
    }
    if (department !== undefined) updateData.department = department?.trim() || null
    if (phone !== undefined) updateData.phone = phone?.trim() || null
    if (is_active !== undefined) updateData.is_active = is_active

    const { data: updatedProfile, error: updateError } = await (adminClient as any)
      .from('profiles')
      .update(updateData)
      .eq('user_id', user_id)
      .select('user_id, email, name, role, department, phone, is_active, created_at, updated_at')
      .single()

    if (updateError) {
      console.error('Error updating profile:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ data: updatedProfile })
  } catch (error) {
    console.error('Error in PATCH /api/admin/users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
