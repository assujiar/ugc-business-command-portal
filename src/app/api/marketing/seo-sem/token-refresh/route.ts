// =====================================================
// POST /api/marketing/seo-sem/token-refresh
// Proactive token refresh for Google SEO-SEM services
// Called by pg_cron every 45 minutes or manually by admin
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshAllSeoSemTokens } from '@/lib/seo-sem-fetcher'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return false
  const token = authHeader.replace('Bearer ', '')
  return token === process.env.SUPABASE_SERVICE_ROLE_KEY
}

export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const reports = await refreshAllSeoSemTokens()

    // Log refresh results to audit table
    const adminClient = createAdminClient() as any
    for (const report of reports) {
      try {
        await adminClient
          .from('marketing_token_refresh_log')
          .insert({
            platform: report.service,
            status: report.status,
            new_expires_at: report.expires_at || null,
            error_message: report.error || null,
          })
      } catch {
        // Log table might not exist yet, skip silently
      }
    }

    const refreshed = reports.filter(r => r.status === 'refreshed').length
    const failed = reports.filter(r => r.status === 'failed').length

    return NextResponse.json({
      message: 'SEO-SEM token refresh check completed',
      summary: { total: reports.length, refreshed, failed },
      reports,
    })
  } catch (error) {
    console.error('SEO-SEM token refresh endpoint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET endpoint for checking SEO-SEM token status
export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const adminClient = createAdminClient() as any

    const { data: configs, error } = await adminClient
      .from('marketing_seo_config')
      .select('service, property_id, token_expires_at, is_active, last_fetch_error, updated_at')
      .eq('is_active', true)
      .in('service', ['google_search_console', 'google_analytics', 'google_ads'])

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 })
    }

    const statuses = (configs || []).map((c: any) => {
      const expiresAt = c.token_expires_at ? new Date(c.token_expires_at) : null
      const now = new Date()
      let tokenStatus = 'no_expiry_info'

      if (expiresAt) {
        const minutesUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60)
        if (minutesUntilExpiry <= 0) {
          tokenStatus = 'expired'
        } else if (minutesUntilExpiry <= 10) {
          tokenStatus = 'expiring_very_soon'
        } else if (minutesUntilExpiry <= 30) {
          tokenStatus = 'expiring_soon'
        } else {
          tokenStatus = 'valid'
        }
      }

      return {
        service: c.service,
        property_id: c.property_id,
        is_active: c.is_active,
        token_status: tokenStatus,
        token_expires_at: c.token_expires_at,
        minutes_until_expiry: expiresAt
          ? Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60))
          : null,
        last_fetch_error: c.last_fetch_error,
        last_updated: c.updated_at,
      }
    })

    return NextResponse.json({ statuses })
  } catch (error) {
    console.error('SEO-SEM token status check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
