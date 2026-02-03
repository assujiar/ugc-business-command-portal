// =====================================================
// Public Quotation PDF API - No Auth Required
// GET: Download PDF by validation code (for customer access)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ code: string }>
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

const formatDateTime = (date: string | Date): string => {
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

// Helper to group items by shipment label prefix
const groupItemsByShipment = (items: any[], shipments: any[]): Map<number, any[]> => {
  const itemsByShipment = new Map<number, any[]>()

  // Initialize with empty arrays for each shipment
  shipments.forEach((_, idx) => {
    itemsByShipment.set(idx, [])
  })

  items.forEach((item: any) => {
    const componentName = item.component_name || ''
    // Check if item has shipment prefix like "Shipment 1: " or "Shipment 2: "
    const shipmentMatch = componentName.match(/^Shipment\s*(\d+)\s*:\s*/i)
    if (shipmentMatch) {
      const shipmentIndex = parseInt(shipmentMatch[1]) - 1
      if (itemsByShipment.has(shipmentIndex)) {
        // Remove the prefix from component_name for display
        const cleanedItem = {
          ...item,
          component_name: componentName.replace(/^Shipment\s*\d+\s*:\s*/i, '')
        }
        itemsByShipment.get(shipmentIndex)!.push(cleanedItem)
      }
    } else {
      // Item without shipment prefix goes to first shipment (or general items)
      if (!itemsByShipment.has(-1)) {
        itemsByShipment.set(-1, [])
      }
      itemsByShipment.get(-1)!.push(item)
    }
  })

  return itemsByShipment
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'DRAFT', color: '#6b7280', bg: '#f3f4f6' },
  sent: { label: 'ACTIVE', color: '#059669', bg: '#d1fae5' },
  accepted: { label: 'ACCEPTED', color: '#2563eb', bg: '#dbeafe' },
  rejected: { label: 'REJECTED', color: '#dc2626', bg: '#fee2e2' },
  expired: { label: 'EXPIRED', color: '#d97706', bg: '#fef3c7' },
}

