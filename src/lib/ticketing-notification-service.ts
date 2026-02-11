// =====================================================
// Ticketing Notification Service
// Handles all ticketing email notification logic
// =====================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { sendCrmEmail, isCrmEmailConfigured } from '@/lib/crm-email'
import type { UserRole } from '@/types/database'

// App URL for generating links
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.ugc.co.id'

// =====================================================
// Types
// =====================================================

interface UserProfile {
  user_id: string
  email: string
  name: string
  role: UserRole
}

interface TicketForNotification {
  id: string
  ticket_code: string
  ticket_type: string
  status: string
  priority: string
  subject: string
  description: string | null
  department: string
  origin_dept: string | null
  target_dept: string | null
  created_by: string
  assigned_to: string | null
  created_at: string
  account_id: string | null
}

// =====================================================
// Helper Functions
// =====================================================

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

async function getUsersByDepartmentRole(department: string): Promise<UserProfile[]> {
  const supabase = createAdminClient()

  // Map department codes to roles
  const deptRoleMap: Record<string, UserRole[]> = {
    'MKT': ['Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO'],
    'SAL': ['sales manager', 'salesperson', 'sales support'],
    'DOM': ['domestics Ops'],
    'EXI': ['EXIM Ops'],
    'DTD': ['Import DTD Ops'],
    'TRF': ['traffic & warehous'],
  }

  const roles = deptRoleMap[department] || []
  if (roles.length === 0) return []

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email, name, role')
    .in('role', roles)
    .eq('is_active', true)

  if (error) {
    console.error('Error fetching users by department:', error)
    return []
  }

  return data || []
}

async function getAdminUsers(): Promise<UserProfile[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email, name, role')
    .in('role', ['Director', 'super admin'])
    .eq('is_active', true)

  if (error) {
    console.error('Error fetching admin users:', error)
    return []
  }

  return data || []
}

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

function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    'urgent': '🔴 Urgent',
    'high': '🟠 High',
    'medium': '🟡 Medium',
    'low': '🟢 Low',
  }
  return labels[priority] || priority
}

function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    'urgent': '#dc2626',
    'high': '#ea580c',
    'medium': '#ca8a04',
    'low': '#16a34a',
  }
  return colors[priority] || '#6b7280'
}

// =====================================================
// Email Templates
// =====================================================

interface NewTicketEmailData {
  ticketCode: string
  ticketType: string
  subject: string
  description: string | null
  priority: string
  department: string
  creatorName: string
  createdAt: string
  appUrl: string
}

function newTicketEmailTemplate(data: NewTicketEmailData): { subject: string; html: string } {
  const priorityColor = getPriorityColor(data.priority)

  return {
    subject: `[${data.ticketCode}] Tiket Baru: ${data.subject}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <!-- Header -->
      <div style="border-bottom: 1px solid #e5e5e5; padding-bottom: 20px; margin-bottom: 20px;">
        <h1 style="margin: 0; color: #FF4600; font-size: 24px;">📋 Tiket Baru</h1>
      </div>

      <!-- Content -->
      <div style="margin-bottom: 20px;">
        <p style="margin: 0 0 15px; color: #374151;">
          Tiket baru telah dibuat dan memerlukan penanganan Anda.
        </p>
      </div>

      <!-- Ticket Details -->
      <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 120px;">Kode Tiket</td>
            <td style="padding: 8px 0; color: #111827; font-weight: 600;">${data.ticketCode}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Tipe</td>
            <td style="padding: 8px 0; color: #111827;">${data.ticketType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Subject</td>
            <td style="padding: 8px 0; color: #111827;">${data.subject}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Prioritas</td>
            <td style="padding: 8px 0;">
              <span style="background-color: ${priorityColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">
                ${getPriorityLabel(data.priority)}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Departemen</td>
            <td style="padding: 8px 0; color: #111827;">${data.department}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Dibuat Oleh</td>
            <td style="padding: 8px 0; color: #111827;">${data.creatorName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Waktu</td>
            <td style="padding: 8px 0; color: #111827;">${data.createdAt}</td>
          </tr>
        </table>
      </div>

      ${data.description ? `
      <div style="background-color: #fef3c7; border-radius: 6px; padding: 15px; margin-bottom: 20px;">
        <p style="margin: 0 0 8px; color: #92400e; font-weight: 600; font-size: 14px;">Deskripsi:</p>
        <p style="margin: 0; color: #78350f; font-size: 14px; white-space: pre-wrap;">${data.description}</p>
      </div>
      ` : ''}

      <!-- CTA Button -->
      <div style="text-align: center; margin: 25px 0;">
        <a href="${data.appUrl}/tickets/${data.ticketCode}"
           style="display: inline-block; background-color: #FF4600; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600;">
          Lihat Tiket
        </a>
      </div>

      <!-- Footer -->
      <div style="border-top: 1px solid #e5e5e5; padding-top: 20px; margin-top: 20px; text-align: center;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
          Email ini dikirim secara otomatis oleh UGC Business Command Portal
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `,
  }
}

