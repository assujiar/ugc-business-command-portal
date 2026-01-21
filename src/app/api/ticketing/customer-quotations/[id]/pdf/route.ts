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
}

// Format currency
const formatCurrency = (amount: number, currency: string = 'IDR'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

// Format date
const formatDate = (date: string | Date): string => {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

// Generate HTML for PDF
const generateQuotationHTML = (quotation: any, profile: ProfileData, validationUrl: string): string => {
  const items = quotation.items || []
  const isBreakdown = quotation.rate_structure === 'breakdown'

  // Build items table for breakdown
  let itemsTableHTML = ''
  if (isBreakdown && items.length > 0) {
    itemsTableHTML = `
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 5%">No</th>
            <th style="width: 45%">Description</th>
            <th style="width: 25%">Unit</th>
            <th style="width: 25%">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item: any, index: number) => `
            <tr>
              <td>${index + 1}</td>
              <td>${item.component_name || item.component_type}</td>
              <td>${item.quantity ? `${item.quantity} ${item.unit || ''}` : '-'}</td>
              <td style="text-align: right">${formatCurrency(item.selling_rate, quotation.currency)}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="3" style="text-align: right"><strong>TOTAL</strong></td>
            <td style="text-align: right"><strong>${formatCurrency(quotation.total_selling_rate, quotation.currency)}</strong></td>
          </tr>
        </tbody>
      </table>
    `
  } else {
    itemsTableHTML = `
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 75%">Description</th>
            <th style="width: 25%">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Logistics Service</strong><br/>
              ${quotation.service_type || 'Door to Door Delivery'}<br/>
              ${quotation.origin_city || ''} → ${quotation.destination_city || ''}
            </td>
            <td style="text-align: right"><strong>${formatCurrency(quotation.total_selling_rate, quotation.currency)}</strong></td>
          </tr>
        </tbody>
      </table>
    `
  }

  // Build includes list
  const includesList = Array.isArray(quotation.terms_includes)
    ? quotation.terms_includes.map((t: string) => `<li>${t}</li>`).join('')
    : ''

  // Build excludes list
  const excludesList = Array.isArray(quotation.terms_excludes)
    ? quotation.terms_excludes.map((t: string) => `<li>${t}</li>`).join('')
    : ''

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          font-size: 11px;
          line-height: 1.5;
          color: #333;
          padding: 40px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 30px;
          border-bottom: 3px solid #1a365d;
          padding-bottom: 20px;
        }
        .logo {
          width: 150px;
          height: auto;
        }
        .company-info {
          text-align: right;
          font-size: 10px;
          color: #666;
        }
        .quotation-title {
          text-align: center;
          font-size: 24px;
          font-weight: bold;
          color: #1a365d;
          margin: 20px 0;
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        .quotation-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 25px;
          background: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
        }
        .info-box {
          flex: 1;
        }
        .info-box h4 {
          font-size: 10px;
          color: #666;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .info-box p {
          font-size: 12px;
          font-weight: 500;
        }
        .section {
          margin-bottom: 25px;
        }
        .section-title {
          font-size: 14px;
          font-weight: bold;
          color: #1a365d;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 8px;
          margin-bottom: 15px;
        }
        .customer-info {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
          margin-bottom: 20px;
        }
        .customer-info p {
          margin: 3px 0;
        }
        .customer-name {
          font-size: 14px;
          font-weight: bold;
        }
        .service-details {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
          margin-bottom: 20px;
        }
        .detail-item {
          background: #f8f9fa;
          padding: 10px;
          border-radius: 5px;
        }
        .detail-label {
          font-size: 9px;
          color: #666;
          text-transform: uppercase;
        }
        .detail-value {
          font-size: 12px;
          font-weight: 500;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        .items-table th {
          background: #1a365d;
          color: white;
          padding: 10px;
          text-align: left;
          font-size: 11px;
        }
        .items-table td {
          padding: 10px;
          border-bottom: 1px solid #e2e8f0;
        }
        .items-table .total-row {
          background: #f8f9fa;
          font-weight: bold;
        }
        .terms-section {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }
        .terms-box {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
        }
        .terms-box h4 {
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 10px;
          color: #1a365d;
        }
        .terms-box ul {
          margin-left: 20px;
          font-size: 10px;
        }
        .terms-box li {
          margin: 5px 0;
        }
        .scope-notes {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
        }
        .validity-box {
          background: #d4edda;
          border-left: 4px solid #28a745;
          padding: 15px;
          margin: 20px 0;
        }
        .footer {
          margin-top: 40px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .signature {
          text-align: center;
        }
        .signature-line {
          width: 200px;
          border-top: 1px solid #333;
          margin-top: 60px;
          padding-top: 10px;
        }
        .signature-name {
          font-weight: bold;
          font-size: 12px;
        }
        .signature-title {
          color: #666;
          font-size: 10px;
        }
        .qr-section {
          text-align: center;
        }
        .qr-code {
          width: 80px;
          height: 80px;
        }
        .qr-text {
          font-size: 8px;
          color: #666;
          margin-top: 5px;
        }
        @media print {
          body { padding: 20px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <img src="/logo/logougctaglinefull.png" class="logo" alt="UGC Logo" style="max-height: 60px; width: auto;"/>
        </div>
        <div class="company-info">
          <strong>PT. UGC Logistics</strong><br/>
          Jl. Raya Example No. 123<br/>
          Jakarta, Indonesia 12345<br/>
          Tel: +62 21 1234567<br/>
          Email: info@ugclogistics.com
        </div>
      </div>

      <h1 class="quotation-title">Quotation</h1>

      <div class="quotation-info">
        <div class="info-box">
          <h4>Quotation Number</h4>
          <p>${quotation.quotation_number}</p>
        </div>
        <div class="info-box">
          <h4>Date</h4>
          <p>${formatDate(quotation.created_at)}</p>
        </div>
        <div class="info-box">
          <h4>Valid Until</h4>
          <p>${formatDate(quotation.valid_until)}</p>
        </div>
        <div class="info-box">
          <h4>Reference</h4>
          <p>${quotation.ticket?.ticket_code || '-'}</p>
        </div>
      </div>

      <div class="section">
        <h3 class="section-title">Customer Information</h3>
        <div class="customer-info">
          <p class="customer-name">${quotation.customer_name}</p>
          ${quotation.customer_company ? `<p>${quotation.customer_company}</p>` : ''}
          ${quotation.customer_address ? `<p>${quotation.customer_address}</p>` : ''}
          ${quotation.customer_email ? `<p>Email: ${quotation.customer_email}</p>` : ''}
          ${quotation.customer_phone ? `<p>Phone: ${quotation.customer_phone}</p>` : ''}
        </div>
      </div>

      <div class="section">
        <h3 class="section-title">Service Details</h3>
        <div class="service-details">
          ${quotation.service_type ? `
            <div class="detail-item">
              <div class="detail-label">Service Type</div>
              <div class="detail-value">${quotation.service_type}</div>
            </div>
          ` : ''}
          ${quotation.incoterm ? `
            <div class="detail-item">
              <div class="detail-label">Incoterm</div>
              <div class="detail-value">${quotation.incoterm}</div>
            </div>
          ` : ''}
          ${quotation.fleet_type ? `
            <div class="detail-item">
              <div class="detail-label">Fleet Type</div>
              <div class="detail-value">${quotation.fleet_type}${quotation.fleet_quantity ? ` x ${quotation.fleet_quantity}` : ''}</div>
            </div>
          ` : ''}
          ${quotation.commodity ? `
            <div class="detail-item">
              <div class="detail-label">Commodity</div>
              <div class="detail-value">${quotation.commodity}</div>
            </div>
          ` : ''}
        </div>

        <div class="service-details">
          <div class="detail-item">
            <div class="detail-label">Origin</div>
            <div class="detail-value">
              ${[quotation.origin_address, quotation.origin_city, quotation.origin_country].filter(Boolean).join(', ') || '-'}
              ${quotation.origin_port ? `<br/>Port: ${quotation.origin_port}` : ''}
            </div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Destination</div>
            <div class="detail-value">
              ${[quotation.destination_address, quotation.destination_city, quotation.destination_country].filter(Boolean).join(', ') || '-'}
              ${quotation.destination_port ? `<br/>Port: ${quotation.destination_port}` : ''}
            </div>
          </div>
        </div>

        ${quotation.cargo_description || quotation.cargo_weight || quotation.cargo_volume ? `
          <div class="service-details">
            ${quotation.cargo_description ? `
              <div class="detail-item">
                <div class="detail-label">Cargo Description</div>
                <div class="detail-value">${quotation.cargo_description}</div>
              </div>
            ` : ''}
            <div class="detail-item">
              <div class="detail-label">Cargo Details</div>
              <div class="detail-value">
                ${quotation.cargo_weight ? `Weight: ${quotation.cargo_weight} ${quotation.cargo_weight_unit || 'kg'}` : ''}
                ${quotation.cargo_volume ? `<br/>Volume: ${quotation.cargo_volume} ${quotation.cargo_volume_unit || 'cbm'}` : ''}
                ${quotation.cargo_quantity ? `<br/>Quantity: ${quotation.cargo_quantity} ${quotation.cargo_quantity_unit || 'units'}` : ''}
              </div>
            </div>
          </div>
        ` : ''}

        ${quotation.estimated_leadtime || quotation.estimated_cargo_value ? `
          <div class="service-details">
            ${quotation.estimated_leadtime ? `
              <div class="detail-item">
                <div class="detail-label">Estimated Leadtime</div>
                <div class="detail-value">${quotation.estimated_leadtime}</div>
              </div>
            ` : ''}
            ${quotation.estimated_cargo_value ? `
              <div class="detail-item">
                <div class="detail-label">Estimated Cargo Value</div>
                <div class="detail-value">${formatCurrency(quotation.estimated_cargo_value, quotation.cargo_value_currency || 'IDR')}</div>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>

      <div class="section">
        <h3 class="section-title">Rate Quotation</h3>
        ${itemsTableHTML}
      </div>

      ${quotation.scope_of_work ? `
        <div class="scope-notes">
          <strong>Scope of Work:</strong><br/>
          ${quotation.scope_of_work}
        </div>
      ` : ''}

      <div class="section">
        <h3 class="section-title">Terms & Conditions</h3>
        <div class="terms-section">
          ${includesList ? `
            <div class="terms-box">
              <h4>Included:</h4>
              <ul>${includesList}</ul>
            </div>
          ` : ''}
          ${excludesList ? `
            <div class="terms-box">
              <h4>Excluded:</h4>
              <ul>${excludesList}</ul>
            </div>
          ` : ''}
        </div>
        ${quotation.terms_notes ? `
          <div class="scope-notes" style="margin-top: 15px;">
            <strong>Notes:</strong><br/>
            ${quotation.terms_notes}
          </div>
        ` : ''}
      </div>

      <div class="validity-box">
        <strong>Validity:</strong> This quotation is valid for <strong>${quotation.validity_days} days</strong> from the date of issue (until ${formatDate(quotation.valid_until)}).
      </div>

      <div class="footer">
        <div class="signature">
          <div class="signature-line">
            <div class="signature-name">${profile.name}</div>
            <div class="signature-title">Sales & Commercial Executive</div>
          </div>
        </div>
        <div class="qr-section">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(validationUrl)}" class="qr-code" alt="QR Code"/>
          <div class="qr-text">Scan to verify this quotation</div>
        </div>
      </div>
    </body>
    </html>
  `
}

// POST /api/ticketing/customer-quotations/[id]/pdf - Generate PDF
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
      .select('user_id, role, name')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    if (!profileData || !canAccessTicketing(profileData.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
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

    // Build validation URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const validationUrl = `${baseUrl}/quotation-verify/${quotation.validation_code}`

    // Generate HTML
    const html = generateQuotationHTML(quotation, profileData, validationUrl)

    // Return HTML for now (in production, use a PDF library or service)
    // The frontend can use this HTML with html2pdf.js or similar
    return NextResponse.json({
      success: true,
      html,
      quotation_number: quotation.quotation_number,
      validation_url: validationUrl,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET - Get PDF preview HTML
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role, name')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    if (!profileData || !canAccessTicketing(profileData.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch quotation
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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const validationUrl = `${baseUrl}/quotation-verify/${quotation.validation_code}`

    const html = generateQuotationHTML(quotation, profileData, validationUrl)

    // Return as HTML response for preview
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
