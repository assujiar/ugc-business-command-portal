import nodemailer from 'nodemailer'

// =====================================================
// CRM Email Service
// Separate SMTP configuration for CRM notifications
// to avoid conflict with ticketing/quotation emails
// =====================================================

// CRM SMTP Configuration - uses dedicated CRM email account
const CRM_SMTP_CONFIG = {
  host: process.env.CRM_SMTP_HOST || 'smtp.ugc.co.id',
  port: parseInt(process.env.CRM_SMTP_PORT || '465'),
  secure: process.env.CRM_SMTP_SECURE !== 'false', // Default true for 465
  auth: {
    user: process.env.CRM_SMTP_USER || 'crm@ugc.co.id',
    pass: process.env.CRM_SMTP_PASS || '9E8@2tr9v',
  },
}

// Default sender for CRM emails
const CRM_DEFAULT_FROM = process.env.CRM_SMTP_FROM || 'CRM UGC Logistics <crm@ugc.co.id>'

export interface CRMEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
  cc?: string | string[]
  bcc?: string | string[]
}

export interface CRMEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Create CRM Nodemailer transporter
 */
function createCRMTransporter() {
  return nodemailer.createTransport({
    host: CRM_SMTP_CONFIG.host,
    port: CRM_SMTP_CONFIG.port,
    secure: CRM_SMTP_CONFIG.secure,
    auth: CRM_SMTP_CONFIG.auth,
  })
}

/**
 * Send CRM notification email
 */
export async function sendCRMEmail(options: CRMEmailOptions): Promise<CRMEmailResult> {
  try {
    const { to, subject, html, text, from = CRM_DEFAULT_FROM, replyTo, cc, bcc } = options

    // Validate recipient
    if (!to || (Array.isArray(to) && to.length === 0)) {
      return {
        success: false,
        error: 'Recipient email address is required',
      }
    }

    // Create transporter
    const transporter = createCRMTransporter()

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

    console.log('[CRM Email] Sent successfully:', info.messageId)

    return {
      success: true,
      messageId: info.messageId,
    }
  } catch (err) {
    console.error('[CRM Email] Send error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected error sending CRM email',
    }
  }
}

/**
 * Verify CRM SMTP connection
 */
export async function verifyCRMSmtpConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createCRMTransporter()
    await transporter.verify()
    return { success: true }
  } catch (err) {
    console.error('[CRM Email] SMTP verification error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to verify CRM SMTP connection',
    }
  }
}

// =====================================================
// Email Template Helpers
// =====================================================

export function getEmailHeader(): string {
  return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CRM UGC Logistics</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa; line-height: 1.6;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f7fa;">
        <tr>
          <td style="padding: 20px 0;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px 40px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">
                    CRM UGC Logistics
                  </h1>
                </td>
              </tr>
              <!-- Content -->
              <tr>
                <td style="padding: 40px;">
  `
}

export function getEmailFooter(): string {
  return `
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 25px 40px; border-top: 1px solid #e2e8f0;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                      <td style="text-align: center;">
                        <p style="margin: 0 0 10px 0; color: #64748b; font-size: 13px;">
                          PT. UGC Logistics Indonesia
                        </p>
                        <p style="margin: 0 0 10px 0; color: #94a3b8; font-size: 12px;">
                          Email ini dikirim otomatis oleh sistem CRM UGC Logistics.<br>
                          Mohon tidak membalas email ini.
                        </p>
                        <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                          &copy; ${new Date().getFullYear()} UGC Logistics. All rights reserved.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '-'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }) + ' WIB'
}

export function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Jakarta',
  })
}

export function getPriorityBadge(priority: number): string {
  const colors: Record<number, { bg: string; text: string; label: string }> = {
    1: { bg: '#dcfce7', text: '#166534', label: 'Low' },
    2: { bg: '#fef9c3', text: '#854d0e', label: 'Medium' },
    3: { bg: '#fed7aa', text: '#c2410c', label: 'High' },
    4: { bg: '#fecaca', text: '#dc2626', label: 'Critical' },
  }
  const style = colors[priority] || colors[2]
  return `<span style="background-color: ${style.bg}; color: ${style.text}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">${style.label}</span>`
}

export function getActionButton(url: string, text: string, primary = true): string {
  const bgColor = primary ? '#1e40af' : '#f1f5f9'
  const textColor = primary ? '#ffffff' : '#334155'
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 20px auto;">
      <tr>
        <td style="border-radius: 8px; background-color: ${bgColor};">
          <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: ${textColor}; text-decoration: none; font-weight: 600; font-size: 14px;">
            ${text}
          </a>
        </td>
      </tr>
    </table>
  `
}

export function getInfoBox(title: string, items: { label: string; value: string }[]): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; margin: 20px 0;">
      <tr>
        <td style="padding: 20px;">
          <h3 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; font-weight: 600; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
            ${title}
          </h3>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            ${items.map(item => `
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 40%;">${item.label}</td>
                <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 500;">${item.value}</td>
              </tr>
            `).join('')}
          </table>
        </td>
      </tr>
    </table>
  `
}

export function getAlertBox(type: 'warning' | 'info' | 'success' | 'danger', message: string): string {
  const styles: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    warning: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', icon: '⚠️' },
    info: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af', icon: 'ℹ️' },
    success: { bg: '#dcfce7', border: '#22c55e', text: '#166534', icon: '✅' },
    danger: { bg: '#fee2e2', border: '#ef4444', text: '#dc2626', icon: '🚨' },
  }
  const style = styles[type]
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${style.bg}; border-left: 4px solid ${style.border}; border-radius: 4px; margin: 20px 0;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0; color: ${style.text}; font-size: 14px;">
            ${style.icon} ${message}
          </p>
        </td>
      </tr>
    </table>
  `
}
