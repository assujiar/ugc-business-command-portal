import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

// Generate Email HTML - modern, attractive design with QR code
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
      <tr style="background: ${index % 2 === 0 ? '#ffffff' : '#fafafa'};">
        <td style="padding: 12px 15px; border-bottom: 1px solid #f0f0f0; color: #374151;">${item.component_name || item.component_type}${item.quantity && item.unit ? ` <span style="color: #9ca3af; font-size: 12px;">(${item.quantity} ${item.unit})</span>` : ''}</td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: 500; color: #1f2937;">${formatCurrency(item.selling_rate, quotation.currency)}</td>
      </tr>
    `).join('')

    itemsTable = `
      <table style="width: 100%; border-collapse: collapse; margin: 0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <thead>
          <tr style="background: linear-gradient(135deg, #ff4600 0%, #ff6b35 100%);">
            <th style="padding: 14px 15px; text-align: left; color: white; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Deskripsi</th>
            <th style="padding: 14px 15px; text-align: right; color: white; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Rate</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          <tr style="background: linear-gradient(135deg, #fff5f0 0%, #ffffff 100%);">
            <td style="padding: 16px 15px; font-weight: 700; color: #ff4600; font-size: 15px; border-top: 2px solid #ff4600;">TOTAL</td>
            <td style="padding: 16px 15px; text-align: right; font-weight: 700; color: #ff4600; font-size: 18px; border-top: 2px solid #ff4600;">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</td>
          </tr>
        </tbody>
      </table>
    `
  }

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quotation ${quotation.quotation_number}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0;">
        <table role="presentation" style="width: 100%; max-width: 620px; margin: 0 auto; border-collapse: collapse;">

          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #ff4600 0%, #ff6b35 50%, #ff8c42 100%); padding: 0; border-radius: 12px 12px 0 0;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 30px 35px;">
                    <img src="${PRODUCTION_URL}/logo/logougctaglinewhite.png" alt="UGC Logistics" style="height: 48px; display: block;" />
                  </td>
                  <td style="padding: 30px 35px; text-align: right;">
                    <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Quotation</p>
                    <p style="margin: 5px 0 0; color: white; font-size: 20px; font-weight: 700;">${quotation.quotation_number}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Quotation Info Strip -->
          <tr>
            <td style="background: #1f2937; padding: 15px 35px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="color: rgba(255,255,255,0.7); font-size: 12px;">
                    Tanggal: <span style="color: white; font-weight: 500;">${formatDate(quotation.created_at)}</span>
                  </td>
                  <td style="text-align: center; color: rgba(255,255,255,0.7); font-size: 12px;">
                    ${quotation.service_type ? `Layanan: <span style="color: white; font-weight: 500;">${quotation.service_type}</span>` : ''}
                  </td>
                  <td style="text-align: right; color: rgba(255,255,255,0.7); font-size: 12px;">
                    Berlaku: <span style="color: #10b981; font-weight: 500;">${formatDate(quotation.valid_until)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="background: #ffffff; padding: 35px;">

              <!-- Greeting -->
              <p style="margin: 0 0 5px; color: #6b7280; font-size: 13px;">Kepada Yth.</p>
              ${companyName ? `
                <p style="margin: 0 0 3px; font-size: 18px; font-weight: 700; color: #1f2937;">${companyName}</p>
                <p style="margin: 0 0 20px; color: #4b5563;">U.p ${customerName}</p>
              ` : `
                <p style="margin: 0 0 20px; font-size: 18px; font-weight: 700; color: #1f2937;">${customerName}</p>
              `}

              <p style="margin: 0 0 25px; color: #4b5563; line-height: 1.7;">
                Terima kasih atas kepercayaan Anda kepada <strong style="color: #ff4600;">UGC Logistics</strong>.
                Dengan senang hati kami sampaikan penawaran harga${routeDisplay ? ` untuk pengiriman rute <strong>${routeDisplay}</strong>` : ''} sebagai berikut:
              </p>

              <!-- Route & Service Card -->
              ${(routeDisplay || quotation.fleet_type || quotation.commodity) ? `
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <tr>
                  ${routeDisplay ? `
                  <td style="background: linear-gradient(135deg, #fef3c7 0%, #fef9c3 100%); padding: 18px 20px; border-radius: 10px; width: 50%; vertical-align: top;">
                    <p style="margin: 0 0 5px; color: #92400e; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Rute Pengiriman</p>
                    <p style="margin: 0; color: #78350f; font-size: 15px; font-weight: 700;">${routeDisplay}</p>
                  </td>
                  ` : ''}
                  ${quotation.fleet_type ? `
                  <td style="background: linear-gradient(135deg, #e0e7ff 0%, #eef2ff 100%); padding: 18px 20px; border-radius: 10px; ${routeDisplay ? 'width: 50%;' : 'width: 100%;'} vertical-align: top; ${routeDisplay ? 'margin-left: 10px;' : ''}">
                    <p style="margin: 0 0 5px; color: #3730a3; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Armada</p>
                    <p style="margin: 0; color: #312e81; font-size: 15px; font-weight: 700;">${quotation.fleet_type}${quotation.fleet_quantity > 1 ? ` x ${quotation.fleet_quantity} unit` : ''}</p>
                  </td>
                  ` : ''}
                </tr>
              </table>
              ` : ''}

              <!-- Cargo Details -->
              ${(quotation.commodity || quotation.cargo_weight || quotation.cargo_volume) ? `
              <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                <p style="margin: 0 0 15px; color: #374151; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Detail Cargo</p>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  ${quotation.commodity ? `<tr><td style="padding: 6px 0; color: #6b7280; width: 35%;">Commodity</td><td style="padding: 6px 0; color: #1f2937; font-weight: 500;">${quotation.commodity}</td></tr>` : ''}
                  ${quotation.cargo_description ? `<tr><td style="padding: 6px 0; color: #6b7280; width: 35%;">Deskripsi</td><td style="padding: 6px 0; color: #1f2937;">${quotation.cargo_description}</td></tr>` : ''}
                  ${quotation.cargo_weight ? `<tr><td style="padding: 6px 0; color: #6b7280; width: 35%;">Berat</td><td style="padding: 6px 0; color: #1f2937; font-weight: 500;">${quotation.cargo_weight.toLocaleString()} ${quotation.cargo_weight_unit || 'kg'}</td></tr>` : ''}
                  ${quotation.cargo_volume ? `<tr><td style="padding: 6px 0; color: #6b7280; width: 35%;">Volume</td><td style="padding: 6px 0; color: #1f2937; font-weight: 500;">${quotation.cargo_volume.toLocaleString()} ${quotation.cargo_volume_unit || 'cbm'}</td></tr>` : ''}
                </table>
              </div>
              ` : ''}

              <!-- Rate Section -->
              ${itemsTable ? `
                <p style="margin: 0 0 15px; color: #374151; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Rincian Biaya</p>
                ${itemsTable}
              ` : `
                <!-- Total Amount Card -->
                <div style="background: linear-gradient(135deg, #fff5f0 0%, #ffffff 100%); border: 2px solid #ff4600; border-radius: 12px; padding: 30px; text-align: center; margin-bottom: 25px;">
                  <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Total Penawaran</p>
                  <p style="margin: 0; color: #ff4600; font-size: 36px; font-weight: 800; letter-spacing: -1px;">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</p>
                </div>
              `}

              <!-- Scope of Work -->
              ${quotation.scope_of_work ? `
              <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 18px 20px; margin: 25px 0; border-radius: 0 10px 10px 0;">
                <p style="margin: 0 0 10px; color: #166534; font-size: 12px; font-weight: 600; text-transform: uppercase;">Scope of Work</p>
                <p style="margin: 0; color: #15803d; white-space: pre-line; line-height: 1.6;">${quotation.scope_of_work}</p>
              </div>
              ` : ''}

              <!-- Validity Notice -->
              <div style="background: linear-gradient(135deg, #fef3c7 0%, #fefce8 100%); border-radius: 10px; padding: 18px 20px; margin: 25px 0;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="width: 30px; vertical-align: top; padding-top: 2px;">
                      <span style="font-size: 20px;">⏰</span>
                    </td>
                    <td>
                      <p style="margin: 0; color: #92400e; font-weight: 600;">Validitas Penawaran</p>
                      <p style="margin: 5px 0 0; color: #78350f; font-size: 14px;">Quotation ini berlaku selama <strong>${quotation.validity_days} hari</strong> hingga <strong>${formatDate(quotation.valid_until)}</strong></p>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- CTA Section with QR -->
              <div style="background: #f8fafc; border-radius: 12px; padding: 25px; margin: 30px 0; text-align: center;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="vertical-align: middle; text-align: left; padding-right: 25px;">
                      <p style="margin: 0 0 15px; color: #1f2937; font-weight: 600; font-size: 15px;">Lihat Detail Quotation</p>
                      <p style="margin: 0 0 20px; color: #6b7280; font-size: 13px; line-height: 1.5;">Scan QR code atau klik tombol di bawah untuk melihat detail lengkap dan download PDF.</p>
                      <a href="${validationUrl}" style="display: inline-block; background: linear-gradient(135deg, #ff4600 0%, #ff6b35 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 14px rgba(255,70,0,0.3);">Lihat Quotation Online</a>
                      <br/>
                      <a href="${pdfUrl}" style="display: inline-block; margin-top: 12px; background: white; color: #ff4600; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; border: 2px solid #ff4600;">Download PDF</a>
                    </td>
                    <td style="vertical-align: middle; text-align: center; width: 150px;">
                      <div style="background: white; padding: 12px; border-radius: 12px; display: inline-block; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <img src="${qrCodeUrl}" alt="QR Code" style="width: 120px; height: 120px; display: block;" />
                      </div>
                      <p style="margin: 10px 0 0; color: #9ca3af; font-size: 11px;">Scan untuk verifikasi</p>
                    </td>
                  </tr>
                </table>
              </div>

              <p style="margin: 0 0 25px; color: #4b5563; line-height: 1.7;">
                Jika Bapak/Ibu memiliki pertanyaan atau membutuhkan informasi tambahan, silakan menghubungi kami. Kami siap membantu.
              </p>

              <!-- Signature -->
              <div style="border-top: 1px solid #e5e7eb; padding-top: 25px; margin-top: 30px;">
                <p style="margin: 0 0 3px; color: #6b7280; font-size: 13px;">Hormat kami,</p>
                <p style="margin: 12px 0 3px; color: #ff4600; font-size: 16px; font-weight: 700;">${profile.name}</p>
                <p style="margin: 0 0 3px; color: #4b5563; font-size: 13px;">Sales & Commercial Executive</p>
                <p style="margin: 0 0 12px; color: #4b5563; font-size: 13px;">${UGC_INFO.shortName}</p>
                <p style="margin: 0; color: #6b7280; font-size: 12px;">
                  ${profile.email} | ${UGC_INFO.phone}
                </p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #1f2937; padding: 30px 35px; border-radius: 0 0 12px 12px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td>
                    <p style="margin: 0 0 5px; color: white; font-weight: 700; font-size: 14px;">${UGC_INFO.name}</p>
                    <p style="margin: 0; color: rgba(255,255,255,0.7); font-size: 12px; line-height: 1.5;">${UGC_INFO.address}</p>
                    <p style="margin: 10px 0 0; color: rgba(255,255,255,0.7); font-size: 12px;">
                      Tel: ${UGC_INFO.phone} | Email: ${UGC_INFO.email}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 20px;">
                    <p style="margin: 0; color: rgba(255,255,255,0.5); font-size: 10px; text-align: center;">
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
        return NextResponse.json({
          error: 'Email service is not configured. Please set SMTP environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS).',
          fallback: {
            email_subject: emailSubject,
            email_html: emailHtml,
            email_text: emailText,
            recipient_email: quotation.customer_email,
          }
        }, { status: 503 })
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
        return NextResponse.json({
          error: emailResult.error || 'Failed to send email',
          fallback: {
            email_subject: emailSubject,
            email_html: emailHtml,
            email_text: emailText,
            recipient_email: quotation.customer_email,
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

      // Update quotation status
      const { error: updateError } = await (supabase as any)
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
      }

      // Sync quotation status to all linked entities (ticket, lead, opportunity)
      const { error: syncError } = await (supabase as any).rpc('sync_quotation_to_all', {
        p_quotation_id: id,
        p_new_status: 'sent',
        p_actor_user_id: user.id
      })

      if (syncError) {
        console.error('Error syncing quotation status:', syncError)
        // Continue anyway - main operation succeeded
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
