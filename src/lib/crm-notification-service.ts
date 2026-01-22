import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { sendCRMEmail } from './crm-email'
import {
  generateNewLeadAssignmentEmail,
  generateUnclaimedLeadReminderEmail,
  generatePipelineDueDateReminderEmail,
  generateOverduePipelineReminderEmail,
  generateSalesInactivityReminderEmail,
  generateWeeklyPerformanceSummaryEmail,
  NewLeadAssignmentData,
  UnclaimedLeadReminderData,
  PipelineDueDateReminderData,
  OverduePipelineReminderData,
  SalesInactivityReminderData,
  WeeklyPerformanceSummaryData,
  SalesPerformanceData,
} from './crm-email-templates'
import type { UserRole } from '@/types/database'

// =====================================================
// CRM Notification Service
// Handles all CRM email notifications
// =====================================================

// Create Supabase admin client for server-side operations
function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// =====================================================
// User/Email Helpers
// =====================================================

interface UserInfo {
  user_id: string
  email: string
  name: string
  role: UserRole
}

async function getUsersByRoles(supabase: SupabaseClient, roles: UserRole[]): Promise<UserInfo[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email, name, role')
    .in('role', roles)
    .eq('is_active', true)

  if (error) {
    console.error('[CRM Notification] Error fetching users by roles:', error)
    return []
  }

  return data || []
}

async function getUserById(supabase: SupabaseClient, userId: string): Promise<UserInfo | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email, name, role')
    .eq('user_id', userId)
    .single()

  if (error) {
    console.error('[CRM Notification] Error fetching user:', error)
    return null
  }

  return data
}

async function getSalespersons(supabase: SupabaseClient): Promise<UserInfo[]> {
  return getUsersByRoles(supabase, ['salesperson'])
}

async function getSalesManagers(supabase: SupabaseClient): Promise<UserInfo[]> {
  return getUsersByRoles(supabase, ['sales manager'])
}

async function getMarketingManagers(supabase: SupabaseClient): Promise<UserInfo[]> {
  return getUsersByRoles(supabase, ['Marketing Manager'])
}

async function getDirectors(supabase: SupabaseClient, type: '1' | '2' | 'all' = 'all'): Promise<UserInfo[]> {
  // Director role represents both direktur 1 and direktur 2
  // For now, we'll get all directors
  return getUsersByRoles(supabase, ['Director'])
}

// =====================================================
// Email Logging Helpers
// =====================================================

async function logEmailSent(
  supabase: SupabaseClient,
  notificationType: string,
  recipients: string[],
  cc: string[],
  subject: string,
  options: {
    leadId?: string
    opportunityId?: string
    userId?: string
    metadata?: Record<string, unknown>
    messageId?: string
    status?: 'sent' | 'failed'
    error?: string
  }
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('crm_email_logs')
      .insert({
        notification_type: notificationType,
        recipient_emails: recipients,
        cc_emails: cc.length > 0 ? cc : null,
        subject,
        lead_id: options.leadId || null,
        opportunity_id: options.opportunityId || null,
        user_id: options.userId || null,
        metadata: options.metadata || {},
        message_id: options.messageId || null,
        status: options.status || 'sent',
        error_message: options.error || null,
        sent_at: options.status === 'sent' ? new Date().toISOString() : null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[CRM Notification] Error logging email:', error)
      return null
    }

    return data?.id || null
  } catch (err) {
    console.error('[CRM Notification] Error logging email:', err)
    return null
  }
}

async function wasReminderSent(
  supabase: SupabaseClient,
  notificationType: string,
  intervalHours: number,
  entityId: string,
  entityType: 'lead' | 'opportunity' | 'user'
): Promise<boolean> {
  const columnName = entityType === 'lead' ? 'lead_id' : entityType === 'opportunity' ? 'opportunity_id' : 'user_id'

  const { data, error } = await supabase
    .from('crm_notification_schedules')
    .select('id')
    .eq('notification_type', notificationType)
    .eq('interval_hours', intervalHours)
    .eq(columnName, entityId)
    .eq('is_sent', true)
    .maybeSingle()

  if (error) {
    console.error('[CRM Notification] Error checking reminder status:', error)
    return false
  }

  return !!data
}