// GET /api/public/quotation/[code]/pdf - Public PDF download by validation code
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { code } = await params
    const adminClient = createAdminClient()
    const printDate = formatDateTime(new Date())

    // Fetch quotation by validation code (public access)
    const { data: quotation, error } = await (adminClient as any)
      .from('customer_quotations')
      .select(`
        *,
        items:customer_quotation_items(
          id,
          component_type,
          component_name,
          description,
          cost_amount,
          target_margin_percent,
          selling_rate,
          quantity,
          unit,
          sort_order
        ),
        creator:profiles!customer_quotations_created_by_fkey(user_id, name, email)
      `)
      .eq('validation_code', code)
      .single()

    if (error || !quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    // Build route display
    const routeParts: string[] = []
    if (quotation.origin_city) routeParts.push(quotation.origin_city)
    if (quotation.origin_country && quotation.origin_country !== 'Indonesia') routeParts.push(quotation.origin_country)
    const originStr = routeParts.join(', ')
    routeParts.length = 0
    if (quotation.destination_city) routeParts.push(quotation.destination_city)
    if (quotation.destination_country && quotation.destination_country !== 'Indonesia') routeParts.push(quotation.destination_country)
    const destStr = routeParts.join(', ')
    const routeDisplay = originStr && destStr ? `${originStr} → ${destStr}` : originStr || destStr || '-'

    // Parse multi-shipment data from JSONB field
    let shipments: any[] = []
    if (quotation.shipments) {
      try {
        shipments = typeof quotation.shipments === 'string'
          ? JSON.parse(quotation.shipments)
          : quotation.shipments
      } catch {
        shipments = []
      }
    }
    const hasMultipleShipments = Array.isArray(shipments) && shipments.length > 1
    const items = quotation.items || []
    const isBreakdown = quotation.rate_structure === 'breakdown'

    // Group items by shipment for multi-shipment breakdown
    const itemsByShipment = hasMultipleShipments && isBreakdown
      ? groupItemsByShipment(items, shipments)
      : null

    // Prepare terms
    const includeTerms = quotation.terms_includes || []
    const excludeTerms = quotation.terms_excludes || []
    const termsNotes = quotation.terms_notes || ''

    // Check expiration
    const validUntil = new Date(quotation.valid_until)
    const isExpired = validUntil < new Date()
    const displayStatus = isExpired ? 'expired' : quotation.status
    const statusConfig = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.draft

    // Generate HTML for PDF
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Quotation ${quotation.quotation_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #1f2937; line-height: 1.4; }
    .page { padding: 20px 30px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #ff4600; padding-bottom: 12px; margin-bottom: 15px; }
    .logo-section { display: flex; align-items: center; gap: 12px; }
    .logo { width: 80px; height: auto; }
    .company-info { font-size: 8pt; color: #6b7280; }
    .company-name { font-weight: 700; color: #ff4600; font-size: 12pt; margin-bottom: 2px; }
    .doc-info { text-align: right; }
    .doc-title { font-size: 16pt; font-weight: 700; color: #ff4600; }
    .doc-number { font-size: 11pt; color: #374151; margin-top: 2px; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 8pt; font-weight: 600; margin-top: 5px; background: ${statusConfig.bg}; color: ${statusConfig.color}; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
    .info-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; }
    .info-box-header { font-size: 8pt; font-weight: 600; color: #ff4600; text-transform: uppercase; margin-bottom: 6px; }
    .info-row { display: flex; justify-content: space-between; font-size: 9pt; padding: 2px 0; }
    .info-label { color: #6b7280; }
    .info-value { font-weight: 500; color: #1f2937; }
    .section { margin-bottom: 15px; }
    .section-title { font-size: 10pt; font-weight: 600; color: #ff4600; border-bottom: 1px solid #fee2e2; padding-bottom: 4px; margin-bottom: 8px; text-transform: uppercase; }
    .cargo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .cargo-item { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 4px; padding: 8px; text-align: center; }
    .cargo-label { font-size: 7pt; color: #9a3412; text-transform: uppercase; }
    .cargo-value { font-size: 10pt; font-weight: 600; color: #c2410c; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th { background: #ff4600; color: white; padding: 8px; text-align: left; font-weight: 600; }
    td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
    tr:hover { background: #fff7ed; }
    .text-right { text-align: right; }
    .total-row { background: #fff7ed; font-weight: 700; }
    .total-row td { border-top: 2px solid #ff4600; color: #c2410c; }
    .terms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .terms-box { border-radius: 6px; padding: 10px; font-size: 8pt; }
    .terms-include { background: #ecfdf5; border: 1px solid #a7f3d0; }
    .terms-exclude { background: #fef2f2; border: 1px solid #fecaca; }
    .terms-title { font-weight: 600; margin-bottom: 6px; }
    .terms-include .terms-title { color: #059669; }
    .terms-exclude .terms-title { color: #dc2626; }
    .terms-list { list-style: none; }
    .terms-list li { padding: 2px 0; padding-left: 12px; position: relative; }
    .terms-list li::before { content: "•"; position: absolute; left: 0; }
    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 8pt; color: #6b7280; display: flex; justify-content: space-between; }
    .signature-section { margin-top: 20px; display: flex; justify-content: space-between; }
    .signature-box { width: 200px; text-align: center; }
    .signature-line { border-top: 1px solid #1f2937; margin-top: 50px; padding-top: 5px; font-size: 9pt; }
    .qr-section { text-align: center; margin-top: 15px; padding: 10px; background: #f9fafb; border-radius: 6px; }
    .qr-text { font-size: 7pt; color: #6b7280; }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        <div>
          <div class="company-name">${UGC_INFO.name}</div>
          <div class="company-info">
            ${UGC_INFO.address}<br>
            Tel: ${UGC_INFO.phone} | Email: ${UGC_INFO.email}
          </div>
        </div>
      </div>
      <div class="doc-info">
        <div class="doc-title">QUOTATION</div>
        <div class="doc-number">${quotation.quotation_number}</div>
        <div class="status-badge">${statusConfig.label}</div>
      </div>
    </div>

    <!-- Customer & Dates -->
    <div class="info-grid">
      <div class="info-box">
        <div class="info-box-header">Customer Information</div>
        <div class="info-row"><span class="info-label">Name:</span><span class="info-value">${quotation.customer_name}</span></div>
        ${quotation.customer_company ? `<div class="info-row"><span class="info-label">Company:</span><span class="info-value">${quotation.customer_company}</span></div>` : ''}
        ${quotation.customer_email ? `<div class="info-row"><span class="info-label">Email:</span><span class="info-value">${quotation.customer_email}</span></div>` : ''}
        ${quotation.customer_phone ? `<div class="info-row"><span class="info-label">Phone:</span><span class="info-value">${quotation.customer_phone}</span></div>` : ''}
      </div>
      <div class="info-box">
        <div class="info-box-header">Document Details</div>
        <div class="info-row"><span class="info-label">Issue Date:</span><span class="info-value">${formatDate(quotation.created_at)}</span></div>
        <div class="info-row"><span class="info-label">Valid Until:</span><span class="info-value">${formatDate(quotation.valid_until)}${isExpired ? ' (Expired)' : ''}</span></div>
        <div class="info-row"><span class="info-label">Prepared By:</span><span class="info-value">${quotation.creator?.name || 'UGC Logistics'}</span></div>
      </div>
    </div>

    <!-- Service Details -->
    <div class="section">
      <div class="section-title">Service Details</div>
      <div class="info-grid">
        <div class="info-box">
          ${quotation.service_type ? `<div class="info-row"><span class="info-label">Service Type:</span><span class="info-value">${quotation.service_type}</span></div>` : ''}
          ${quotation.incoterm ? `<div class="info-row"><span class="info-label">Incoterm:</span><span class="info-value">${quotation.incoterm}</span></div>` : ''}
          ${quotation.fleet_type ? `<div class="info-row"><span class="info-label">Fleet Type:</span><span class="info-value">${quotation.fleet_type}${quotation.fleet_quantity > 1 ? ` × ${quotation.fleet_quantity}` : ''}</span></div>` : ''}
        </div>
        <div class="info-box">
          <div class="info-row"><span class="info-label">Route:</span><span class="info-value">${routeDisplay}</span></div>
          ${quotation.commodity ? `<div class="info-row"><span class="info-label">Commodity:</span><span class="info-value">${quotation.commodity}</span></div>` : ''}
        </div>
      </div>
    </div>

    ${(quotation.cargo_weight || quotation.cargo_volume || quotation.estimated_cargo_value) ? `
    <!-- Cargo Details -->
    <div class="section">
      <div class="section-title">Cargo Details</div>
      <div class="cargo-grid">
        ${quotation.cargo_weight ? `<div class="cargo-item"><div class="cargo-label">Weight</div><div class="cargo-value">${quotation.cargo_weight.toLocaleString()} ${quotation.cargo_weight_unit || 'kg'}</div></div>` : ''}
        ${quotation.cargo_volume ? `<div class="cargo-item"><div class="cargo-label">Volume</div><div class="cargo-value">${quotation.cargo_volume.toLocaleString()} ${quotation.cargo_volume_unit || 'cbm'}</div></div>` : ''}
        ${quotation.estimated_cargo_value ? `<div class="cargo-item"><div class="cargo-label">Cargo Value</div><div class="cargo-value">${formatCurrency(quotation.estimated_cargo_value, quotation.cargo_value_currency || 'IDR')}</div></div>` : ''}
      </div>
    </div>
    ` : ''}

    <!-- Rate Section -->
    <div class="section">
      <div class="section-title">${hasMultipleShipments ? `Shipments & Rates (${shipments.length} shipments)` : (isBreakdown ? 'Rate Breakdown' : 'Rate Summary')}</div>
      ${hasMultipleShipments ? `
      <!-- Multi-shipment: Display each shipment with its own rate section -->
      ${shipments.map((s: any, idx: number) => {
        const shipmentItems = itemsByShipment?.get(idx) || []
        const shipmentSellingRate = s.selling_rate || 0
        return `
        <div style="margin-bottom:${idx < shipments.length - 1 ? '12px' : '0'};padding:10px;background:#f9fafb;border-radius:6px;border-left:3px solid #ff4600">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div>
              <span style="font-size:10pt;font-weight:700;color:#ff4600">SHIPMENT ${idx + 1}</span>
              <span style="font-size:9pt;color:#666;margin-left:10px">${s.origin_city || 'Origin'} → ${s.destination_city || 'Destination'}</span>
            </div>
          </div>
          ${s.cargo_description ? `<div style="font-size:8pt;color:#666;margin-bottom:6px">${s.cargo_description}</div>` : ''}
          ${s.fleet_type ? `<div style="font-size:8pt;color:#666;margin-bottom:6px">Fleet: ${s.fleet_type}${s.fleet_quantity > 1 ? ' × ' + s.fleet_quantity : ''}</div>` : ''}
          ${isBreakdown && shipmentItems.length > 0 ? `
          <table style="margin-bottom:6px">
            <thead>
              <tr>
                <th>Description</th>
                <th class="text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              ${shipmentItems.map((item: any) => `
              <tr>
                <td>${item.component_name || item.component_type}${item.quantity && item.unit ? ` (${item.quantity} ${item.unit})` : ''}</td>
                <td class="text-right">${formatCurrency(item.selling_rate, s.cost_currency || quotation.currency)}</td>
              </tr>
              `).join('')}
            </tbody>
          </table>
          ` : ''}
          <div style="background:#ff4600;color:white;padding:6px 10px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;margin-top:4px">
            <span style="font-size:8pt;font-weight:600;text-transform:uppercase">Subtotal Shipment ${idx + 1}</span>
            <span style="font-size:12pt;font-weight:700">${formatCurrency(shipmentSellingRate, s.cost_currency || quotation.currency)}</span>
          </div>
        </div>
        `
      }).join('')}
      ` : isBreakdown && items.length > 0 ? `
      <!-- Single shipment breakdown -->
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="text-right">Rate</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item: any) => `
          <tr>
            <td>${item.component_name || item.component_type}${item.quantity && item.unit ? ` (${item.quantity} ${item.unit})` : ''}</td>
            <td class="text-right">${formatCurrency(item.selling_rate, quotation.currency)}</td>
          </tr>
          `).join('')}
          <tr class="total-row">
            <td>TOTAL</td>
            <td class="text-right">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</td>
          </tr>
        </tbody>
      </table>
      ` : `
      <!-- Single shipment bundling -->
      <table>
        <tbody>
          <tr class="total-row">
            <td>Total Rate</td>
            <td class="text-right">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</td>
          </tr>
        </tbody>
      </table>
      `}
    </div>

    ${(includeTerms.length > 0 || excludeTerms.length > 0) ? `
    <!-- Terms -->
    <div class="section">
      <div class="section-title">Terms & Conditions</div>
      <div class="terms-grid">
        ${includeTerms.length > 0 ? `
        <div class="terms-box terms-include">
          <div class="terms-title">✓ Included</div>
          <ul class="terms-list">${includeTerms.map((t: string) => `<li>${t}</li>`).join('')}</ul>
        </div>
        ` : ''}
        ${excludeTerms.length > 0 ? `
        <div class="terms-box terms-exclude">
          <div class="terms-title">✗ Excluded</div>
          <ul class="terms-list">${excludeTerms.map((t: string) => `<li>${t}</li>`).join('')}</ul>
        </div>
        ` : ''}
      </div>
      ${termsNotes ? `<div style="margin-top: 8px; font-size: 8pt; color: #6b7280;"><strong>Notes:</strong> ${termsNotes}</div>` : ''}
    </div>
    ` : ''}

    <!-- Signature -->
    <div class="signature-section">
      <div class="signature-box">
        <div class="signature-line">Customer Signature</div>
      </div>
      <div class="signature-box">
        <div class="signature-line">${quotation.creator?.name || 'UGC Logistics'}</div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div>Verify: ${process.env.NEXT_PUBLIC_APP_URL || ''}/quotation-verify/${quotation.validation_code}</div>
      <div>Printed: ${printDate}</div>
    </div>
  </div>
</body>
</html>
`

    // Return HTML (can be converted to PDF by client or use a PDF service)
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="Quotation-${quotation.quotation_number}.html"`,
      },
    })

  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
