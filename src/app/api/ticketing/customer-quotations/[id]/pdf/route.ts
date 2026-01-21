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

// Generate HTML for PDF - Modern & Attractive Design
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
            <th style="width: 5%">#</th>
            <th style="width: 55%">Description</th>
            <th style="width: 15%">Unit</th>
            <th style="width: 25%">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item: any, index: number) => `
            <tr>
              <td class="center">${index + 1}</td>
              <td>${item.component_name || item.component_type}${item.description ? `<div class="item-desc">${item.description}</div>` : ''}</td>
              <td class="center">${item.quantity ? `${item.quantity} ${item.unit || ''}` : '-'}</td>
              <td class="right">${formatCurrency(item.selling_rate, quotation.currency)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  } else {
    itemsTableHTML = `
      <div class="bundling-rate">
        <div class="bundling-label">Logistics Service Package</div>
        <div class="bundling-route">${quotation.service_type || 'Door to Door'} • ${quotation.origin_city || 'Origin'} → ${quotation.destination_city || 'Destination'}</div>
      </div>
    `
  }

  // Build includes list
  const includesList = Array.isArray(quotation.terms_includes) && quotation.terms_includes.length > 0
    ? quotation.terms_includes.map((t: string) => `<li><span class="icon-check">✓</span>${t}</li>`).join('')
    : ''

  // Build excludes list
  const excludesList = Array.isArray(quotation.terms_excludes) && quotation.terms_excludes.length > 0
    ? quotation.terms_excludes.map((t: string) => `<li><span class="icon-cross">✗</span>${t}</li>`).join('')
    : ''

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Quotation ${quotation.quotation_number}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        @page { size: A4; margin: 0; }

        body {
          font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
          font-size: 9px;
          line-height: 1.5;
          color: #1e293b;
          background: white;
        }

        .page {
          width: 210mm;
          min-height: 297mm;
          padding: 12mm 15mm;
          position: relative;
        }

        /* Decorative corner accent */
        .page::before {
          content: '';
          position: absolute;
          top: 0;
          right: 0;
          width: 80mm;
          height: 80mm;
          background: linear-gradient(135deg, transparent 50%, rgba(255, 70, 0, 0.03) 50%);
          pointer-events: none;
        }

        /* ===== HEADER ===== */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 6mm;
          padding-bottom: 4mm;
          border-bottom: 0.5mm solid #ff4600;
        }

        .logo-section { display: flex; align-items: center; gap: 4mm; }
        .logo-section img { height: 14mm; width: auto; }

        .company-info { font-size: 7px; color: #64748b; line-height: 1.6; }
        .company-info .name { font-size: 9px; font-weight: 700; color: #1e293b; margin-bottom: 1mm; }

        .doc-info { text-align: right; }
        .doc-title {
          font-size: 20px;
          font-weight: 800;
          color: #ff4600;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .doc-number {
          font-size: 11px;
          font-weight: 600;
          color: #1e293b;
          margin-top: 1mm;
          padding: 1.5mm 3mm;
          background: #fff7ed;
          border-radius: 2mm;
          display: inline-block;
        }

        /* ===== META INFO BAR ===== */
        .meta-bar {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 3mm;
          margin-bottom: 5mm;
        }

        .meta-item {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          padding: 3mm;
          border-radius: 2mm;
          border-left: 1mm solid #ff4600;
        }

        .meta-item .label {
          font-size: 6px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .meta-item .value {
          font-size: 9px;
          font-weight: 600;
          color: #1e293b;
          margin-top: 0.5mm;
        }

        /* ===== SECTIONS ===== */
        .section { margin-bottom: 4mm; }

        .section-title {
          font-size: 9px;
          font-weight: 700;
          color: #ff4600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding-bottom: 2mm;
          margin-bottom: 3mm;
          border-bottom: 0.3mm solid #fed7aa;
          display: flex;
          align-items: center;
          gap: 2mm;
        }

        .section-title::before {
          content: '';
          width: 3mm;
          height: 3mm;
          background: #ff4600;
          border-radius: 0.5mm;
        }

        /* ===== TWO COLUMN LAYOUT ===== */
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }

        /* ===== CUSTOMER CARD ===== */
        .customer-card {
          background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
          padding: 4mm;
          border-radius: 3mm;
          border: 0.3mm solid #fed7aa;
        }

        .customer-name {
          font-size: 11px;
          font-weight: 700;
          color: #ea580c;
          margin-bottom: 1mm;
        }

        .customer-company { font-size: 9px; font-weight: 600; color: #1e293b; margin-bottom: 2mm; }
        .customer-detail { font-size: 8px; color: #64748b; line-height: 1.6; }

        /* ===== ROUTE DISPLAY ===== */
        .route-box {
          background: linear-gradient(90deg, #fff7ed 0%, white 50%, #fff7ed 100%);
          padding: 4mm;
          border-radius: 3mm;
          border: 0.3mm solid #fed7aa;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 3mm;
        }

        .route-point { text-align: center; flex: 1; }
        .route-city { font-size: 12px; font-weight: 700; color: #1e293b; }
        .route-country { font-size: 8px; color: #64748b; margin-top: 0.5mm; }

        .route-arrow {
          font-size: 16px;
          color: #ff4600;
          padding: 0 3mm;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .route-arrow::before { content: '✈'; font-size: 12px; }

        /* ===== DETAILS GRID ===== */
        .details-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 2mm;
        }

        .detail-item {
          background: #f8fafc;
          padding: 2.5mm 3mm;
          border-radius: 2mm;
        }

        .detail-item .label {
          font-size: 6px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .detail-item .value {
          font-size: 8px;
          font-weight: 600;
          color: #1e293b;
          margin-top: 0.5mm;
        }

        /* ===== CARGO DESCRIPTION BOX ===== */
        .cargo-desc {
          background: #fffbeb;
          border: 0.3mm solid #fde68a;
          border-radius: 2mm;
          padding: 3mm;
          margin-top: 2mm;
        }

        .cargo-desc .label {
          font-size: 7px;
          font-weight: 600;
          color: #92400e;
          text-transform: uppercase;
        }

        .cargo-desc .value { font-size: 9px; color: #78350f; margin-top: 1mm; }

        /* ===== RATE TABLE ===== */
        .rate-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 8px;
          margin-bottom: 2mm;
        }

        .rate-table th {
          background: linear-gradient(135deg, #ff4600 0%, #ea580c 100%);
          color: white;
          padding: 2.5mm 3mm;
          text-align: left;
          font-weight: 600;
          font-size: 7px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .rate-table th:first-child { border-radius: 2mm 0 0 0; }
        .rate-table th:last-child { border-radius: 0 2mm 0 0; }

        .rate-table td {
          padding: 2.5mm 3mm;
          border-bottom: 0.2mm solid #f1f5f9;
        }

        .rate-table tr:nth-child(even) { background: #fafafa; }
        .rate-table .center { text-align: center; }
        .rate-table .right { text-align: right; font-weight: 600; }
        .item-desc { font-size: 7px; color: #94a3b8; margin-top: 0.5mm; }

        /* Bundling Rate Style */
        .bundling-rate {
          background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
          padding: 4mm;
          border-radius: 3mm;
          border: 0.3mm solid #fed7aa;
          margin-bottom: 2mm;
        }

        .bundling-label { font-size: 9px; font-weight: 600; color: #ea580c; }
        .bundling-route { font-size: 8px; color: #78350f; margin-top: 1mm; }

        /* ===== TOTAL BOX ===== */
        .total-box {
          background: linear-gradient(135deg, #ff4600 0%, #ea580c 100%);
          color: white;
          padding: 4mm 5mm;
          border-radius: 3mm;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .total-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .total-amount { font-size: 18px; font-weight: 800; }

        /* ===== TERMS GRID ===== */
        .terms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }

        .terms-card {
          padding: 3mm;
          border-radius: 2mm;
          font-size: 7px;
        }

        .terms-card.included { background: #ecfdf5; border: 0.3mm solid #a7f3d0; }
        .terms-card.excluded { background: #fef2f2; border: 0.3mm solid #fecaca; }

        .terms-card h4 {
          font-size: 8px;
          font-weight: 700;
          margin-bottom: 2mm;
        }

        .terms-card.included h4 { color: #059669; }
        .terms-card.excluded h4 { color: #dc2626; }

        .terms-card ul { list-style: none; }
        .terms-card li { margin: 1mm 0; display: flex; align-items: flex-start; gap: 1.5mm; line-height: 1.4; }
        .icon-check { color: #059669; font-weight: bold; font-size: 8px; }
        .icon-cross { color: #dc2626; font-weight: bold; font-size: 8px; }

        /* ===== SCOPE BOX ===== */
        .scope-box {
          background: #f0fdf4;
          border-left: 1mm solid #22c55e;
          padding: 3mm;
          border-radius: 0 2mm 2mm 0;
          font-size: 8px;
          color: #166534;
          line-height: 1.6;
        }

        /* ===== NOTES BOX ===== */
        .notes-box {
          background: #fffbeb;
          border-left: 1mm solid #f59e0b;
          padding: 3mm;
          border-radius: 0 2mm 2mm 0;
          margin-bottom: 3mm;
        }

        .notes-box .label { font-size: 7px; font-weight: 600; color: #92400e; text-transform: uppercase; }
        .notes-box .value { font-size: 8px; color: #78350f; margin-top: 1mm; }

        /* ===== VALIDITY BANNER ===== */
        .validity-banner {
          background: linear-gradient(90deg, #fff7ed 0%, white 50%, #fff7ed 100%);
          border: 0.5mm dashed #ff4600;
          padding: 3mm;
          border-radius: 2mm;
          text-align: center;
          font-size: 8px;
          color: #78350f;
          margin: 3mm 0;
        }

        .validity-banner strong { color: #ea580c; }

        /* ===== FOOTER ===== */
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-top: 3mm;
          border-top: 0.3mm solid #e2e8f0;
          margin-top: 3mm;
        }

        .signature-section { display: flex; gap: 4mm; align-items: flex-start; }

        .qr-container { text-align: center; }
        .qr-container img {
          width: 18mm;
          height: 18mm;
          border: 0.5mm solid #ff4600;
          border-radius: 2mm;
          padding: 1mm;
        }
        .qr-label { font-size: 6px; color: #94a3b8; margin-top: 1mm; }

        .signer-info { padding-top: 1mm; }
        .signer-name { font-size: 10px; font-weight: 700; color: #ea580c; }
        .signer-title { font-size: 7px; color: #64748b; margin-top: 0.5mm; }
        .signer-date { font-size: 7px; color: #94a3b8; margin-top: 1mm; }

        .verify-section { text-align: right; font-size: 7px; color: #64748b; }
        .verify-section a { color: #ff4600; text-decoration: none; word-break: break-all; }

        /* ===== COMPANY FOOTER ===== */
        .company-footer {
          text-align: center;
          padding-top: 3mm;
          border-top: 0.3mm solid #f1f5f9;
          margin-top: 3mm;
          font-size: 7px;
          color: #94a3b8;
        }

        .company-footer strong { color: #1e293b; }

        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page { padding: 10mm 12mm; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <!-- Header -->
        <div class="header">
          <div class="logo-section">
            <img src="https://ugc-business-command-portal.vercel.app/logo/logougctaglinefull.png" alt="UGC Logistics"/>
            <div class="company-info">
              <div class="name">${UGC_INFO.name}</div>
              ${UGC_INFO.address}<br/>
              ${UGC_INFO.city}
            </div>
          </div>
          <div class="doc-info">
            <div class="doc-title">Quotation</div>
            <div class="doc-number">${quotation.quotation_number}</div>
          </div>
        </div>

        <!-- Meta Info -->
        <div class="meta-bar">
          <div class="meta-item">
            <div class="label">Issue Date</div>
            <div class="value">${formatDate(quotation.created_at)}</div>
          </div>
          <div class="meta-item">
            <div class="label">Valid Until</div>
            <div class="value">${formatDate(quotation.valid_until)}</div>
          </div>
          <div class="meta-item">
            <div class="label">Reference</div>
            <div class="value">${quotation.ticket?.ticket_code || '-'}</div>
          </div>
          <div class="meta-item">
            <div class="label">Validity</div>
            <div class="value">${quotation.validity_days} Days</div>
          </div>
        </div>

        <!-- Customer & Route Section -->
        <div class="two-col">
          <div class="section">
            <div class="section-title">Customer</div>
            <div class="customer-card">
              <div class="customer-name">${quotation.customer_name}</div>
              ${quotation.customer_company ? `<div class="customer-company">${quotation.customer_company}</div>` : ''}
              <div class="customer-detail">
                ${quotation.customer_email ? `✉ ${quotation.customer_email}<br/>` : ''}
                ${quotation.customer_phone ? `☏ ${quotation.customer_phone}` : ''}
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Route</div>
            <div class="route-box">
              <div class="route-point">
                <div class="route-city">${quotation.origin_city || 'Origin'}</div>
                <div class="route-country">${quotation.origin_country || '-'}</div>
              </div>
              <div class="route-arrow">→</div>
              <div class="route-point">
                <div class="route-city">${quotation.destination_city || 'Destination'}</div>
                <div class="route-country">${quotation.destination_country || '-'}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Service Details -->
        <div class="section">
          <div class="section-title">Service Details</div>
          <div class="details-grid">
            ${quotation.service_type ? `<div class="detail-item"><div class="label">Service</div><div class="value">${quotation.service_type}</div></div>` : ''}
            ${quotation.fleet_type ? `<div class="detail-item"><div class="label">Fleet</div><div class="value">${quotation.fleet_type}${quotation.fleet_quantity ? ` × ${quotation.fleet_quantity}` : ''}</div></div>` : ''}
            ${quotation.incoterm ? `<div class="detail-item"><div class="label">Incoterm</div><div class="value">${quotation.incoterm}</div></div>` : ''}
            ${quotation.commodity ? `<div class="detail-item"><div class="label">Commodity</div><div class="value">${quotation.commodity}</div></div>` : ''}
            ${quotation.estimated_leadtime ? `<div class="detail-item"><div class="label">Leadtime</div><div class="value">${quotation.estimated_leadtime}</div></div>` : ''}
            ${quotation.cargo_weight ? `<div class="detail-item"><div class="label">Weight</div><div class="value">${quotation.cargo_weight} ${quotation.cargo_weight_unit || 'kg'}</div></div>` : ''}
            ${quotation.cargo_volume ? `<div class="detail-item"><div class="label">Volume</div><div class="value">${quotation.cargo_volume} ${quotation.cargo_volume_unit || 'cbm'}</div></div>` : ''}
            ${quotation.estimated_cargo_value ? `<div class="detail-item"><div class="label">Cargo Value</div><div class="value">${formatCurrency(quotation.estimated_cargo_value, quotation.cargo_value_currency || 'IDR')}</div></div>` : ''}
          </div>
          ${quotation.cargo_description ? `
            <div class="cargo-desc">
              <div class="label">Cargo Description</div>
              <div class="value">${quotation.cargo_description}</div>
            </div>
          ` : ''}
        </div>

        <!-- Rate Quotation -->
        <div class="section">
          <div class="section-title">Rate Quotation</div>
          ${itemsTableHTML}
          <div class="total-box">
            <div class="total-label">Total Amount</div>
            <div class="total-amount">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</div>
          </div>
        </div>

        ${quotation.scope_of_work ? `
          <div class="section">
            <div class="section-title">Scope of Work</div>
            <div class="scope-box">${quotation.scope_of_work}</div>
          </div>
        ` : ''}

        ${(includesList || excludesList) ? `
          <div class="section">
            <div class="section-title">Terms & Conditions</div>
            <div class="terms-grid">
              ${includesList ? `<div class="terms-card included"><h4>✓ Included</h4><ul>${includesList}</ul></div>` : ''}
              ${excludesList ? `<div class="terms-card excluded"><h4>✗ Excluded</h4><ul>${excludesList}</ul></div>` : ''}
            </div>
          </div>
        ` : ''}

        ${quotation.terms_notes ? `
          <div class="notes-box">
            <div class="label">Notes</div>
            <div class="value">${quotation.terms_notes}</div>
          </div>
        ` : ''}

        <div class="validity-banner">
          ⏰ This quotation is valid for <strong>${quotation.validity_days} days</strong> from issue date (until <strong>${formatDate(quotation.valid_until)}</strong>)
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="signature-section">
            <div class="qr-container">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(validationUrl)}&color=ff4600" alt="QR"/>
              <div class="qr-label">Scan to Verify</div>
            </div>
            <div class="signer-info">
              <div class="signer-name">${profile.name}</div>
              <div class="signer-title">Sales & Commercial Executive</div>
              <div class="signer-date">Issued: ${formatDate(quotation.created_at)}</div>
            </div>
          </div>
          <div class="verify-section">
            <strong>Verify Document</strong><br/>
            <a href="${validationUrl}">${validationUrl}</a>
          </div>
        </div>

        <div class="company-footer">
          <strong>${UGC_INFO.name}</strong><br/>
          ${UGC_INFO.address}, ${UGC_INFO.city}<br/>
          ☏ ${UGC_INFO.phone} • ✉ ${UGC_INFO.email} • 🌐 ${UGC_INFO.web}
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
