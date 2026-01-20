// =====================================================
// Ticketing API - SLA Holidays Configuration
// GET: Get holidays list
// POST: Add holiday (superadmin only)
// DELETE: Remove holiday (superadmin only)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, isAdmin } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year') || new Date().getFullYear().toString()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    const profile = profileData

    if (!profile || !canAccessTicketing(profile.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch holidays for the specified year
    const { data: holidays, error } = await (supabase as any)
      .from('sla_holidays')
      .select(`
        *,
        creator:profiles!sla_holidays_created_by_fkey(user_id, name)
      `)
      .gte('holiday_date', `${year}-01-01`)
      .lte('holiday_date', `${year}-12-31`)
      .order('holiday_date', { ascending: true })

    if (error) {
      console.error('Error fetching holidays:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: holidays || [],
      year: parseInt(year),
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    const profile = profileData

    // Only admin (Director, super admin) can add holidays
    if (!profile || !isAdmin(profile.role)) {
      return NextResponse.json({ error: 'Access denied: Admin only' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { holiday_date, name, description, is_recurring } = body as {
      holiday_date: string
      name: string
      description?: string
      is_recurring?: boolean
    }

    if (!holiday_date || !name) {
      return NextResponse.json({ error: 'Missing required fields: holiday_date, name' }, { status: 400 })
    }

    // Insert holiday
    const { data: holiday, error } = await (supabase as any)
      .from('sla_holidays')
      .insert({
        holiday_date,
        name,
        description: description || null,
        is_recurring: is_recurring || false,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding holiday:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Holiday already exists for this date' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: holiday,
    }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const holidayId = searchParams.get('id')

    if (!holidayId) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
    }

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    const profile = profileData

    // Only admin (Director, super admin) can delete holidays
    if (!profile || !isAdmin(profile.role)) {
      return NextResponse.json({ error: 'Access denied: Admin only' }, { status: 403 })
    }

    // Delete holiday
    const { error } = await (supabase as any)
      .from('sla_holidays')
      .delete()
      .eq('id', holidayId)

    if (error) {
      console.error('Error deleting holiday:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Holiday deleted',
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
