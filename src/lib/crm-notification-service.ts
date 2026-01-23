// =====================================================
// CRM Notification Service
// Handles all CRM email notification logic
// =====================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { sendCrmEmail, isCrmEmailConfigured } from '@/lib/crm-email'
import {
  newLeadEmailTemplate,
  unclaimedLeadReminderTemplate,
  pipelineDueReminderTemplate,
  pipelineOverdueTemplate,
  salesInactivityTemplate,
  weeklyPerformanceSummaryTemplate,
  type NewLeadEmailData,
  type UnclaimedLeadEmailData,
  type PipelineDueReminderData,
  type PipelineOverdueData,
  type SalesInactivityData,
  type SalesPerformanceData,
  type WeeklyPerformanceEmailData,
} from '@/lib/crm-email-templates'
import type { UserRole } from '@/types/database'

// App URL for generating links
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.ugc.co.id'

// Unclaimed lead reminder thresholds in hours
const UNCLAIMED_THRESHOLDS = [4, 6, 12, 24, 36, 48, 60, 72]

// Pipeline due date reminder thresholds (hours before due)
const PIPELINE_DUE_THRESHOLDS = [24, 12, 4]

// Pipeline overdue reminder thresholds (hours after due)
const PIPELINE_OVERDUE_THRESHOLDS = [1, 6, 12, 24]

// Days for inactivity check
const INACTIVITY_DAYS = 2

// =====================================================
// Helper Functions
// =====================================================

interface UserProfile {
  user_id: string
  email: string
  name: string
  role: UserRole
}

/**
 * Get users by roles
 */
async function getUsersByRoles(roles: UserRole[]): Promise<UserProfile[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email, name, role')
    .in('role', roles)
    .eq('is_active', true)

  if (error) {
    console.error('Error fetching users by roles:', error)
    return []
  }

  return data || []
}

/**
 * Get user by ID
 */
async function getUserById(userId: string): Promise<UserProfile | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email, name, role')
    .eq('user_id', userId)
    .single()

  if (error) {
    console.error('Error fetching user by ID:', error)
    return null
  }

  return data
}

/**
 * Check if notification was already sent
 */
async function notificationExists(
  entityType: string,
  entityId: string,
  event: string,
  threshold?: number
): Promise<boolean> {
  const supabase = createAdminClient()

  // Use type assertion since crm_notification_logs table is created via migration
  let query = (supabase.from('crm_notification_logs') as any)
    .select('id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('event', event)
    .eq('status', 'sent')

  if (threshold !== undefined) {
    query = query.eq('threshold', threshold)
  } else {
    query = query.is('threshold', null)
  }

  const { data, error } = await query.limit(1)

  if (error) {
    console.error('Error checking notification existence:', error)
    return false
  }

  return (data?.length ?? 0) > 0
}

/**
 * Log notification
 */
async function logNotification(params: {
  entityType: string
  entityId: string
  event: string
  threshold?: number
  recipientEmails: string[]
  ccEmails?: string[]
  subject: string
  status: 'sent' | 'failed'
  errorMessage?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  const supabase = createAdminClient()

  // Use type assertion since crm_notification_logs table is created via migration
  // and may not be in the generated types yet
  const { error } = await (supabase.from('crm_notification_logs') as any).upsert(
    {
      entity_type: params.entityType,
      entity_id: params.entityId,
      event: params.event,
      threshold: params.threshold ?? null,
      recipient_emails: params.recipientEmails,
      cc_emails: params.ccEmails ?? null,
      subject: params.subject,
      status: params.status,
      error_message: params.errorMessage ?? null,
      metadata: params.metadata ?? null,
      sent_at: new Date().toISOString(),
    },
    {
      onConflict: 'entity_type,entity_id,event,threshold',
    }
  )

  if (error) {
    console.error('Error logging notification:', error)
  }
}

/**
 * Format date to Indonesian locale
 */
function formatDateIndonesian(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
}

/**
 * Format date short
 */
function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  })
}

// =====================================================
// Send New Lead Notification
// =====================================================

export interface SendNewLeadNotificationParams {
  leadId: string
  handoverByUserId: string
}