async function markReminderSent(
  supabase: SupabaseClient,
  notificationType: string,
  intervalHours: number,
  entityId: string,
  entityType: 'lead' | 'opportunity' | 'user',
  emailLogId: string | null,
  reminderNumber: number
): Promise<void> {
  const insertData: Record<string, unknown> = {
    notification_type: notificationType,
    interval_hours: intervalHours,
    reminder_number: reminderNumber,
    is_sent: true,
    sent_at: new Date().toISOString(),
    email_log_id: emailLogId,
  }

  if (entityType === 'lead') insertData.lead_id = entityId
  else if (entityType === 'opportunity') insertData.opportunity_id = entityId
  else insertData.user_id = entityId

  const { error } = await supabase
    .from('crm_notification_schedules')
    .upsert(insertData, {
      onConflict: `notification_type,${entityType === 'lead' ? 'lead_id' : entityType === 'opportunity' ? 'opportunity_id' : 'user_id'},interval_hours`,
    })

  if (error) {
    console.error('[CRM Notification] Error marking reminder sent:', error)
  }
}

// =====================================================
// 1. NEW LEAD ASSIGNMENT NOTIFICATION
// =====================================================

export async function sendNewLeadAssignmentEmail(leadId: string, assignedByUserId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin()

  try {
    // Fetch lead details
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('lead_id', leadId)
      .single()

    if (leadError || !lead) {
      return { success: false, error: 'Lead not found' }
    }

    // Fetch assigner info
    const assigner = await getUserById(supabase, assignedByUserId)
    if (!assigner) {
      return { success: false, error: 'Assigner not found' }
    }

    // Get recipients
    const salespersons = await getSalespersons(supabase)
    const salesManagers = await getSalesManagers(supabase)
    const marketingManagers = await getMarketingManagers(supabase)

    if (salespersons.length === 0) {
      return { success: false, error: 'No salespersons found' }
    }

    const toEmails = salespersons.map(s => s.email)
    const ccEmails = [
      ...salesManagers.map(m => m.email),
      ...marketingManagers.map(m => m.email),
      assigner.email,
    ].filter((email, index, self) => self.indexOf(email) === index) // Remove duplicates

    // Generate email
    const emailData: NewLeadAssignmentData = {
      lead: {
        lead_id: lead.lead_id,
        company_name: lead.company_name,
        pic_name: lead.pic_name,
        pic_email: lead.pic_email,
        pic_phone: lead.pic_phone,
        industry: lead.industry,
        source: lead.source,
        priority: lead.priority,
        potential_revenue: lead.potential_revenue,
        inquiry_text: lead.inquiry_text,
        created_at: lead.created_at,
      },
      assignedBy: {
        name: assigner.name,
        email: assigner.email,
      },
    }

    const html = generateNewLeadAssignmentEmail(emailData)
    const subject = `Lead Baru Tersedia: ${lead.company_name} - Buruan Claim!`

    // Send email
    const result = await sendCRMEmail({
      to: toEmails,
      cc: ccEmails,
      subject,
      html,
    })

    // Log email
    await logEmailSent(supabase, 'new_lead_assignment', toEmails, ccEmails, subject, {
      leadId: lead.lead_id,
      metadata: { assignedBy: assigner.name },
      messageId: result.messageId,
      status: result.success ? 'sent' : 'failed',
      error: result.error,
    })

    return { success: result.success, error: result.error }
  } catch (error) {
    console.error('[CRM Notification] Error sending new lead assignment email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// =====================================================
// 2. UNCLAIMED LEAD REMINDERS
// =====================================================

const UNCLAIMED_LEAD_INTERVALS = [4, 6, 12, 24, 36, 48, 60, 72] // hours

export async function processUnclaimedLeadReminders(): Promise<{ processed: number; sent: number; errors: number }> {
  const supabase = getSupabaseAdmin()
  let processed = 0
  let sent = 0
  let errors = 0

  try {
    // Get all unclaimed leads from the pool
    const { data: unclaimedLeads, error: poolError } = await supabase
      .from('lead_handover_pool')
      .select(`
        pool_id,
        lead_id,
        handed_over_by,
        handed_over_at,
        priority,
        handover_notes,
        leads!inner (
          lead_id,
          company_name,
          pic_name,
          pic_email,
          pic_phone,
          industry,
          source,
          priority,
          potential_revenue,
          inquiry_text,
          claim_status
        )
      `)
      .is('claimed_by', null)
      .eq('leads.claim_status', 'unclaimed')

    if (poolError) {
      console.error('[CRM Notification] Error fetching unclaimed leads:', poolError)
      return { processed: 0, sent: 0, errors: 1 }
    }

    if (!unclaimedLeads || unclaimedLeads.length === 0) {
      console.log('[CRM Notification] No unclaimed leads found')
      return { processed: 0, sent: 0, errors: 0 }
    }

    // Get recipients
    const salespersons = await getSalespersons(supabase)
    const salesManagers = await getSalesManagers(supabase)
    const marketingManagers = await getMarketingManagers(supabase)
    const directors = await getDirectors(supabase, '1')

    if (salespersons.length === 0) {
      console.log('[CRM Notification] No salespersons found')
      return { processed: 0, sent: 0, errors: 0 }
    }

    const toEmails = salespersons.map(s => s.email)

    for (const poolEntry of unclaimedLeads) {
      processed++

      const handedOverAt = new Date(poolEntry.handed_over_at)
      const now = new Date()
      const hoursElapsed = Math.floor((now.getTime() - handedOverAt.getTime()) / (1000 * 60 * 60))

      // Find which interval we should send for
      for (let i = 0; i < UNCLAIMED_LEAD_INTERVALS.length; i++) {
        const interval = UNCLAIMED_LEAD_INTERVALS[i]

        // Check if enough time has passed for this interval
        if (hoursElapsed >= interval) {
          // Check if this reminder was already sent
          const alreadySent = await wasReminderSent(
            supabase,
            'unclaimed_lead_reminder',
            interval,
            poolEntry.lead_id,
            'lead'
          )

          if (alreadySent) continue

          // Get assigner info
          let assigner: UserInfo | null = null
          if (poolEntry.handed_over_by) {
            assigner = await getUserById(supabase, poolEntry.handed_over_by)
          }

          // Build CC list - include directors for emails sent after 24 hours
          const ccEmails = [
            ...salesManagers.map(m => m.email),
            ...marketingManagers.map(m => m.email),
            ...(assigner ? [assigner.email] : []),
            ...(interval >= 24 ? directors.map(d => d.email) : []),
          ].filter((email, index, self) => self.indexOf(email) === index)

          // Generate email
          const lead = poolEntry.leads as unknown as {
            lead_id: string
            company_name: string
            pic_name: string | null
            pic_email: string | null
            pic_phone: string | null
            industry: string | null
            source: string
            priority: number
            potential_revenue: number | null
            inquiry_text: string | null
          }

          const emailData: UnclaimedLeadReminderData = {
            lead: {
              lead_id: lead.lead_id,
              company_name: lead.company_name,
              pic_name: lead.pic_name,
              pic_email: lead.pic_email,
              pic_phone: lead.pic_phone,
              industry: lead.industry,
              source: lead.source,
              priority: lead.priority || poolEntry.priority,
              potential_revenue: lead.potential_revenue,
              inquiry_text: lead.inquiry_text,
              handed_over_at: poolEntry.handed_over_at,
            },
            assignedBy: {
              name: assigner?.name || 'Marketing Team',
              email: assigner?.email || '',
            },
            hoursElapsed: interval,
            reminderNumber: i + 1,
          }

          const html = generateUnclaimedLeadReminderEmail(emailData)
          const subject = `Reminder ${i + 1}: Lead ${lead.company_name} Belum Di-Claim (${interval} jam)`

          // Send email
          const result = await sendCRMEmail({
            to: toEmails,
            cc: ccEmails,
            subject,
            html,
          })

          // Log and mark as sent
          const logId = await logEmailSent(supabase, 'unclaimed_lead_reminder', toEmails, ccEmails, subject, {
            leadId: lead.lead_id,
            metadata: { hoursElapsed: interval, reminderNumber: i + 1 },
            messageId: result.messageId,
            status: result.success ? 'sent' : 'failed',
            error: result.error,
          })

          if (result.success) {
            await markReminderSent(supabase, 'unclaimed_lead_reminder', interval, lead.lead_id, 'lead', logId, i + 1)
            sent++
          } else {
            errors++
          }
        }
      }
    }

    return { processed, sent, errors }
  } catch (error) {
    console.error('[CRM Notification] Error processing unclaimed lead reminders:', error)
    return { processed, sent, errors: errors + 1 }
  }
}

// =====================================================
// 3. PIPELINE DUE DATE REMINDERS
// =====================================================

const PIPELINE_DUE_INTERVALS = [24, 12, 4] // hours before due date

export async function processPipelineDueDateReminders(): Promise<{ processed: number; sent: number; errors: number }> {
  const supabase = getSupabaseAdmin()
  let processed = 0
  let sent = 0
  let errors = 0

  try {
    // Get active opportunities with due dates
    const { data: opportunities, error: oppError } = await supabase
      .from('opportunities')
      .select(`
        opportunity_id,
        name,
        stage,
        estimated_value,
        next_step,
        next_step_due_date,
        owner_user_id,
        accounts!inner (
          company_name,
          pic_name
        )
      `)
      .not('stage', 'in', '("Closed Won","Closed Lost")')
      .not('next_step_due_date', 'is', null)

    if (oppError) {
      console.error('[CRM Notification] Error fetching opportunities:', oppError)
      return { processed: 0, sent: 0, errors: 1 }
    }

    if (!opportunities || opportunities.length === 0) {
      console.log('[CRM Notification] No opportunities with due dates found')
      return { processed: 0, sent: 0, errors: 0 }
    }

    const now = new Date()

    for (const opp of opportunities) {
      if (!opp.next_step_due_date || !opp.owner_user_id) continue

      processed++

      const dueDate = new Date(opp.next_step_due_date)
      const hoursUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60))

      // Only process if due date is in the future
      if (hoursUntilDue < 0) continue

      for (const interval of PIPELINE_DUE_INTERVALS) {
        // Check if we're within the reminder window
        if (hoursUntilDue <= interval && hoursUntilDue > interval - 4) {
          // Check if already sent
          const alreadySent = await wasReminderSent(
            supabase,
            'pipeline_due_date_reminder',
            interval,
            opp.opportunity_id,
            'opportunity'
          )

          if (alreadySent) continue

          // Get sales info
          const sales = await getUserById(supabase, opp.owner_user_id)
          if (!sales) continue

          const account = opp.accounts as unknown as { company_name: string; pic_name: string | null }

          const emailData: PipelineDueDateReminderData = {
            opportunity: {
              opportunity_id: opp.opportunity_id,
              name: opp.name,
              stage: opp.stage,
              estimated_value: opp.estimated_value,
              next_step: opp.next_step,
              next_step_due_date: opp.next_step_due_date,
            },
            account: {
              company_name: account.company_name,
              pic_name: account.pic_name,
            },
            sales: {
              name: sales.name,
              email: sales.email,
            },
            hoursUntilDue: interval,
          }

          const html = generatePipelineDueDateReminderEmail(emailData)
          const subject = `Reminder: Pipeline ${opp.name} Due dalam ${interval} Jam`

          // Send to sales only
          const result = await sendCRMEmail({
            to: sales.email,
            subject,
            html,
          })

          const logId = await logEmailSent(supabase, 'pipeline_due_date_reminder', [sales.email], [], subject, {
            opportunityId: opp.opportunity_id,
            userId: sales.user_id,
            metadata: { hoursUntilDue: interval },
            messageId: result.messageId,
            status: result.success ? 'sent' : 'failed',
            error: result.error,
          })

          if (result.success) {
            await markReminderSent(supabase, 'pipeline_due_date_reminder', interval, opp.opportunity_id, 'opportunity', logId, PIPELINE_DUE_INTERVALS.indexOf(interval) + 1)
            sent++
          } else {
            errors++
          }
        }
      }
    }

    return { processed, sent, errors }
  } catch (error) {
    console.error('[CRM Notification] Error processing pipeline due date reminders:', error)
    return { processed, sent, errors: errors + 1 }
  }
}

// =====================================================
// 4. OVERDUE PIPELINE REMINDERS
// =====================================================

const OVERDUE_INTERVALS = [1, 6, 12, 24] // hours after due date

export async function processOverduePipelineReminders(): Promise<{ processed: number; sent: number; errors: number }> {
  const supabase = getSupabaseAdmin()
  let processed = 0
  let sent = 0
  let errors = 0

  try {
    // Get overdue opportunities
    const { data: opportunities, error: oppError } = await supabase
      .from('opportunities')
      .select(`
        opportunity_id,
        name,
        stage,
        estimated_value,
        next_step,
        next_step_due_date,
        owner_user_id,
        accounts!inner (
          company_name,
          pic_name
        )
      `)
      .not('stage', 'in', '("Closed Won","Closed Lost")')
      .not('next_step_due_date', 'is', null)
      .lt('next_step_due_date', new Date().toISOString())

    if (oppError) {
      console.error('[CRM Notification] Error fetching overdue opportunities:', oppError)
      return { processed: 0, sent: 0, errors: 1 }
    }

    if (!opportunities || opportunities.length === 0) {
      console.log('[CRM Notification] No overdue opportunities found')
      return { processed: 0, sent: 0, errors: 0 }
    }

    const salesManagers = await getSalesManagers(supabase)
    const directors = await getDirectors(supabase, '1')
    const now = new Date()

    for (const opp of opportunities) {
      if (!opp.next_step_due_date || !opp.owner_user_id) continue

      processed++

      const dueDate = new Date(opp.next_step_due_date)
      const hoursOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60))

      for (let i = 0; i < OVERDUE_INTERVALS.length; i++) {
        const interval = OVERDUE_INTERVALS[i]

        // Check if enough time has passed for this interval
        if (hoursOverdue >= interval) {
          const alreadySent = await wasReminderSent(
            supabase,
            'overdue_pipeline_reminder',
            interval,
            opp.opportunity_id,
            'opportunity'
          )

          if (alreadySent) continue

          // Get sales info
          const sales = await getUserById(supabase, opp.owner_user_id)
          if (!sales) continue

          const account = opp.accounts as unknown as { company_name: string; pic_name: string | null }
          const includeManagement = interval >= 24

          const emailData: OverduePipelineReminderData = {
            opportunity: {
              opportunity_id: opp.opportunity_id,
              name: opp.name,
              stage: opp.stage,
              estimated_value: opp.estimated_value,
              next_step: opp.next_step,
              next_step_due_date: opp.next_step_due_date,
            },
            account: {
              company_name: account.company_name,
              pic_name: account.pic_name,
            },
            sales: {
              name: sales.name,
              email: sales.email,
            },
            hoursOverdue: interval,
            includeManagement,
          }

          const html = generateOverduePipelineReminderEmail(emailData)
          const subject = includeManagement
            ? `ESCALATION: Pipeline ${opp.name} Overdue ${interval} Jam`
            : `Reminder: Pipeline ${opp.name} Sudah Overdue ${interval} Jam`

          // Build CC list for 24-hour reminder
          const ccEmails = includeManagement
            ? [...salesManagers.map(m => m.email), ...directors.map(d => d.email)].filter((e, i, a) => a.indexOf(e) === i)
            : []

          const result = await sendCRMEmail({
            to: sales.email,
            cc: ccEmails,
            subject,
            html,
          })

          const logId = await logEmailSent(supabase, 'overdue_pipeline_reminder', [sales.email], ccEmails, subject, {
            opportunityId: opp.opportunity_id,
            userId: sales.user_id,
            metadata: { hoursOverdue: interval, includeManagement },
            messageId: result.messageId,
            status: result.success ? 'sent' : 'failed',
            error: result.error,
          })

          if (result.success) {
            await markReminderSent(supabase, 'overdue_pipeline_reminder', interval, opp.opportunity_id, 'opportunity', logId, i + 1)
            sent++
          } else {
            errors++
          }
        }
      }
    }

    return { processed, sent, errors }
  } catch (error) {
    console.error('[CRM Notification] Error processing overdue pipeline reminders:', error)
    return { processed, sent, errors: errors + 1 }
  }
}

