// =====================================================
// Ticketing API - Rejection Analytics
// GET: Retrieve rejection analytics for ops costs and quotations
// Issue 11: Overview dashboard metrics
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, getUserTicketingDepartment, canViewAllTickets } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
  department: string | null
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role, department')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    if (!profileData || !canAccessTicketing(profileData.role)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const periodDays = parseInt(searchParams.get('period') || '30', 10)

    // Determine department filter based on role
    // Directors and super admins can see all, others see only their department
    const canSeeAll = canViewAllTickets(profileData.role)
    const userDepartment = getUserTicketingDepartment(profileData.role)
    const departmentFilter = canSeeAll ? null : (userDepartment || profileData.department)

    // Call the RPC function for rejection analytics
    const { data: analyticsData, error: rpcError } = await (supabase as any).rpc(
      'rpc_get_rejection_analytics',
      {
        p_period_days: periodDays,
        p_department: departmentFilter
      }
    )

    if (rpcError) {
      console.error('Error fetching rejection analytics:', rpcError)
      return NextResponse.json({
        success: false,
        error: rpcError.message
      }, { status: 500 })
    }

    // Format rejection reasons for display
    const formatReasonLabel = (reason: string): string => {
      const labels: Record<string, string> = {
        // Ops cost rejection reasons
        'harga_terlalu_tinggi': 'Harga Terlalu Tinggi',
        'margin_tidak_mencukupi': 'Margin Tidak Mencukupi',
        'vendor_tidak_sesuai': 'Vendor Tidak Sesuai',
        'waktu_tidak_sesuai': 'Waktu Tidak Sesuai',
        'perlu_revisi': 'Perlu Revisi',
        'tarif_tidak_masuk': 'Tarif Tidak Masuk',
        'kompetitor_lebih_murah': 'Kompetitor Lebih Murah',
        'budget_customer_tidak_cukup': 'Budget Customer Tidak Cukup',
        'other': 'Lainnya',
        'unknown': 'Tidak Diketahui',
        'unspecified': 'Tidak Disebutkan',
        // Common quotation rejection reasons
        'price_too_high': 'Harga Terlalu Tinggi',
        'competitor_chosen': 'Pilih Kompetitor',
        'project_cancelled': 'Proyek Dibatalkan',
        'budget_issues': 'Masalah Budget',
        'timeline_issues': 'Masalah Timeline',
      }
      return labels[reason] || reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    }

    // Enhance the response with formatted labels
    const enhancedData = {
      ...analyticsData,
      ops_cost_rejections: {
        ...analyticsData.ops_cost_rejections,
        by_reason_formatted: Object.entries(analyticsData.ops_cost_rejections?.by_reason || {}).map(
          ([reason, data]: [string, any]) => ({
            reason,
            label: formatReasonLabel(reason),
            ...data
          })
        ).sort((a: any, b: any) => b.count - a.count)
      },
      quotation_rejections: {
        ...analyticsData.quotation_rejections,
        by_reason_formatted: Object.entries(analyticsData.quotation_rejections?.by_reason || {}).map(
          ([reason, data]: [string, any]) => ({
            reason,
            label: formatReasonLabel(reason),
            ...data
          })
        ).sort((a: any, b: any) => b.count - a.count)
      }
    }

    return NextResponse.json({
      success: true,
      data: enhancedData
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
