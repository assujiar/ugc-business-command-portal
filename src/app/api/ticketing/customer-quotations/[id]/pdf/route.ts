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

const formatCurrency = (amount: number, currency: string = 'IDR'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

const formatDate = (date: string | Date): string => {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const UGC_INFO = {
  name: 'PT. Utama Global Indo Cargo',
  shortName: 'UGC Logistics',
  address: 'Graha Fadillah, Jl Prof. Soepomo SH No. 45 BZ Blok C, Tebet, Jakarta Selatan 12810',
  phone: '+6221 8350778',
  email: 'service@ugc.co.id',
  web: 'www.utamaglobalindocargo.com',
}

const generateQuotationHTML = (quotation: any, profile: ProfileData, validationUrl: string): string => {
  const items = quotation.items || []
  const isBreakdown = quotation.rate_structure === 'breakdown'

  let rateHTML = ''
  if (isBreakdown && items.length > 0) {
    rateHTML = `
      <table class="tbl">
        <thead><tr><th style="width:28px">#</th><th>Description</th><th style="width:70px">Qty</th><th style="width:90px;text-align:right">Amount</th></tr></thead>
        <tbody>
          ${items.map((item: any, i: number) => `
            <tr>
              <td class="c">${i + 1}</td>
              <td><b>${item.component_name || item.component_type}</b>${item.description ? `<br><span class="m">${item.description}</span>` : ''}</td>
              <td class="c">${item.quantity ? `${item.quantity} ${item.unit || ''}` : '-'}</td>
              <td class="r">${formatCurrency(item.selling_rate, quotation.currency)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  } else {
    rateHTML = `
      <table class="tbl">
        <thead><tr><th>Service</th><th style="width:90px;text-align:right">Amount</th></tr></thead>
        <tbody>
          <tr>
            <td><b>${quotation.service_type || 'Logistics Service'}</b> <span class="m">(${quotation.origin_city} → ${quotation.destination_city}, All-in)</span></td>
            <td class="r">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</td>
          </tr>
        </tbody>
      </table>
    `
  }

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
    @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    @page{size:A4;margin:0}
    html,body{width:210mm;min-height:297mm}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:8px;line-height:1.3;color:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact}

    .page{position:relative;width:210mm;min-height:297mm;display:flex;flex-direction:column}

    /* Header - full width orange block */
    .hdr{background:#ff4600;color:#fff;padding:12px 0.8cm 10px 0.8cm;display:flex;justify-content:space-between;align-items:flex-start}
    .logo{display:flex;align-items:center;gap:10px}
    .logo img{height:40px}
    .logo h1{font-size:14px;font-weight:700;margin-bottom:2px}
    .logo p{font-size:7px;opacity:0.9;line-height:1.4}
    .doc{text-align:right}
    .doc .t{font-size:20px;font-weight:700;letter-spacing:2px}
    .doc .n{font-size:11px;font-weight:600;margin-top:3px;opacity:0.95}
    .doc .d{font-size:7px;margin-top:5px;opacity:0.9}

    /* Content area */
    .content{flex:1;padding:12px 0.8cm 10px 0.8cm}

    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
    .box{background:#f8f9fa;border:1px solid #e5e5e5;border-radius:4px;padding:6px 8px}
    .box h3{font-size:8px;font-weight:700;color:#ff4600;text-transform:uppercase;margin-bottom:4px;padding-bottom:3px;border-bottom:1px solid #e5e5e5}
    .row{display:flex;margin-bottom:2px}
    .row .l{width:60px;font-size:7px;color:#666}
    .row .v{flex:1;font-size:7px;font-weight:500}

    .route{background:#fff5f0;border:1px solid #ffcdb8;border-radius:4px;padding:8px;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:20px}
    .route .pt{text-align:center}
    .route .city{font-size:11px;font-weight:700}
    .route .ctry{font-size:7px;color:#666}
    .route .arr{font-size:18px;color:#ff4600;font-weight:bold}

    .sec{font-size:8px;font-weight:700;text-transform:uppercase;margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid #ff4600}

    .tbl{width:100%;border-collapse:collapse;margin-bottom:8px}
    .tbl th{background:#1a1a1a;color:#fff;font-size:7px;font-weight:600;text-transform:uppercase;padding:5px 6px;text-align:left}
    .tbl td{padding:5px 6px;border-bottom:1px solid #e5e5e5;font-size:7px;vertical-align:top}
    .tbl tr:nth-child(even) td{background:#fafafa}
    .tbl .c{text-align:center}
    .tbl .r{text-align:right;font-weight:600}
    .m{color:#666;font-size:6px}

    .total{background:#ff4600;color:#fff;padding:6px 10px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
    .total .lbl{font-size:8px;font-weight:600;text-transform:uppercase}
    .total .amt{font-size:14px;font-weight:700}

    .cargo{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px}
    .cargo .item{background:#f8f9fa;border:1px solid #e5e5e5;border-radius:3px;padding:4px 6px}
    .cargo .item .l{font-size:6px;color:#666;text-transform:uppercase}
    .cargo .item .v{font-size:8px;font-weight:600;margin-top:1px}

    .terms{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
    .terms .t{border:1px solid #e5e5e5;border-radius:4px;overflow:hidden}
    .terms .t h4{font-size:7px;font-weight:600;padding:4px 6px;text-transform:uppercase}
    .terms .t.inc h4{background:#d4edda;color:#155724}
    .terms .t.exc h4{background:#f8d7da;color:#721c24}
    .terms .t ul{list-style:none;padding:4px 6px}
    .terms .t li{font-size:7px;padding:1px 0}

    .note{background:#fff5f0;border-left:2px solid #ff4600;padding:5px 8px;margin-bottom:10px;border-radius:0 4px 4px 0}
    .note h4{font-size:7px;font-weight:600;color:#ff4600;text-transform:uppercase;margin-bottom:2px}
    .note p{font-size:7px;color:#333;line-height:1.4}

    .valid{background:#e7f3ff;border:1px dashed #0066cc;border-radius:4px;padding:5px;text-align:center;margin-bottom:10px}
    .valid p{font-size:7px;color:#0066cc}
    .valid strong{color:#004499}

    /* Signature section - above footer */
    .sig-section{display:flex;justify-content:space-between;align-items:flex-end;padding:10px 0;margin-top:auto;border-top:1px solid #e5e5e5}
    .sig-left{display:flex;gap:12px;align-items:flex-end}
    .qr{text-align:center}
    .qr img{width:50px;height:50px;border:1px solid #e5e5e5;padding:2px;border-radius:3px}
    .qr p{font-size:6px;color:#666;margin-top:2px}
    .sig-block{min-width:160px}
    .sig-block .hand{font-family:'Dancing Script',cursive;font-size:22px;color:#1a1a1a;margin-bottom:2px}
    .sig-block .name{font-size:9px;font-weight:600;border-top:1px solid #1a1a1a;padding-top:3px}
    .sig-block .title{font-size:7px;color:#666;margin-top:1px}
    .ugc-info{text-align:right;font-size:7px;color:#666;line-height:1.6}
    .ugc-info strong{color:#1a1a1a;font-size:8px}

    /* Footer - full width orange block */
    .ftr{background:#ff4600;color:#fff;padding:4px 0.8cm;font-family:'Courier New',monospace;font-size:7px;display:flex;justify-content:space-between;align-items:center}
    .ftr span{opacity:0.95}

    .keep{break-inside:avoid;page-break-inside:avoid}
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="hdr">
      <div class="logo">
        <img src="https://ugc-business-command-portal.vercel.app/logo/logougctaglinewhite.png" alt="UGC">
        <div>
          <h1>${UGC_INFO.shortName}</h1>
          <p>${UGC_INFO.address}<br>${UGC_INFO.phone} | ${UGC_INFO.email} | ${UGC_INFO.web}</p>
        </div>
      </div>
      <div class="doc">
        <div class="t">QUOTATION</div>
        <div class="n">${quotation.quotation_number}</div>
        <div class="d">Date: ${formatDate(quotation.created_at)} | Valid: ${formatDate(quotation.valid_until)}</div>
      </div>
    </div>

    <!-- Content -->
    <div class="content">
      <div class="grid keep">
        <div class="box">
          <h3>Customer</h3>
          <div class="row"><span class="l">Name</span><span class="v">${quotation.customer_name || '-'}</span></div>
          <div class="row"><span class="l">Company</span><span class="v">${quotation.customer_company || '-'}</span></div>
          <div class="row"><span class="l">Email</span><span class="v">${quotation.customer_email || '-'}</span></div>
          <div class="row"><span class="l">Phone</span><span class="v">${quotation.customer_phone || '-'}</span></div>
        </div>
        <div class="box">
          <h3>Details</h3>
          <div class="row"><span class="l">Reference</span><span class="v">${quotation.ticket?.ticket_code || '-'}</span></div>
          <div class="row"><span class="l">Service</span><span class="v">${quotation.service_type || '-'}</span></div>
          <div class="row"><span class="l">Incoterm</span><span class="v">${quotation.incoterm || '-'}</span></div>
          <div class="row"><span class="l">Prepared</span><span class="v">${profile.name}</span></div>
        </div>
      </div>

      <div class="route keep">
        <div class="pt">
          <div class="city">${quotation.origin_city || 'Origin'}</div>
          <div class="ctry">${quotation.origin_country || ''}${quotation.origin_port ? ' • ' + quotation.origin_port : ''}</div>
        </div>
        <div class="arr">→</div>
        <div class="pt">
          <div class="city">${quotation.destination_city || 'Destination'}</div>
          <div class="ctry">${quotation.destination_country || ''}${quotation.destination_port ? ' • ' + quotation.destination_port : ''}</div>
        </div>
      </div>

      ${(quotation.cargo_weight || quotation.cargo_volume || quotation.commodity || quotation.estimated_leadtime) ? `
      <div class="keep">
        <div class="sec">Cargo</div>
        <div class="cargo">
          ${quotation.commodity ? `<div class="item"><div class="l">Commodity</div><div class="v">${quotation.commodity}</div></div>` : ''}
          ${quotation.cargo_weight ? `<div class="item"><div class="l">Weight</div><div class="v">${quotation.cargo_weight} ${quotation.cargo_weight_unit || 'kg'}</div></div>` : ''}
          ${quotation.cargo_volume ? `<div class="item"><div class="l">Volume</div><div class="v">${quotation.cargo_volume} ${quotation.cargo_volume_unit || 'cbm'}</div></div>` : ''}
          ${quotation.cargo_quantity ? `<div class="item"><div class="l">Qty</div><div class="v">${quotation.cargo_quantity} ${quotation.cargo_quantity_unit || ''}</div></div>` : ''}
          ${quotation.estimated_leadtime ? `<div class="item"><div class="l">Lead Time</div><div class="v">${quotation.estimated_leadtime}</div></div>` : ''}
          ${quotation.fleet_type ? `<div class="item"><div class="l">Fleet</div><div class="v">${quotation.fleet_type}${quotation.fleet_quantity ? ' × ' + quotation.fleet_quantity : ''}</div></div>` : ''}
        </div>
      </div>
      ` : ''}

      ${quotation.cargo_description ? `<div class="note keep"><h4>Cargo Description</h4><p>${quotation.cargo_description}</p></div>` : ''}

      <div class="keep">
        <div class="sec">Rate (${quotation.currency || 'IDR'})</div>
        ${rateHTML}
        <div class="total">
          <span class="lbl">Total</span>
          <span class="amt">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</span>
        </div>
      </div>

      ${quotation.scope_of_work ? `<div class="note keep"><h4>Scope of Work</h4><p>${quotation.scope_of_work}</p></div>` : ''}

      ${(includesList || excludesList) ? `
      <div class="keep">
        <div class="sec">Terms</div>
        <div class="terms">
          ${includesList ? `<div class="t inc"><h4>Included</h4><ul>${includesList}</ul></div>` : ''}
          ${excludesList ? `<div class="t exc"><h4>Excluded</h4><ul>${excludesList}</ul></div>` : ''}
        </div>
      </div>
      ` : ''}

      ${quotation.terms_notes ? `<div class="note keep"><h4>Notes</h4><p>${quotation.terms_notes}</p></div>` : ''}

      <div class="valid keep">
        <p>Valid for <strong>${quotation.validity_days} days</strong> until <strong>${formatDate(quotation.valid_until)}</strong></p>
      </div>

      <!-- Signature Section -->
      <div class="sig-section keep">
        <div class="sig-left">
          <div class="qr">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(validationUrl)}&color=ff4600" alt="QR">
            <p>Scan to verify</p>
          </div>
          <div class="sig-block">
            <div class="hand">${profile.name}</div>
            <div class="name">${profile.name}</div>
            <div class="title">Sales & Commercial Department</div>
          </div>
        </div>
        <div class="ugc-info">
          <strong>${UGC_INFO.name}</strong><br>
          ${UGC_INFO.address}<br>
          ${UGC_INFO.phone} | ${UGC_INFO.email}<br>
          ${UGC_INFO.web}
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="ftr">
      <span>${quotation.quotation_number}</span>
      <span>${formatDate(quotation.created_at)}</span>
      <span>${validationUrl}</span>
      <span>Ref: ${quotation.ticket?.ticket_code || '-'}</span>
    </div>
  </div>
</body>
</html>`
}

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

    const { data: quotation, error } = await (supabase as any)
      .from('customer_quotations')
      .select(`
        *,
        ticket:tickets!customer_quotations_ticket_id_fkey(id, ticket_code, subject),
        items:customer_quotation_items(*),
        creator:profiles!customer_quotations_created_by_fkey(user_id, role, name, email)
      `)
      .eq('id', id)
      .single()

    if (error || !quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    // Use creator's profile for PDF, fallback to current user
    const creatorProfile: ProfileData = quotation.creator || profileData

    const baseUrl = 'https://ugc-business-command-portal.vercel.app'
    const validationUrl = `${baseUrl}/quotation-verify/${quotation.validation_code}`
    const html = generateQuotationHTML(quotation, creatorProfile, validationUrl)

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

    const { data: quotation, error } = await (supabase as any)
      .from('customer_quotations')
      .select(`
        *,
        ticket:tickets!customer_quotations_ticket_id_fkey(id, ticket_code, subject),
        items:customer_quotation_items(*),
        creator:profiles!customer_quotations_created_by_fkey(user_id, role, name, email)
      `)
      .eq('id', id)
      .single()

    if (error || !quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    // Use creator's profile for PDF, fallback to current user
    const creatorProfile: ProfileData = quotation.creator || profileData

    const baseUrl = 'https://ugc-business-command-portal.vercel.app'
    const validationUrl = `${baseUrl}/quotation-verify/${quotation.validation_code}`
    const html = generateQuotationHTML(quotation, creatorProfile, validationUrl)

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
