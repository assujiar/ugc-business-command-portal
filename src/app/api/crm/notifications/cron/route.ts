// =====================================================
// API Route: /api/crm/notifications/cron
// Cron job endpoint for CRM email notifications
// Called by Vercel Cron with different notification types
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import {
  processUnclaimedLeadReminders,
  processPipelineDueDateReminders,
  processOverduePipelineReminders,
  processSalesInactivityReminders,
  sendWeeklyPerformanceSummary,
} from '@/lib/crm-notification-service'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Maximum duration for Vercel serverless function (in seconds)
export const maxDuration = 60

// Valid notification types
type NotificationType =
  | 'unclaimed_leads'
  | 'pipeline_due'
  | 'overdue_pipeline'
  | 'inactivity'
  | 'weekly_summary'

/**
 * Verify that the request is from Vercel Cron or has valid authorization
 */
function isAuthorized(request: NextRequest): boolean {
  // Check for Vercel Cron header (set automatically by Vercel)
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  if (vercelCronHeader) {
    return true
  }

  // Check User-Agent for Vercel Cron (alternative method)
  const userAgent = request.headers.get('user-agent')
  if (userAgent?.includes('vercel-cron')) {
    return true
  }

  // Fallback: Check for Bearer token (CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY)
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    const validTokens = [
      process.env.CRON_SECRET,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ].filter(Boolean)

    if (validTokens.includes(token)) {
      return true
    }
  }

  return false
}

// GET /api/crm/notifications/cron?type=<notification_type>
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Verify authorization
    if (!isAuthorized(request)) {
      console.error('[CRM Cron] Unauthorized request')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get notification type from query parameter
    const searchParams = request.nextUrl.searchParams
    const notificationType = searchParams.get('type') as NotificationType | null

    if (!notificationType) {
      return NextResponse.json(
        { error: 'Missing required parameter: type' },
        { status: 400 }
      )
    }

    // Valid types
    const validTypes: NotificationType[] = [
      'unclaimed_leads',
      'pipeline_due',
      'overdue_pipeline',
      'inactivity',
      'weekly_summary',
    ]

    if (!validTypes.includes(notificationType)) {
      return NextResponse.json(
        { error: `Invalid notification type: ${notificationType}. Valid types: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    console.log(`[CRM Cron] Starting ${notificationType} notification job`)

    // Execute the appropriate notification job
    let result: {
      processed?: number
      sent?: number
      success?: boolean
      errors: string[]
    }

    switch (notificationType) {
      case 'unclaimed_leads':
        result = await processUnclaimedLeadReminders()
        break
      case 'pipeline_due':
        result = await processPipelineDueDateReminders()
        break
      case 'overdue_pipeline':
        result = await processOverduePipelineReminders()
        break
      case 'inactivity':
        result = await processSalesInactivityReminders()
        break
      case 'weekly_summary':
        result = await sendWeeklyPerformanceSummary()
        break
      default:
        return NextResponse.json(
          { error: `Unhandled notification type: ${notificationType}` },
          { status: 400 }
        )
    }

    const duration = Date.now() - startTime

    console.log(`[CRM Cron] Completed ${notificationType} job in ${duration}ms:`, {
      processed: result.processed,
      sent: result.sent ?? (result.success ? 1 : 0),
      errors: result.errors.length,
    })

    // Return result
    return NextResponse.json({
      success: true,
      type: notificationType,
      processed: result.processed ?? 0,
      sent: result.sent ?? (result.success ? 1 : 0),
      errors: result.errors,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`[CRM Cron] Error:`, error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

// POST handler for manual triggering (same logic as GET)
export async function POST(request: NextRequest) {
  return GET(request)
}
