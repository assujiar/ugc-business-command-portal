import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessTicketing } from '@/lib/permissions'
import { sendEmail, isEmailServiceConfigured } from '@/lib/email'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ProfileData {
  user_id: string
  role: UserRole
  name: string
  email: string
}

// Format currency for display
const formatCurrency = (amount: number, currency: string = 'IDR'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

// Format date for display
const formatDate = (date: string | Date): string => {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

// UGC Company Info
const UGC_INFO = {
  name: 'PT. Utama Global Indo Cargo',
  shortName: 'UGC Logistics',
  address: 'Graha Fadillah, Jl Prof. Soepomo SH No. 45 BZ Blok C, Tebet, Jakarta Selatan, Indonesia 12810',
  phone: '+6221 8350778',
  fax: '+6221 8300219',
  whatsapp: '+62812 8459 6614',
  email: 'service@ugc.co.id',
  web: 'www.utamaglobalindocargo.com',
}

// Production base URL
const PRODUCTION_URL = 'https://ugc-business-command-portal.vercel.app'

// Sales Manager Email for CC (can be configured via environment variable)
const SALES_MANAGER_EMAIL = process.env.SALES_MANAGER_EMAIL || ''

// Generate WhatsApp text - clean formatting, no problematic characters
const generateWhatsAppText = (quotation: any, profile: ProfileData, validationUrl: string, pdfUrl: string): string => {
  const greeting = getTimeBasedGreeting()
  const customerName = quotation.customer_name || 'Bapak/Ibu'
  const companyName = quotation.customer_company || ''

  // Build route info
  let routeInfo = ''
  if (quotation.origin_city && quotation.destination_city) {
    routeInfo = `${quotation.origin_city} - ${quotation.destination_city}`
  }

  // Build cargo summary (single line)
  const cargoParts: string[] = []
  if (quotation.fleet_type) {
    cargoParts.push(`${quotation.fleet_type}${quotation.fleet_quantity > 1 ? ' x' + quotation.fleet_quantity : ''}`)
  }
  if (quotation.cargo_weight) {
    cargoParts.push(`${quotation.cargo_weight} ${quotation.cargo_weight_unit || 'kg'}`)
  }
  if (quotation.cargo_volume) {
    cargoParts.push(`${quotation.cargo_volume} ${quotation.cargo_volume_unit || 'cbm'}`)
  }
  const cargoSummary = cargoParts.length > 0 ? cargoParts.join(' | ') : ''

  // Clean greeting line
  const greetingLine = companyName
    ? `*${companyName}*\nU.p ${customerName}`
    : `Yth. ${customerName}`

  // Build message with clean formatting
  let text = `${greeting},

${greetingLine}

Terima kasih atas kepercayaan Anda kepada *${UGC_INFO.shortName}*.

Berikut penawaran harga kami:

*QUOTATION ${quotation.quotation_number}*
${routeInfo ? `Rute: ${routeInfo}\n` : ''}${quotation.service_type ? `Layanan: ${quotation.service_type}\n` : ''}${cargoSummary ? `Cargo: ${cargoSummary}\n` : ''}
*Total: ${formatCurrency(quotation.total_selling_rate, quotation.currency)}*
Berlaku s/d ${formatDate(quotation.valid_until)}

Lihat detail quotation:
${validationUrl}

Download PDF:
${pdfUrl}

Silakan hubungi kami jika ada pertanyaan.

Hormat kami,
*${profile.name}*
${UGC_INFO.shortName}
${UGC_INFO.phone}`

  return text
}

// Generate Email HTML - email-client compatible design with QR code and bulletproof buttons
const generateEmailHTML = (quotation: any, profile: ProfileData, validationUrl: string, pdfUrl: string): string => {
  const customerName = quotation.customer_name || 'Bapak/Ibu'
  const companyName = quotation.customer_company || ''

  // Build route display
  let routeDisplay = ''
  if (quotation.origin_city && quotation.destination_city) {
    routeDisplay = `${quotation.origin_city} → ${quotation.destination_city}`
  }

  // QR Code URL (using free QR code API)
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(validationUrl)}&bgcolor=ffffff&color=ff4600`

  // Build items table for breakdown
  let itemsTable = ''
  if (quotation.rate_structure === 'breakdown' && quotation.items?.length > 0) {
    const itemRows = quotation.items.map((item: any, index: number) => `
      <tr${index % 2 === 0 ? '' : ' bgcolor="#fafafa"'}>
        <td style="padding: 14px 18px; border-bottom: 1px solid #f0f0f0; color: #374151; font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px;">${item.component_name || item.component_type}${item.quantity && item.unit ? ` <span style="color: #9ca3af; font-size: 12px;">(${item.quantity} ${item.unit})</span>` : ''}</td>
        <td style="padding: 14px 18px; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: 600; color: #1f2937; font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px;">${formatCurrency(item.selling_rate, quotation.currency)}</td>
      </tr>
    `).join('')

    itemsTable = `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <tr bgcolor="#ff4600">
          <th style="padding: 16px 18px; text-align: left; color: white; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-family: 'Segoe UI', Arial, sans-serif;">Deskripsi</th>
          <th style="padding: 16px 18px; text-align: right; color: white; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-family: 'Segoe UI', Arial, sans-serif;">Rate</th>
        </tr>
        ${itemRows}
        <tr bgcolor="#fff5f0">
          <td style="padding: 18px; font-weight: 700; color: #ff4600; font-size: 15px; border-top: 2px solid #ff4600; font-family: 'Segoe UI', Arial, sans-serif;">TOTAL</td>
          <td style="padding: 18px; text-align: right; font-weight: 700; color: #ff4600; font-size: 20px; border-top: 2px solid #ff4600; font-family: 'Segoe UI', Arial, sans-serif;">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</td>
        </tr>
      </table>
    `
  }

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Quotation ${quotation.quotation_number}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    table {border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;}
    td, th {mso-line-height-rule: exactly;}
    a {text-decoration: none;}
  </style>
  <![endif]-->
  <style type="text/css">
    @media only screen and (max-width: 620px) {
      .mobile-full { width: 100% !important; }
      .mobile-center { text-align: center !important; }
      .mobile-padding { padding: 15px !important; }
      .mobile-hide { display: none !important; }
      .mobile-btn { width: 100% !important; display: block !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f0f2f5; font-family: 'Segoe UI', Arial, Helvetica, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <!-- Preview text (hidden) -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    Quotation ${quotation.quotation_number} - ${formatCurrency(quotation.total_selling_rate, quotation.currency)}${routeDisplay ? ` | ${routeDisplay}` : ''} | UGC Logistics
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f2f5">
    <tr>
      <td align="center" style="padding: 30px 15px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="mobile-full" style="max-width: 600px; width: 100%;">

          <!-- Preheader with Logo -->
          <tr>
            <td align="center" style="padding: 0 0 20px;">
              <img src="${PRODUCTION_URL}/logo/logougctaglinewhite.png" alt="UGC Logistics" width="140" height="auto" style="display: block; border: 0;" />
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td style="background: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">

              <!-- Header Banner with Gradient Effect -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="#ff4600" style="border-radius: 16px 16px 0 0; background: linear-gradient(135deg, #ff4600 0%, #ff6b35 100%);">
                    <!--[if mso]>
                    <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:100px;">
                      <v:fill type="gradient" color="#ff4600" color2="#ff6b35" angle="135"/>
                      <v:textbox inset="0,0,0,0">
                    <![endif]-->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding: 30px;" valign="middle">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td>
                                <p style="margin: 0; color: rgba(255,255,255,0.85); font-size: 11px; text-transform: uppercase; letter-spacing: 2px; font-family: 'Segoe UI', Arial, sans-serif;">Price Quotation</p>
                                <p style="margin: 8px 0 0; color: #ffffff; font-size: 26px; font-weight: 700; font-family: 'Segoe UI', Arial, sans-serif; letter-spacing: -0.5px;">${quotation.quotation_number}</p>
                              </td>
                              <td align="right" valign="middle">
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                  <tr>
                                    <td bgcolor="rgba(255,255,255,0.2)" style="border-radius: 8px; padding: 12px 16px;">
                                      <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 11px; font-family: 'Segoe UI', Arial, sans-serif;">Berlaku hingga</p>
                                      <p style="margin: 4px 0 0; color: #ffffff; font-size: 14px; font-weight: 600; font-family: 'Segoe UI', Arial, sans-serif;">${formatDate(quotation.valid_until)}</p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    <!--[if mso]>
                      </v:textbox>
                    </v:rect>
                    <![endif]-->
                  </td>
                </tr>
              </table>

              <!-- Info Strip -->
              <tr>
                <td bgcolor="#1e293b" style="padding: 14px 30px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="color: #94a3b8; font-size: 12px; font-family: 'Segoe UI', Arial, sans-serif;">
                        <span style="color: #64748b;">Tanggal:</span> <span style="color: #ffffff; font-weight: 500;">${formatDate(quotation.created_at)}</span>
                      </td>
                      <td align="center" style="color: #94a3b8; font-size: 12px; font-family: 'Segoe UI', Arial, sans-serif;">
                        ${quotation.service_type ? `<span style="color: #64748b;">Layanan:</span> <span style="color: #ffffff; font-weight: 500;">${quotation.service_type}</span>` : '&nbsp;'}
                      </td>
                      <td align="right" style="color: #94a3b8; font-size: 12px; font-family: 'Segoe UI', Arial, sans-serif;">
                        ${quotation.ticket?.ticket_code ? `<span style="color: #64748b;">Ref:</span> <span style="color: #fbbf24; font-weight: 500;">${quotation.ticket.ticket_code}</span>` : '&nbsp;'}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Main Content -->
              <tr>
                <td style="padding: 35px 30px;" class="mobile-padding">

                  <!-- Greeting -->
                  <p style="margin: 0 0 6px; color: #64748b; font-size: 13px; font-family: 'Segoe UI', Arial, sans-serif;">Kepada Yth.</p>
                  ${companyName ? `
                    <p style="margin: 0 0 4px; font-size: 20px; font-weight: 700; color: #1e293b; font-family: 'Segoe UI', Arial, sans-serif;">${companyName}</p>
                    <p style="margin: 0 0 24px; color: #475569; font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px;">U.p ${customerName}</p>
                  ` : `
                    <p style="margin: 0 0 24px; font-size: 20px; font-weight: 700; color: #1e293b; font-family: 'Segoe UI', Arial, sans-serif;">${customerName}</p>
                  `}

                  <p style="margin: 0 0 28px; color: #475569; line-height: 1.7; font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px;">
                    Terima kasih atas kepercayaan Anda kepada <strong style="color: #ff4600;">UGC Logistics</strong>.
                    Dengan senang hati kami sampaikan penawaran harga${routeDisplay ? ` untuk pengiriman rute <strong style="color: #1e293b;">${routeDisplay}</strong>` : ''} sebagai berikut:
                  </p>

                  <!-- Route & Fleet Cards -->
                  ${(routeDisplay || quotation.fleet_type) ? `
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                    <tr>
                      ${routeDisplay ? `
                      <td width="${quotation.fleet_type ? '48%' : '100%'}" bgcolor="#fef9c3" style="padding: 18px 20px; border-radius: 12px; border-left: 4px solid #eab308; vertical-align: top;">
                        <p style="margin: 0 0 6px; color: #a16207; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; font-family: 'Segoe UI', Arial, sans-serif;">Rute Pengiriman</p>
                        <p style="margin: 0; color: #713f12; font-size: 16px; font-weight: 700; font-family: 'Segoe UI', Arial, sans-serif;">${routeDisplay}</p>
                      </td>
                      ${quotation.fleet_type ? '<td width="4%">&nbsp;</td>' : ''}
                      ` : ''}
                      ${quotation.fleet_type ? `
                      <td width="${routeDisplay ? '48%' : '100%'}" bgcolor="#e0e7ff" style="padding: 18px 20px; border-radius: 12px; border-left: 4px solid #6366f1; vertical-align: top;">
                        <p style="margin: 0 0 6px; color: #4338ca; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; font-family: 'Segoe UI', Arial, sans-serif;">Armada</p>
                        <p style="margin: 0; color: #312e81; font-size: 16px; font-weight: 700; font-family: 'Segoe UI', Arial, sans-serif;">${quotation.fleet_type}${quotation.fleet_quantity > 1 ? ` x ${quotation.fleet_quantity} unit` : ''}</p>
                      </td>
                      ` : ''}
                    </tr>
                  </table>
                  ` : ''}

                  <!-- Cargo Details -->
                  ${(quotation.commodity || quotation.cargo_weight || quotation.cargo_volume) ? `
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8fafc" style="border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
                    <tr>
                      <td style="padding: 20px;">
                        <p style="margin: 0 0 14px; color: #334155; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; font-family: 'Segoe UI', Arial, sans-serif;">Detail Cargo</p>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          ${quotation.commodity ? `<tr><td style="padding: 6px 0; color: #64748b; width: 35%; font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px;">Commodity</td><td style="padding: 6px 0; color: #1e293b; font-weight: 600; font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px;">${quotation.commodity}</td></tr>` : ''}
                          ${quotation.cargo_description ? `<tr><td style="padding: 6px 0; color: #64748b; width: 35%; font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px;">Deskripsi</td><td style="padding: 6px 0; color: #1e293b; font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px;">${quotation.cargo_description}</td></tr>` : ''}
                          ${quotation.cargo_weight ? `<tr><td style="padding: 6px 0; color: #64748b; width: 35%; font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px;">Berat</td><td style="padding: 6px 0; color: #1e293b; font-weight: 600; font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px;">${quotation.cargo_weight.toLocaleString()} ${quotation.cargo_weight_unit || 'kg'}</td></tr>` : ''}
                          ${quotation.cargo_volume ? `<tr><td style="padding: 6px 0; color: #64748b; width: 35%; font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px;">Volume</td><td style="padding: 6px 0; color: #1e293b; font-weight: 600; font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px;">${quotation.cargo_volume.toLocaleString()} ${quotation.cargo_volume_unit || 'cbm'}</td></tr>` : ''}
                        </table>
                      </td>
                    </tr>
                  </table>
                  ` : ''}

                  <!-- Rate Section -->
                  ${itemsTable ? `
                    <p style="margin: 0 0 14px; color: #334155; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; font-family: 'Segoe UI', Arial, sans-serif;">Rincian Biaya</p>
                    ${itemsTable}
                  ` : `
                    <!-- Total Amount Card - Premium Look -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                      <tr>
                        <td bgcolor="#fff7ed" style="border: 2px solid #ff4600; border-radius: 16px; padding: 30px; text-align: center;">
                          <p style="margin: 0 0 10px; color: #64748b; font-size: 13px; font-family: 'Segoe UI', Arial, sans-serif; text-transform: uppercase; letter-spacing: 1px;">Total Penawaran</p>
                          <p style="margin: 0; color: #ff4600; font-size: 38px; font-weight: 800; font-family: 'Segoe UI', Arial, sans-serif; letter-spacing: -1px;">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</p>
                          <p style="margin: 10px 0 0; color: #94a3b8; font-size: 12px; font-family: 'Segoe UI', Arial, sans-serif;">Harga sudah termasuk semua biaya yang tercantum</p>
                        </td>
                      </tr>
                    </table>
                  `}

                  <!-- Scope of Work -->
                  ${quotation.scope_of_work ? `
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0fdf4" style="border-left: 4px solid #22c55e; border-radius: 0 12px 12px 0; margin: 24px 0;">
                    <tr>
                      <td style="padding: 18px 20px;">
                        <p style="margin: 0 0 10px; color: #166534; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; font-family: 'Segoe UI', Arial, sans-serif;">Scope of Work</p>
                        <p style="margin: 0; color: #15803d; white-space: pre-line; line-height: 1.7; font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px;">${quotation.scope_of_work}</p>
                      </td>
                    </tr>
                  </table>
                  ` : ''}

                  <!-- Validity Notice -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fefce8" style="border-radius: 12px; margin: 24px 0; border: 1px solid #fef08a;">
                    <tr>
                      <td width="50" style="padding: 18px 10px 18px 18px; vertical-align: middle;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td bgcolor="#fbbf24" style="width: 36px; height: 36px; border-radius: 50%; text-align: center; vertical-align: middle;">
                              <span style="font-size: 18px; line-height: 36px;">⏰</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td style="padding: 18px 18px 18px 8px;">
                        <p style="margin: 0; color: #854d0e; font-weight: 700; font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px;">Validitas Penawaran</p>
                        <p style="margin: 5px 0 0; color: #a16207; font-size: 13px; font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.5;">Quotation ini berlaku selama <strong>${quotation.validity_days} hari</strong> hingga <strong>${formatDate(quotation.valid_until)}</strong></p>
                      </td>
                    </tr>
                  </table>

                  <!-- CTA Section with QR -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="border-radius: 16px; margin: 28px 0;">
                    <tr>
                      <td style="padding: 28px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="vertical-align: top; padding-right: 25px;">
                              <p style="margin: 0 0 10px; color: #1e293b; font-weight: 700; font-size: 16px; font-family: 'Segoe UI', Arial, sans-serif;">Akses Quotation Anda</p>
                              <p style="margin: 0 0 22px; color: #64748b; font-size: 13px; line-height: 1.6; font-family: 'Segoe UI', Arial, sans-serif;">Scan QR code atau klik tombol di bawah untuk melihat detail lengkap quotation dan download dalam format PDF.</p>

                              <!-- Primary Button - Bulletproof -->
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 12px;" class="mobile-btn">
                                <tr>
                                  <td align="center" bgcolor="#ff4600" style="border-radius: 8px; background: linear-gradient(135deg, #ff4600 0%, #ff6b35 100%);">
                                    <!--[if mso]>
                                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${validationUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="17%" strokecolor="#ff4600" fillcolor="#ff4600">
                                      <w:anchorlock/>
                                      <center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:bold;">Lihat Quotation Online</center>
                                    </v:roundrect>
                                    <![endif]-->
                                    <!--[if !mso]><!-->
                                    <a href="${validationUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; font-family: 'Segoe UI', Arial, sans-serif; border-radius: 8px; mso-hide: all;">Lihat Quotation Online</a>
                                    <!--<![endif]-->
                                  </td>
                                </tr>
                              </table>

                              <!-- Secondary Button - Bulletproof -->
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="mobile-btn">
                                <tr>
                                  <td align="center" style="border: 2px solid #ff4600; border-radius: 8px; background: #ffffff;">
                                    <!--[if mso]>
                                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${pdfUrl}" style="height:44px;v-text-anchor:middle;width:180px;" arcsize="18%" strokecolor="#ff4600" fillcolor="#ffffff">
                                      <w:anchorlock/>
                                      <center style="color:#ff4600;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:bold;">Download PDF</center>
                                    </v:roundrect>
                                    <![endif]-->
                                    <!--[if !mso]><!-->
                                    <a href="${pdfUrl}" target="_blank" style="display: inline-block; padding: 12px 28px; color: #ff4600; text-decoration: none; font-weight: 700; font-size: 13px; font-family: 'Segoe UI', Arial, sans-serif; border-radius: 8px; mso-hide: all;">Download PDF</a>
                                    <!--<![endif]-->
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td width="130" style="vertical-align: top; text-align: center;" class="mobile-hide">
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                                <tr>
                                  <td style="padding: 12px;">
                                    <img src="${qrCodeUrl}" alt="QR Code" width="106" height="106" style="display: block; border: 0; border-radius: 4px;" />
                                  </td>
                                </tr>
                              </table>
                              <p style="margin: 10px 0 0; color: #94a3b8; font-size: 10px; font-family: 'Segoe UI', Arial, sans-serif;">Scan untuk akses cepat</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <p style="margin: 0 0 24px; color: #475569; line-height: 1.7; font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px;">
                    Jika Bapak/Ibu memiliki pertanyaan atau membutuhkan informasi tambahan, silakan menghubungi kami. Kami siap membantu Anda.
                  </p>

                  <!-- Signature -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #e2e8f0; margin-top: 28px;">
                    <tr>
                      <td style="padding-top: 24px;">
                        <p style="margin: 0 0 4px; color: #64748b; font-size: 13px; font-family: 'Segoe UI', Arial, sans-serif;">Hormat kami,</p>
                        <p style="margin: 14px 0 4px; color: #ff4600; font-size: 17px; font-weight: 700; font-family: 'Segoe UI', Arial, sans-serif;">${profile.name}</p>
                        <p style="margin: 0 0 4px; color: #475569; font-size: 13px; font-family: 'Segoe UI', Arial, sans-serif;">Sales & Commercial Executive</p>
                        <p style="margin: 0 0 12px; color: #475569; font-size: 13px; font-family: 'Segoe UI', Arial, sans-serif;">${UGC_INFO.shortName}</p>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="padding-right: 15px;">
                              <p style="margin: 0; color: #64748b; font-size: 12px; font-family: 'Segoe UI', Arial, sans-serif;">
                                <span style="color: #94a3b8;">Email:</span> ${profile.email}
                              </p>
                            </td>
                            <td>
                              <p style="margin: 0; color: #64748b; font-size: 12px; font-family: 'Segoe UI', Arial, sans-serif;">
                                <span style="color: #94a3b8;">Tel:</span> ${UGC_INFO.phone}
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                </td>
              </tr>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top: 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1e293b" style="border-radius: 16px;">
                <tr>
                  <td style="padding: 28px 30px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td>
                          <p style="margin: 0 0 6px; color: #ffffff; font-weight: 700; font-size: 15px; font-family: 'Segoe UI', Arial, sans-serif;">${UGC_INFO.name}</p>
                          <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.6; font-family: 'Segoe UI', Arial, sans-serif;">${UGC_INFO.address}</p>
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top: 14px;">
                            <tr>
                              <td style="padding-right: 20px;">
                                <p style="margin: 0; color: #94a3b8; font-size: 12px; font-family: 'Segoe UI', Arial, sans-serif;">
                                  <span style="color: #64748b;">Tel:</span> ${UGC_INFO.phone}
                                </p>
                              </td>
                              <td style="padding-right: 20px;">
                                <p style="margin: 0; color: #94a3b8; font-size: 12px; font-family: 'Segoe UI', Arial, sans-serif;">
                                  <span style="color: #64748b;">Email:</span> ${UGC_INFO.email}
                                </p>
                              </td>
                              <td>
                                <p style="margin: 0; color: #94a3b8; font-size: 12px; font-family: 'Segoe UI', Arial, sans-serif;">
                                  <span style="color: #64748b;">Web:</span> ${UGC_INFO.web}
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td bgcolor="#0f172a" style="padding: 16px 30px; border-radius: 0 0 16px 16px;">
                    <p style="margin: 0; color: #64748b; font-size: 10px; text-align: center; font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.5;">
                      Email ini dikirim secara otomatis dari UGC Business Command Portal.<br/>
                      Jika Anda menerima email ini karena kesalahan, mohon abaikan.
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

// Generate plain text email version
const generateEmailPlainText = (quotation: any, profile: ProfileData, validationUrl: string, pdfUrl: string): string => {
  const customerName = quotation.customer_name || 'Bapak/Ibu'
  const companyName = quotation.customer_company || ''

  let routeInfo = ''
  if (quotation.origin_city && quotation.destination_city) {
    routeInfo = ` dari ${quotation.origin_city} ke ${quotation.destination_city}`
  }

  // Build cargo details
  let cargoDetails = ''
  if (quotation.cargo_description || quotation.fleet_type || quotation.cargo_weight) {
    cargoDetails = '\n\nDETAIL CARGO:'
    if (quotation.commodity) cargoDetails += `\n- Commodity: ${quotation.commodity}`
    if (quotation.cargo_description) cargoDetails += `\n- Deskripsi: ${quotation.cargo_description}`
    if (quotation.fleet_type) cargoDetails += `\n- Fleet: ${quotation.fleet_type}${quotation.fleet_quantity ? ` × ${quotation.fleet_quantity}` : ''}`
    if (quotation.cargo_weight) cargoDetails += `\n- Berat: ${quotation.cargo_weight} ${quotation.cargo_weight_unit || 'kg'}`
    if (quotation.cargo_volume) cargoDetails += `\n- Volume: ${quotation.cargo_volume} ${quotation.cargo_volume_unit || 'cbm'}`
    if (quotation.estimated_cargo_value) cargoDetails += `\n- Nilai Cargo: ${formatCurrency(quotation.estimated_cargo_value, quotation.cargo_value_currency || 'IDR')}`
  }

  // Build greeting with company name and PIC
  const greetingLine = companyName
    ? `${companyName}\nU.p Bapak/Ibu ${customerName}`
    : `Yth. Bapak/Ibu ${customerName}`

  return `
${UGC_INFO.shortName} - Quotation ${quotation.quotation_number}

${greetingLine}

Terima kasih atas kepercayaan Anda kepada ${UGC_INFO.shortName}. Dengan senang hati kami sampaikan penawaran harga untuk layanan ${quotation.service_type || 'pengiriman barang'}${routeInfo}.

No. Quotation: ${quotation.quotation_number}
Tanggal: ${formatDate(quotation.created_at)}
${quotation.ticket?.ticket_code ? `Reference: ${quotation.ticket.ticket_code}` : ''}

TOTAL PENAWARAN: ${formatCurrency(quotation.total_selling_rate, quotation.currency)}
${cargoDetails}

Validitas: Penawaran ini berlaku selama ${quotation.validity_days} hari sejak tanggal penerbitan (hingga ${formatDate(quotation.valid_until)}).

📋 Lihat Quotation Online: ${validationUrl}
📄 Download Quotation Letter: ${pdfUrl}

Jika memiliki pertanyaan atau membutuhkan informasi tambahan, silakan menghubungi kami.

Hormat kami,
${profile.name}
Sales & Commercial Executive
${UGC_INFO.shortName}
Email: ${profile.email}
Tel: ${UGC_INFO.phone}
WhatsApp: ${UGC_INFO.whatsapp}

---
${UGC_INFO.name}
${UGC_INFO.address}
Tel: ${UGC_INFO.phone} | Fax: ${UGC_INFO.fax} | Email: ${UGC_INFO.email}
`.trim()
}

// Get greeting based on time
const getTimeBasedGreeting = (): string => {
  const hour = new Date().getHours()
  if (hour < 11) return 'Selamat pagi'
  if (hour < 15) return 'Selamat siang'
  if (hour < 18) return 'Selamat sore'
  return 'Selamat malam'
}

// POST /api/ticketing/customer-quotations/[id]/send - Send quotation via email or WhatsApp
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role, name, email')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    if (!profileData || !canAccessTicketing(profileData.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { method, pdf_url, isResend } = body as {
      method: 'whatsapp' | 'email'
      pdf_url?: string
      isResend?: boolean
    }

    if (!method || !['whatsapp', 'email'].includes(method)) {
      return NextResponse.json({ error: 'Invalid send method' }, { status: 400 })
    }

    // Fetch quotation with all details including creator profile
    const { data: quotation, error } = await (supabase as any)
      .from('customer_quotations')
      .select(`
        *,
        ticket:tickets!customer_quotations_ticket_id_fkey(id, ticket_code, subject),
        items:customer_quotation_items(*),
        creator:profiles!customer_quotations_created_by_fkey(user_id, name, email)
      `)
      .eq('id', id)
      .single()

    if (error || !quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    // Get creator email for reply-to (fallback to current user if not found)
    const creatorEmail = quotation.creator?.email || profileData.email

    // Build URLs using production URL - use public endpoints for customer access
    const validationUrl = `${PRODUCTION_URL}/quotation-verify/${quotation.validation_code}`
    // Use public PDF endpoint with validation code (no auth required)
    const pdfDownloadUrl = pdf_url || `${PRODUCTION_URL}/api/public/quotation/${quotation.validation_code}/pdf`

    let responseData: any = {
      quotation_id: id,
      quotation_number: quotation.quotation_number,
      method,
    }

    if (method === 'whatsapp') {
      // Generate WhatsApp text
      const whatsappText = generateWhatsAppText(quotation, profileData, validationUrl, pdfDownloadUrl)

      // Generate WhatsApp URL (if phone number is available)
      let whatsappUrl = ''
      if (quotation.customer_phone) {
        // Clean phone number
        let phone = quotation.customer_phone.replace(/\D/g, '')
        if (phone.startsWith('0')) {
          phone = '62' + phone.substring(1)
        } else if (!phone.startsWith('62')) {
          phone = '62' + phone
        }
        whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}`
      }

      responseData = {
        ...responseData,
        whatsapp_text: whatsappText,
        whatsapp_url: whatsappUrl,
        pdf_url: pdfDownloadUrl,
        validation_url: validationUrl,
      }
    } else if (method === 'email') {
      // Generate email content
      const emailSubject = `Penawaran Harga - ${quotation.quotation_number} | ${UGC_INFO.shortName}`
      const emailHtml = generateEmailHTML(quotation, profileData, validationUrl, pdfDownloadUrl)
      const emailText = generateEmailPlainText(quotation, profileData, validationUrl, pdfDownloadUrl)

      // Check if recipient email exists
      if (!quotation.customer_email) {
        return NextResponse.json({
          error: 'Customer email address is not available'
        }, { status: 400 })
      }

      // Check if email service is configured
      if (!isEmailServiceConfigured()) {
        // Even without SMTP, update status to 'sent' when using fallback
        if (!isResend) {
          const adminClient = createAdminClient()
          await (adminClient as any)
            .from('customer_quotations')
            .update({
              status: 'sent',
              sent_via: 'email',
              sent_to: quotation.customer_email,
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', id)

          // Sync status to linked entities
          await (adminClient as any).rpc('sync_quotation_to_all', {
            p_quotation_id: id,
            p_new_status: 'sent',
            p_actor_user_id: user.id
          })
        }

        return NextResponse.json({
          success: true,
          message: 'Email service not configured. Opening email client as fallback.',
          fallback: true,
          data: {
            email_subject: emailSubject,
            email_html: emailHtml,
            email_text: emailText,
            recipient_email: quotation.customer_email,
            validation_url: validationUrl,
            pdf_url: pdfDownloadUrl,
          }
        })
      }

      // Build CC list: sender's email + sales manager (if configured)
      const ccList: string[] = []

      // CC to the sender (current user)
      if (profileData.email && profileData.email !== quotation.customer_email) {
        ccList.push(profileData.email)
      }

      // CC to sales manager (if configured and different from sender)
      if (SALES_MANAGER_EMAIL &&
          SALES_MANAGER_EMAIL !== profileData.email &&
          SALES_MANAGER_EMAIL !== quotation.customer_email) {
        ccList.push(SALES_MANAGER_EMAIL)
      }

      // Send email via SMTP (Nodemailer)
      // Reply-To is set to quotation creator's email so customer replies go to the right person
      // CC to sender and sales manager for tracking
      const emailResult = await sendEmail({
        to: quotation.customer_email,
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
        replyTo: creatorEmail, // Reply goes to quotation creator
        cc: ccList.length > 0 ? ccList : undefined,
      })

      if (!emailResult.success) {
        // Email failed but provide fallback - still update status if using fallback
        return NextResponse.json({
          error: emailResult.error || 'Failed to send email via SMTP',
          fallback: {
            email_subject: emailSubject,
            email_html: emailHtml,
            email_text: emailText,
            recipient_email: quotation.customer_email,
            validation_url: validationUrl,
            pdf_url: pdfDownloadUrl,
          }
        }, { status: 500 })
      }

      responseData = {
        ...responseData,
        email_sent: true,
        message_id: emailResult.messageId,
        email_subject: emailSubject,
        recipient_email: quotation.customer_email,
        cc_emails: ccList.length > 0 ? ccList : undefined,
        pdf_url: pdfDownloadUrl,
        validation_url: validationUrl,
      }
    }

    // Use admin client for status updates to bypass RLS
    const adminClient = createAdminClient()

    // Update quotation status to 'sent' only if not a resend
    if (!isResend) {
      const sentTo = method === 'email' ? quotation.customer_email : quotation.customer_phone

      // Update quotation status
      const { error: updateError } = await (adminClient as any)
        .from('customer_quotations')
        .update({
          status: 'sent',
          sent_via: method,
          sent_to: sentTo,
          sent_at: new Date().toISOString(),
          pdf_url: pdf_url || quotation.pdf_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (updateError) {
        console.error('Error updating quotation status:', updateError)
        // Continue anyway - email was sent successfully
      } else {
        console.log('Quotation status updated to sent')
      }
    }

    // Always sync quotation status to all linked entities (ticket, lead, opportunity)
    // This ensures the pipeline stage is correct even on resends
    const { data: syncResult, error: syncError } = await (adminClient as any).rpc('sync_quotation_to_all', {
      p_quotation_id: id,
      p_new_status: 'sent',
      p_actor_user_id: user.id
    })

    if (syncError) {
      console.error('Error syncing quotation status:', syncError)
      // Continue anyway - main operation succeeded
    } else {
      console.log('Quotation synced to all entities:', syncResult)
    }

    return NextResponse.json({
      success: true,
      data: responseData,
      message: isResend
        ? `Quotation resent via ${method}`
        : method === 'email'
          ? 'Email sent successfully to customer.'
          : 'WhatsApp text generated. Click the link to send via WhatsApp.',
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
