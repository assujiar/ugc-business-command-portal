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
  tagline: 'Your Trusted Logistics Partner',
  address: 'Graha Fadillah, Jl Prof. Soepomo SH No. 45 BZ Blok C',
  city: 'Tebet, Jakarta Selatan, Indonesia 12810',
  phone: '+6221 8350778',
  fax: '+6221 8300219',
  whatsapp: '+62812 8459 6614',
  email: 'service@ugc.co.id',
  web: 'www.utamaglobalindocargo.com',
}

// Generate clean, professional PDF HTML
const generateQuotationHTML = (quotation: any, profile: ProfileData, validationUrl: string): string => {
  const items = quotation.items || []
  const isBreakdown = quotation.rate_structure === 'breakdown'

  // Anti-tamper watermark text (subtle)
  const watermarkText = `${quotation.quotation_number} • ${quotation.validation_code}`

  // Build rate items
  let rateHTML = ''
  if (isBreakdown && items.length > 0) {
    rateHTML = `
      <table class="rate-table">
        <thead>
          <tr>
            <th style="width:40px">No</th>
            <th>Description</th>
            <th style="width:100px">Qty/Unit</th>
            <th style="width:120px;text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item: any, i: number) => `
            <tr>
              <td style="text-align:center">${i + 1}</td>
              <td>
                <strong>${item.component_name || item.component_type}</strong>
                ${item.description ? `<br><span class="text-muted">${item.description}</span>` : ''}
              </td>
              <td style="text-align:center">${item.quantity ? `${item.quantity} ${item.unit || ''}` : '-'}</td>
              <td style="text-align:right">${formatCurrency(item.selling_rate, quotation.currency)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  } else {
    rateHTML = `
      <table class="rate-table">
        <thead>
          <tr>
            <th>Service Package</th>
            <th style="width:120px;text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>${quotation.service_type || 'Logistics Service'}</strong><br>
              <span class="text-muted">${quotation.origin_city || 'Origin'} → ${quotation.destination_city || 'Destination'} (All-in Rate)</span>
            </td>
            <td style="text-align:right">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</td>
          </tr>
        </tbody>
      </table>
    `
  }

  // Includes/Excludes
  const includesList = Array.isArray(quotation.terms_includes) && quotation.terms_includes.length > 0
    ? quotation.terms_includes.map((t: string) => `<li>✓ ${t}</li>`).join('')
    : ''
  const excludesList = Array.isArray(quotation.terms_excludes) && quotation.terms_excludes.length > 0
    ? quotation.terms_excludes.map((t: string) => `<li>✗ ${t}</li>`).join('')
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Quotation ${quotation.quotation_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    @page {
      size: A4;
      margin: 15mm 15mm 20mm 15mm;
    }

    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 10px;
      line-height: 1.5;
      color: #1a1a1a;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Subtle watermark */
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 48px;
      font-weight: bold;
      color: rgba(255, 70, 0, 0.04);
      white-space: nowrap;
      pointer-events: none;
      z-index: -1;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 15px;
      border-bottom: 3px solid #ff4600;
      margin-bottom: 20px;
    }

    .logo-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-section img {
      height: 50px;
      width: auto;
    }

    .company-info h1 {
      font-size: 16px;
      font-weight: 700;
      color: #ff4600;
      margin-bottom: 2px;
    }

    .company-info p {
      font-size: 8px;
      color: #666;
      line-height: 1.4;
    }

    .doc-info {
      text-align: right;
    }

    .doc-info .doc-title {
      font-size: 24px;
      font-weight: 700;
      color: #1a1a1a;
      letter-spacing: 2px;
    }

    .doc-info .doc-number {
      font-size: 12px;
      font-weight: 600;
      color: #ff4600;
      margin-top: 4px;
    }

    .doc-info .doc-date {
      font-size: 9px;
      color: #666;
      margin-top: 8px;
    }

    /* Info Grid */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }

    .info-box {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 6px;
      padding: 12px;
    }

    .info-box h3 {
      font-size: 10px;
      font-weight: 700;
      color: #ff4600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e9ecef;
    }

    .info-row {
      display: flex;
      margin-bottom: 4px;
    }

    .info-label {
      width: 80px;
      font-size: 9px;
      color: #666;
    }

    .info-value {
      flex: 1;
      font-size: 9px;
      font-weight: 500;
      color: #1a1a1a;
    }

    /* Route Box */
    .route-box {
      background: linear-gradient(135deg, #fff5f0 0%, #fff 100%);
      border: 1px solid #ffcdb8;
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 30px;
    }

    .route-point {
      text-align: center;
    }

    .route-point .city {
      font-size: 14px;
      font-weight: 700;
      color: #1a1a1a;
    }

    .route-point .country {
      font-size: 9px;
      color: #666;
    }

    .route-arrow {
      font-size: 24px;
      color: #ff4600;
      font-weight: bold;
    }

    /* Section Title */
    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: #1a1a1a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 2px solid #ff4600;
    }

    /* Rate Table */
    .rate-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }

    .rate-table th {
      background: #1a1a1a;
      color: #fff;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 10px;
      text-align: left;
    }

    .rate-table td {
      padding: 10px;
      border-bottom: 1px solid #e9ecef;
      font-size: 9px;
      vertical-align: top;
    }

    .rate-table tr:nth-child(even) td {
      background: #f8f9fa;
    }

    .text-muted {
      color: #666;
      font-size: 8px;
    }

    /* Total Box */
    .total-box {
      background: #ff4600;
      color: #fff;
      padding: 12px 15px;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .total-box .label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .total-box .amount {
      font-size: 18px;
      font-weight: 700;
    }

    /* Cargo Details */
    .cargo-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }

    .cargo-item {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 4px;
      padding: 8px 10px;
    }

    .cargo-item .label {
      font-size: 8px;
      color: #666;
      text-transform: uppercase;
    }

    .cargo-item .value {
      font-size: 10px;
      font-weight: 600;
      color: #1a1a1a;
      margin-top: 2px;
    }

    /* Terms */
    .terms-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 20px;
    }

    .terms-box {
      border: 1px solid #e9ecef;
      border-radius: 6px;
      overflow: hidden;
    }

    .terms-box.included h4 {
      background: #d4edda;
      color: #155724;
    }

    .terms-box.excluded h4 {
      background: #f8d7da;
      color: #721c24;
    }

    .terms-box h4 {
      font-size: 9px;
      font-weight: 600;
      padding: 8px 10px;
      text-transform: uppercase;
    }

    .terms-box ul {
      list-style: none;
      padding: 10px;
    }

    .terms-box li {
      font-size: 9px;
      padding: 3px 0;
      color: #333;
    }

    /* Notes */
    .notes-box {
      background: #fff5f0;
      border-left: 3px solid #ff4600;
      padding: 10px 12px;
      margin-bottom: 20px;
      border-radius: 0 6px 6px 0;
    }

    .notes-box h4 {
      font-size: 9px;
      font-weight: 600;
      color: #ff4600;
      text-transform: uppercase;
      margin-bottom: 5px;
    }

    .notes-box p {
      font-size: 9px;
      color: #333;
      line-height: 1.5;
    }

    /* Validity */
    .validity-box {
      background: #e7f3ff;
      border: 1px dashed #0066cc;
      border-radius: 6px;
      padding: 10px;
      text-align: center;
      margin-bottom: 20px;
    }

    .validity-box p {
      font-size: 9px;
      color: #0066cc;
    }

    .validity-box strong {
      color: #004499;
    }

    /* Signature Section */
    .signature-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-top: 20px;
      border-top: 1px solid #e9ecef;
      margin-top: 20px;
    }

    .signature-left {
      display: flex;
      gap: 15px;
      align-items: flex-end;
    }

    .qr-code {
      text-align: center;
    }

    .qr-code img {
      width: 60px;
      height: 60px;
      border: 1px solid #e9ecef;
      padding: 4px;
      border-radius: 4px;
    }

    .qr-code p {
      font-size: 7px;
      color: #666;
      margin-top: 4px;
    }

    .signature-block {
      min-width: 180px;
    }

    .signature-block .sig-line {
      border-bottom: 1px solid #1a1a1a;
      height: 30px;
      margin-bottom: 5px;
    }

    .signature-block .sig-name {
      font-size: 10px;
      font-weight: 600;
      color: #1a1a1a;
    }

    .signature-block .sig-title {
      font-size: 8px;
      color: #666;
    }

    .contact-info {
      text-align: right;
      font-size: 8px;
      color: #666;
      line-height: 1.6;
    }

    .contact-info strong {
      color: #1a1a1a;
    }

    /* Footer */
    .footer {
      margin-top: 15px;
      padding-top: 10px;
      border-top: 1px solid #e9ecef;
      text-align: center;
    }

    .footer p {
      font-size: 8px;
      color: #666;
    }

    .footer .verify {
      font-size: 7px;
      color: #999;
      margin-top: 5px;
      font-family: monospace;
    }

    /* Print */
    @media print {
      body { -webkit-print-color-adjust: exact; }
    }

    /* Page break control */
    .keep { break-inside: avoid; page-break-inside: avoid; }
  </style>