// Lead type for email notifications
interface LeadForNotification {
  lead_id: string
  company_name: string
  pic_name: string | null
  pic_email: string | null
  pic_phone: string | null
  source: string
  industry: string | null
  inquiry_text: string | null
  priority: number
}

// Pool entry type
interface PoolEntryForNotification {
  pool_id: number
  lead_id: string
  handed_over_by: string | null
  handed_over_at: string
  handover_notes: string | null
  priority: number
}

export async function sendNewLeadNotification(
  params: SendNewLeadNotificationParams
): Promise<{ success: boolean; error?: string }> {
  if (!isCrmEmailConfigured()) {
    return { success: false, error: 'CRM email not configured' }
  }

  const supabase = createAdminClient()

  // Get lead details
  const { data: leadData, error: leadError } = await supabase
    .from('leads')
    .select('lead_id, company_name, pic_name, pic_email, pic_phone, source, industry, inquiry_text, priority')
    .eq('lead_id', params.leadId)
    .single()

  const lead = leadData as LeadForNotification | null

  if (leadError || !lead) {
    return { success: false, error: 'Lead not found' }
  }

  // Get handover pool details
  const { data: poolData } = await supabase
    .from('lead_handover_pool')
    .select('pool_id, lead_id, handed_over_by, handed_over_at, handover_notes, priority')
    .eq('lead_id', params.leadId)
    .order('handed_over_at', { ascending: false })
    .limit(1)
    .single()

  const poolEntry = poolData as PoolEntryForNotification | null

  // Get handover user
  const handoverUser = await getUserById(params.handoverByUserId)
  if (!handoverUser) {
    return { success: false, error: 'Handover user not found' }
  }

  // Get all salespersons (TO recipients)
  const salespeople = await getUsersByRoles(['salesperson'])
  if (salespeople.length === 0) {
    return { success: false, error: 'No salesperson found' }
  }

  // Get CC recipients: sales manager, marketing manager, the user who assigned
  const managers = await getUsersByRoles(['sales manager', 'Marketing Manager'])
  const ccEmails = [...managers.map((m) => m.email)]

  // Add handover user to CC if not already included
  if (!ccEmails.includes(handoverUser.email)) {
    ccEmails.push(handoverUser.email)
  }

  // Prepare email data
  const emailData: NewLeadEmailData = {
    companyName: lead.company_name,
    picName: lead.pic_name,
    picEmail: lead.pic_email,
    picPhone: lead.pic_phone,
    source: lead.source,
    industry: lead.industry,
    inquiryText: lead.inquiry_text,
    priority: poolEntry?.priority || lead.priority || 3,
    handoverNotes: poolEntry?.handover_notes ?? null,
    handoverByName: handoverUser.name,
    leadId: params.leadId,
    appUrl: APP_URL,
  }

  const { subject, html } = newLeadEmailTemplate(emailData)

  // Send email
  const toEmails = salespeople.map((s) => s.email)
  const result = await sendCrmEmail({
    to: toEmails,
    cc: ccEmails.length > 0 ? ccEmails : undefined,
    subject,
    html,
  })

  // Log notification
  await logNotification({
    entityType: 'lead',
    entityId: params.leadId,
    event: 'new_lead',
    recipientEmails: toEmails,
    ccEmails,
    subject,
    status: result.success ? 'sent' : 'failed',
    errorMessage: result.error,
    metadata: { companyName: lead.company_name, handoverBy: handoverUser.name },
  })

  return result
}

// =====================================================
// Process Unclaimed Lead Reminders
// =====================================================

export interface UnclaimedLeadResult {
  processed: number
  sent: number
  errors: string[]
}

// Type for unclaimed lead query result
interface UnclaimedLeadEntry {
  pool_id: number
  lead_id: string
  handed_over_at: string
  handed_over_by: string | null
  handover_notes: string | null
  leads: {
    lead_id: string
    company_name: string
    pic_name: string | null
    pic_email: string | null
    pic_phone: string | null
    source: string
    industry: string | null
  }
}