interface TicketAssignedEmailData {
  ticketCode: string
  ticketType: string
  subject: string
  priority: string
  assignerName: string
  assigneeName: string
  notes: string | null
  appUrl: string
}

function ticketAssignedEmailTemplate(data: TicketAssignedEmailData): { subject: string; html: string } {
  const priorityColor = getPriorityColor(data.priority)

  return {
    subject: `[${data.ticketCode}] Tiket Ditugaskan kepada Anda`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <!-- Header -->
      <div style="border-bottom: 1px solid #e5e5e5; padding-bottom: 20px; margin-bottom: 20px;">
        <h1 style="margin: 0; color: #FF4600; font-size: 24px;">👤 Tiket Ditugaskan</h1>
      </div>

      <!-- Content -->
      <div style="margin-bottom: 20px;">
        <p style="margin: 0 0 15px; color: #374151;">
          Tiket berikut telah ditugaskan kepada Anda oleh <strong>${data.assignerName}</strong>:
        </p>
      </div>

      <!-- Ticket Details -->
      <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 120px;">Kode Tiket</td>
            <td style="padding: 8px 0; color: #111827; font-weight: 600;">${data.ticketCode}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Subject</td>
            <td style="padding: 8px 0; color: #111827;">${data.subject}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Prioritas</td>
            <td style="padding: 8px 0;">
              <span style="background-color: ${priorityColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">
                ${getPriorityLabel(data.priority)}
              </span>
            </td>
          </tr>
        </table>
      </div>

      ${data.notes ? `
      <div style="background-color: #e0f2fe; border-radius: 6px; padding: 15px; margin-bottom: 20px;">
        <p style="margin: 0 0 8px; color: #0369a1; font-weight: 600; font-size: 14px;">Catatan dari ${data.assignerName}:</p>
        <p style="margin: 0; color: #0c4a6e; font-size: 14px;">${data.notes}</p>
      </div>
      ` : ''}

      <!-- CTA Button -->
      <div style="text-align: center; margin: 25px 0;">
        <a href="${data.appUrl}/tickets/${data.ticketCode}"
           style="display: inline-block; background-color: #FF4600; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600;">
          Buka Tiket
        </a>
      </div>

      <!-- Footer -->
      <div style="border-top: 1px solid #e5e5e5; padding-top: 20px; margin-top: 20px; text-align: center;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
          Email ini dikirim secara otomatis oleh UGC Business Command Portal
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `,
  }
}

interface TicketStatusChangedEmailData {
  ticketCode: string
  subject: string
  oldStatus: string
  newStatus: string
  changedByName: string
  changedAt: string
  appUrl: string
}

function ticketStatusChangedEmailTemplate(data: TicketStatusChangedEmailData): { subject: string; html: string } {
  return {
    subject: `[${data.ticketCode}] Status Berubah: ${data.newStatus}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <!-- Header -->
      <div style="border-bottom: 1px solid #e5e5e5; padding-bottom: 20px; margin-bottom: 20px;">
        <h1 style="margin: 0; color: #FF4600; font-size: 24px;">🔄 Status Tiket Berubah</h1>
      </div>

      <!-- Content -->
      <div style="margin-bottom: 20px;">
        <p style="margin: 0 0 15px; color: #374151;">
          Status tiket <strong>${data.ticketCode}</strong> telah diperbarui oleh <strong>${data.changedByName}</strong>.
        </p>
      </div>

      <!-- Status Change -->
      <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin-bottom: 20px; text-align: center;">
        <div style="display: inline-block; margin: 10px;">
          <span style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 5px;">Sebelumnya</span>
          <span style="background-color: #e5e7eb; padding: 6px 12px; border-radius: 6px; font-weight: 600;">${data.oldStatus}</span>
        </div>
        <div style="display: inline-block; margin: 0 10px; color: #9ca3af;">→</div>
        <div style="display: inline-block; margin: 10px;">
          <span style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 5px;">Sekarang</span>
          <span style="background-color: #FF4600; color: white; padding: 6px 12px; border-radius: 6px; font-weight: 600;">${data.newStatus}</span>
        </div>
      </div>

      <div style="text-align: center; margin-bottom: 20px;">
        <p style="margin: 0; color: #6b7280; font-size: 14px;">
          Subject: <strong>${data.subject}</strong>
        </p>
        <p style="margin: 5px 0 0; color: #9ca3af; font-size: 12px;">
          ${data.changedAt}
        </p>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 25px 0;">
        <a href="${data.appUrl}/tickets/${data.ticketCode}"
           style="display: inline-block; background-color: #FF4600; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600;">
          Lihat Tiket
        </a>
      </div>

      <!-- Footer -->
      <div style="border-top: 1px solid #e5e5e5; padding-top: 20px; margin-top: 20px; text-align: center;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
          Email ini dikirim secara otomatis oleh UGC Business Command Portal
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `,
  }
}

// =====================================================
// Notification Functions
// =====================================================

export interface SendNewTicketNotificationParams {
  ticketId: string
}

export async function sendNewTicketNotification(
  params: SendNewTicketNotificationParams
): Promise<{ success: boolean; error?: string }> {
  if (!isCrmEmailConfigured()) {
    return { success: false, error: 'CRM email not configured' }
  }

  const supabase = createAdminClient()

  // Get ticket details
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', params.ticketId)
    .single()

  if (ticketError || !ticket) {
    return { success: false, error: 'Ticket not found' }
  }

  const typedTicket = ticket as TicketForNotification

  // Get creator info
  const creator = await getUserById(typedTicket.created_by)
  if (!creator) {
    return { success: false, error: 'Creator not found' }
  }

  // Get recipients: target department users
  const targetDept = typedTicket.target_dept || typedTicket.department
  const deptUsers = await getUsersByDepartmentRole(targetDept)
  const adminUsers = await getAdminUsers()

  const toEmails = Array.from(new Set(deptUsers.map(u => u.email)))

  const ccEmails = Array.from(new Set(adminUsers.map(u => u.email)))

  if (toEmails.length === 0) {
    return { success: false, error: 'No recipients found' }
  }

  // Prepare email data
  const emailData: NewTicketEmailData = {
    ticketCode: typedTicket.ticket_code,
    ticketType: typedTicket.ticket_type,
    subject: typedTicket.subject,
    description: typedTicket.description,
    priority: typedTicket.priority,
    department: targetDept,
    creatorName: creator.name,
    createdAt: formatDateIndonesian(typedTicket.created_at),
    appUrl: APP_URL,
  }

  const { subject, html } = newTicketEmailTemplate(emailData)

  // Send email
  const result = await sendCrmEmail({
    to: toEmails,
    cc: ccEmails.length > 0 ? ccEmails : undefined,
    subject,
    html,
  })

  return result
}

export interface SendTicketAssignedNotificationParams {
  ticketId: string
  assigneeId: string
  assignerId: string
  notes?: string | null
}

export async function sendTicketAssignedNotification(
  params: SendTicketAssignedNotificationParams
): Promise<{ success: boolean; error?: string }> {
  if (!isCrmEmailConfigured()) {
    return { success: false, error: 'CRM email not configured' }
  }

  const supabase = createAdminClient()

  // Get ticket details
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', params.ticketId)
    .single()

  if (ticketError || !ticket) {
    return { success: false, error: 'Ticket not found' }
  }

  const typedTicket = ticket as TicketForNotification

  // Get assignee and assigner info
  const assignee = await getUserById(params.assigneeId)
  const assigner = await getUserById(params.assignerId)

  if (!assignee || !assigner) {
    return { success: false, error: 'User not found' }
  }

  // Prepare email data
  const emailData: TicketAssignedEmailData = {
    ticketCode: typedTicket.ticket_code,
    ticketType: typedTicket.ticket_type,
    subject: typedTicket.subject,
    priority: typedTicket.priority,
    assignerName: assigner.name,
    assigneeName: assignee.name,
    notes: params.notes || null,
    appUrl: APP_URL,
  }

  const { subject, html } = ticketAssignedEmailTemplate(emailData)

  // Send email to assignee
  const result = await sendCrmEmail({
    to: assignee.email,
    subject,
    html,
  })

  return result
}

export interface SendTicketStatusChangedNotificationParams {
  ticketId: string
  oldStatus: string
  newStatus: string
  changedById: string
}

export async function sendTicketStatusChangedNotification(
  params: SendTicketStatusChangedNotificationParams
): Promise<{ success: boolean; error?: string }> {
  if (!isCrmEmailConfigured()) {
    return { success: false, error: 'CRM email not configured' }
  }

  const supabase = createAdminClient()

  // Get ticket details
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', params.ticketId)
    .single()

  if (ticketError || !ticket) {
    return { success: false, error: 'Ticket not found' }
  }

  const typedTicket = ticket as TicketForNotification

  // Get changer info
  const changer = await getUserById(params.changedById)
  if (!changer) {
    return { success: false, error: 'User not found' }
  }

  // Get creator info for notification
  const creator = await getUserById(typedTicket.created_by)
  const assignee = typedTicket.assigned_to ? await getUserById(typedTicket.assigned_to) : null

  // Prepare recipients (creator and assignee if different from changer)
  const recipients: string[] = []
  if (creator && creator.user_id !== params.changedById) {
    recipients.push(creator.email)
  }
  if (assignee && assignee.user_id !== params.changedById && !recipients.includes(assignee.email)) {
    recipients.push(assignee.email)
  }

  if (recipients.length === 0) {
    return { success: true } // No one to notify
  }

  // Prepare email data
  const emailData: TicketStatusChangedEmailData = {
    ticketCode: typedTicket.ticket_code,
    subject: typedTicket.subject,
    oldStatus: params.oldStatus,
    newStatus: params.newStatus,
    changedByName: changer.name,
    changedAt: formatDateIndonesian(new Date().toISOString()),
    appUrl: APP_URL,
  }

  const { subject, html } = ticketStatusChangedEmailTemplate(emailData)

  // Send email
  const result = await sendCrmEmail({
    to: recipients,
    subject,
    html,
  })

  return result
}
