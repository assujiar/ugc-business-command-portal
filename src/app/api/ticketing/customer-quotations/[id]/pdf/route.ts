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

// Generate HTML for PDF - Letterhead Style Design
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
            <th style="width: 50%">Description</th>
            <th style="width: 20%">Unit</th>
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

  // Build cargo details grid
  const cargoDetails = []
  if (quotation.commodity) cargoDetails.push({ label: 'Commodity', value: quotation.commodity })
  if (quotation.cargo_weight) cargoDetails.push({ label: 'Weight', value: `${quotation.cargo_weight} ${quotation.cargo_weight_unit || 'kg'}` })
  if (quotation.cargo_volume) cargoDetails.push({ label: 'Volume', value: `${quotation.cargo_volume} ${quotation.cargo_volume_unit || 'cbm'}` })
  if (quotation.estimated_cargo_value) cargoDetails.push({ label: 'Cargo Value', value: formatCurrency(quotation.estimated_cargo_value, quotation.cargo_value_currency || 'IDR') })
  if (quotation.estimated_leadtime) cargoDetails.push({ label: 'Est. Leadtime', value: quotation.estimated_leadtime })
  if (quotation.fleet_type) cargoDetails.push({ label: 'Fleet', value: `${quotation.fleet_type}${quotation.fleet_quantity ? ` × ${quotation.fleet_quantity}` : ''}` })

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Quotation ${quotation.quotation_number}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        @page {
          size: A4;
          margin: 0;
        }

        body {
          font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
          font-size: 10px;
          line-height: 1.6;
          color: #1e293b;
          background: white;
        }

        .page {
          width: 210mm;
          min-height: 297mm;
          padding: 0;
          position: relative;
          background: white;
        }

        /* ===== DECORATIVE BORDERS ===== */
        .left-border {
          position: fixed;
          left: 0;
          top: 0;
          bottom: 0;
          width: 8mm;
          background: linear-gradient(180deg,
            #ff4600 0%, #ff4600 25%,
            #1e293b 25%, #1e293b 50%,
            #94a3b8 50%, #94a3b8 75%,
            #ff4600 75%, #ff4600 100%
          );
          z-index: 100;
        }

        .left-border::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background:
            linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.1) 50%),
            linear-gradient(-135deg, transparent 50%, rgba(0,0,0,0.1) 50%);
          background-size: 4mm 4mm;
        }

        .right-border {
          position: fixed;
          right: 0;
          top: 0;
          bottom: 0;
          width: 8mm;
          background: linear-gradient(180deg,
            #94a3b8 0%, #94a3b8 25%,
            #1e293b 25%, #1e293b 50%,
            #ff4600 50%, #ff4600 75%,
            #1e293b 75%, #1e293b 100%
          );
          z-index: 100;
        }

        .right-border::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background:
            linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.1) 50%),
            linear-gradient(-135deg, transparent 50%, rgba(0,0,0,0.1) 50%);
          background-size: 4mm 4mm;
        }

        /* Corner decorations */
        .corner-top-right {
          position: absolute;
          top: 0;
          right: 8mm;
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 0 30mm 30mm 0;
          border-color: transparent #f1f5f9 transparent transparent;
        }

        .corner-bottom-left {
          position: absolute;
          bottom: 0;
          left: 8mm;
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 30mm 0 0 30mm;
          border-color: transparent transparent transparent #f1f5f9;
        }

        /* ===== CONTENT AREA ===== */
        .content {
          margin-left: 12mm;
          margin-right: 12mm;
          padding: 10mm 8mm;
        }

        /* ===== HEADER BANNER ===== */
        .header-banner {
          background: linear-gradient(135deg, #ff4600 0%, #ea580c 100%);
          padding: 5mm 6mm;
          border-radius: 3mm;
          display: flex;
          align-items: center;
          gap: 4mm;
          margin-bottom: 6mm;
          box-shadow: 0 2mm 4mm rgba(255, 70, 0, 0.2);
        }

        .header-banner img {
          height: 14mm;
          width: auto;
        }

        .header-banner .brand-text {
          color: white;
        }

        .header-banner .brand-name {
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.5px;
        }

        .header-banner .brand-tagline {
          font-size: 8px;
          opacity: 0.9;
          margin-top: 1mm;
        }

        /* ===== LETTERHEAD INFO ===== */
        .letterhead-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6mm;
          padding-bottom: 4mm;
          border-bottom: 0.5mm solid #e2e8f0;
        }

        .sender-info { max-width: 55%; }
        .sender-name {
          font-size: 14px;
          font-weight: 800;
          color: #1e293b;
          margin-bottom: 1mm;
        }
        .sender-title {
          font-size: 9px;
          color: #64748b;
          margin-bottom: 3mm;
        }
        .sender-company {
          font-size: 11px;
          font-weight: 700;
          color: #ff4600;
          margin-bottom: 2mm;
        }
        .sender-detail {
          font-size: 8px;
          color: #64748b;
          line-height: 1.8;
        }
        .sender-detail span {
          color: #ff4600;
          font-weight: 600;
        }

        .doc-date {
          text-align: right;
        }
        .doc-date .label {
          font-size: 8px;
          color: #94a3b8;
          margin-bottom: 1mm;
        }
        .doc-date .value {
          font-size: 11px;
          font-weight: 600;
          color: #1e293b;
        }

        /* ===== DOCUMENT TITLE ===== */
        .doc-header {
          background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
          border: 0.5mm solid #fed7aa;
          border-radius: 3mm;
          padding: 4mm 5mm;
          margin-bottom: 5mm;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .doc-title-section {}
        .doc-title {
          font-size: 18px;
          font-weight: 800;
          color: #ff4600;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .doc-number {
          font-size: 12px;
          font-weight: 600;
          color: #1e293b;
          margin-top: 1mm;
        }

        .doc-meta {
          text-align: right;
          font-size: 8px;
          color: #64748b;
        }
        .doc-meta .value {
          font-weight: 600;
          color: #1e293b;
        }

        /* ===== GREETING ===== */
        .greeting {
          font-size: 11px;
          margin-bottom: 4mm;
        }
        .greeting-to {
          font-weight: 700;
          color: #1e293b;
        }
        .greeting-company {
          color: #64748b;
        }

        /* ===== INTRO TEXT ===== */
        .intro-text {
          font-size: 10px;
          color: #475569;
          line-height: 1.8;
          margin-bottom: 5mm;
          text-align: justify;
        }

        /* ===== SECTIONS ===== */
        .section {
          margin-bottom: 5mm;
          page-break-inside: avoid;
        }

        .section-title {
          font-size: 10px;
          font-weight: 700;
          color: #ff4600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding-bottom: 2mm;
          margin-bottom: 3mm;
          border-bottom: 0.5mm solid #fed7aa;
          display: flex;
          align-items: center;
          gap: 2mm;
        }

        .section-title::before {
          content: '';
          width: 3mm;
          height: 3mm;
          background: #ff4600;
          border-radius: 1mm;
        }

        /* ===== TWO COLUMN LAYOUT ===== */
        .two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4mm;
        }

        /* ===== CUSTOMER CARD ===== */
        .customer-card {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          padding: 4mm;
          border-radius: 3mm;
          border-left: 1mm solid #ff4600;
        }

        .customer-name {
          font-size: 12px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 1mm;
        }

        .customer-company {
          font-size: 10px;
          font-weight: 600;
          color: #ff4600;
          margin-bottom: 2mm;
        }

        .customer-detail {
          font-size: 9px;
          color: #64748b;
          line-height: 1.6;
        }

        /* ===== ROUTE DISPLAY ===== */
        .route-card {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          padding: 4mm;
          border-radius: 3mm;
          border-left: 1mm solid #ff4600;
        }

        .route-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .route-point { text-align: center; flex: 1; }
        .route-city { font-size: 12px; font-weight: 700; color: #1e293b; }
        .route-country { font-size: 8px; color: #64748b; margin-top: 0.5mm; }
        .route-port { font-size: 7px; color: #94a3b8; margin-top: 0.5mm; }

        .route-arrow {
          font-size: 20px;
          color: #ff4600;
          padding: 0 3mm;
        }

        /* ===== DETAILS GRID ===== */
        .details-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 3mm;
        }

        .detail-item {
          background: #f8fafc;
          padding: 3mm;
          border-radius: 2mm;
          border-left: 0.8mm solid #ff4600;
        }

        .detail-item .label {
          font-size: 7px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .detail-item .value {
          font-size: 10px;
          font-weight: 600;
          color: #1e293b;
          margin-top: 1mm;
        }

        /* ===== CARGO DESCRIPTION BOX ===== */
        .cargo-desc {
          background: #fffbeb;
          border: 0.3mm solid #fde68a;
          border-radius: 2mm;
          padding: 3mm 4mm;
          margin-top: 3mm;
        }

        .cargo-desc .label {
          font-size: 8px;
          font-weight: 600;
          color: #92400e;
          text-transform: uppercase;
        }

        .cargo-desc .value {
          font-size: 10px;
          color: #78350f;
          margin-top: 1mm;
          line-height: 1.6;
        }

        /* ===== RATE TABLE ===== */
        .rate-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 9px;
          margin-bottom: 3mm;
        }

        .rate-table th {
          background: linear-gradient(135deg, #ff4600 0%, #ea580c 100%);
          color: white;
          padding: 3mm;
          text-align: left;
          font-weight: 600;
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .rate-table th:first-child { border-radius: 2mm 0 0 0; }
        .rate-table th:last-child { border-radius: 0 2mm 0 0; }

        .rate-table td {
          padding: 3mm;
          border-bottom: 0.3mm solid #f1f5f9;
        }

        .rate-table tr:nth-child(even) { background: #fafafa; }
        .rate-table tr:last-child td:first-child { border-radius: 0 0 0 2mm; }
        .rate-table tr:last-child td:last-child { border-radius: 0 0 2mm 0; }
        .rate-table .center { text-align: center; }
        .rate-table .right { text-align: right; font-weight: 600; }
        .item-desc { font-size: 8px; color: #94a3b8; margin-top: 0.5mm; }

        /* Bundling Rate Style */
        .bundling-rate {
          background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
          padding: 4mm;
          border-radius: 3mm;
          border: 0.3mm solid #fed7aa;
          margin-bottom: 3mm;
        }

        .bundling-label { font-size: 10px; font-weight: 600; color: #ea580c; }
        .bundling-route { font-size: 9px; color: #78350f; margin-top: 1mm; }

        /* ===== TOTAL BOX ===== */
        .total-box {
          background: linear-gradient(135deg, #ff4600 0%, #ea580c 100%);
          color: white;
          padding: 4mm 5mm;
          border-radius: 3mm;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2mm 4mm rgba(255, 70, 0, 0.3);
        }

        .total-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .total-amount {
          font-size: 20px;
          font-weight: 800;
        }

        /* ===== TERMS GRID ===== */
        .terms-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4mm;
        }

        .terms-card {
          padding: 3mm 4mm;
          border-radius: 3mm;
          font-size: 8px;
        }

        .terms-card.included {
          background: #ecfdf5;
          border: 0.3mm solid #a7f3d0;
        }
        .terms-card.excluded {
          background: #fef2f2;
          border: 0.3mm solid #fecaca;
        }

        .terms-card h4 {
          font-size: 9px;
          font-weight: 700;
          margin-bottom: 2mm;
        }

        .terms-card.included h4 { color: #059669; }
        .terms-card.excluded h4 { color: #dc2626; }

        .terms-card ul { list-style: none; }
        .terms-card li {
          margin: 1.5mm 0;
          display: flex;
          align-items: flex-start;
          gap: 2mm;
          line-height: 1.5;
        }
        .icon-check { color: #059669; font-weight: bold; font-size: 9px; }
        .icon-cross { color: #dc2626; font-weight: bold; font-size: 9px; }

        /* ===== SCOPE BOX ===== */
        .scope-box {
          background: #f0fdf4;
          border-left: 1mm solid #22c55e;
          padding: 3mm 4mm;
          border-radius: 0 3mm 3mm 0;
          font-size: 9px;
          color: #166534;
          line-height: 1.7;
        }

        /* ===== NOTES BOX ===== */
        .notes-box {
          background: #fffbeb;
          border-left: 1mm solid #f59e0b;
          padding: 3mm 4mm;
          border-radius: 0 3mm 3mm 0;
          margin-bottom: 4mm;
        }

        .notes-box .label {
          font-size: 8px;
          font-weight: 600;
          color: #92400e;
          text-transform: uppercase;
        }
        .notes-box .value {
          font-size: 9px;
          color: #78350f;
          margin-top: 1mm;
          line-height: 1.6;
        }

        /* ===== VALIDITY BANNER ===== */
        .validity-banner {
          background: linear-gradient(90deg, #fff7ed 0%, white 50%, #fff7ed 100%);
          border: 0.5mm dashed #ff4600;
          padding: 3mm 4mm;
          border-radius: 3mm;
          text-align: center;
          font-size: 9px;
          color: #78350f;
          margin: 4mm 0;
        }

        .validity-banner strong { color: #ea580c; }

        /* ===== SIGNATURE FOOTER ===== */
        .signature-footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          padding-top: 5mm;
          margin-top: 5mm;
          border-top: 0.5mm solid #e2e8f0;
          page-break-inside: avoid;
        }

        .signature-left {
          display: flex;
          gap: 4mm;
          align-items: flex-start;
        }

        .qr-container { text-align: center; }
        .qr-container img {
          width: 20mm;
          height: 20mm;
          border: 0.5mm solid #ff4600;
          border-radius: 2mm;
          padding: 1mm;
        }
        .qr-label {
          font-size: 7px;
          color: #94a3b8;
          margin-top: 1mm;
        }

        .signature-block {
          padding-top: 2mm;
        }
        .signature-line {
          font-family: 'Brush Script MT', cursive;
          font-size: 18px;
          color: #1e293b;
          border-bottom: 0.3mm solid #1e293b;
          padding-bottom: 1mm;
          margin-bottom: 2mm;
        }
        .signer-name {
          font-size: 11px;
          font-weight: 700;
          color: #ff4600;
        }
        .signer-title {
          font-size: 8px;
          color: #64748b;
          margin-top: 0.5mm;
        }

        .signature-right {
          text-align: right;
        }
        .contact-item {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 2mm;
          font-size: 8px;
          color: #64748b;
          margin: 1.5mm 0;
        }
        .contact-item .icon {
          width: 4mm;
          height: 4mm;
          background: #ff4600;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 6px;
        }
        .contact-item .text {
          color: #1e293b;
        }

        /* ===== COMPANY FOOTER ===== */
        .company-footer {
          text-align: center;
          padding: 4mm;
          margin-top: 4mm;
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border-radius: 3mm;
          font-size: 8px;
          color: #64748b;
        }

        .company-footer strong { color: #1e293b; }
        .company-footer .highlight { color: #ff4600; }

        /* ===== PRINT STYLES ===== */
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          .page {
            page-break-after: always;
          }

          .section {
            page-break-inside: avoid;
          }

          .signature-footer {
            page-break-inside: avoid;
          }

          .rate-table {
            page-break-inside: auto;
          }

          .rate-table tr {
            page-break-inside: avoid;
          }
        }
      </style>
    </head>
    <body>
      <!-- Decorative Borders -->
      <div class="left-border"></div>
      <div class="right-border"></div>

      <div class="page">
        <div class="corner-top-right"></div>
        <div class="corner-bottom-left"></div>

        <div class="content">
          <!-- Header Banner -->
          <div class="header-banner">
            <img src="https://ugc-business-command-portal.vercel.app/logo/logougctaglinewhite.png" alt="UGC Logistics"/>
            <div class="brand-text">
              <div class="brand-name">${UGC_INFO.shortName.toUpperCase()}</div>
              <div class="brand-tagline">${UGC_INFO.tagline}</div>
            </div>
          </div>

          <!-- Letterhead Info -->
          <div class="letterhead-info">
            <div class="sender-info">
              <div class="sender-name">${profile.name.toUpperCase()}</div>
              <div class="sender-title">Sales & Commercial Executive</div>
              <div class="sender-company">${UGC_INFO.name}</div>
              <div class="sender-detail">
                <span>Address:</span> ${UGC_INFO.address}, ${UGC_INFO.city}<br/>
                <span>Web:</span> ${UGC_INFO.web}<br/>
                <span>Phone:</span> ${UGC_INFO.phone}
              </div>
            </div>
            <div class="doc-date">
              <div class="label">Date</div>
              <div class="value">${formatDate(quotation.created_at)}</div>
            </div>
          </div>

          <!-- Document Header -->
          <div class="doc-header">
            <div class="doc-title-section">
              <div class="doc-title">Quotation</div>
              <div class="doc-number">${quotation.quotation_number}</div>
            </div>
            <div class="doc-meta">
              Reference: <span class="value">${quotation.ticket?.ticket_code || '-'}</span><br/>
              Valid Until: <span class="value">${formatDate(quotation.valid_until)}</span><br/>
              Validity: <span class="value">${quotation.validity_days} Days</span>
            </div>
          </div>

          <!-- Greeting -->
          <div class="greeting">
            Dear <span class="greeting-to">${quotation.customer_name}</span>${quotation.customer_company ? `,<br/><span class="greeting-company">${quotation.customer_company}</span>` : ''},
          </div>

          <!-- Intro Text -->
          <div class="intro-text">
            Thank you for your interest in our logistics services. We are pleased to present you with our quotation for ${quotation.service_type || 'logistics services'}${quotation.origin_city && quotation.destination_city ? ` from ${quotation.origin_city} to ${quotation.destination_city}` : ''}. Please find below the details of our proposed service and pricing.
          </div>

          <!-- Customer & Route Section -->
          <div class="two-col section">
            <div>
              <div class="section-title">Customer Information</div>
              <div class="customer-card">
                <div class="customer-name">${quotation.customer_name}</div>
                ${quotation.customer_company ? `<div class="customer-company">${quotation.customer_company}</div>` : ''}
                <div class="customer-detail">
                  ${quotation.customer_email ? `✉ ${quotation.customer_email}<br/>` : ''}
                  ${quotation.customer_phone ? `☏ ${quotation.customer_phone}` : ''}
                  ${quotation.customer_address ? `<br/>📍 ${quotation.customer_address}` : ''}
                </div>
              </div>
            </div>

            <div>
              <div class="section-title">Route Information</div>
              <div class="route-card">
                <div class="route-box">
                  <div class="route-point">
                    <div class="route-city">${quotation.origin_city || 'Origin'}</div>
                    <div class="route-country">${quotation.origin_country || ''}</div>
                    ${quotation.origin_port ? `<div class="route-port">Port: ${quotation.origin_port}</div>` : ''}
                  </div>
                  <div class="route-arrow">→</div>
                  <div class="route-point">
                    <div class="route-city">${quotation.destination_city || 'Destination'}</div>
                    <div class="route-country">${quotation.destination_country || ''}</div>
                    ${quotation.destination_port ? `<div class="route-port">Port: ${quotation.destination_port}</div>` : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Service & Cargo Details -->
          ${cargoDetails.length > 0 ? `
            <div class="section">
              <div class="section-title">Service & Cargo Details</div>
              <div class="details-grid">
                ${quotation.service_type ? `<div class="detail-item"><div class="label">Service Type</div><div class="value">${quotation.service_type}</div></div>` : ''}
                ${quotation.incoterm ? `<div class="detail-item"><div class="label">Incoterm</div><div class="value">${quotation.incoterm}</div></div>` : ''}
                ${cargoDetails.map(d => `<div class="detail-item"><div class="label">${d.label}</div><div class="value">${d.value}</div></div>`).join('')}
              </div>
              ${quotation.cargo_description ? `
                <div class="cargo-desc">
                  <div class="label">Cargo Description</div>
                  <div class="value">${quotation.cargo_description}</div>
                </div>
              ` : ''}
            </div>
          ` : ''}

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
                ${includesList ? `<div class="terms-card included"><h4>✓ Included in Quote</h4><ul>${includesList}</ul></div>` : ''}
                ${excludesList ? `<div class="terms-card excluded"><h4>✗ Not Included</h4><ul>${excludesList}</ul></div>` : ''}
              </div>
            </div>
          ` : ''}

          ${quotation.terms_notes ? `
            <div class="notes-box">
              <div class="label">Additional Notes</div>
              <div class="value">${quotation.terms_notes}</div>
            </div>
          ` : ''}

          <div class="validity-banner">
            ⏰ This quotation is valid for <strong>${quotation.validity_days} days</strong> from issue date (until <strong>${formatDate(quotation.valid_until)}</strong>). Prices are subject to change after validity period.
          </div>

          <!-- Signature Footer -->
          <div class="signature-footer">
            <div class="signature-left">
              <div class="qr-container">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(validationUrl)}&color=ff4600" alt="QR Code"/>
                <div class="qr-label">Scan to Verify</div>
              </div>
              <div class="signature-block">
                <div class="signature-line">${profile.name}</div>
                <div class="signer-name">${profile.name.toUpperCase()}</div>
                <div class="signer-title">Sales & Commercial Executive</div>
              </div>
            </div>
            <div class="signature-right">
              <div class="contact-item">
                <div class="icon">☏</div>
                <div class="text">${UGC_INFO.phone}</div>
              </div>
              <div class="contact-item">
                <div class="icon">✉</div>
                <div class="text">${profile.email || UGC_INFO.email}</div>
              </div>
              <div class="contact-item">
                <div class="icon">🌐</div>
                <div class="text">${UGC_INFO.web}</div>
              </div>
              <div class="contact-item">
                <div class="icon">📍</div>
                <div class="text">${UGC_INFO.city}</div>
              </div>
            </div>
          </div>

          <!-- Company Footer -->
          <div class="company-footer">
            <strong>${UGC_INFO.name}</strong><br/>
            ${UGC_INFO.address}, ${UGC_INFO.city}<br/>
            <span class="highlight">☏ ${UGC_INFO.phone}</span> • <span class="highlight">✉ ${UGC_INFO.email}</span> • <span class="highlight">🌐 ${UGC_INFO.web}</span>
          </div>
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