export async function processUnclaimedLeadReminders(): Promise<UnclaimedLeadResult> {
  const result: UnclaimedLeadResult = { processed: 0, sent: 0, errors: [] }

  if (!isCrmEmailConfigured()) {
    result.errors.push('CRM email not configured')
    return result
  }

  const supabase = createAdminClient()

  // Get all unclaimed leads with hours since handover
  const { data: unclaimedLeadsData, error } = await supabase
    .from('lead_handover_pool')
    .select(`
      pool_id,
      lead_id,
      handed_over_at,
      handed_over_by,
      handover_notes,
      leads!inner (
        lead_id,
        company_name,
        pic_name,
        pic_email,
        pic_phone,
        source,
        industry
      )
    `)
    .is('claimed_at', null)
    .not('handed_over_at', 'is', null)

  // Type assertion for the join query result
  const unclaimedLeads = unclaimedLeadsData as UnclaimedLeadEntry[] | null

  if (error) {
    result.errors.push(`Error fetching unclaimed leads: ${error.message}`)
    return result
  }

  if (!unclaimedLeads || unclaimedLeads.length === 0) {
    return result
  }

  // Get recipient lists
  const salespeople = await getUsersByRoles(['salesperson'])
  const managers = await getUsersByRoles(['sales manager', 'Marketing Manager', 'Director'])

  if (salespeople.length === 0) {
    result.errors.push('No salesperson found')
    return result
  }

  const toEmails = salespeople.map((s) => s.email)
  const ccEmails = managers.map((m) => m.email)

  // Process each unclaimed lead
  for (const entry of unclaimedLeads) {
    result.processed++

    const handedOverAt = new Date(entry.handed_over_at)
    const now = new Date()
    const hoursPassed = Math.floor((now.getTime() - handedOverAt.getTime()) / (1000 * 60 * 60))

    // Find applicable thresholds
    for (const threshold of UNCLAIMED_THRESHOLDS) {
      if (hoursPassed >= threshold) {
        // Check if already sent for this threshold
        const alreadySent = await notificationExists('lead', entry.lead_id, 'unclaimed', threshold)
        if (alreadySent) continue

        // Get handover user name
        let handoverByName = 'Marketing'
        if (entry.handed_over_by) {
          const handoverUser = await getUserById(entry.handed_over_by)
          if (handoverUser) {
            handoverByName = handoverUser.name

            // Add handover user to CC if not already included
            if (!ccEmails.includes(handoverUser.email)) {
              ccEmails.push(handoverUser.email)
            }
          }
        }

        // Prepare email data
        const lead = entry.leads

        const emailData: UnclaimedLeadEmailData = {
          companyName: lead.company_name,
          picName: lead.pic_name,
          picEmail: lead.pic_email,
          picPhone: lead.pic_phone,
          source: lead.source,
          hoursUnclaimed: threshold,
          handoverByName,
          leadId: entry.lead_id,
          appUrl: APP_URL,
        }

        const { subject, html } = unclaimedLeadReminderTemplate(emailData)

        // Send email
        const emailResult = await sendCrmEmail({
          to: toEmails,
          cc: ccEmails.length > 0 ? ccEmails : undefined,
          subject,
          html,
        })

        // Log notification
        await logNotification({
          entityType: 'lead',
          entityId: entry.lead_id,
          event: 'unclaimed',
          threshold,
          recipientEmails: toEmails,
          ccEmails,
          subject,
          status: emailResult.success ? 'sent' : 'failed',
          errorMessage: emailResult.error,
          metadata: { companyName: lead.company_name, hoursPassed: threshold },
        })

        if (emailResult.success) {
          result.sent++
        } else {
          result.errors.push(`Failed to send unclaimed reminder for ${lead.company_name}: ${emailResult.error}`)
        }
      }
    }
  }

  return result
}

// =====================================================
// Process Pipeline Due Date Reminders
// =====================================================

export interface PipelineDueResult {
  processed: number
  sent: number
  errors: string[]
}

// Type for opportunity query result
interface OpportunityForNotification {
  opportunity_id: string
  name: string
  stage: string
  next_step: string | null
  next_step_due_date: string | null
  estimated_value: number | null
  currency: string
  owner_user_id: string | null
  accounts: {
    account_id: string
    company_name: string
  }
}