// =====================================================
// 5. SALES INACTIVITY REMINDERS
// =====================================================

export async function processSalesInactivityReminders(): Promise<{ processed: number; sent: number; errors: number }> {
  const supabase = getSupabaseAdmin()
  let processed = 0
  let sent = 0
  let errors = 0

  try {
    // Get all active salespersons
    const salespersons = await getSalespersons(supabase)
    const salesManagers = await getSalesManagers(supabase)

    if (salespersons.length === 0) {
      console.log('[CRM Notification] No salespersons found')
      return { processed: 0, sent: 0, errors: 0 }
    }

    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

    for (const sales of salespersons) {
      processed++

      // Get last completed activity
      const { data: lastActivity, error: actError } = await supabase
        .from('activities')
        .select('activity_type, subject, completed_at')
        .eq('owner_user_id', sales.user_id)
        .eq('status', 'Done')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (actError) {
        console.error('[CRM Notification] Error fetching activity:', actError)
        errors++
        continue
      }

      // Check if there's been activity in the last 2 days
      let daysSinceLastActivity = 999
      if (lastActivity?.completed_at) {
        const lastActivityDate = new Date(lastActivity.completed_at)
        daysSinceLastActivity = Math.floor((new Date().getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24))
      }

      // Only send if no activity in 2+ days
      if (daysSinceLastActivity < 2) continue

      // Check if we already sent a reminder in the last 24 hours
      const alreadySent = await wasReminderSent(
        supabase,
        'sales_inactivity_reminder',
        48, // Use 48 as the interval marker
        sales.user_id,
        'user'
      )

      if (alreadySent) continue

      // Get active opportunities count and value
      const { data: pipelineStats } = await supabase
        .from('opportunities')
        .select('estimated_value')
        .eq('owner_user_id', sales.user_id)
        .not('stage', 'in', '("Closed Won","Closed Lost")')

      const activeOpportunitiesCount = pipelineStats?.length || 0
      const totalPipelineValue = pipelineStats?.reduce((sum, opp) => sum + (opp.estimated_value || 0), 0) || 0

      const emailData: SalesInactivityReminderData = {
        sales: {
          user_id: sales.user_id,
          name: sales.name,
          email: sales.email,
        },
        lastActivity: lastActivity ? {
          activity_type: lastActivity.activity_type,
          subject: lastActivity.subject,
          completed_at: lastActivity.completed_at,
        } : null,
        daysSinceLastActivity,
        activeOpportunitiesCount,
        totalPipelineValue,
      }

      const html = generateSalesInactivityReminderEmail(emailData)
      const subject = `Hey ${sales.name.split(' ')[0]}! Sudah ${daysSinceLastActivity} Hari Tanpa Aktivitas`

      const ccEmails = salesManagers.map(m => m.email)

      const result = await sendCRMEmail({
        to: sales.email,
        cc: ccEmails,
        subject,
        html,
      })

      const logId = await logEmailSent(supabase, 'sales_inactivity_reminder', [sales.email], ccEmails, subject, {
        userId: sales.user_id,
        metadata: { daysSinceLastActivity, activeOpportunitiesCount, totalPipelineValue },
        messageId: result.messageId,
        status: result.success ? 'sent' : 'failed',
        error: result.error,
      })

      if (result.success) {
        await markReminderSent(supabase, 'sales_inactivity_reminder', 48, sales.user_id, 'user', logId, 1)
        sent++
      } else {
        errors++
      }
    }

    return { processed, sent, errors }
  } catch (error) {
    console.error('[CRM Notification] Error processing sales inactivity reminders:', error)
    return { processed, sent, errors: errors + 1 }
  }
}

