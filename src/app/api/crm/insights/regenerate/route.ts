// =====================================================
// POST /api/crm/insights/regenerate
// Generate new insight using AI
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionAndProfile } from '@/lib/supabase/server'
import {
  resolveInsightScope,
  buildGrowthSnapshot,
  computeFiltersHash,
  generateInsight,
} from '@/lib/insights'
import type { InsightFilters, InsightRegenerateRequest, InsightResponse, InsightOutput } from '@/types/insights'

export const dynamic = 'force-dynamic'

// Soft TTL: don't regenerate if insight is less than 5 minutes old (unless forced)
const SOFT_TTL_MS = 5 * 60 * 1000

// Regenerate cooldown: 3 days for regular users
const REGENERATE_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000 // 3 days

// Roles that can regenerate anytime (no cooldown)
const UNLIMITED_REGENERATE_ROLES = [
  'Director',
  'super admin',
  'sales manager',
  'Marketing Manager',
  'MACX',
  'Marcomm',
  'DGO',
  'VSDO',
]

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Auth check
    const { user, profile } = await getSessionAndProfile()
    if (!user || !profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user has unlimited regenerate access
    const canRegenerateAnytime = UNLIMITED_REGENERATE_ROLES.includes(profile.role)

    // Parse request body
    const body: InsightRegenerateRequest = await request.json()
    const filters: InsightFilters = {
      startDate: body.startDate,
      endDate: body.endDate,
      salespersonId: body.salespersonId,
      source: body.source as any,
      ...body.otherFilters,
    }

    // Resolve scope based on user role
    const scope = resolveInsightScope({
      user_id: profile.user_id,
      role: profile.role,
      department: profile.department,
    })

    // Compute filters hash for caching
    const filtersHash = computeFiltersHash(filters)

    const adminClient = createAdminClient()

    // Check for existing in-progress generation (concurrency control)
    const { data: existingPending } = await (adminClient as any)
      .from('insights_growth')
      .select('id, generated_at, status')
      .eq('scope_key', scope.scope_key)
      .eq('filters_hash', filtersHash)
      .eq('role_view', profile.role)
      .eq('status', 'generating')
      .single()

    if (existingPending) {
      return NextResponse.json(
        { error: 'Insight generation already in progress', status: 'generating' },
        { status: 409 }
      )
    }

    // Check regenerate rate limit for non-privileged users
    if (!canRegenerateAnytime) {
      // Check if user has generated any insight for THIS scope in the last 3 days
      const { data: userLastInsight } = await (adminClient as any)
        .from('insights_growth')
        .select('id, generated_at')
        .eq('generated_by_user_id', profile.user_id)
        .eq('scope_key', scope.scope_key)
        .eq('status', 'completed')
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

      if (userLastInsight) {
        const lastGeneratedAt = new Date(userLastInsight.generated_at).getTime()
        const timeSinceLastGenerate = Date.now() - lastGeneratedAt
        const timeRemaining = REGENERATE_COOLDOWN_MS - timeSinceLastGenerate

        if (timeRemaining > 0) {
          const daysRemaining = Math.ceil(timeRemaining / (24 * 60 * 60 * 1000))
          return NextResponse.json(
            {
              error: 'Regenerate rate limit exceeded',
              message: `Anda hanya dapat regenerate insight setiap 3 hari sekali. Silakan coba lagi dalam ${daysRemaining} hari.`,
              nextAvailableAt: new Date(lastGeneratedAt + REGENERATE_COOLDOWN_MS).toISOString(),
              lastGeneratedAt: userLastInsight.generated_at,
            },
            { status: 429 }
          )
        }
      }
    }

    // Check soft TTL - return existing insight if recent (applies to all users)
    const forceRegenerate = request.headers.get('x-force-regenerate') === 'true'
    if (!forceRegenerate) {
      const { data: recentInsight } = await (adminClient as any)
        .from('insights_growth')
        .select('*')
        .eq('scope_key', scope.scope_key)
        .eq('filters_hash', filtersHash)
        .eq('role_view', profile.role)
        .eq('is_latest', true)
        .eq('status', 'completed')
        .single()

      if (recentInsight) {
        const generatedAt = new Date(recentInsight.generated_at).getTime()
        if (Date.now() - generatedAt < SOFT_TTL_MS) {
          // Return existing recent insight
          const response: InsightResponse = {
            id: recentInsight.id,
            scope_key: recentInsight.scope_key,
            filters_hash: recentInsight.filters_hash,
            filters: recentInsight.filters as InsightFilters,
            role_view: recentInsight.role_view,
            generated_at: recentInsight.generated_at,
            insight: recentInsight.insight_json as InsightOutput,
            metrics_snapshot: recentInsight.metrics_snapshot,
            status: recentInsight.status,
          }
          return NextResponse.json({
            ...response,
            cached: true,
            message: 'Returned cached insight (generated less than 5 minutes ago)',
          })
        }
      }
    }

    // Create a pending record (for concurrency lock)
    const { data: pendingRecord, error: insertError } = await (adminClient as any)
      .from('insights_growth')
      .insert({
        scope_key: scope.scope_key,
        filters_hash: filtersHash,
        filters,
        role_view: profile.role,
        generated_by_user_id: profile.user_id,
        status: 'generating',
        metrics_snapshot: {},
        insight_json: {},
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating pending insight:', insertError)
      return NextResponse.json({ error: 'Failed to start insight generation' }, { status: 500 })
    }

    try {
      // Build growth metrics snapshot
      const snapshot = await buildGrowthSnapshot({
        filters,
        scope,
        roleView: profile.role,
        supabaseAdmin: adminClient,
      })

      // Check if Gemini API key is configured
      const apiKey = process.env.GEMINI_API_KEY
      console.log('[Insights] GEMINI_API_KEY configured:', apiKey ? 'YES (length: ' + apiKey.length + ')' : 'NO')
      if (!apiKey) {
        // No API key - save snapshot only with fallback insight
        const fallbackInsight: InsightOutput = {
          executive_summary: 'AI insight generation is not configured. Please contact your administrator to enable this feature.',
          summary_table: [
            { metric: 'Leads', current: snapshot.metrics.leads_in?.toString() || '0', previous: null, delta: null, note: null },
            { metric: 'Opportunities', current: snapshot.metrics.opps_created?.toString() || '0', previous: null, delta: null, note: null },
            { metric: 'Pipeline Value', current: formatCurrency(snapshot.metrics.pipeline_open_value || 0), previous: null, delta: null, note: null },
            { metric: 'Win Rate', current: snapshot.metrics.opp_to_win_rate ? `${snapshot.metrics.opp_to_win_rate}%` : 'N/A', previous: null, delta: null, note: null },
          ],
          key_points: ['Metrics data collected successfully', 'AI analysis requires Gemini API configuration'],
          risks: [],
          mitigations: [],
          recommendations: [],
          next_steps: ['Configure GEMINI_API_KEY environment variable to enable AI insights'],
          data_gaps: ['AI analysis not available', ...snapshot.data_quality_flags],
        }

        const { data: updatedInsight } = await (adminClient as any)
          .from('insights_growth')
          .update({
            status: 'completed',
            metrics_snapshot: snapshot,
            insight_json: fallbackInsight,
            latency_ms: Date.now() - startTime,
          })
          .eq('id', pendingRecord.id)
          .select()
          .single()

        const response: InsightResponse = {
          id: updatedInsight.id,
          scope_key: updatedInsight.scope_key,
          filters_hash: updatedInsight.filters_hash,
          filters: updatedInsight.filters as InsightFilters,
          role_view: updatedInsight.role_view,
          generated_at: updatedInsight.generated_at,
          insight: fallbackInsight,
          metrics_snapshot: snapshot,
          status: 'completed',
        }

        return NextResponse.json(response)
      }

      // Generate insight using Gemini
      const aiResult = await generateInsight(snapshot, apiKey)

      // Update record with completed insight
      const { data: completedInsight, error: updateError } = await (adminClient as any)
        .from('insights_growth')
        .update({
          status: 'completed',
          metrics_snapshot: snapshot,
          insight_json: aiResult.insight,
          latency_ms: aiResult.latencyMs,
          tokens_in: aiResult.tokensIn,
          tokens_out: aiResult.tokensOut,
          model: 'gemini-2.0-flash',
        })
        .eq('id', pendingRecord.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating insight:', updateError)
        throw new Error('Failed to save generated insight')
      }

      const response: InsightResponse = {
        id: completedInsight.id,
        scope_key: completedInsight.scope_key,
        filters_hash: completedInsight.filters_hash,
        filters: completedInsight.filters as InsightFilters,
        role_view: completedInsight.role_view,
        generated_at: completedInsight.generated_at,
        insight: aiResult.insight,
        metrics_snapshot: snapshot,
        status: 'completed',
      }

      return NextResponse.json(response)
    } catch (generationError) {
      console.error('Error generating insight:', generationError)

      // Update record with failed status
      await (adminClient as any)
        .from('insights_growth')
        .update({
          status: 'failed',
          error_message: generationError instanceof Error ? generationError.message : 'Unknown error',
          latency_ms: Date.now() - startTime,
        })
        .eq('id', pendingRecord.id)

      // Try to return last known good insight
      const { data: lastGoodInsight } = await (adminClient as any)
        .from('insights_growth')
        .select('*')
        .eq('scope_key', scope.scope_key)
        .eq('filters_hash', filtersHash)
        .eq('role_view', profile.role)
        .eq('status', 'completed')
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

      return NextResponse.json(
        {
          error: 'Failed to generate insight',
          message: generationError instanceof Error ? generationError.message : 'Unknown error',
          lastInsight: lastGoodInsight ? {
            id: lastGoodInsight.id,
            generated_at: lastGoodInsight.generated_at,
            insight: lastGoodInsight.insight_json,
          } : null,
        },
        { status: 502 }
      )
    }
  } catch (error) {
    console.error('Error in POST /api/crm/insights/regenerate:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Format currency in Indonesian Rupiah
 */
function formatCurrency(value: number): string {
  if (value >= 1000000000) {
    return `Rp ${(value / 1000000000).toFixed(1)}B`
  }
  if (value >= 1000000) {
    return `Rp ${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `Rp ${(value / 1000).toFixed(1)}K`
  }
  return `Rp ${value.toLocaleString('id-ID')}`
}