export async function processPipelineDueDateReminders(): Promise<PipelineDueResult> {
  const result: PipelineDueResult = { processed: 0, sent: 0, errors: [] }

  if (!isCrmEmailConfigured()) {
    result.errors.push('CRM email not configured')
    return result
  }

  const supabase = createAdminClient()

  // Get active opportunities with due dates
  const { data: opportunitiesData, error } = await supabase
    .from('opportunities')
    .select(`
      opportunity_id,
      name,
      stage,
      next_step,
      next_step_due_date,
      estimated_value,
      currency,
      owner_user_id,
      accounts!inner (
        account_id,
        company_name
      )
    `)
    .not('stage', 'in', '("Closed Won","Closed Lost")')
    .not('next_step_due_date', 'is', null)

  // Type assertion for the join query result
  const opportunities = opportunitiesData as OpportunityForNotification[] | null

  if (error) {
    result.errors.push(`Error fetching opportunities: ${error.message}`)
    return result
  }

  if (!opportunities || opportunities.length === 0) {
    return result
  }

  // Process each opportunity
  for (const opp of opportunities) {
    result.processed++

    if (!opp.next_step_due_date || !opp.owner_user_id) continue

    // Parse due date - treat as end of day in Jakarta timezone
    const dueDate = new Date(opp.next_step_due_date + 'T23:59:59+07:00')
    const now = new Date()

    // Calculate hours until due
    const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60)

    // Skip if already overdue
    if (hoursUntilDue < 0) continue

    // Check each threshold
    for (const threshold of PIPELINE_DUE_THRESHOLDS) {
      // Check if within threshold window (threshold - 0.5 to threshold + 0.5 hours)
      if (hoursUntilDue >= threshold - 0.5 && hoursUntilDue <= threshold + 0.5) {
        // Check if already sent
        const alreadySent = await notificationExists('opportunity', opp.opportunity_id, 'due_reminder', threshold)
        if (alreadySent) continue

        // Get owner user
        const owner = await getUserById(opp.owner_user_id)
        if (!owner) continue

        // Prepare email data
        const emailData: PipelineDueReminderData = {
          opportunityName: opp.name,
          accountName: opp.accounts.company_name,
          stage: opp.stage,
          nextStep: opp.next_step,
          dueDate: formatDateIndonesian(opp.next_step_due_date + 'T23:59:59+07:00'),
          hoursRemaining: threshold,
          estimatedValue: opp.estimated_value,
          currency: opp.currency || 'IDR',
          opportunityId: opp.opportunity_id,
          appUrl: APP_URL,
        }

        const { subject, html } = pipelineDueReminderTemplate(emailData)

        // Send email to owner only
        const emailResult = await sendCrmEmail({
          to: owner.email,
          subject,
          html,
        })

        // Log notification
        await logNotification({
          entityType: 'opportunity',
          entityId: opp.opportunity_id,
          event: 'due_reminder',
          threshold,
          recipientEmails: [owner.email],
          subject,
          status: emailResult.success ? 'sent' : 'failed',
          errorMessage: emailResult.error,
          metadata: { opportunityName: opp.name, hoursRemaining: threshold },
        })

        if (emailResult.success) {
          result.sent++
        } else {
          result.errors.push(`Failed to send due reminder for ${opp.name}: ${emailResult.error}`)
        }
      }
    }
  }

  return result
}

// =====================================================
// Process Pipeline Overdue Reminders
// =====================================================

export interface PipelineOverdueResult {
  processed: number
  sent: number
  errors: string[]
}