// =====================================================
// 6. WEEKLY PERFORMANCE SUMMARY
// =====================================================

export async function sendWeeklyPerformanceSummary(): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin()

  try {
    // Calculate last week period (Monday to Sunday)
    const now = new Date()
    const dayOfWeek = now.getDay()
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1 + 7
    const lastMonday = new Date(now)
    lastMonday.setDate(now.getDate() - daysToLastMonday)
    lastMonday.setHours(0, 0, 0, 0)

    const lastSunday = new Date(lastMonday)
    lastSunday.setDate(lastMonday.getDate() + 6)
    lastSunday.setHours(23, 59, 59, 999)

    // Get all active salespersons
    const salespersons = await getSalespersons(supabase)
    const salesManagers = await getSalesManagers(supabase)
    const marketingManagers = await getMarketingManagers(supabase)
    const directors = await getDirectors(supabase, 'all')

    if (salespersons.length === 0) {
      return { success: false, error: 'No salespersons found' }
    }

    const salesPerformances: SalesPerformanceData[] = []
    const teamTotals = {
      activities: 0,
      pipeline_count: 0,
      pipeline_value: 0,
      new_customers: 0,
      won_count: 0,
      won_value: 0,
      lost_count: 0,
      lost_value: 0,
    }

    for (const sales of salespersons) {
      // Get activities for the period
      const { data: activities } = await supabase
        .from('activities')
        .select('activity_type')
        .eq('owner_user_id', sales.user_id)
        .gte('completed_at', lastMonday.toISOString())
        .lte('completed_at', lastSunday.toISOString())
        .eq('status', 'Done')

      const activityCounts: Record<string, number> = {}
      activities?.forEach(a => {
        activityCounts[a.activity_type] = (activityCounts[a.activity_type] || 0) + 1
      })

      // Get pipeline stats
      const { data: pipelineData } = await supabase
        .from('opportunities')
        .select('estimated_value, stage')
        .eq('owner_user_id', sales.user_id)
        .not('stage', 'in', '("Closed Won","Closed Lost")')

      // Get won deals
      const { data: wonDeals } = await supabase
        .from('opportunities')
        .select('estimated_value')
        .eq('owner_user_id', sales.user_id)
        .eq('stage', 'Closed Won')
        .gte('closed_at', lastMonday.toISOString())
        .lte('closed_at', lastSunday.toISOString())

      // Get lost deals
      const { data: lostDeals } = await supabase
        .from('opportunities')
        .select('estimated_value, lost_reason')
        .eq('owner_user_id', sales.user_id)
        .eq('stage', 'Closed Lost')
        .gte('closed_at', lastMonday.toISOString())
        .lte('closed_at', lastSunday.toISOString())

      const lostReasonCounts: Record<string, number> = {}
      lostDeals?.forEach(d => {
        if (d.lost_reason) {
          lostReasonCounts[d.lost_reason] = (lostReasonCounts[d.lost_reason] || 0) + 1
        }
      })

      // Get new customers (accounts with first transaction in the period)
      const { data: newCustomers } = await supabase
        .from('accounts')
        .select('account_id')
        .eq('owner_user_id', sales.user_id)
        .gte('created_at', lastMonday.toISOString())
        .lte('created_at', lastSunday.toISOString())

      // Get RFQ tickets submitted
      const { data: rfqTickets } = await supabase
        .from('tickets')
        .select('id')
        .eq('created_by', sales.user_id)
        .eq('ticket_type', 'RFQ')
        .gte('created_at', lastMonday.toISOString())
        .lte('created_at', lastSunday.toISOString())

      // Calculate average sales cycle (from create to close for won deals)
      const { data: wonDealsWithCycle } = await supabase
        .from('opportunities')
        .select('created_at, closed_at')
        .eq('owner_user_id', sales.user_id)
        .eq('stage', 'Closed Won')
        .not('closed_at', 'is', null)
        .gte('closed_at', lastMonday.toISOString())
        .lte('closed_at', lastSunday.toISOString())

      let avgCycleDays: number | null = null
      if (wonDealsWithCycle && wonDealsWithCycle.length > 0) {
        const totalDays = wonDealsWithCycle.reduce((sum, deal) => {
          if (deal.created_at && deal.closed_at) {
            const created = new Date(deal.created_at)
            const closed = new Date(deal.closed_at)
            return sum + ((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
          }
          return sum
        }, 0)
        avgCycleDays = totalDays / wonDealsWithCycle.length
      }

      const totalActivities = activities?.length || 0
      const pipelineCount = pipelineData?.length || 0
      const pipelineValue = pipelineData?.reduce((sum, p) => sum + (p.estimated_value || 0), 0) || 0
      const wonCount = wonDeals?.length || 0
      const wonValue = wonDeals?.reduce((sum, w) => sum + (w.estimated_value || 0), 0) || 0
      const lostCount = lostDeals?.length || 0
      const lostValue = lostDeals?.reduce((sum, l) => sum + (l.estimated_value || 0), 0) || 0

      salesPerformances.push({
        user_id: sales.user_id,
        name: sales.name,
        email: sales.email,
        activities: {
          total: totalActivities,
          by_type: Object.entries(activityCounts).map(([type, count]) => ({ type, count })),
        },
        pipeline: {
          total_count: pipelineCount,
          total_value: pipelineValue,
        },
        new_customers: newCustomers?.length || 0,
        won: {
          count: wonCount,
          value: wonValue,
        },
        lost: {
          count: lostCount,
          value: lostValue,
          reasons: Object.entries(lostReasonCounts).map(([reason, count]) => ({ reason, count })),
        },
        open_pipeline: {
          count: pipelineCount,
          value: pipelineValue,
        },
        services_statistics: {
          leads: [],
          pipeline: [],
          tickets: [],
          quotations: [],
        },
        rfq_submitted: rfqTickets?.length || 0,
        avg_sales_cycle_days: avgCycleDays,
      })

      // Update team totals
      teamTotals.activities += totalActivities
      teamTotals.pipeline_count += pipelineCount
      teamTotals.pipeline_value += pipelineValue
      teamTotals.new_customers += newCustomers?.length || 0
      teamTotals.won_count += wonCount
      teamTotals.won_value += wonValue
      teamTotals.lost_count += lostCount
      teamTotals.lost_value += lostValue
    }

    const emailData: WeeklyPerformanceSummaryData = {
      period: {
        start: lastMonday.toISOString(),
        end: lastSunday.toISOString(),
      },
      salesPerformances,
      teamTotals,
    }

    const html = generateWeeklyPerformanceSummaryEmail(emailData)
    const periodStr = `${lastMonday.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${lastSunday.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
    const subject = `Laporan Performa Sales Mingguan: ${periodStr}`

    // All salespersons, CC to managers and directors
    const toEmails = salespersons.map(s => s.email)
    const ccEmails = [
      ...salesManagers.map(m => m.email),
      ...marketingManagers.map(m => m.email),
      ...directors.map(d => d.email),
    ].filter((email, index, self) => self.indexOf(email) === index)

    const result = await sendCRMEmail({
      to: toEmails,
      cc: ccEmails,
      subject,
      html,
    })

    await logEmailSent(supabase, 'weekly_performance_summary', toEmails, ccEmails, subject, {
      metadata: {
        period_start: lastMonday.toISOString(),
        period_end: lastSunday.toISOString(),
        sales_count: salespersons.length,
        team_totals: teamTotals,
      },
      messageId: result.messageId,
      status: result.success ? 'sent' : 'failed',
      error: result.error,
    })

    return { success: result.success, error: result.error }
  } catch (error) {
    console.error('[CRM Notification] Error sending weekly performance summary:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
