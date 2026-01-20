// =====================================================
// Ticketing API - SLA Business Hours Configuration
// GET: Get business hours configuration
// PUT: Update business hours (superadmin only)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export async function GET(request: NextRequest) {
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

    if (!profile || !canAccessTicketing(profile.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch business hours
    const { data: businessHours, error } = await (supabase as any)
      .from('sla_business_hours')
      .select('*')
      .order('day_of_week', { ascending: true })

    if (error) {
      console.error('Error fetching business hours:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Add day names for convenience
    const hoursWithNames = (businessHours || []).map((hour: any) => ({
      ...hour,
      day_name: DAY_NAMES[hour.day_of_week],
    }))

    return NextResponse.json({
      success: true,
      data: hoursWithNames,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
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

    // Only superadmin can update
    if (!profile || profile.role !== 'superadmin') {
      return NextResponse.json({ error: 'Access denied: Superadmin only' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { business_hours } = body as {
      business_hours: Array<{
        day_of_week: number
        is_working_day: boolean
        start_time: string
        end_time: string
      }>
    }

    if (!business_hours || !Array.isArray(business_hours)) {
      return NextResponse.json({ error: 'Missing business_hours array' }, { status: 400 })
    }

    // Validate
    for (const hour of business_hours) {
      if (hour.day_of_week < 0 || hour.day_of_week > 6) {
        return NextResponse.json({ error: `Invalid day_of_week: ${hour.day_of_week}` }, { status: 400 })
      }
    }

    // Update each day
    for (const hour of business_hours) {
      const { error: updateError } = await (supabase as any)
        .from('sla_business_hours')
        .upsert({
          day_of_week: hour.day_of_week,
          is_working_day: hour.is_working_day,
          start_time: hour.start_time,
          end_time: hour.end_time,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'day_of_week' })

      if (updateError) {
        console.error('Error updating business hours:', updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Business hours updated',
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