export async function processOverduePipelineReminders(): Promise<PipelineOverdueResult> {
  const result: PipelineOverdueResult = { processed: 0, sent: 0, errors: [] }

  if (!isCrmEmailConfigured()) {
    result.errors.push('CRM email not configured')
    return result
  }

  const supabase = createAdminClient()

  // Get active opportunities with past due dates
  const { data: opportunitiesData, error } = await supabase
    .from('opportunities')
    .select(`
      opportunity_id,
      name,
      stage,
      next_step,
      next_step_due_date,
      estimated_value,
      currency,
      owner_user_id,
      accounts!inner (
        account_id,
        company_name
      )
    `)
    .not('stage', 'in', '("Closed Won","Closed Lost")')
    .not('next_step_due_date', 'is', null)

  // Type assertion for the join query result
  const opportunities = opportunitiesData as OpportunityForNotification[] | null

  if (error) {
    result.errors.push(`Error fetching opportunities: ${error.message}`)
    return result
  }

  if (!opportunities || opportunities.length === 0) {
    return result
  }

  // Get managers for CC on 24-hour overdue
  const managers = await getUsersByRoles(['sales manager', 'Director'])
  const managerEmails = managers.map((m) => m.email)

  // Process each opportunity
  for (const opp of opportunities) {
    result.processed++

    if (!opp.next_step_due_date || !opp.owner_user_id) continue

    // Parse due date - treat as end of day in Jakarta timezone
    const dueDate = new Date(opp.next_step_due_date + 'T23:59:59+07:00')
    const now = new Date()

    // Calculate hours overdue
    const hoursOverdue = (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60)

    // Skip if not overdue yet
    if (hoursOverdue < 0) continue

    // Check each threshold
    for (const threshold of PIPELINE_OVERDUE_THRESHOLDS) {
      // Check if within threshold window
      if (hoursOverdue >= threshold - 0.5 && hoursOverdue <= threshold + 0.5) {
        // Check if already sent
        const alreadySent = await notificationExists('opportunity', opp.opportunity_id, 'overdue', threshold)
        if (alreadySent) continue

        // Get owner user
        const owner = await getUserById(opp.owner_user_id)
        if (!owner) continue

        // Prepare email data
        const emailData: PipelineOverdueData = {
          opportunityName: opp.name,
          accountName: opp.accounts.company_name,
          stage: opp.stage,
          nextStep: opp.next_step,
          dueDate: formatDateIndonesian(opp.next_step_due_date + 'T23:59:59+07:00'),
          hoursOverdue: threshold,
          estimatedValue: opp.estimated_value,
          currency: opp.currency || 'IDR',
          opportunityId: opp.opportunity_id,
          appUrl: APP_URL,
        }

        const { subject, html } = pipelineOverdueTemplate(emailData)

        // CC managers only on 24-hour overdue
        const ccEmails = threshold >= 24 ? managerEmails : undefined

        // Send email
        const emailResult = await sendCrmEmail({
          to: owner.email,
          cc: ccEmails,
          subject,
          html,
        })

        // Log notification
        await logNotification({
          entityType: 'opportunity',
          entityId: opp.opportunity_id,
          event: 'overdue',
          threshold,
          recipientEmails: [owner.email],
          ccEmails: ccEmails || [],
          subject,
          status: emailResult.success ? 'sent' : 'failed',
          errorMessage: emailResult.error,
          metadata: { opportunityName: opp.name, hoursOverdue: threshold },
        })

        if (emailResult.success) {
          result.sent++
        } else {
          result.errors.push(`Failed to send overdue reminder for ${opp.name}: ${emailResult.error}`)
        }
      }
    }
  }

  return result
}

// =====================================================
// Process Sales Inactivity Reminders
// =====================================================

export interface InactivityResult {
  processed: number
  sent: number
  errors: string[]
}

// Type for activity query result
interface ActivityForNotification {
  activity_id: string
  created_at: string
  activity_type: string
}