</head>
<body>
  <!-- Subtle Watermark -->
  <div class="watermark">${watermarkText}</div>

  <!-- Header -->
  <div class="header keep">
    <div class="logo-section">
      <img src="https://ugc-business-command-portal.vercel.app/logo/logougctagline.png" alt="UGC Logo">
      <div class="company-info">
        <h1>${UGC_INFO.shortName}</h1>
        <p>${UGC_INFO.address}<br>${UGC_INFO.city}<br>${UGC_INFO.phone} | ${UGC_INFO.email}</p>
      </div>
    </div>
    <div class="doc-info">
      <div class="doc-title">QUOTATION</div>
      <div class="doc-number">${quotation.quotation_number}</div>
      <div class="doc-date">
        Issue Date: ${formatDate(quotation.created_at)}<br>
        Valid Until: ${formatDate(quotation.valid_until)}
      </div>
    </div>
  </div>

  <!-- Customer & Reference Info -->
  <div class="info-grid keep">
    <div class="info-box">
      <h3>Customer Information</h3>
      <div class="info-row">
        <span class="info-label">Name</span>
        <span class="info-value">${quotation.customer_name || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Company</span>
        <span class="info-value">${quotation.customer_company || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Email</span>
        <span class="info-value">${quotation.customer_email || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Phone</span>
        <span class="info-value">${quotation.customer_phone || '-'}</span>
      </div>
      ${quotation.customer_address ? `
      <div class="info-row">
        <span class="info-label">Address</span>
        <span class="info-value">${quotation.customer_address}</span>
      </div>
      ` : ''}
    </div>
    <div class="info-box">
      <h3>Quotation Details</h3>
      <div class="info-row">
        <span class="info-label">Reference</span>
        <span class="info-value">${quotation.ticket?.ticket_code || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Service</span>
        <span class="info-value">${quotation.service_type || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Incoterm</span>
        <span class="info-value">${quotation.incoterm || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Currency</span>
        <span class="info-value">${quotation.currency || 'IDR'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Prepared By</span>
        <span class="info-value">${profile.name}</span>
      </div>
    </div>
  </div>

  <!-- Route -->
  <div class="route-box keep">
    <div class="route-point">
      <div class="city">${quotation.origin_city || 'Origin'}</div>
      <div class="country">${quotation.origin_country || ''}${quotation.origin_port ? ` • ${quotation.origin_port}` : ''}</div>
    </div>
    <div class="route-arrow">→</div>
    <div class="route-point">
      <div class="city">${quotation.destination_city || 'Destination'}</div>
      <div class="country">${quotation.destination_country || ''}${quotation.destination_port ? ` • ${quotation.destination_port}` : ''}</div>
    </div>
  </div>

  <!-- Cargo Details -->
  ${(quotation.cargo_weight || quotation.cargo_volume || quotation.commodity || quotation.estimated_leadtime || quotation.fleet_type) ? `
  <div class="keep">
    <div class="section-title">Cargo Details</div>
    <div class="cargo-grid">
      ${quotation.commodity ? `<div class="cargo-item"><div class="label">Commodity</div><div class="value">${quotation.commodity}</div></div>` : ''}
      ${quotation.cargo_weight ? `<div class="cargo-item"><div class="label">Weight</div><div class="value">${quotation.cargo_weight} ${quotation.cargo_weight_unit || 'kg'}</div></div>` : ''}
      ${quotation.cargo_volume ? `<div class="cargo-item"><div class="label">Volume</div><div class="value">${quotation.cargo_volume} ${quotation.cargo_volume_unit || 'cbm'}</div></div>` : ''}
      ${quotation.cargo_quantity ? `<div class="cargo-item"><div class="label">Quantity</div><div class="value">${quotation.cargo_quantity} ${quotation.cargo_quantity_unit || 'units'}</div></div>` : ''}
      ${quotation.estimated_cargo_value ? `<div class="cargo-item"><div class="label">Cargo Value</div><div class="value">${formatCurrency(quotation.estimated_cargo_value, quotation.cargo_value_currency || 'IDR')}</div></div>` : ''}
      ${quotation.estimated_leadtime ? `<div class="cargo-item"><div class="label">Lead Time</div><div class="value">${quotation.estimated_leadtime}</div></div>` : ''}
      ${quotation.fleet_type ? `<div class="cargo-item"><div class="label">Fleet</div><div class="value">${quotation.fleet_type}${quotation.fleet_quantity ? ` × ${quotation.fleet_quantity}` : ''}</div></div>` : ''}
    </div>
  </div>
  ` : ''}

  ${quotation.cargo_description ? `
  <div class="notes-box keep">
    <h4>Cargo Description</h4>
    <p>${quotation.cargo_description}</p>
  </div>
  ` : ''}

  <!-- Rate Quotation -->
  <div class="keep">
    <div class="section-title">Rate Quotation</div>
    ${rateHTML}
    <div class="total-box">
      <span class="label">Total Amount</span>
      <span class="amount">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</span>
    </div>
  </div>

  <!-- Scope of Work -->
  ${quotation.scope_of_work ? `
  <div class="notes-box keep">
    <h4>Scope of Work</h4>
    <p>${quotation.scope_of_work}</p>
  </div>
  ` : ''}

  <!-- Terms & Conditions -->
  ${(includesList || excludesList) ? `
  <div class="keep">
    <div class="section-title">Terms & Conditions</div>
    <div class="terms-grid">
      ${includesList ? `
      <div class="terms-box included">
        <h4>Included</h4>
        <ul>${includesList}</ul>
      </div>
      ` : ''}
      ${excludesList ? `
      <div class="terms-box excluded">
        <h4>Not Included</h4>
        <ul>${excludesList}</ul>
      </div>
      ` : ''}
    </div>
  </div>
  ` : ''}

  <!-- Additional Notes -->
  ${quotation.terms_notes ? `
  <div class="notes-box keep">
    <h4>Additional Notes</h4>
    <p>${quotation.terms_notes}</p>
  </div>
  ` : ''}

  <!-- Validity -->
  <div class="validity-box keep">
    <p>This quotation is valid for <strong>${quotation.validity_days} days</strong> from the issue date (until <strong>${formatDate(quotation.valid_until)}</strong>). Prices may change after the validity period.</p>
  </div>

  <!-- Signature Section -->
  <div class="signature-section keep">
    <div class="signature-left">
      <div class="qr-code">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(validationUrl)}&color=ff4600" alt="QR">
        <p>Scan to verify</p>
      </div>
      <div class="signature-block">
        <div class="sig-line"></div>
        <div class="sig-name">${profile.name}</div>
        <div class="sig-title">Sales Executive • ${UGC_INFO.shortName}</div>
      </div>
    </div>
    <div class="contact-info">
      <strong>${UGC_INFO.name}</strong><br>
      ${UGC_INFO.address}<br>
      ${UGC_INFO.city}<br>
      Phone: ${UGC_INFO.phone} | Fax: ${UGC_INFO.fax}<br>
      Email: ${UGC_INFO.email} | Web: ${UGC_INFO.web}
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>Thank you for your business. For inquiries, please contact us at <strong>${UGC_INFO.email}</strong> or <strong>${UGC_INFO.phone}</strong></p>
    <div class="verify">Document ID: ${quotation.quotation_number} • Validation: ${quotation.validation_code} • ${validationUrl}</div>
  </div>
</body>
</html>`
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
      .select('user_id, role, name, email')
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
    const baseUrl = 'https://ugc-business-command-portal.vercel.app'
    const validationUrl = `${baseUrl}/quotation-verify/${quotation.validation_code}`

    // Generate HTML
    const html = generateQuotationHTML(quotation, profileData, validationUrl)

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
      .select('user_id, role, name, email')
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
