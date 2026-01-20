// =====================================================
// Ticketing API - SLA Configuration
// GET: Get SLA configuration by department/ticket type
// PUT: Update SLA configuration (superadmin only)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, isAdmin } from '@/lib/permissions'
import type { UserRole, TicketingDepartment, TicketType } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
}

const DEPARTMENT_LABELS: Record<TicketingDepartment, string> = {
  MKT: 'Marketing',
  SAL: 'Sales',
  DOM: 'Domestics Operations',
  EXI: 'EXIM Operations',
  DTD: 'Import DTD Operations',
  TRF: 'Traffic & Warehouse',
}

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

    // Fetch SLA configurations
    const { data: slaConfigs, error } = await (supabase as any)
      .from('ticketing_sla_config')
      .select('*')
      .order('department', { ascending: true })
      .order('ticket_type', { ascending: true })

    if (error) {
      console.error('Error fetching SLA config:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Add department labels
    const configsWithLabels = (slaConfigs || []).map((config: any) => ({
      ...config,
      department_label: DEPARTMENT_LABELS[config.department as TicketingDepartment] || config.department,
    }))

    return NextResponse.json({
      success: true,
      data: configsWithLabels,
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

    // Only admin (Director, super admin) can update
    if (!profile || !isAdmin(profile.role)) {
      return NextResponse.json({ error: 'Access denied: Admin only' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { sla_configs } = body as {
      sla_configs: Array<{
        department: TicketingDepartment
        ticket_type: TicketType
        first_response_hours: number
        resolution_hours: number
      }>
    }

    if (!sla_configs || !Array.isArray(sla_configs)) {
      return NextResponse.json({ error: 'Missing sla_configs array' }, { status: 400 })
    }

    // Update each config
    for (const config of sla_configs) {
      const { error: updateError } = await (supabase as any)
        .from('ticketing_sla_config')
        .upsert({
          department: config.department,
          ticket_type: config.ticket_type,
          first_response_hours: config.first_response_hours,
          resolution_hours: config.resolution_hours,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'department,ticket_type' })

      if (updateError) {
        console.error('Error updating SLA config:', updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'SLA configuration updated',
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