export async function processSalesInactivityReminders(): Promise<InactivityResult> {
  const result: InactivityResult = { processed: 0, sent: 0, errors: [] }

  if (!isCrmEmailConfigured()) {
    result.errors.push('CRM email not configured')
    return result
  }

  const supabase = createAdminClient()

  // Get all active salespersons
  const salespeople = await getUsersByRoles(['salesperson'])
  if (salespeople.length === 0) {
    return result
  }

  // Get sales managers for CC
  const managers = await getUsersByRoles(['sales manager'])
  const managerEmails = managers.map((m) => m.email)

  // Calculate the cutoff date (2 days ago)
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - INACTIVITY_DAYS)

  // Process each salesperson
  for (const sales of salespeople) {
    result.processed++

    // Get last activity for this salesperson
    const { data: activitiesData, error } = await supabase
      .from('activities')
      .select('activity_id, created_at, activity_type')
      .eq('owner_user_id', sales.user_id)
      .order('created_at', { ascending: false })
      .limit(1)

    // Type assertion for query result
    const activities = activitiesData as ActivityForNotification[] | null

    if (error) {
      result.errors.push(`Error fetching activities for ${sales.name}: ${error.message}`)
      continue
    }

    // Check if there's no recent activity
    let shouldNotify = false
    let lastActivityDate = ''
    let lastActivityType: string | null = null
    let daysSinceLastActivity = INACTIVITY_DAYS

    if (!activities || activities.length === 0) {
      // No activities at all
      shouldNotify = true
      lastActivityDate = 'N/A'
    } else {
      const lastActivity = activities[0]
      const lastActivityTime = new Date(lastActivity.created_at)

      if (lastActivityTime < cutoffDate) {
        shouldNotify = true
        lastActivityDate = formatDateIndonesian(lastActivity.created_at)
        lastActivityType = lastActivity.activity_type
        daysSinceLastActivity = Math.floor(
          (new Date().getTime() - lastActivityTime.getTime()) / (1000 * 60 * 60 * 24)
        )
      }
    }

    if (!shouldNotify) continue

    // Create a unique ID for today's inactivity check
    const today = new Date().toISOString().split('T')[0]
    const entityId = `${sales.user_id}_${today}`

    // Check if already sent today
    const alreadySent = await notificationExists('activity', entityId, 'inactivity')
    if (alreadySent) continue

    // Prepare email data
    const emailData: SalesInactivityData = {
      salesName: sales.name,
      lastActivityDate,
      lastActivityType,
      daysSinceLastActivity,
      appUrl: APP_URL,
    }

    const { subject, html } = salesInactivityTemplate(emailData)

    // Send email
    const emailResult = await sendCrmEmail({
      to: sales.email,
      cc: managerEmails.length > 0 ? managerEmails : undefined,
      subject,
      html,
    })

    // Log notification
    await logNotification({
      entityType: 'activity',
      entityId,
      event: 'inactivity',
      recipientEmails: [sales.email],
      ccEmails: managerEmails,
      subject,
      status: emailResult.success ? 'sent' : 'failed',
      errorMessage: emailResult.error,
      metadata: { salesName: sales.name, daysSinceLastActivity },
    })

    if (emailResult.success) {
      result.sent++
    } else {
      result.errors.push(`Failed to send inactivity reminder for ${sales.name}: ${emailResult.error}`)
    }
  }

  return result
}

// =====================================================
// Send Weekly Performance Summary
// =====================================================

export interface WeeklySummaryResult {
  success: boolean
  sent: number
  errors: string[]
}

