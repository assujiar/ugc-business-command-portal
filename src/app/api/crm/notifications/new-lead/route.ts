import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendNewLeadAssignmentEmail } from '@/lib/crm-notification-service'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// =====================================================
// New Lead Assignment Notification Endpoint
// Sends email to all salespersons when a new lead is assigned to sales
//
// POST /api/crm/notifications/new-lead
// Body: { leadId: string }
// =====================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { leadId } = body

    if (!leadId) {
      return NextResponse.json(
        { success: false, error: 'Missing leadId' },
        { status: 400 }
      )
    }

    // Send email
    const result = await sendNewLeadAssignmentEmail(leadId, user.id)

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'New lead assignment email sent successfully',
      })
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[CRM Notification] Error sending new lead email:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
