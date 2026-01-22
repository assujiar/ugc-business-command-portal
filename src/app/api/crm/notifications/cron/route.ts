import { NextRequest, NextResponse } from 'next/server'
import {
  processUnclaimedLeadReminders,
  processPipelineDueDateReminders,
  processOverduePipelineReminders,
  processSalesInactivityReminders,
  sendWeeklyPerformanceSummary,
} from '@/lib/crm-notification-service'

// =====================================================
// CRM Notification Cron Endpoint
// Handles all scheduled CRM email notifications
//
// Usage: Set up cron jobs to call this endpoint:
// - Unclaimed leads: Every hour
// - Pipeline due date: Every hour
// - Overdue pipeline: Every hour
// - Inactivity: Once daily
// - Weekly summary: Every Monday 08:00 WIB
//
// Example cron setup:
// 0 * * * * curl -X POST "https://your-domain/api/crm/notifications/cron?type=unclaimed_leads" -H "Authorization: Bearer YOUR_CRON_SECRET"
// 0 * * * * curl -X POST "https://your-domain/api/crm/notifications/cron?type=pipeline_due" -H "Authorization: Bearer YOUR_CRON_SECRET"
// 0 * * * * curl -X POST "https://your-domain/api/crm/notifications/cron?type=overdue_pipeline" -H "Authorization: Bearer YOUR_CRON_SECRET"
// 0 8 * * * curl -X POST "https://your-domain/api/crm/notifications/cron?type=inactivity" -H "Authorization: Bearer YOUR_CRON_SECRET"
// 0 1 * * 1 curl -X POST "https://your-domain/api/crm/notifications/cron?type=weekly_summary" -H "Authorization: Bearer YOUR_CRON_SECRET"
// =====================================================

// Verify cron secret or service role
function verifyCronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')

  // Check for cron secret
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true
  }

  // Check for service role key (for Vercel cron jobs)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) {
    return true
  }

  // Check for Vercel cron header (Vercel sends '1' as the value)
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  if (vercelCronHeader) {
    return true
  }

  return false
}