export async function sendWeeklyPerformanceSummary(): Promise<WeeklySummaryResult> {
  const result: WeeklySummaryResult = { success: false, sent: 0, errors: [] }

  if (!isCrmEmailConfigured()) {
    result.errors.push('CRM email not configured')
    return result
  }

  const supabase = createAdminClient()

  // Calculate week range (previous Monday to Sunday)
  const now = new Date()
  const dayOfWeek = now.getDay()
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const lastMonday = new Date(now)
  lastMonday.setDate(now.getDate() - daysToLastMonday - 7)
  lastMonday.setHours(0, 0, 0, 0)

  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)
  lastSunday.setHours(23, 59, 59, 999)

  const weekStart = lastMonday.toISOString()
  const weekEnd = lastSunday.toISOString()

  // Get all salespersons
  const salespeople = await getUsersByRoles(['salesperson'])
  if (salespeople.length === 0) {
    result.errors.push('No salesperson found')
    return result
  }

  // Get CC recipients
  const managers = await getUsersByRoles(['sales manager', 'Marketing Manager', 'Director'])
  const ccEmails = managers.map((m) => m.email)

  // Collect performance data for each salesperson
  const performanceData: SalesPerformanceData[] = []

  // Type definitions for weekly summary queries
  type ActivitySummary = { activity_type: string }
  type OpportunitySummary = { opportunity_id: string; estimated_value: number | null }
  type AccountSummary = { account_id: string }
  type StageHistoryWithOpp = {
    opportunity_id: string
    opportunities: {
      opportunity_id: string
      estimated_value: number | null
      owner_user_id: string
      lost_reason?: string | null
    }
  }

  for (const sales of salespeople) {
    // Get activities count by type
    const { data: activitiesRaw } = await supabase
      .from('activities')
      .select('activity_type')
      .eq('owner_user_id', sales.user_id)
      .gte('created_at', weekStart)
      .lte('created_at', weekEnd)

    const activitiesData = activitiesRaw as ActivitySummary[] | null

    const activitiesByType: { type: string; count: number }[] = []
    const activityCounts: Record<string, number> = {}
    let totalActivities = 0

    if (activitiesData) {
      for (const activity of activitiesData) {
        activityCounts[activity.activity_type] = (activityCounts[activity.activity_type] || 0) + 1
        totalActivities++
      }
      for (const [type, count] of Object.entries(activityCounts)) {
        activitiesByType.push({ type, count })
      }
    }

    // Get new pipelines created this week
    const { data: newPipelinesRaw } = await supabase
      .from('opportunities')
      .select('opportunity_id, estimated_value')
      .eq('owner_user_id', sales.user_id)
      .gte('created_at', weekStart)
      .lte('created_at', weekEnd)

    const newPipelinesData = newPipelinesRaw as OpportunitySummary[] | null
    const newPipelines = newPipelinesData?.length || 0
    const newPipelineValue = newPipelinesData?.reduce((sum, opp) => sum + (opp.estimated_value || 0), 0) || 0

    // Get new customers (accounts created this week)
    const { data: newCustomersRaw } = await supabase
      .from('accounts')
      .select('account_id')
      .eq('owner_user_id', sales.user_id)
      .gte('created_at', weekStart)
      .lte('created_at', weekEnd)

    const newCustomersData = newCustomersRaw as AccountSummary[] | null
    const newCustomers = newCustomersData?.length || 0

    // Get deals won this week
    const { data: wonDealsRaw } = await supabase
      .from('opportunity_stage_history')
      .select(`
        opportunity_id,
        opportunities!inner (
          opportunity_id,
          estimated_value,
          owner_user_id
        )
      `)
      .eq('new_stage', 'Closed Won')
      .gte('changed_at', weekStart)
      .lte('changed_at', weekEnd)

    const wonDealsData = wonDealsRaw as StageHistoryWithOpp[] | null
    const wonDeals = wonDealsData?.filter(
      (d) => d.opportunities.owner_user_id === sales.user_id
    ) || []
    const wonCount = wonDeals.length
    const wonValue = wonDeals.reduce(
      (sum, d) => sum + (d.opportunities.estimated_value || 0),
      0
    )

    // Get deals lost this week
    const { data: lostDealsRaw } = await supabase
      .from('opportunity_stage_history')
      .select(`
        opportunity_id,
        opportunities!inner (
          opportunity_id,
          estimated_value,
          lost_reason,
          owner_user_id
        )
      `)
      .eq('new_stage', 'Closed Lost')
      .gte('changed_at', weekStart)
      .lte('changed_at', weekEnd)

    const lostDealsData = lostDealsRaw as StageHistoryWithOpp[] | null
    const lostDeals = lostDealsData?.filter(
      (d) => d.opportunities.owner_user_id === sales.user_id
    ) || []
    const lostCount = lostDeals.length
    const lostValue = lostDeals.reduce(
      (sum, d) => sum + (d.opportunities.estimated_value || 0),
      0
    )

    // Count lost reasons
    const lostReasonCounts: Record<string, number> = {}
    for (const deal of lostDeals) {
      const reason = deal.opportunities.lost_reason || 'Tidak disebutkan'
      lostReasonCounts[reason] = (lostReasonCounts[reason] || 0) + 1
    }
    const lostReasons = Object.entries(lostReasonCounts).map(([reason, count]) => ({ reason, count }))

    // Get open pipelines (not closed)
    const { data: openPipelinesRaw } = await supabase
      .from('opportunities')
      .select('opportunity_id, estimated_value')
      .eq('owner_user_id', sales.user_id)
      .not('stage', 'in', '("Closed Won","Closed Lost")')

    const openPipelinesData = openPipelinesRaw as OpportunitySummary[] | null
    const openPipelineCount = openPipelinesData?.length || 0
    const openPipelineValue = openPipelinesData?.reduce((sum, opp) => sum + (opp.estimated_value || 0), 0) || 0

    // Get service statistics from leads and opportunities
    const serviceStats: { service: string; count: number }[] = []
    // Note: This would need actual service tracking in leads/opportunities
    // For now, we'll leave it empty as the schema may not have service codes

    // Get RFQ count (tickets with type RFQ created by this user)
    const { data: rfqRaw } = await supabase
      .from('tickets')
      .select('id')
      .eq('created_by', sales.user_id)
      .eq('ticket_type', 'RFQ')
      .gte('created_at', weekStart)
      .lte('created_at', weekEnd)

    const rfqData = rfqRaw as { id: string }[] | null
    const rfqCount = rfqData?.length || 0

    // Calculate average sales cycle for won deals this week
    let avgSalesCycleDays: number | null = null
    if (wonDeals.length > 0) {
      const cycleDays: number[] = []
      for (const deal of wonDeals) {
        const oppId = deal.opportunities.opportunity_id

        // Get opportunity creation date
        const { data: oppData } = await supabase
          .from('opportunities')
          .select('created_at')
          .eq('opportunity_id', oppId)
          .single()

        if (oppData) {
          // Get closed_at from stage history
          const { data: closeHistory } = await supabase
            .from('opportunity_stage_history')
            .select('changed_at')
            .eq('opportunity_id', oppId)
            .eq('new_stage', 'Closed Won')
            .order('changed_at', { ascending: false })
            .limit(1)
            .single()

          if (closeHistory) {
            const oppCreatedAt = (oppData as { created_at: string }).created_at
            const closedAt = (closeHistory as { changed_at: string }).changed_at
            const days = Math.floor(
              (new Date(closedAt).getTime() - new Date(oppCreatedAt).getTime()) / (1000 * 60 * 60 * 24)
            )
            cycleDays.push(days)
          }
        }
      }

      if (cycleDays.length > 0) {
        avgSalesCycleDays = Math.round(cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length)
      }
    }

    performanceData.push({
      salesId: sales.user_id,
      salesName: sales.name,
      totalActivities,
      activitiesByType,
      newPipelines,
      newPipelineValue,
      newCustomers,
      wonCount,
      wonValue,
      lostCount,
      lostValue,
      lostReasons,
      openPipelineCount,
      openPipelineValue,
      serviceStats,
      rfqCount,
      avgSalesCycleDays,
    })
  }

  // Prepare email data
  const emailData: WeeklyPerformanceEmailData = {
    weekStart: formatDateShort(weekStart),
    weekEnd: formatDateShort(weekEnd),
    salesPerformance: performanceData,
    currency: 'IDR',
    appUrl: APP_URL,
  }

  const { subject, html } = weeklyPerformanceSummaryTemplate(emailData)

  // Send to all salespersons, CC to managers
  const toEmails = salespeople.map((s) => s.email)

  const emailResult = await sendCrmEmail({
    to: toEmails,
    cc: ccEmails.length > 0 ? ccEmails : undefined,
    subject,
    html,
  })

  // Create unique entity ID for this week
  const weekEntityId = `weekly_${lastMonday.toISOString().split('T')[0]}`

  // Log notification
  await logNotification({
    entityType: 'weekly_summary',
    entityId: weekEntityId,
    event: 'weekly_summary',
    recipientEmails: toEmails,
    ccEmails,
    subject,
    status: emailResult.success ? 'sent' : 'failed',
    errorMessage: emailResult.error,
    metadata: {
      weekStart: formatDateShort(weekStart),
      weekEnd: formatDateShort(weekEnd),
      salesCount: salespeople.length,
    },
  })

  if (emailResult.success) {
    result.success = true
    result.sent = 1
  } else {
    result.errors.push(`Failed to send weekly summary: ${emailResult.error}`)
  }

  return result
}
