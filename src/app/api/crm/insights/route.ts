// =====================================================
// GET /api/crm/insights
// Fetch latest insight for current user's scope
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { resolveInsightScope, computeFiltersHash } from '@/lib/insights'
import type { InsightFilters, InsightResponse, InsightOutput } from '@/types/insights'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const { user, profile } = await getSessionAndProfile()
    if (!user || !profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams
    const filters: InsightFilters = {
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      salespersonId: searchParams.get('salespersonId'),
      source: searchParams.get('source') as any,
    }

    // Resolve scope based on user role
    const scope = resolveInsightScope({
      user_id: profile.user_id,
      role: profile.role,
      department: profile.department,
    })

    // Compute filters hash for caching
    const filtersHash = computeFiltersHash(filters)

    // Query for latest insight
    const adminClient = createAdminClient()
    const { data: insight, error } = await (adminClient as any)
      .from('insights_growth')
      .select('*')
      .eq('scope_key', scope.scope_key)
      .eq('filters_hash', filtersHash)
      .eq('role_view', profile.role)
      .eq('is_latest', true)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (which is fine for first time)
      console.error('Error fetching insight:', error)
      return NextResponse.json({ error: 'Failed to fetch insight' }, { status: 500 })
    }

    // If no insight exists yet, return null
    if (!insight) {
      return NextResponse.json({
        insight: null,
        scope_key: scope.scope_key,
        filters_hash: filtersHash,
        filters,
        role_view: profile.role,
        message: 'No insight generated yet. Click "Generate Insight" to create one.',
      })
    }

    // Return the insight
    const response: InsightResponse = {
      id: insight.id,
      scope_key: insight.scope_key,
      filters_hash: insight.filters_hash,
      filters: insight.filters as InsightFilters,
      role_view: insight.role_view,
      generated_at: insight.generated_at,
      insight: insight.insight_json as InsightOutput,
      metrics_snapshot: insight.metrics_snapshot,
      status: insight.status,
      error_message: insight.error_message,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error in GET /api/crm/insights:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
