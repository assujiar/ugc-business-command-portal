// =====================================================
// POST /api/marketing/social-media/token-refresh
// Proactive token refresh endpoint
// Called by pg_cron every 6 hours or manually by admin
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshAllExpiringTokens } from '@/lib/social-media-token-refresh'

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
    const reports = await refreshAllExpiringTokens()

    // Log refresh results to database for audit trail
    const adminClient = createAdminClient() as any
    for (const report of reports) {
      try {
        await adminClient
          .from('marketing_token_refresh_log')
          .insert({
            platform: report.platform,
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
      message: 'Token refresh check completed',
      summary: { total: reports.length, refreshed, failed },
      reports,
    })
  } catch (error) {
    console.error('Token refresh endpoint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET endpoint for checking token status (admin use)
export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const adminClient = createAdminClient() as any

    const { data: configs, error } = await adminClient
      .from('marketing_social_media_config')
      .select('platform, account_id, token_expires_at, is_active, updated_at')
      .eq('is_active', true)

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 })
    }

    const statuses = (configs || []).map((c: any) => {
      const expiresAt = c.token_expires_at ? new Date(c.token_expires_at) : null
      const now = new Date()
      let tokenStatus = 'no_expiry_info'

      if (expiresAt) {
        const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)
        if (hoursUntilExpiry <= 0) {
          tokenStatus = 'expired'
        } else if (hoursUntilExpiry <= 1) {
          tokenStatus = 'expiring_very_soon'
        } else if (hoursUntilExpiry <= 24) {
          tokenStatus = 'expiring_soon'
        } else {
          tokenStatus = 'valid'
        }
      }

      return {
        platform: c.platform,
        account_id: c.account_id,
        is_active: c.is_active,
        token_status: tokenStatus,
        token_expires_at: c.token_expires_at,
        hours_until_expiry: expiresAt
          ? Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60) * 10) / 10
          : null,
        last_updated: c.updated_at,
      }
    })

    return NextResponse.json({ statuses })
  } catch (error) {
    console.error('Token status check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
