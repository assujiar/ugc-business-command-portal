import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing } from '@/lib/permissions'
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

// Generate WhatsApp text - concise, professional, friendly
const generateWhatsAppText = (quotation: any, profile: ProfileData, pdfUrl: string): string => {
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

  const text = `${greeting} ${customerName},

Terima kasih atas kepercayaan Anda pada UGC Logistics.

Berikut kami sampaikan penawaran harga${serviceInfo}${routeInfo ? ` ${routeInfo}` : ''}:

📋 *No. Quotation:* ${quotation.quotation_number}
💰 *Total:* ${formatCurrency(quotation.total_selling_rate, quotation.currency)}
📅 *Berlaku hingga:* ${formatDate(quotation.valid_until)}

📎 *Detail lengkap dapat dilihat di:*
${pdfUrl}

Mohon konfirmasi jika ada pertanyaan atau membutuhkan informasi tambahan. Kami siap membantu!

Terima kasih 🙏

Best regards,
*${profile.name}*
Sales & Commercial Executive
UGC Logistics
📞 +62 21 1234567`

  return text
}

// Generate Email HTML - professional, complete narrative
const generateEmailHTML = (quotation: any, profile: ProfileData, validationUrl: string): string => {
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
          <tr style="background: #1a365d; color: white;">
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
          <tr style="background: #f8f9fa; font-weight: bold;">
            <td style="padding: 10px;">Total</td>
            <td style="padding: 10px; text-align: right;">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</td>
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
      <style>
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: #1a365d;
          color: white;
          padding: 20px;
          text-align: center;
          border-radius: 8px 8px 0 0;
        }
        .content {
          background: #ffffff;
          padding: 30px;
          border: 1px solid #e2e8f0;
          border-top: none;
        }
        .highlight-box {
          background: #f8f9fa;
          border-left: 4px solid #1a365d;
          padding: 15px;
          margin: 20px 0;
        }
        .validity-box {
          background: #d4edda;
          border-left: 4px solid #28a745;
          padding: 15px;
          margin: 20px 0;
        }
        .cta-button {
          display: inline-block;
          background: #1a365d;
          color: white;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 5px;
          margin: 20px 0;
        }
        .footer {
          background: #f8f9fa;
          padding: 20px;
          text-align: center;
          font-size: 12px;
          color: #666;
          border-radius: 0 0 8px 8px;
          border: 1px solid #e2e8f0;
          border-top: none;
        }
        .signature {
          margin-top: 30px;
          border-top: 1px solid #e2e8f0;
          padding-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 style="margin: 0; font-size: 24px;">UGC Logistics</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">Quotation ${quotation.quotation_number}</p>
      </div>

      <div class="content">
        <p>Yth. ${customerName}${companyName ? `,<br/>${companyName}` : ''},</p>

        <p>Terima kasih atas kepercayaan Anda kepada UGC Logistics. Dengan senang hati kami sampaikan penawaran harga untuk layanan ${serviceInfo}${routeInfo}.</p>

        <div class="highlight-box">
          <p style="margin: 0;"><strong>No. Quotation:</strong> ${quotation.quotation_number}</p>
          <p style="margin: 5px 0;"><strong>Tanggal:</strong> ${formatDate(quotation.created_at)}</p>
          ${quotation.ticket?.ticket_code ? `<p style="margin: 5px 0;"><strong>Reference:</strong> ${quotation.ticket.ticket_code}</p>` : ''}
        </div>

        ${itemsSummary || `
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; color: #666;">Total Penawaran</p>
            <p style="margin: 10px 0; font-size: 28px; font-weight: bold; color: #1a365d;">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</p>
          </div>
        `}

        ${quotation.scope_of_work ? `
          <div style="margin: 20px 0;">
            <h3 style="color: #1a365d; margin-bottom: 10px;">Scope of Work:</h3>
            <p style="white-space: pre-wrap;">${quotation.scope_of_work}</p>
          </div>
        ` : ''}

        <div class="validity-box">
          <strong>⏰ Validitas Penawaran:</strong> Penawaran ini berlaku selama <strong>${quotation.validity_days} hari</strong> sejak tanggal penerbitan (hingga ${formatDate(quotation.valid_until)}).
        </div>

        <p>Detail lengkap mengenai penawaran ini dapat dilihat pada dokumen PDF terlampir. Anda juga dapat memverifikasi keaslian dokumen dengan memindai QR code yang tersedia.</p>

        <p style="text-align: center;">
          <a href="${validationUrl}" class="cta-button">Lihat Quotation Online</a>
        </p>

        <p>Jika Bapak/Ibu memiliki pertanyaan atau membutuhkan informasi tambahan, silakan menghubungi kami. Kami dengan senang hati akan membantu.</p>

        <p>Kami berharap dapat bekerja sama dengan ${companyName || 'perusahaan Anda'} dan memberikan layanan logistik terbaik.</p>

        <div class="signature">
          <p style="margin: 0;">Hormat kami,</p>
          <p style="margin: 10px 0 0 0;"><strong>${profile.name}</strong></p>
          <p style="margin: 0; color: #666;">Sales & Commercial Executive</p>
          <p style="margin: 5px 0 0 0; color: #666;">UGC Logistics</p>
          <p style="margin: 0; color: #666;">Email: ${profile.email}</p>
          <p style="margin: 0; color: #666;">Tel: +62 21 1234567</p>
        </div>
      </div>

      <div class="footer">
        <p style="margin: 0;">PT. UGC Logistics</p>
        <p style="margin: 5px 0;">Jl. Raya Example No. 123, Jakarta, Indonesia</p>
        <p style="margin: 10px 0 0 0; font-size: 10px;">This email and any attachments are confidential. If you have received this email in error, please delete it immediately.</p>
      </div>
    </body>
    </html>
  `
}

// Generate plain text email version
const generateEmailPlainText = (quotation: any, profile: ProfileData, validationUrl: string): string => {
  const customerName = quotation.customer_name || 'Bapak/Ibu'
  const companyName = quotation.customer_company || ''

  let routeInfo = ''
  if (quotation.origin_city && quotation.destination_city) {
    routeInfo = ` dari ${quotation.origin_city} ke ${quotation.destination_city}`
  }

  return `
UGC Logistics - Quotation ${quotation.quotation_number}

Yth. ${customerName}${companyName ? `, ${companyName}` : ''},

Terima kasih atas kepercayaan Anda kepada UGC Logistics. Dengan senang hati kami sampaikan penawaran harga untuk layanan ${quotation.service_type || 'pengiriman barang'}${routeInfo}.

No. Quotation: ${quotation.quotation_number}
Tanggal: ${formatDate(quotation.created_at)}
${quotation.ticket?.ticket_code ? `Reference: ${quotation.ticket.ticket_code}` : ''}

TOTAL PENAWARAN: ${formatCurrency(quotation.total_selling_rate, quotation.currency)}

Validitas: Penawaran ini berlaku selama ${quotation.validity_days} hari sejak tanggal penerbitan (hingga ${formatDate(quotation.valid_until)}).

Detail lengkap dapat dilihat di: ${validationUrl}

Jika memiliki pertanyaan atau membutuhkan informasi tambahan, silakan menghubungi kami.

Hormat kami,
${profile.name}
Sales & Commercial Executive
UGC Logistics
Email: ${profile.email}
Tel: +62 21 1234567

---
PT. UGC Logistics
Jl. Raya Example No. 123, Jakarta, Indonesia
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
    const { method, pdf_url } = body as {
      method: 'whatsapp' | 'email'
      pdf_url?: string
    }

    if (!method || !['whatsapp', 'email'].includes(method)) {
      return NextResponse.json({ error: 'Invalid send method' }, { status: 400 })
    }

    // Fetch quotation with all details
    const { data: quotation, error } = await (supabase as any)
      .from('customer_quotations')
      .select(`
        *,
        ticket:tickets!customer_quotations_ticket_id_fkey(id, ticket_code, subject),
        items:customer_quotation_items(*)
      `)
      .eq('id', id)
      .single()

    if (error || !quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    // Build URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const validationUrl = `${baseUrl}/quotation-verify/${quotation.validation_code}`
    const pdfDownloadUrl = pdf_url || `${baseUrl}/api/ticketing/customer-quotations/${id}/pdf`

    let responseData: any = {
      quotation_id: id,
      quotation_number: quotation.quotation_number,
      method,
    }

    if (method === 'whatsapp') {
      // Generate WhatsApp text
      const whatsappText = generateWhatsAppText(quotation, profileData, pdfDownloadUrl)

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
      const emailSubject = `Penawaran Harga - ${quotation.quotation_number} | UGC Logistics`
      const emailHtml = generateEmailHTML(quotation, profileData, validationUrl)
      const emailText = generateEmailPlainText(quotation, profileData, validationUrl)

      responseData = {
        ...responseData,
        email_subject: emailSubject,
        email_html: emailHtml,
        email_text: emailText,
        recipient_email: quotation.customer_email,
        pdf_url: pdfDownloadUrl,
        validation_url: validationUrl,
      }

      // Note: Actual email sending would require an email service integration
      // For now, we return the content for the frontend to handle or for future integration
      // Example with Resend, SendGrid, or Nodemailer would go here
    }

    // Update quotation status to 'sent'
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

    return NextResponse.json({
      success: true,
      data: responseData,
      message: method === 'whatsapp'
        ? 'WhatsApp text generated. Click the link to send via WhatsApp.'
        : 'Email content generated. Ready to send.',
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
