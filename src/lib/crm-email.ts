// =====================================================
// CRM Email Service
// Separate SMTP configuration for CRM notifications
// to avoid conflict with quotation email service
// =====================================================

import nodemailer from 'nodemailer'

// CRM-specific SMTP Configuration from environment variables
// These are separate from the quotation SMTP settings
const CRM_SMTP_CONFIG = {
  host: process.env.CRM_SMTP_HOST,
  port: parseInt(process.env.CRM_SMTP_PORT || '465'),
  secure: process.env.CRM_SMTP_SECURE === 'true',
  auth: {
    user: process.env.CRM_SMTP_USER,
    pass: process.env.CRM_SMTP_PASS,
  },
}

// Default sender for CRM emails
const CRM_DEFAULT_FROM = process.env.CRM_SMTP_FROM || 'CRM UGC Logistics <crm@ugc.co.id>'

export interface CrmEmailOptions {
  to: string | string[]
  subject: string
  html: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string
}

export interface CrmEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Create Nodemailer transporter for CRM emails
 */
function createCrmTransporter() {
  return nodemailer.createTransport({
    host: CRM_SMTP_CONFIG.host,
    port: CRM_SMTP_CONFIG.port,
    secure: CRM_SMTP_CONFIG.secure,
    auth: CRM_SMTP_CONFIG.auth,
  })
}

/**
 * Check if CRM email service is configured
 */
export function isCrmEmailConfigured(): boolean {
  return !!(
    process.env.CRM_SMTP_HOST &&
    process.env.CRM_SMTP_USER &&
    process.env.CRM_SMTP_PASS
  )
}

/**
 * Send email using CRM SMTP configuration
 */
export async function sendCrmEmail(options: CrmEmailOptions): Promise<CrmEmailResult> {
  try {
    // Check if CRM SMTP is configured
    if (!isCrmEmailConfigured()) {
      console.error('CRM SMTP is not configured')
      return {
        success: false,
        error: 'CRM email service not configured. Please set CRM_SMTP environment variables (CRM_SMTP_HOST, CRM_SMTP_USER, CRM_SMTP_PASS).',
      }
    }

    const { to, subject, html, cc, bcc, replyTo } = options

    // Validate recipient
    if (!to || (Array.isArray(to) && to.length === 0)) {
      return {
        success: false,
        error: 'Recipient email address is required',
      }
    }

    // Create transporter
    const transporter = createCrmTransporter()

    // Send email
    const info = await transporter.sendMail({
      from: CRM_DEFAULT_FROM,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
      bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
      replyTo,
    })

    console.log('CRM email sent successfully:', info.messageId)

    return {
      success: true,
      messageId: info.messageId,
    }
  } catch (err) {
    console.error('CRM email send error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected error sending CRM email',
    }
  }
}

/**
 * Verify CRM SMTP connection
 */
export async function verifyCrmSmtpConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isCrmEmailConfigured()) {
      return {
        success: false,
        error: 'CRM SMTP is not configured',
      }
    }

    const transporter = createCrmTransporter()
    await transporter.verify()

    return { success: true }
  } catch (err) {
    console.error('CRM SMTP verification error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to verify CRM SMTP connection',
    }
  }
}

/**
 * Format email addresses array to string for display
 */
export function formatEmailRecipients(emails: string | string[]): string {
  if (Array.isArray(emails)) {
    return emails.join(', ')
  }
  return emails
}
