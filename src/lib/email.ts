import nodemailer from 'nodemailer'

// SMTP Configuration from environment variables
// Required environment variables:
// - SMTP_HOST: SMTP server hostname (e.g., smtp.gmail.com)
// - SMTP_PORT: SMTP port (e.g., 587 for TLS, 465 for SSL)
// - SMTP_USER: SMTP username/email
// - SMTP_PASS: SMTP password or app-specific password
// - SMTP_FROM: Default sender email (e.g., "UGC Logistics <noreply@ugc.co.id>")

const SMTP_CONFIG = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
}

// Default sender
const DEFAULT_FROM = process.env.SMTP_FROM || 'UGC Logistics <noreply@ugc.co.id>'

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
  cc?: string | string[]
  bcc?: string | string[]
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Create Nodemailer transporter
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: SMTP_CONFIG.host,
    port: SMTP_CONFIG.port,
    secure: SMTP_CONFIG.secure,
    auth: SMTP_CONFIG.auth,
  })
}

/**
 * Send email using Nodemailer SMTP
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  try {
    // Check if SMTP is configured
    if (!isEmailServiceConfigured()) {
      console.error('SMTP is not configured')
      return {
        success: false,
        error: 'Email service not configured. Please set SMTP environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS).',
      }
    }

    const { to, subject, html, text, from = DEFAULT_FROM, replyTo, cc, bcc } = options

    // Validate recipient
    if (!to || (Array.isArray(to) && to.length === 0)) {
      return {
        success: false,
        error: 'Recipient email address is required',
      }
    }

    // Create transporter
    const transporter = createTransporter()

    // Send email
    const info = await transporter.sendMail({
      from,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text,
      replyTo,
      cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
      bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
    })

    console.log('Email sent successfully:', info.messageId)

    return {
      success: true,
      messageId: info.messageId,
    }
  } catch (err) {
    console.error('Email send error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected error sending email',
    }
  }
}

/**
 * Check if email service is configured
 */
export function isEmailServiceConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

/**
 * Verify SMTP connection
 */
export async function verifySmtpConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isEmailServiceConfigured()) {
      return {
        success: false,
        error: 'SMTP is not configured',
      }
    }

    const transporter = createTransporter()
    await transporter.verify()

    return { success: true }
  } catch (err) {
    console.error('SMTP verification error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to verify SMTP connection',
    }
  }
}
