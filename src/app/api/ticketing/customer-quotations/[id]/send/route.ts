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

// Generate WhatsApp text - concise, professional, friendly
const generateWhatsAppText = (quotation: any, profile: ProfileData, validationUrl: string, pdfUrl: string): string => {
  const greeting = getTimeBasedGreeting()
  const customerName = quotation.customer_name?.split(' ')[0] || 'Bapak/Ibu'

  let routeInfo = ''
  if (quotation.origin_city && quotation.destination_city) {
    routeInfo = `rute ${quotation.origin_city} - ${quotation.destination_city}`
  }

  let serviceInfo = ''
  if (quotation.service_type) {
    serviceInfo = ` untuk layanan ${quotation.service_type}`
  }

  // Build cargo details
  let cargoDetails = ''
  if (quotation.cargo_description || quotation.fleet_type || quotation.cargo_weight) {
    cargoDetails = '\n📦 *Detail Cargo:*'
    if (quotation.commodity) cargoDetails += `\n   • Commodity: ${quotation.commodity}`
    if (quotation.cargo_description) cargoDetails += `\n   • Deskripsi: ${quotation.cargo_description}`
    if (quotation.fleet_type) cargoDetails += `\n   • Fleet: ${quotation.fleet_type}${quotation.fleet_quantity ? ` × ${quotation.fleet_quantity}` : ''}`
    if (quotation.cargo_weight) cargoDetails += `\n   • Berat: ${quotation.cargo_weight} ${quotation.cargo_weight_unit || 'kg'}`
    if (quotation.cargo_volume) cargoDetails += `\n   • Volume: ${quotation.cargo_volume} ${quotation.cargo_volume_unit || 'cbm'}`
    cargoDetails += '\n'
  }

  const text = `${greeting} ${customerName},

Terima kasih atas kepercayaan Anda pada *${UGC_INFO.shortName}*.

Berikut kami sampaikan penawaran harga${serviceInfo}${routeInfo ? ` ${routeInfo}` : ''}:

📋 *No. Quotation:* ${quotation.quotation_number}
💰 *Total:* ${formatCurrency(quotation.total_selling_rate, quotation.currency)}
📅 *Berlaku hingga:* ${formatDate(quotation.valid_until)}
${cargoDetails}
🔗 *Lihat Quotation Online:*
${validationUrl}

📄 *Download PDF:*
${pdfUrl}

Mohon konfirmasi jika ada pertanyaan atau membutuhkan informasi tambahan. Kami siap membantu!

Terima kasih 🙏

Best regards,
*${profile.name}*
Sales & Commercial Executive
${UGC_INFO.shortName}
📞 ${UGC_INFO.phone}
📱 ${UGC_INFO.whatsapp}`

  return text
}