export async function POST(request: NextRequest) {
  // Verify authentication
  if (!verifyCronAuth(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  if (!type) {
    return NextResponse.json(
      { success: false, error: 'Missing type parameter' },
      { status: 400 }
    )
  }

  try {
    let result: { processed?: number; sent?: number; errors?: number; success?: boolean; error?: string }

    switch (type) {
      case 'unclaimed_leads':
        result = await processUnclaimedLeadReminders()
        console.log(`[CRM Cron] Unclaimed leads: processed=${result.processed}, sent=${result.sent}, errors=${result.errors}`)
        break

      case 'pipeline_due':
        result = await processPipelineDueDateReminders()
        console.log(`[CRM Cron] Pipeline due date: processed=${result.processed}, sent=${result.sent}, errors=${result.errors}`)
        break

      case 'overdue_pipeline':
        result = await processOverduePipelineReminders()
        console.log(`[CRM Cron] Overdue pipeline: processed=${result.processed}, sent=${result.sent}, errors=${result.errors}`)
        break

      case 'inactivity':
        result = await processSalesInactivityReminders()
        console.log(`[CRM Cron] Inactivity: processed=${result.processed}, sent=${result.sent}, errors=${result.errors}`)
        break

      case 'weekly_summary':
        result = await sendWeeklyPerformanceSummary()
        console.log(`[CRM Cron] Weekly summary: success=${result.success}`)
        break

      case 'all':
        // Process all notification types (except weekly summary)
        const unclaimedResult = await processUnclaimedLeadReminders()
        const pipelineDueResult = await processPipelineDueDateReminders()
        const overdueResult = await processOverduePipelineReminders()
        const inactivityResult = await processSalesInactivityReminders()

        result = {
          processed: (unclaimedResult.processed || 0) + (pipelineDueResult.processed || 0) + (overdueResult.processed || 0) + (inactivityResult.processed || 0),
          sent: (unclaimedResult.sent || 0) + (pipelineDueResult.sent || 0) + (overdueResult.sent || 0) + (inactivityResult.sent || 0),
          errors: (unclaimedResult.errors || 0) + (pipelineDueResult.errors || 0) + (overdueResult.errors || 0) + (inactivityResult.errors || 0),
        }
        console.log(`[CRM Cron] All: processed=${result.processed}, sent=${result.sent}, errors=${result.errors}`)
        break

      default:
        return NextResponse.json(
          { success: false, error: `Unknown type: ${type}` },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      type,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error(`[CRM Cron] Error processing ${type}:`, error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        type,
      },
      { status: 500 }
    )
  }
}

// GET endpoint - Vercel Cron uses GET by default
export async function GET(request: NextRequest) {
  // Verify authentication
  if (!verifyCronAuth(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  // If no type, return documentation
  if (!type) {
    return NextResponse.json({
      service: 'CRM Notification Cron',
      available_types: [
        'unclaimed_leads',
        'pipeline_due',
        'overdue_pipeline',
        'inactivity',
        'weekly_summary',
        'all',
      ],
      usage: 'GET /api/crm/notifications/cron?type=<type>',
      documentation: {
        unclaimed_leads: 'Sends reminders for leads that have not been claimed (4, 6, 12, 24, 36, 48, 60, 72 hours)',
        pipeline_due: 'Sends reminders for pipeline due dates (24, 12, 4 hours before)',
        overdue_pipeline: 'Sends reminders for overdue pipelines (1, 6, 12, 24 hours after)',
        inactivity: 'Sends reminders for sales without activity in 2+ days',
        weekly_summary: 'Sends weekly performance summary (run on Monday 08:00 WIB)',
        all: 'Runs all reminders except weekly summary',
      },
    })
  }

  try {
    let result: { processed?: number; sent?: number; errors?: number; success?: boolean; error?: string }

    switch (type) {
      case 'unclaimed_leads':
        result = await processUnclaimedLeadReminders()
        console.log(`[CRM Cron] Unclaimed leads: processed=${result.processed}, sent=${result.sent}, errors=${result.errors}`)
        break

      case 'pipeline_due':
        result = await processPipelineDueDateReminders()
        console.log(`[CRM Cron] Pipeline due date: processed=${result.processed}, sent=${result.sent}, errors=${result.errors}`)
        break

      case 'overdue_pipeline':
        result = await processOverduePipelineReminders()
        console.log(`[CRM Cron] Overdue pipeline: processed=${result.processed}, sent=${result.sent}, errors=${result.errors}`)
        break

      case 'inactivity':
        result = await processSalesInactivityReminders()
        console.log(`[CRM Cron] Inactivity: processed=${result.processed}, sent=${result.sent}, errors=${result.errors}`)
        break

      case 'weekly_summary':
        result = await sendWeeklyPerformanceSummary()
        console.log(`[CRM Cron] Weekly summary: success=${result.success}`)
        break

      case 'all':
        // Process all notification types (except weekly summary)
        const unclaimedResult = await processUnclaimedLeadReminders()
        const pipelineDueResult = await processPipelineDueDateReminders()
        const overdueResult = await processOverduePipelineReminders()
        const inactivityResult = await processSalesInactivityReminders()

        result = {
          processed: (unclaimedResult.processed || 0) + (pipelineDueResult.processed || 0) + (overdueResult.processed || 0) + (inactivityResult.processed || 0),
          sent: (unclaimedResult.sent || 0) + (pipelineDueResult.sent || 0) + (overdueResult.sent || 0) + (inactivityResult.sent || 0),
          errors: (unclaimedResult.errors || 0) + (pipelineDueResult.errors || 0) + (overdueResult.errors || 0) + (inactivityResult.errors || 0),
        }
        console.log(`[CRM Cron] All: processed=${result.processed}, sent=${result.sent}, errors=${result.errors}`)
        break

      default:
        return NextResponse.json(
          { success: false, error: `Unknown type: ${type}` },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      type,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error(`[CRM Cron] Error processing ${type}:`, error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        type,
      },
      { status: 500 }
    )
  }
}
