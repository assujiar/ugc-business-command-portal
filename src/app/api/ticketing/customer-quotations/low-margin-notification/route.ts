import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, isEmailServiceConfigured } from '@/lib/email'
import type { UserRole } from '@/types/database'

// Sales Manager Email from environment variable (fallback)
const SALES_MANAGER_EMAIL = process.env.SALES_MANAGER_EMAIL || ''

// App URL for generating links
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.ugc.co.id'

// Minimum margin threshold
const MIN_MARGIN_THRESHOLD = 15

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
 * Format currency for display
 */
function formatCurrency(amount: number, currency: string = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Generate low margin notification email HTML
 */
function generateLowMarginEmailHtml(data: {
  quotation_id: string
  quotation_number: string
  customer_name: string
  customer_company?: string
  margin_percent: number
  total_cost: number
  total_selling_rate: number
  currency: string
  created_by: string
}): string {
  const quotationUrl = `${APP_URL}/customer-quotations/${data.quotation_id}`
  const marginDiff = MIN_MARGIN_THRESHOLD - data.margin_percent
  const marginColor = data.margin_percent < 10 ? '#dc2626' : '#ca8a04' // red if < 10%, yellow otherwise

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Low Margin Alert - ${data.quotation_number}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #ca8a04 0%, #a16207 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
                ⚠️ Low Margin Alert
              </h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 14px;">
                Quotation dengan margin dibawah standar
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <!-- Alert Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef3c7; border-left: 4px solid ${marginColor}; padding: 15px; margin-bottom: 25px; border-radius: 0 4px 4px 0;">
                <tr>
                  <td>
                    <p style="margin: 0; color: #92400e; font-weight: 600; font-size: 16px;">
                      Margin ${data.margin_percent}% - ${marginDiff.toFixed(1)}% dibawah standar minimum (${MIN_MARGIN_THRESHOLD}%)
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Quotation Details -->
              <h2 style="color: #1f2937; font-size: 18px; margin: 0 0 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
                Detail Quotation
              </h2>

              <table width="100%" cellpadding="8" cellspacing="0" style="margin-bottom: 25px;">
                <tr>
                  <td width="40%" style="color: #6b7280; font-size: 14px;">Nomor Quotation</td>
                  <td style="color: #1f2937; font-weight: 600; font-size: 14px;">
                    <a href="${quotationUrl}" style="color: #2563eb; text-decoration: none;">${data.quotation_number}</a>
                  </td>
                </tr>
                <tr style="background-color: #f9fafb;">
                  <td style="color: #6b7280; font-size: 14px;">Customer</td>
                  <td style="color: #1f2937; font-size: 14px;">${data.customer_name}${data.customer_company ? ` - ${data.customer_company}` : ''}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; font-size: 14px;">Dibuat oleh</td>
                  <td style="color: #1f2937; font-size: 14px;">${data.created_by}</td>
                </tr>
              </table>

              <!-- Financial Details -->
              <h2 style="color: #1f2937; font-size: 18px; margin: 0 0 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
                Detail Finansial
              </h2>

              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; margin-bottom: 25px;">
                <tr>
                  <td width="33%" style="text-align: center; border-right: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 5px; color: #6b7280; font-size: 12px; text-transform: uppercase;">Total Cost</p>
                    <p style="margin: 0; color: #1f2937; font-size: 16px; font-weight: 600;">${formatCurrency(data.total_cost, data.currency)}</p>
                  </td>
                  <td width="33%" style="text-align: center; border-right: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 5px; color: #6b7280; font-size: 12px; text-transform: uppercase;">Margin</p>
                    <p style="margin: 0; color: ${marginColor}; font-size: 16px; font-weight: 700;">${data.margin_percent}%</p>
                  </td>
                  <td width="33%" style="text-align: center;">
                    <p style="margin: 0 0 5px; color: #6b7280; font-size: 12px; text-transform: uppercase;">Selling Rate</p>
                    <p style="margin: 0; color: #059669; font-size: 16px; font-weight: 600;">${formatCurrency(data.total_selling_rate, data.currency)}</p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${quotationUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600; font-size: 14px;">
                      Lihat Detail Quotation
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; text-align: center;">
                Email ini dikirim secara otomatis oleh sistem UGC Business Portal.<br>
                Silakan tinjau quotation ini dan ambil tindakan yang diperlukan.
              </p>
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

/**
 * Generate plain text version
 */
function generateLowMarginEmailText(data: {
  quotation_number: string
  customer_name: string
  customer_company?: string
  margin_percent: number
  total_cost: number
  total_selling_rate: number
  currency: string
  created_by: string
  quotation_id: string
}): string {
  const quotationUrl = `${APP_URL}/customer-quotations/${data.quotation_id}`

  return `
LOW MARGIN ALERT - ${data.quotation_number}
============================================

Margin ${data.margin_percent}% - dibawah standar minimum (${MIN_MARGIN_THRESHOLD}%)

DETAIL QUOTATION
----------------
Nomor Quotation: ${data.quotation_number}
Customer: ${data.customer_name}${data.customer_company ? ` - ${data.customer_company}` : ''}
Dibuat oleh: ${data.created_by}

DETAIL FINANSIAL
----------------
Total Cost: ${formatCurrency(data.total_cost, data.currency)}
Margin: ${data.margin_percent}%
Selling Rate: ${formatCurrency(data.total_selling_rate, data.currency)}

Lihat detail quotation: ${quotationUrl}

---
Email ini dikirim secara otomatis oleh sistem UGC Business Portal.
`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      quotation_id,
      quotation_number,
      customer_name,
      customer_company,
      margin_percent,
      total_cost,
      total_selling_rate,
      currency,
      created_by,
    } = body

    // Validate required fields
    if (!quotation_id || !quotation_number || !customer_name) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Check if email service is configured
    if (!isEmailServiceConfigured()) {
      console.warn('Email service not configured, skipping low margin notification')
      return NextResponse.json({
        success: true,
        message: 'Email service not configured, notification skipped',
        skipped: true,
      })
    }

    // Get sales managers from database
    const salesManagers = await getUsersByRoles(['sales manager'])
    const managerEmails = salesManagers.map(m => m.email).filter(Boolean)

    // Add fallback email from environment if configured
    if (SALES_MANAGER_EMAIL && !managerEmails.includes(SALES_MANAGER_EMAIL)) {
      managerEmails.push(SALES_MANAGER_EMAIL)
    }

    // If no recipients, log and return
    if (managerEmails.length === 0) {
      console.warn('No sales manager emails found, skipping low margin notification')
      return NextResponse.json({
        success: true,
        message: 'No sales manager recipients found, notification skipped',
        skipped: true,
      })
    }

    // Generate email content
    const emailData = {
      quotation_id,
      quotation_number,
      customer_name,
      customer_company,
      margin_percent,
      total_cost,
      total_selling_rate,
      currency: currency || 'IDR',
      created_by: created_by || 'Unknown',
    }

    const htmlContent = generateLowMarginEmailHtml(emailData)
    const textContent = generateLowMarginEmailText(emailData)

    // Send email
    const result = await sendEmail({
      to: managerEmails,
      subject: `⚠️ Low Margin Alert: ${quotation_number} - Margin ${margin_percent}%`,
      html: htmlContent,
      text: textContent,
    })

    if (!result.success) {
      console.error('Failed to send low margin notification:', result.error)
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    // Log to console for tracking
    console.log('Low margin notification sent:', {
      quotation_number,
      customer_name,
      margin_percent,
      recipients: managerEmails,
    })

    return NextResponse.json({
      success: true,
      message: `Low margin notification sent to ${managerEmails.length} recipient(s)`,
      recipients: managerEmails,
      messageId: result.messageId,
    })

  } catch (error) {
    console.error('Error sending low margin notification:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