// Generate Email HTML - professional, complete narrative with UGC branding
const generateEmailHTML = (quotation: any, profile: ProfileData, validationUrl: string, pdfUrl: string): string => {
  const customerName = quotation.customer_name || 'Bapak/Ibu'
  const companyName = quotation.customer_company || ''

  let routeInfo = ''
  if (quotation.origin_city && quotation.destination_city) {
    routeInfo = ` dari ${quotation.origin_city} ke ${quotation.destination_city}`
  }

  let serviceInfo = quotation.service_type || 'pengiriman barang'

  // Build items summary
  let itemsSummary = ''
  if (quotation.rate_structure === 'breakdown' && quotation.items?.length > 0) {
    itemsSummary = `
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #ff4600; color: white;">
            <th style="padding: 10px; text-align: left;">Description</th>
            <th style="padding: 10px; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${quotation.items.map((item: any) => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px;">${item.component_name || item.component_type}</td>
              <td style="padding: 10px; text-align: right;">${formatCurrency(item.selling_rate, quotation.currency)}</td>
            </tr>
          `).join('')}
          <tr style="background: #fff8f5; font-weight: bold;">
            <td style="padding: 10px; color: #ff4600;">Total</td>
            <td style="padding: 10px; text-align: right; color: #ff4600;">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</td>
          </tr>
        </tbody>
      </table>
    `
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f5f5f5;">
      <!-- Header with Logo -->
      <div style="background: linear-gradient(135deg, #ff4600 0%, #ff6b35 100%); color: white; padding: 25px 30px; text-align: center;">
        <img src="${PRODUCTION_URL}/logo/logougctaglinewhite.png" alt="UGC Logistics" style="height: 45px; margin-bottom: 10px;" />
        <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.95;">Quotation ${quotation.quotation_number}</p>
      </div>

      <!-- Content -->
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="margin-top: 0;">Yth. <strong>${customerName}</strong>${companyName ? `,<br/>${companyName}` : ''},</p>

        <p>Terima kasih atas kepercayaan Anda kepada <strong style="color: #ff4600;">${UGC_INFO.shortName}</strong>. Dengan senang hati kami sampaikan penawaran harga untuk layanan ${serviceInfo}${routeInfo}.</p>

        <!-- Quote Info Box -->
        <div style="background: #fff8f5; border-left: 4px solid #ff4600; padding: 15px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 0;"><strong>No. Quotation:</strong> ${quotation.quotation_number}</p>
          <p style="margin: 5px 0 0;"><strong>Tanggal:</strong> ${formatDate(quotation.created_at)}</p>
          ${quotation.ticket?.ticket_code ? `<p style="margin: 5px 0 0;"><strong>Reference:</strong> ${quotation.ticket.ticket_code}</p>` : ''}
        </div>

        <!-- Cargo Details -->
        ${(quotation.commodity || quotation.cargo_description || quotation.cargo_weight || quotation.cargo_volume || quotation.fleet_type) ? `
          <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #ff4600; margin: 0 0 15px 0; font-size: 14px;">📦 Detail Cargo</h3>
            <table style="width: 100%; font-size: 13px;">
              ${quotation.commodity ? `<tr><td style="padding: 5px 0; color: #666;">Commodity:</td><td style="padding: 5px 0;"><strong>${quotation.commodity}</strong></td></tr>` : ''}
              ${quotation.cargo_description ? `<tr><td style="padding: 5px 0; color: #666;">Deskripsi:</td><td style="padding: 5px 0;">${quotation.cargo_description}</td></tr>` : ''}
              ${quotation.fleet_type ? `<tr><td style="padding: 5px 0; color: #666;">Fleet:</td><td style="padding: 5px 0;"><strong>${quotation.fleet_type}</strong>${quotation.fleet_quantity ? ` × ${quotation.fleet_quantity} unit` : ''}</td></tr>` : ''}
              ${quotation.cargo_weight ? `<tr><td style="padding: 5px 0; color: #666;">Berat:</td><td style="padding: 5px 0;">${quotation.cargo_weight} ${quotation.cargo_weight_unit || 'kg'}</td></tr>` : ''}
              ${quotation.cargo_volume ? `<tr><td style="padding: 5px 0; color: #666;">Volume:</td><td style="padding: 5px 0;">${quotation.cargo_volume} ${quotation.cargo_volume_unit || 'cbm'}</td></tr>` : ''}
              ${quotation.estimated_cargo_value ? `<tr><td style="padding: 5px 0; color: #666;">Nilai Cargo:</td><td style="padding: 5px 0;"><strong style="color: #ff4600;">${formatCurrency(quotation.estimated_cargo_value, quotation.cargo_value_currency || 'IDR')}</strong></td></tr>` : ''}
            </table>
          </div>
        ` : ''}

        ${itemsSummary || `
          <div style="background: linear-gradient(135deg, #fff8f5 0%, #fff 100%); padding: 25px; border-radius: 12px; margin: 20px 0; text-align: center; border: 1px solid #ffe4d6;">
            <p style="margin: 0; color: #666; font-size: 13px;">Total Penawaran</p>
            <p style="margin: 10px 0 0; font-size: 32px; font-weight: bold; color: #ff4600;">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</p>
          </div>
        `}

        ${quotation.scope_of_work ? `
          <div style="margin: 20px 0;">
            <h3 style="color: #ff4600; margin-bottom: 10px; font-size: 14px;">Scope of Work:</h3>
            <p style="white-space: pre-wrap; background: #f9fafb; padding: 15px; border-radius: 8px; margin: 0;">${quotation.scope_of_work}</p>
          </div>
        ` : ''}

        <!-- Validity Box -->
        <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 15px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          <strong>⏰ Validitas Penawaran:</strong> Penawaran ini berlaku selama <strong>${quotation.validity_days} hari</strong> sejak tanggal penerbitan (hingga <strong>${formatDate(quotation.valid_until)}</strong>).
        </div>

        <p>Detail lengkap mengenai penawaran ini dapat dilihat melalui link di bawah. Anda juga dapat memverifikasi keaslian dokumen dengan memindai QR code yang tersedia.</p>

        <!-- CTA Buttons -->
        <div style="text-align: center; margin: 30px 0;">
          <a href="${validationUrl}" style="display: inline-block; background: linear-gradient(135deg, #ff4600 0%, #ff6b35 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 5px;">📋 Lihat Quotation Online</a>
          <br/><br/>
          <a href="${pdfUrl}" style="display: inline-block; background: #ffffff; color: #ff4600; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; border: 2px solid #ff4600; margin: 5px;">📄 Download Quotation Letter</a>
        </div>

        <p>Jika Bapak/Ibu memiliki pertanyaan atau membutuhkan informasi tambahan, silakan menghubungi kami. Kami dengan senang hati akan membantu.</p>

        <p>Kami berharap dapat bekerja sama dengan ${companyName || 'perusahaan Anda'} dan memberikan layanan logistik terbaik.</p>

        <!-- Signature -->
        <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
          <p style="margin: 0;">Hormat kami,</p>
          <p style="margin: 10px 0 0 0;"><strong style="color: #ff4600;">${profile.name}</strong></p>
          <p style="margin: 0; color: #666; font-size: 13px;">Sales & Commercial Executive</p>
          <p style="margin: 5px 0 0 0; color: #666; font-size: 13px;">${UGC_INFO.shortName}</p>
          <p style="margin: 5px 0 0 0; color: #666; font-size: 13px;">📧 ${profile.email}</p>
          <p style="margin: 0; color: #666; font-size: 13px;">📞 ${UGC_INFO.phone} | 📱 ${UGC_INFO.whatsapp}</p>
        </div>
      </div>

      <!-- Footer -->
      <div style="background: linear-gradient(135deg, #ff4600 0%, #ff6b35 100%); padding: 25px; text-align: center; color: white; font-size: 12px;">
        <p style="margin: 0; font-weight: bold;">${UGC_INFO.name}</p>
        <p style="margin: 8px 0; opacity: 0.9;">${UGC_INFO.address}</p>
        <p style="margin: 8px 0; opacity: 0.9;">📞 ${UGC_INFO.phone} | 📠 ${UGC_INFO.fax} | 📧 ${UGC_INFO.email}</p>
        <p style="margin: 12px 0 0 0; opacity: 0.7; font-size: 10px;">This email and any attachments are confidential. If you have received this email in error, please delete it immediately.</p>
      </div>
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

  return `
${UGC_INFO.shortName} - Quotation ${quotation.quotation_number}

Yth. ${customerName}${companyName ? `, ${companyName}` : ''},

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

    // Build URLs using production URL
    const validationUrl = `${PRODUCTION_URL}/quotation-verify/${quotation.validation_code}`
    const pdfDownloadUrl = pdf_url || `${PRODUCTION_URL}/api/ticketing/customer-quotations/${id}/pdf`

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
      await (supabase as any)
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

      // Sync quotation status to all linked entities (ticket, lead, opportunity)
      await (supabase as any).rpc('sync_quotation_to_all', {
        p_quotation_id: id,
        p_new_status: 'sent',
        p_actor_user_id: user.id
      })
    }

    return NextResponse.json({
      success: true,
      data: responseData,
      message: isResend
        ? `Quotation resent via ${method}`
        : method === 'whatsapp'
          ? 'WhatsApp text generated. Click the link to send via WhatsApp.'
          : 'Email content generated. Ready to send.',
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
