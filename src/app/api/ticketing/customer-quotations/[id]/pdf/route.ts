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

// UGC Company Info
const UGC_INFO = {
  name: 'PT. Utama Global Indo Cargo',
  shortName: 'UGC Logistics',
  address: 'Graha Fadillah, Jl Prof. Soepomo SH No. 45 BZ Blok C',
  city: 'Tebet, Jakarta Selatan, Indonesia 12810',
  phone: '+6221 8350778',
  fax: '+6221 8300219',
  whatsapp: '+62812 8459 6614',
  email: 'service@ugc.co.id',
  web: 'www.utamaglobalindocargo.com',
}

// Generate HTML for PDF
const generateQuotationHTML = (quotation: any, profile: ProfileData, validationUrl: string): string => {
  const items = quotation.items || []
  const isBreakdown = quotation.rate_structure === 'breakdown'

  // Build items table for breakdown
  let itemsTableHTML = ''
  if (isBreakdown && items.length > 0) {
    itemsTableHTML = `
      <table class="rate-table">
        <thead>
          <tr>
            <th style="width: 5%">No</th>
            <th style="width: 50%">Description</th>
            <th style="width: 20%">Unit</th>
            <th style="width: 25%">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item: any, index: number) => `
            <tr>
              <td class="center">${index + 1}</td>
              <td>${item.component_name || item.component_type}${item.description ? `<br/><span class="item-desc">${item.description}</span>` : ''}</td>
              <td class="center">${item.quantity ? `${item.quantity} ${item.unit || ''}` : '-'}</td>
              <td class="right">${formatCurrency(item.selling_rate, quotation.currency)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  } else {
    itemsTableHTML = `
      <table class="rate-table">
        <thead>
          <tr>
            <th style="width: 75%">Description</th>
            <th style="width: 25%">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Logistics Service - ${quotation.service_type || 'Door to Door Delivery'}</strong><br/>
              <span class="item-desc">${quotation.origin_city || 'Origin'} → ${quotation.destination_city || 'Destination'}</span>
            </td>
            <td class="right"><strong>${formatCurrency(quotation.total_selling_rate, quotation.currency)}</strong></td>
          </tr>
        </tbody>
      </table>
    `
  }

  // Build includes list
  const includesList = Array.isArray(quotation.terms_includes)
    ? quotation.terms_includes.map((t: string) => `<li><span class="check">✓</span> ${t}</li>`).join('')
    : ''

  // Build excludes list
  const excludesList = Array.isArray(quotation.terms_excludes)
    ? quotation.terms_excludes.map((t: string) => `<li><span class="cross">✗</span> ${t}</li>`).join('')
    : ''

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Quotation ${quotation.quotation_number}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        :root {
          --orange: #ff4600;
          --orange-light: #ff6b35;
          --orange-bg: #fff8f5;
          --dark: #1a1a2e;
          --gray: #6b7280;
          --light-gray: #f3f4f6;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        @page {
          size: A4;
          margin: 10mm;
        }

        body {
          font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
          font-size: 9px;
          line-height: 1.4;
          color: var(--dark);
          background: white;
        }

        .page {
          max-width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          padding: 8mm;
        }

        /* Header - Combined with title */
        .header-wrapper {
          background: linear-gradient(135deg, var(--orange) 0%, var(--orange-light) 100%);
          color: white;
          padding: 12px 16px;
          margin-bottom: 12px;
          border-radius: 6px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-left img {
          height: 36px;
          width: auto;
          background: white;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .header-title h1 {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
        }

        .header-right {
          text-align: right;
        }

        .header-right .label {
          font-size: 8px;
          opacity: 0.9;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .header-right .number {
          font-size: 13px;
          font-weight: 700;
          margin-top: 2px;
        }

        .company-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          margin-bottom: 10px;
          border-bottom: 2px solid var(--orange);
          font-size: 8px;
          color: var(--gray);
        }

        .company-bar strong {
          color: var(--dark);
          font-size: 10px;
        }

        /* Info Grid */
        .info-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 12px;
        }

        .info-card {
          background: var(--light-gray);
          padding: 8px;
          border-radius: 4px;
          border-left: 2px solid var(--orange);
        }

        .info-card .label {
          font-size: 7px;
          color: var(--gray);
          text-transform: uppercase;
          letter-spacing: 0.3px;
          margin-bottom: 2px;
        }

        .info-card .value {
          font-size: 9px;
          font-weight: 600;
          color: var(--dark);
        }

        /* Sections */
        .section {
          margin-bottom: 12px;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
          padding-bottom: 4px;
          border-bottom: 1px solid var(--orange);
        }

        .section-icon {
          width: 16px;
          height: 16px;
          background: var(--orange);
          border-radius: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 8px;
        }

        .section-title {
          font-size: 10px;
          font-weight: 700;
          color: var(--orange);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Customer Box */
        .customer-box {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .customer-card {
          background: var(--orange-bg);
          padding: 10px;
          border-radius: 6px;
          border: 1px solid #ffe4d6;
        }

        .customer-card .name {
          font-size: 11px;
          font-weight: 700;
          color: var(--orange);
          margin-bottom: 3px;
        }

        .customer-card p {
          color: var(--gray);
          font-size: 8px;
          margin: 1px 0;
        }

        /* Details Grid */
        .details-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .detail-box {
          background: var(--light-gray);
          padding: 6px 8px;
          border-radius: 4px;
        }

        .detail-box .label {
          font-size: 7px;
          color: var(--gray);
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .detail-box .value {
          font-size: 9px;
          font-weight: 500;
          color: var(--dark);
          margin-top: 1px;
        }

        /* Route Display */
        .route-display {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          background: linear-gradient(135deg, var(--orange-bg) 0%, #fff 100%);
          padding: 10px;
          border-radius: 6px;
          margin: 8px 0;
          border: 1px solid #ffe4d6;
        }

        .route-point {
          text-align: center;
          flex: 1;
        }

        .route-point .city {
          font-size: 11px;
          font-weight: 700;
          color: var(--dark);
        }

        .route-point .country {
          font-size: 8px;
          color: var(--gray);
        }

        .route-arrow {
          font-size: 18px;
          color: var(--orange);
        }

        /* Rate Table */
        .rate-table {
          width: 100%;
          border-collapse: collapse;
          margin: 8px 0;
          font-size: 8px;
        }

        .rate-table th {
          background: var(--orange);
          color: white;
          padding: 6px 8px;
          text-align: left;
          font-weight: 600;
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .rate-table td {
          padding: 6px 8px;
          border-bottom: 1px solid #e5e7eb;
        }

        .rate-table tr:hover { background: var(--light-gray); }

        .rate-table .center { text-align: center; }
        .rate-table .right { text-align: right; }

        .item-desc {
          font-size: 7px;
          color: var(--gray);
        }

        /* Total Box */
        .total-box {
          background: linear-gradient(135deg, var(--orange) 0%, var(--orange-light) 100%);
          color: white;
          padding: 10px 14px;
          border-radius: 6px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 10px;
        }

        .total-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .total-amount {
          font-size: 16px;
          font-weight: 700;
        }

        /* Terms */
        .terms-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .terms-card {
          padding: 8px;
          border-radius: 6px;
          font-size: 8px;
        }

        .terms-card.included {
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
        }

        .terms-card.excluded {
          background: #fef2f2;
          border: 1px solid #fecaca;
        }

        .terms-card h4 {
          font-size: 9px;
          font-weight: 700;
          margin-bottom: 5px;
        }

        .terms-card.included h4 { color: #059669; }
        .terms-card.excluded h4 { color: #dc2626; }

        .terms-card ul {
          list-style: none;
        }

        .terms-card li {
          margin: 2px 0;
          display: flex;
          align-items: flex-start;
          gap: 4px;
          font-size: 7px;
        }

        .check { color: #059669; font-weight: bold; }
        .cross { color: #dc2626; font-weight: bold; }

        /* Validity Banner */
        .validity-banner {
          background: var(--orange-bg);
          border: 1px dashed var(--orange);
          padding: 8px 10px;
          border-radius: 6px;
          margin: 10px 0;
          text-align: center;
          font-size: 8px;
        }

        .validity-banner strong {
          color: var(--orange);
        }

        /* Footer */
        .footer {
          margin-top: 15px;
          padding-top: 12px;
          border-top: 1px solid var(--light-gray);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .signature-block {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .qr-box {
          text-align: center;
        }

        .qr-box img {
          width: 60px;
          height: 60px;
          border: 1px solid var(--orange);
          border-radius: 4px;
          padding: 2px;
        }

        .qr-box .qr-label {
          font-size: 7px;
          color: var(--gray);
          margin-top: 3px;
        }

        .signer-info {
          padding-top: 3px;
        }

        .signer-name {
          font-size: 10px;
          font-weight: 700;
          color: var(--orange);
        }

        .signer-title {
          font-size: 8px;
          color: var(--gray);
          margin-top: 1px;
        }

        .signer-date {
          font-size: 7px;
          color: var(--gray);
          margin-top: 3px;
        }

        .verify-info {
          text-align: right;
          font-size: 7px;
          color: var(--gray);
        }

        .verify-info a {
          color: var(--orange);
          text-decoration: none;
          word-break: break-all;
        }

        .company-footer {
          text-align: center;
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--light-gray);
          font-size: 7px;
          color: var(--gray);
        }

        .company-footer strong {
          color: var(--dark);
        }

        @media print {
          .page { padding: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <!-- Header -->
        <div class="header-wrapper">
          <div class="header-left">
            <img src="https://ugc-business-command-portal.vercel.app/logo/logougctaglinefull.png" alt="UGC Logo"/>
            <div class="header-title">
              <h1>Quotation</h1>
            </div>
          </div>
          <div class="header-right">
            <div class="label">Document No.</div>
            <div class="number">${quotation.quotation_number}</div>
          </div>
        </div>

        <!-- Company Bar -->
        <div class="company-bar">
          <div>
            <strong>${UGC_INFO.name}</strong> | ${UGC_INFO.address}, ${UGC_INFO.city}
          </div>
          <div>
            Tel: ${UGC_INFO.phone} | Email: ${UGC_INFO.email}
          </div>
        </div>

        <!-- Info Grid -->
        <div class="info-grid">
          <div class="info-card">
            <div class="label">Issue Date</div>
            <div class="value">${formatDate(quotation.created_at)}</div>
          </div>
          <div class="info-card">
            <div class="label">Valid Until</div>
            <div class="value">${formatDate(quotation.valid_until)}</div>
          </div>
          <div class="info-card">
            <div class="label">Reference</div>
            <div class="value">${quotation.ticket?.ticket_code || '-'}</div>
          </div>
          <div class="info-card">
            <div class="label">Validity</div>
            <div class="value">${quotation.validity_days} Days</div>
          </div>
        </div>

        <!-- Customer Section -->
        <div class="section">
          <div class="section-header">
            <div class="section-icon">👤</div>
            <span class="section-title">Customer Information</span>
          </div>
          <div class="customer-box">
            <div class="customer-card">
              <div class="name">${quotation.customer_name}</div>
              ${quotation.customer_company ? `<p><strong>${quotation.customer_company}</strong></p>` : ''}
              ${quotation.customer_address ? `<p>${quotation.customer_address}</p>` : ''}
            </div>
            <div class="customer-card">
              ${quotation.customer_email ? `<p>📧 ${quotation.customer_email}</p>` : ''}
              ${quotation.customer_phone ? `<p>📱 ${quotation.customer_phone}</p>` : ''}
            </div>
          </div>
        </div>

        <!-- Service Details -->
        <div class="section">
          <div class="section-header">
            <div class="section-icon">📦</div>
            <span class="section-title">Service Details</span>
          </div>

          ${(quotation.origin_city || quotation.destination_city) ? `
            <div class="route-display">
              <div class="route-point">
                <div class="city">${quotation.origin_city || 'Origin'}</div>
                <div class="country">${quotation.origin_country || ''}</div>
                ${quotation.origin_port ? `<div class="country">Port: ${quotation.origin_port}</div>` : ''}
              </div>
              <div class="route-arrow">→</div>
              <div class="route-point">
                <div class="city">${quotation.destination_city || 'Destination'}</div>
                <div class="country">${quotation.destination_country || ''}</div>
                ${quotation.destination_port ? `<div class="country">Port: ${quotation.destination_port}</div>` : ''}
              </div>
            </div>
          ` : ''}

          <div class="details-grid">
            ${quotation.service_type ? `
              <div class="detail-box">
                <div class="label">Service Type</div>
                <div class="value">${quotation.service_type}</div>
              </div>
            ` : ''}
            ${quotation.incoterm ? `
              <div class="detail-box">
                <div class="label">Incoterm</div>
                <div class="value">${quotation.incoterm}</div>
              </div>
            ` : ''}
            ${quotation.fleet_type ? `
              <div class="detail-box">
                <div class="label">Fleet</div>
                <div class="value">${quotation.fleet_type}${quotation.fleet_quantity ? ` × ${quotation.fleet_quantity}` : ''}</div>
              </div>
            ` : ''}
            ${quotation.commodity ? `
              <div class="detail-box">
                <div class="label">Commodity</div>
                <div class="value">${quotation.commodity}</div>
              </div>
            ` : ''}
            ${quotation.estimated_leadtime ? `
              <div class="detail-box">
                <div class="label">Est. Leadtime</div>
                <div class="value">${quotation.estimated_leadtime}</div>
              </div>
            ` : ''}
            ${quotation.cargo_weight ? `
              <div class="detail-box">
                <div class="label">Weight</div>
                <div class="value">${quotation.cargo_weight} ${quotation.cargo_weight_unit || 'kg'}</div>
              </div>
            ` : ''}
            ${quotation.cargo_volume ? `
              <div class="detail-box">
                <div class="label">Volume</div>
                <div class="value">${quotation.cargo_volume} ${quotation.cargo_volume_unit || 'cbm'}</div>
              </div>
            ` : ''}
            ${quotation.estimated_cargo_value ? `
              <div class="detail-box">
                <div class="label">Cargo Value</div>
                <div class="value">${formatCurrency(quotation.estimated_cargo_value, quotation.cargo_value_currency || 'IDR')}</div>
              </div>
            ` : ''}
          </div>

          ${quotation.cargo_description ? `
            <div style="background: var(--orange-bg); border: 1px solid #ffe4d6; border-radius: 8px; padding: 12px; margin-top: 12px;">
              <div style="font-size: 8px; color: var(--gray); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Cargo Description</div>
              <div style="font-size: 11px; color: var(--dark);">${quotation.cargo_description}</div>
            </div>
          ` : ''}
        </div>

        <!-- Rate Section -->
        <div class="section">
          <div class="section-header">
            <div class="section-icon">💰</div>
            <span class="section-title">Rate Quotation</span>
          </div>
          ${itemsTableHTML}
          <div class="total-box">
            <div class="total-label">Total Amount</div>
            <div class="total-amount">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</div>
          </div>
        </div>

        ${quotation.scope_of_work ? `
          <div class="section">
            <div class="section-header">
              <div class="section-icon">📋</div>
              <span class="section-title">Scope of Work</span>
            </div>
            <div class="detail-box" style="background: var(--orange-bg); border-left: 3px solid var(--orange);">
              <div class="value">${quotation.scope_of_work}</div>
            </div>
          </div>
        ` : ''}

        <!-- Terms Section -->
        ${(includesList || excludesList) ? `
          <div class="section">
            <div class="section-header">
              <div class="section-icon">📝</div>
              <span class="section-title">Terms & Conditions</span>
            </div>
            <div class="terms-grid">
              ${includesList ? `
                <div class="terms-card included">
                  <h4>✓ Included</h4>
                  <ul>${includesList}</ul>
                </div>
              ` : ''}
              ${excludesList ? `
                <div class="terms-card excluded">
                  <h4>✗ Excluded</h4>
                  <ul>${excludesList}</ul>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        ${quotation.terms_notes ? `
          <div class="detail-box" style="background: #fef3c7; border-left: 3px solid #f59e0b; margin-bottom: 15px;">
            <div class="label" style="color: #92400e;">Notes</div>
            <div class="value">${quotation.terms_notes}</div>
          </div>
        ` : ''}

        <!-- Validity -->
        <div class="validity-banner">
          ⏰ This quotation is valid for <strong>${quotation.validity_days} days</strong> from the date of issue (until <strong>${formatDate(quotation.valid_until)}</strong>)
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="signature-block">
            <div class="qr-box">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(validationUrl)}&color=ff4600" alt="Verify"/>
              <div class="qr-label">Scan to Verify</div>
            </div>
            <div class="signer-info">
              <div class="signer-name">${profile.name}</div>
              <div class="signer-title">Sales & Commercial Executive</div>
              <div class="signer-date">Issued: ${formatDate(quotation.created_at)}</div>
            </div>
          </div>
          <div class="verify-info">
            <strong>Verify this document:</strong><br/>
            <a href="${validationUrl}">${validationUrl}</a>
          </div>
        </div>

        <!-- Company Footer -->
        <div class="company-footer">
          <strong>${UGC_INFO.name}</strong> | ${UGC_INFO.address}, ${UGC_INFO.city}<br/>
          Tel: ${UGC_INFO.phone} | WhatsApp: ${UGC_INFO.whatsapp} | Email: ${UGC_INFO.email} | Web: ${UGC_INFO.web}
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

    // Build validation URL (use production URL)
    const baseUrl = 'https://ugc-business-command-portal.vercel.app'
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

    const baseUrl = 'https://ugc-business-command-portal.vercel.app'
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
