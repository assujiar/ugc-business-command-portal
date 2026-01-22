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

// Generate Email HTML - email-client compatible design with QR code
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
        <td style="padding: 12px 15px; border-bottom: 1px solid #f0f0f0; color: #374151; font-family: Arial, sans-serif; font-size: 14px;">${item.component_name || item.component_type}${item.quantity && item.unit ? ` <span style="color: #9ca3af; font-size: 12px;">(${item.quantity} ${item.unit})</span>` : ''}</td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: bold; color: #1f2937; font-family: Arial, sans-serif; font-size: 14px;">${formatCurrency(item.selling_rate, quotation.currency)}</td>
      </tr>
    `).join('')

    itemsTable = `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; border: 1px solid #e5e7eb;">
        <tr bgcolor="#ff4600">
          <th style="padding: 14px 15px; text-align: left; color: white; font-weight: bold; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; font-family: Arial, sans-serif;">Deskripsi</th>
          <th style="padding: 14px 15px; text-align: right; color: white; font-weight: bold; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; font-family: Arial, sans-serif;">Rate</th>
        </tr>
        ${itemRows}
        <tr bgcolor="#fff5f0">
          <td style="padding: 16px 15px; font-weight: bold; color: #ff4600; font-size: 15px; border-top: 2px solid #ff4600; font-family: Arial, sans-serif;">TOTAL</td>
          <td style="padding: 16px 15px; text-align: right; font-weight: bold; color: #ff4600; font-size: 18px; border-top: 2px solid #ff4600; font-family: Arial, sans-serif;">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</td>
        </tr>
      </table>
    `
  }

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quotation ${quotation.quotation_number}</title>
  <!--[if mso]>
  <style type="text/css">
    table {border-collapse: collapse;}
    .button-link {padding: 14px 30px !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: Arial, Helvetica, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f6">
    <tr>
      <td align="center" style="padding: 20px 10px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%;">

          <!-- Header Banner -->
          <tr>
            <td bgcolor="#ff4600" style="padding: 0; border-radius: 12px 12px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding: 25px 30px;" valign="middle">
                    <img src="${PRODUCTION_URL}/logo/logougctaglinewhite.png" alt="UGC Logistics" width="160" height="auto" style="display: block; border: 0;" />
                  </td>
                  <td style="padding: 25px 30px; text-align: right;" valign="middle">
                    <p style="margin: 0; color: #ffffff; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-family: Arial, sans-serif; opacity: 0.9;">Quotation</p>
                    <p style="margin: 5px 0 0; color: #ffffff; font-size: 18px; font-weight: bold; font-family: Arial, sans-serif;">${quotation.quotation_number}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Quotation Info Strip -->
          <tr>
            <td bgcolor="#1f2937" style="padding: 12px 30px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color: #9ca3af; font-size: 12px; font-family: Arial, sans-serif;">
                    Tanggal: <span style="color: #ffffff; font-weight: bold;">${formatDate(quotation.created_at)}</span>
                  </td>
                  <td style="text-align: center; color: #9ca3af; font-size: 12px; font-family: Arial, sans-serif;">
                    ${quotation.service_type ? `Layanan: <span style="color: #ffffff; font-weight: bold;">${quotation.service_type}</span>` : '&nbsp;'}
                  </td>
                  <td style="text-align: right; color: #9ca3af; font-size: 12px; font-family: Arial, sans-serif;">
                    Berlaku: <span style="color: #10b981; font-weight: bold;">${formatDate(quotation.valid_until)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td bgcolor="#ffffff" style="padding: 30px;">

              <!-- Greeting -->
              <p style="margin: 0 0 5px; color: #6b7280; font-size: 13px; font-family: Arial, sans-serif;">Kepada Yth.</p>
              ${companyName ? `
                <p style="margin: 0 0 3px; font-size: 18px; font-weight: bold; color: #1f2937; font-family: Arial, sans-serif;">${companyName}</p>
                <p style="margin: 0 0 20px; color: #4b5563; font-family: Arial, sans-serif;">U.p ${customerName}</p>
              ` : `
                <p style="margin: 0 0 20px; font-size: 18px; font-weight: bold; color: #1f2937; font-family: Arial, sans-serif;">${customerName}</p>
              `}

              <p style="margin: 0 0 25px; color: #4b5563; line-height: 1.6; font-family: Arial, sans-serif; font-size: 14px;">
                Terima kasih atas kepercayaan Anda kepada <strong style="color: #ff4600;">UGC Logistics</strong>.
                Dengan senang hati kami sampaikan penawaran harga${routeDisplay ? ` untuk pengiriman rute <strong>${routeDisplay}</strong>` : ''} sebagai berikut:
              </p>

              <!-- Route & Service Info -->
              ${(routeDisplay || quotation.fleet_type) ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                <tr>
                  ${routeDisplay ? `
                  <td width="${quotation.fleet_type ? '48%' : '100%'}" bgcolor="#fef3c7" style="padding: 15px 18px; border-radius: 8px; vertical-align: top;">
                    <p style="margin: 0 0 5px; color: #92400e; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold; font-family: Arial, sans-serif;">Rute Pengiriman</p>
                    <p style="margin: 0; color: #78350f; font-size: 15px; font-weight: bold; font-family: Arial, sans-serif;">${routeDisplay}</p>
                  </td>
                  ${quotation.fleet_type ? '<td width="4%">&nbsp;</td>' : ''}
                  ` : ''}
                  ${quotation.fleet_type ? `
                  <td width="${routeDisplay ? '48%' : '100%'}" bgcolor="#e0e7ff" style="padding: 15px 18px; border-radius: 8px; vertical-align: top;">
                    <p style="margin: 0 0 5px; color: #3730a3; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold; font-family: Arial, sans-serif;">Armada</p>
                    <p style="margin: 0; color: #312e81; font-size: 15px; font-weight: bold; font-family: Arial, sans-serif;">${quotation.fleet_type}${quotation.fleet_quantity > 1 ? ` x ${quotation.fleet_quantity} unit` : ''}</p>
                  </td>
                  ` : ''}
                </tr>
              </table>
              ` : ''}

              <!-- Cargo Details -->
              ${(quotation.commodity || quotation.cargo_weight || quotation.cargo_volume) ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f9fafb" style="border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 18px;">
                    <p style="margin: 0 0 12px; color: #374151; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; font-family: Arial, sans-serif;">Detail Cargo</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${quotation.commodity ? `<tr><td style="padding: 5px 0; color: #6b7280; width: 35%; font-family: Arial, sans-serif; font-size: 13px;">Commodity</td><td style="padding: 5px 0; color: #1f2937; font-weight: bold; font-family: Arial, sans-serif; font-size: 13px;">${quotation.commodity}</td></tr>` : ''}
                      ${quotation.cargo_description ? `<tr><td style="padding: 5px 0; color: #6b7280; width: 35%; font-family: Arial, sans-serif; font-size: 13px;">Deskripsi</td><td style="padding: 5px 0; color: #1f2937; font-family: Arial, sans-serif; font-size: 13px;">${quotation.cargo_description}</td></tr>` : ''}
                      ${quotation.cargo_weight ? `<tr><td style="padding: 5px 0; color: #6b7280; width: 35%; font-family: Arial, sans-serif; font-size: 13px;">Berat</td><td style="padding: 5px 0; color: #1f2937; font-weight: bold; font-family: Arial, sans-serif; font-size: 13px;">${quotation.cargo_weight.toLocaleString()} ${quotation.cargo_weight_unit || 'kg'}</td></tr>` : ''}
                      ${quotation.cargo_volume ? `<tr><td style="padding: 5px 0; color: #6b7280; width: 35%; font-family: Arial, sans-serif; font-size: 13px;">Volume</td><td style="padding: 5px 0; color: #1f2937; font-weight: bold; font-family: Arial, sans-serif; font-size: 13px;">${quotation.cargo_volume.toLocaleString()} ${quotation.cargo_volume_unit || 'cbm'}</td></tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- Rate Section -->
              ${itemsTable ? `
                <p style="margin: 0 0 12px; color: #374151; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; font-family: Arial, sans-serif;">Rincian Biaya</p>
                ${itemsTable}
              ` : `
                <!-- Total Amount Card -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fff5f0" style="border: 2px solid #ff4600; border-radius: 10px; margin-bottom: 20px;">
                  <tr>
                    <td style="padding: 25px; text-align: center;">
                      <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; font-family: Arial, sans-serif;">Total Penawaran</p>
                      <p style="margin: 0; color: #ff4600; font-size: 32px; font-weight: bold; font-family: Arial, sans-serif;">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</p>
                    </td>
                  </tr>
                </table>
              `}

              <!-- Scope of Work -->
              ${quotation.scope_of_work ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0fdf4" style="border-left: 4px solid #22c55e; margin: 20px 0;">
                <tr>
                  <td style="padding: 15px 18px;">
                    <p style="margin: 0 0 8px; color: #166534; font-size: 11px; font-weight: bold; text-transform: uppercase; font-family: Arial, sans-serif;">Scope of Work</p>
                    <p style="margin: 0; color: #15803d; white-space: pre-line; line-height: 1.6; font-family: Arial, sans-serif; font-size: 13px;">${quotation.scope_of_work}</p>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- Validity Notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fef3c7" style="border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td width="40" style="padding: 15px 5px 15px 15px; vertical-align: top;">
                    <span style="font-size: 20px;">⏰</span>
                  </td>
                  <td style="padding: 15px 15px 15px 5px;">
                    <p style="margin: 0; color: #92400e; font-weight: bold; font-family: Arial, sans-serif; font-size: 14px;">Validitas Penawaran</p>
                    <p style="margin: 5px 0 0; color: #78350f; font-size: 13px; font-family: Arial, sans-serif;">Quotation ini berlaku selama <strong>${quotation.validity_days} hari</strong> hingga <strong>${formatDate(quotation.valid_until)}</strong></p>
                  </td>
                </tr>
              </table>

              <!-- CTA Section with QR -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8fafc" style="border-radius: 10px; margin: 25px 0;">
                <tr>
                  <td style="padding: 25px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: top; padding-right: 20px;">
                          <p style="margin: 0 0 12px; color: #1f2937; font-weight: bold; font-size: 15px; font-family: Arial, sans-serif;">Lihat Detail Quotation</p>
                          <p style="margin: 0 0 18px; color: #6b7280; font-size: 13px; line-height: 1.5; font-family: Arial, sans-serif;">Scan QR code atau klik tombol untuk melihat detail lengkap dan download PDF.</p>

                          <!-- Primary Button -->
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 10px;">
                            <tr>
                              <td bgcolor="#ff4600" style="border-radius: 6px;">
                                <a href="${validationUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 13px; font-family: Arial, sans-serif;">Lihat Quotation Online</a>
                              </td>
                            </tr>
                          </table>

                          <!-- Secondary Button -->
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="border: 2px solid #ff4600; border-radius: 6px;">
                                <a href="${pdfUrl}" target="_blank" style="display: inline-block; padding: 10px 20px; color: #ff4600; text-decoration: none; font-weight: bold; font-size: 12px; font-family: Arial, sans-serif;">Download PDF</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td width="140" style="vertical-align: top; text-align: center;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border-radius: 8px; border: 1px solid #e5e7eb;">
                            <tr>
                              <td style="padding: 10px;">
                                <img src="${qrCodeUrl}" alt="QR Code" width="100" height="100" style="display: block; border: 0;" />
                              </td>
                            </tr>
                          </table>
                          <p style="margin: 8px 0 0; color: #9ca3af; font-size: 10px; font-family: Arial, sans-serif;">Scan untuk verifikasi</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px; color: #4b5563; line-height: 1.6; font-family: Arial, sans-serif; font-size: 14px;">
                Jika Bapak/Ibu memiliki pertanyaan atau membutuhkan informasi tambahan, silakan menghubungi kami. Kami siap membantu.
              </p>

              <!-- Signature -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 25px;">
                <tr>
                  <td style="padding-top: 20px;">
                    <p style="margin: 0 0 3px; color: #6b7280; font-size: 13px; font-family: Arial, sans-serif;">Hormat kami,</p>
                    <p style="margin: 12px 0 3px; color: #ff4600; font-size: 16px; font-weight: bold; font-family: Arial, sans-serif;">${profile.name}</p>
                    <p style="margin: 0 0 3px; color: #4b5563; font-size: 13px; font-family: Arial, sans-serif;">Sales & Commercial Executive</p>
                    <p style="margin: 0 0 10px; color: #4b5563; font-size: 13px; font-family: Arial, sans-serif;">${UGC_INFO.shortName}</p>
                    <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: Arial, sans-serif;">
                      ${profile.email} | ${UGC_INFO.phone}
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#1f2937" style="padding: 25px 30px; border-radius: 0 0 12px 12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin: 0 0 5px; color: #ffffff; font-weight: bold; font-size: 14px; font-family: Arial, sans-serif;">${UGC_INFO.name}</p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5; font-family: Arial, sans-serif;">${UGC_INFO.address}</p>
                    <p style="margin: 10px 0 0; color: #9ca3af; font-size: 12px; font-family: Arial, sans-serif;">
                      Tel: ${UGC_INFO.phone} | Email: ${UGC_INFO.email}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 18px; border-top: 1px solid #374151; margin-top: 18px;">
                    <p style="margin: 0; padding-top: 15px; color: #6b7280; font-size: 10px; text-align: center; font-family: Arial, sans-serif;">
                      Email ini dikirim otomatis dari UGC Business Command Portal. Jika Anda menerima email ini karena kesalahan, mohon abaikan.
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

      // Send email via SMTP (Nodemailer)
      // Reply-To is set to quotation creator's email so customer replies go to the right person
      const emailResult = await sendEmail({
        to: quotation.customer_email,
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
        replyTo: creatorEmail, // Reply goes to quotation creator
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
        pdf_url: pdfDownloadUrl,
        validation_url: validationUrl,
      }
    }

    // Update quotation status to 'sent' only if not a resend
    if (!isResend) {
      const sentTo = method === 'email' ? quotation.customer_email : quotation.customer_phone

      // Use admin client for status updates to bypass RLS
      const adminClient = createAdminClient()

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

      // Sync quotation status to all linked entities (ticket, lead, opportunity)
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
