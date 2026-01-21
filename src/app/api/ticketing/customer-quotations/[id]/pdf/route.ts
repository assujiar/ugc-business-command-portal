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

// Generate HTML for PDF - UGC Bold Ticket-Style + Pagebreak Safe + Anti-Tamper Watermark
const generateQuotationHTML = (quotation: any, profile: ProfileData, validationUrl: string): string => {
  const items = quotation.items || []
  const isBreakdown = quotation.rate_structure === 'breakdown'

  // Anti-tamper watermark text
  const watermarkText = `${quotation.quotation_number} • ${quotation.validation_code} • `
  const watermarkRepeated = watermarkText.repeat(50) // Repeat to fill the page

  // Build items table for breakdown
  let itemsTableHTML = ''
  if (isBreakdown && items.length > 0) {
    itemsTableHTML = `
      <table class="rate-table">
        <thead>
          <tr>
            <th class="col-no">#</th>
            <th>Description</th>
            <th class="col-unit">Unit</th>
            <th class="col-amt">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item: any, index: number) => `
              <tr>
                <td class="center">${index + 1}</td>
                <td>
                  <div class="item-title">${item.component_name || item.component_type}</div>
                  ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
                </td>
                <td class="center">${item.quantity ? `${item.quantity} ${item.unit || ''}` : '-'}</td>
                <td class="right">${formatCurrency(item.selling_rate, quotation.currency)}</td>
              </tr>
            `
            )
            .join('')}
        </tbody>
      </table>
    `
  } else {
    itemsTableHTML = `
      <div class="package-card keep">
        <div class="package-left">
          <div class="kicker">Service Package</div>
          <div class="package-title">${quotation.service_type || 'Door to Door'}</div>
          <div class="package-sub">${quotation.origin_city || 'Origin'} → ${quotation.destination_city || 'Destination'}</div>
        </div>
        <div class="package-right">
          <div class="chip chip-orange">Bundling Rate</div>
          <div class="micro">Rate structure: <strong>All-in</strong></div>
        </div>
      </div>
    `
  }

  const includesList =
    Array.isArray(quotation.terms_includes) && quotation.terms_includes.length > 0
      ? quotation.terms_includes
          .map((t: string) => `<li><span class="tick">✓</span><span>${t}</span></li>`)
          .join('')
      : ''

  const excludesList =
    Array.isArray(quotation.terms_excludes) && quotation.terms_excludes.length > 0
      ? quotation.terms_excludes
          .map((t: string) => `<li><span class="cross">✕</span><span>${t}</span></li>`)
          .join('')
      : ''

  const cargoDetails: Array<{ label: string; value: string }> = []
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
  <meta charset="UTF-8" />
  <title>Quotation ${quotation.quotation_number}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

    :root{
      --ugc-orange:#ff4600;
      --ugc-orange-2:#ff6a2b;
      --ugc-ink:#0f172a;
      --ugc-slate:#1e293b;
      --ugc-muted:#64748b;
      --ugc-line:#e2e8f0;
      --ugc-soft:#f8fafc;
      --ugc-cream:#fff7ed;
      --ugc-green:#059669;
      --ugc-red:#dc2626;
      --shadow: 0 14px 40px rgba(15,23,42,.10);
      --radius: 14px;
      --radius-lg: 18px;
    }

    *{ margin:0; padding:0; box-sizing:border-box; }

    @page{
      size:A4;
      margin: 10mm 10mm 12mm 10mm;
    }

    body{
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      font-size: 10px;
      line-height: 1.55;
      color: var(--ugc-slate);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #fff;
    }

    /* ======= PAGE BACKGROUND (Subtle pattern, still printer-friendly) ======= */
    .bg{
      position: fixed;
      inset: 0;
      z-index: -1;
      background:
        radial-gradient(1000px 400px at 10% -10%, rgba(255,70,0,.14), transparent 55%),
        radial-gradient(800px 320px at 110% 0%, rgba(15,23,42,.10), transparent 60%),
        linear-gradient(180deg, #ffffff 0%, #ffffff 55%, #f9fafb 100%);
    }

    /* micro pattern overlay */
    .bg::after{
      content:"";
      position:absolute; inset:0;
      opacity:.10;
      background-image:
        linear-gradient(90deg, rgba(15,23,42,.10) 1px, transparent 1px),
        linear-gradient(180deg, rgba(15,23,42,.10) 1px, transparent 1px);
      background-size: 12px 12px;
      mask-image: radial-gradient(circle at 30% 0%, #000 0%, transparent 60%);
    }

    /* ======= ANTI-TAMPER WATERMARK ======= */
    .watermark{
      position: fixed;
      inset: 0;
      z-index: -1;
      overflow: hidden;
      pointer-events: none;
    }

    .watermark-text{
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      width: 200%;
      height: 200%;
      display: flex;
      flex-wrap: wrap;
      align-content: center;
      justify-content: center;
      font-size: 6px;
      font-weight: 400;
      letter-spacing: 2px;
      color: rgba(255, 70, 0, 0.035);
      line-height: 3;
      word-break: break-all;
      user-select: none;
    }

    /* Secondary diagonal watermark layer */
    .watermark-diagonal{
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9999;
      pointer-events: none;
      overflow: hidden;
    }

    .watermark-diagonal::before{
      content: "${watermarkText.repeat(100)}";
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      transform: rotate(-30deg);
      font-size: 5px;
      font-family: monospace;
      letter-spacing: 1px;
      line-height: 2.5;
      color: rgba(15, 23, 42, 0.02);
      word-break: break-all;
      white-space: normal;
      pointer-events: none;
      user-select: none;
    }

    /* ======= LAYOUT ======= */
    .sheet{
      position: relative;
      padding: 0;
    }

    /* ticket rails left-right */
    .rail{
      position: fixed;
      top: 0;
      bottom: 0;
      width: 7mm;
      background:
        linear-gradient(180deg,
          rgba(255,70,0,1) 0%,
          rgba(255,70,0,1) 18%,
          rgba(15,23,42,1) 18%,
          rgba(15,23,42,1) 52%,
          rgba(255,70,0,1) 52%,
          rgba(255,70,0,1) 100%
        );
      opacity: .95;
    }
    .rail.left{ left:-10mm; }
    .rail.right{ right:-10mm; }

    /* perforation (visual only) */
    .perf{
      position: fixed;
      top: 0;
      bottom: 0;
      width: 2mm;
      background:
        radial-gradient(circle, rgba(255,255,255,.95) 1.2px, transparent 1.3px) 0 0 / 2mm 6mm;
      opacity: .85;
    }
    .perf.left{ left:-2mm; }
    .perf.right{ right:-2mm; }

    /* ======= PAGEBREAK SAFETY ======= */
    .keep{ break-inside: avoid; page-break-inside: avoid; }
    .keep-pad{ break-inside: avoid; page-break-inside: avoid; padding-top: 1px; }
    .section{ margin-top: 12px; }
    .section + .section{ margin-top: 12px; }

    /* allow table to flow across pages, but keep rows intact */
    table{ width:100%; border-collapse: collapse; }
    thead{ display: table-header-group; }
    tfoot{ display: table-footer-group; }
    tr{ break-inside: avoid; page-break-inside: avoid; }

    /* ======= TOP HERO ======= */
    .hero{
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow);
      border: 1px solid rgba(226,232,240,.9);
      background:
        linear-gradient(135deg, rgba(255,70,0,1) 0%, rgba(255,106,43,1) 38%, rgba(15,23,42,1) 38%, rgba(15,23,42,1) 100%);
    }

    .hero-inner{
      display:flex;
      justify-content: space-between;
      gap: 14px;
      padding: 16px 16px 14px 16px;
      color:#fff;
      position: relative;
    }

    /* route line motif */
    .hero-inner::after{
      content:"";
      position:absolute; inset:0;
      opacity:.18;
      background:
        repeating-linear-gradient(135deg, rgba(255,255,255,.22) 0 6px, transparent 6px 12px);
      mix-blend-mode: overlay;
      pointer-events:none;
    }

    .brand{
      display:flex;
      gap: 10px;
      align-items: center;
      min-width: 58%;
    }
    .brand img{
      height: 14mm;
      width:auto;
      display:block;
      filter: drop-shadow(0 6px 10px rgba(0,0,0,.22));
    }
    .brand-meta .name{
      font-size: 15px;
      font-weight: 800;
      letter-spacing: .6px;
      line-height: 1.05;
    }
    .brand-meta .tag{
      font-size: 8.5px;
      opacity: .92;
      margin-top: 2px;
    }
    .brand-meta .micro{
      font-size: 7.2px;
      opacity: .85;
      margin-top: 6px;
      letter-spacing: .2px;
    }

    .docchip{
      text-align: right;
      min-width: 38%;
    }
    .chip{
      display:inline-flex;
      align-items:center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: .3px;
      border: 1px solid rgba(255,255,255,.35);
      background: rgba(255,255,255,.12);
      backdrop-filter: blur(6px);
    }
    .chip-orange{
      background: rgba(255,255,255,.14);
    }
    .docchip .title{
      margin-top: 10px;
      font-size: 20px;
      font-weight: 900;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .docchip .number{
      margin-top: 4px;
      font-size: 11px;
      font-weight: 700;
      opacity: .95;
    }

    .hero-foot{
      display:flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px 12px 16px;
      background: rgba(255,255,255,.10);
      border-top: 1px solid rgba(255,255,255,.18);
      color: rgba(255,255,255,.92);
      font-size: 8px;
    }
    .hero-foot strong{ color:#fff; }
    .hero-foot .right{ text-align:right; }

    /* ======= MAIN GRID ======= */
    .grid-2{
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 12px;
    }

    /* ======= CARDS ======= */
    .card{
      border: 1px solid rgba(226,232,240,.9);
      background: #fff;
      border-radius: var(--radius);
      box-shadow: 0 10px 26px rgba(15,23,42,.06);
      overflow: hidden;
    }

    .card-h{
      display:flex;
      align-items:center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      background: linear-gradient(135deg, var(--ugc-soft) 0%, #ffffff 60%);
      border-bottom: 1px solid var(--ugc-line);
    }

    .h-left{
      display:flex; align-items:center; gap: 8px;
      min-width: 60%;
    }
    .pill{
      width: 9px; height: 9px; border-radius: 3px;
      background: var(--ugc-orange);
      box-shadow: 0 6px 14px rgba(255,70,0,.25);
    }
    .card-title{
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .5px;
      text-transform: uppercase;
      color: var(--ugc-ink);
    }
    .card-sub{
      font-size: 8px;
      color: var(--ugc-muted);
    }

    .card-b{
      padding: 12px;
    }

    .kv{
      display:grid;
      grid-template-columns: 92px 1fr;
      gap: 6px 10px;
      font-size: 9px;
    }
    .kv .k{ color: var(--ugc-muted); }
    .kv .v{ color: var(--ugc-slate); font-weight: 600; }

    .route{
      display:flex;
      align-items:center;
      justify-content: space-between;
      gap: 10px;
      background: linear-gradient(135deg, #fff 0%, var(--ugc-cream) 100%);
      border: 1px dashed rgba(255,70,0,.45);
      border-radius: 12px;
      padding: 10px 12px;
    }
    .route .pt{
      text-align:center;
      flex:1;
    }
    .route .city{
      font-size: 12px;
      font-weight: 900;
      color: var(--ugc-ink);
      letter-spacing: .2px;
    }
    .route .meta{
      font-size: 8px;
      color: var(--ugc-muted);
      margin-top: 2px;
    }
    .route .arrow{
      width: 42px;
      text-align:center;
      font-size: 18px;
      font-weight: 900;
      color: var(--ugc-orange);
    }
    .route .micro{
      font-size: 7px;
      color: #9a3412;
      margin-top: 3px;
    }

    /* ======= SECTION HEAD ======= */
    .sec-head{
      margin-top: 12px;
      display:flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      padding: 0 2px;
    }
    .sec-head .h{
      font-size: 11px;
      font-weight: 900;
      color: var(--ugc-ink);
      letter-spacing: .4px;
      text-transform: uppercase;
    }
    .sec-head .meta{
      font-size: 8px;
      color: var(--ugc-muted);
    }

    /* ======= DETAILS GRID ======= */
    .details{
      display:grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 10px;
    }
    .tile{
      border: 1px solid var(--ugc-line);
      background: linear-gradient(135deg, #fff 0%, var(--ugc-soft) 100%);
      border-radius: 12px;
      padding: 10px;
    }
    .tile .k{
      font-size: 7px;
      letter-spacing: .6px;
      text-transform: uppercase;
      color: #94a3b8;
      font-weight: 800;
    }
    .tile .v{
      margin-top: 6px;
      font-size: 10px;
      font-weight: 800;
      color: var(--ugc-ink);
      line-height: 1.2;
    }

    .note{
      margin-top: 10px;
      border-left: 4px solid rgba(255,70,0,.85);
      background: linear-gradient(135deg, rgba(255,70,0,.08) 0%, rgba(15,23,42,.03) 100%);
      border-radius: 12px;
      padding: 10px 12px;
    }
    .note .k{
      font-size: 8px;
      font-weight: 900;
      letter-spacing: .3px;
      text-transform: uppercase;
      color: #9a3412;
    }
    .note .v{
      margin-top: 4px;
      font-size: 9px;
      color: #7c2d12;
      line-height: 1.6;
    }

    /* ======= PACKAGE CARD ======= */
    .package-card{
      display:flex;
      justify-content: space-between;
      align-items: stretch;
      gap: 10px;
      border: 1px solid rgba(255,70,0,.35);
      background: linear-gradient(135deg, #fff 0%, var(--ugc-cream) 90%);
      border-radius: var(--radius);
      padding: 12px;
    }
    .kicker{
      font-size: 7px;
      font-weight: 900;
      letter-spacing: .8px;
      text-transform: uppercase;
      color: #9a3412;
    }
    .package-title{
      margin-top: 4px;
      font-size: 13px;
      font-weight: 900;
      color: var(--ugc-ink);
      letter-spacing: .2px;
    }
    .package-sub{
      margin-top: 3px;
      font-size: 9px;
      color: #7c2d12;
      font-weight: 700;
    }
    .package-right{
      text-align:right;
      min-width: 34%;
      display:flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .package-right .micro{
      font-size: 7.5px;
      color: #7c2d12;
      opacity: .95;
    }

    /* ======= RATE TABLE ======= */
    .rate-wrap{
      margin-top: 10px;
      border: 1px solid var(--ugc-line);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: 0 10px 26px rgba(15,23,42,.06);
    }
    .rate-head{
      background: linear-gradient(135deg, var(--ugc-ink) 0%, var(--ugc-slate) 65%, var(--ugc-orange) 65%, var(--ugc-orange-2) 100%);
      color:#fff;
      padding: 10px 12px;
      display:flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .rate-head .left{
      display:flex; flex-direction: column;
      gap: 2px;
    }
    .rate-head .ttl{
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .7px;
      text-transform: uppercase;
    }
    .rate-head .sub{
      font-size: 8px;
      opacity: .9;
    }
    .rate-head .badge{
      font-size: 8px;
      font-weight: 900;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.35);
      background: rgba(255,255,255,.12);
    }

    .rate-table th{
      background: linear-gradient(135deg, var(--ugc-soft) 0%, #fff 80%);
      color: var(--ugc-ink);
      padding: 10px;
      border-bottom: 1px solid var(--ugc-line);
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: .6px;
      font-weight: 900;
    }
    .rate-table td{
      padding: 10px;
      border-bottom: 1px solid rgba(226,232,240,.7);
      font-size: 9px;
      vertical-align: top;
    }
    .rate-table tr:nth-child(even) td{
      background: #fcfcfd;
    }
    .rate-table .col-no{ width: 7%; text-align:center; }
    .rate-table .col-unit{ width: 18%; text-align:center; }
    .rate-table .col-amt{ width: 22%; text-align:right; }
    .rate-table .center{ text-align:center; }
    .rate-table .right{ text-align:right; font-weight: 900; color: var(--ugc-ink); }
    .item-title{ font-weight: 900; color: var(--ugc-ink); }
    .item-desc{ margin-top: 4px; font-size: 8px; color: var(--ugc-muted); line-height: 1.5; }

    /* ======= TOTAL STRIP ======= */
    .total{
      display:flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 12px;
      background: linear-gradient(135deg, var(--ugc-orange) 0%, var(--ugc-orange-2) 55%, var(--ugc-ink) 55%, var(--ugc-ink) 100%);
      color:#fff;
    }
    .total .k{
      font-size: 9px;
      font-weight: 900;
      letter-spacing: .7px;
      text-transform: uppercase;
      opacity: .95;
    }
    .total .v{
      font-size: 20px;
      font-weight: 900;
      letter-spacing: .4px;
      text-shadow: 0 10px 20px rgba(0,0,0,.12);
    }
    .total .mini{
      font-size: 7.5px;
      opacity: .9;
      margin-top: 2px;
    }

    /* ======= TERMS ======= */
    .terms{
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 10px;
    }
    .tcard{
      border: 1px solid var(--ugc-line);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: 0 10px 26px rgba(15,23,42,.06);
      background: #fff;
    }
    .tcard .th{
      padding: 10px 12px;
      font-weight: 900;
      letter-spacing: .6px;
      text-transform: uppercase;
      font-size: 9px;
      border-bottom: 1px solid var(--ugc-line);
      display:flex; align-items:center; gap: 8px;
    }
    .tcard .tb{ padding: 10px 12px; font-size: 9px; }
    .tcard ul{ list-style:none; }
    .tcard li{ display:flex; gap: 8px; line-height: 1.5; margin: 6px 0; }
    .tick{ color: var(--ugc-green); font-weight: 900; width: 14px; display:inline-block; }
    .cross{ color: var(--ugc-red); font-weight: 900; width: 14px; display:inline-block; }
    .t-inc .th{ background: rgba(5,150,105,.08); color: #065f46; }
    .t-exc .th{ background: rgba(220,38,38,.08); color: #7f1d1d; }

    /* ======= VALIDITY STRIP ======= */
    .validity{
      margin-top: 12px;
      border-radius: var(--radius);
      border: 1px dashed rgba(255,70,0,.55);
      background: linear-gradient(135deg, #fff 0%, var(--ugc-cream) 100%);
      padding: 10px 12px;
      text-align: center;
      font-size: 9px;
      color: #7c2d12;
    }
    .validity strong{ color: var(--ugc-orange); }

    /* ======= SIGNATURE ======= */
    .sign{
      margin-top: 12px;
      border-radius: var(--radius);
      border: 1px solid var(--ugc-line);
      background: #fff;
      box-shadow: 0 10px 26px rgba(15,23,42,.06);
      padding: 12px;
      display:flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-end;
    }
    .sign-left{
      display:flex;
      gap: 12px;
      align-items: flex-end;
    }
    .qr{
      text-align:center;
      width: 72px;
      flex: 0 0 72px;
    }
    .qr img{
      width: 66px; height: 66px;
      border-radius: 12px;
      border: 1px solid rgba(255,70,0,.45);
      padding: 6px;
    }
    .qr .lbl{
      margin-top: 6px;
      font-size: 7px;
      color: #94a3b8;
      letter-spacing: .3px;
      text-transform: uppercase;
      font-weight: 800;
    }

    .sig{
      min-width: 220px;
    }
    .sig .hand{
      font-family: "Brush Script MT", cursive;
      font-size: 20px;
      color: var(--ugc-ink);
      border-bottom: 1px solid rgba(15,23,42,.45);
      padding-bottom: 4px;
      margin-bottom: 6px;
      width: 220px;
    }
    .sig .nm{
      font-size: 11px;
      font-weight: 900;
      color: var(--ugc-orange);
    }
    .sig .tl{
      margin-top: 2px;
      font-size: 8px;
      color: var(--ugc-muted);
    }

    .sign-right{
      text-align:right;
      font-size: 8.5px;
      color: var(--ugc-muted);
      line-height: 1.8;
    }
    .sign-right strong{ color: var(--ugc-ink); }
    .contactline{
      display:flex;
      justify-content: flex-end;
      gap: 8px;
      align-items:center;
    }
    .dot{
      width: 8px; height: 8px; border-radius: 999px;
      background: var(--ugc-orange);
      box-shadow: 0 6px 14px rgba(255,70,0,.25);
    }

    /* ======= FOOTER ======= */
    .footer{
      margin-top: 12px;
      border-radius: var(--radius);
      border: 1px solid var(--ugc-line);
      background: linear-gradient(135deg, var(--ugc-soft) 0%, #fff 60%);
      padding: 10px 12px;
      text-align:center;
      font-size: 8px;
      color: var(--ugc-muted);
    }
    .footer strong{ color: var(--ugc-ink); }
    .footer .hl{ color: var(--ugc-orange); font-weight: 900; }

    /* ======= SECURITY FOOTER (Anti-tamper) ======= */
    .security-footer{
      margin-top: 8px;
      padding: 6px 12px;
      background: rgba(15, 23, 42, 0.03);
      border-radius: 8px;
      font-size: 6px;
      font-family: monospace;
      color: rgba(100, 116, 139, 0.6);
      text-align: center;
      letter-spacing: 0.5px;
      word-break: break-all;
    }

    /* ======= PRINT ======= */
    @media print{
      .hero, .card, .rate-wrap, .tcard, .sign, .footer{
        box-shadow: none !important;
      }
      .watermark-diagonal::before{
        color: rgba(15, 23, 42, 0.015);
      }
    }
  </style>
</head>

<body>
  <div class="bg"></div>

  <!-- Anti-Tamper Watermark -->
  <div class="watermark">
    <div class="watermark-text">${watermarkRepeated}</div>
  </div>
  <div class="watermark-diagonal"></div>

  <div class="rail left"></div><div class="perf left"></div>
  <div class="rail right"></div><div class="perf right"></div>

  <div class="sheet">
    <!-- HERO -->
    <div class="hero keep">
      <div class="hero-inner">
        <div class="brand">
          <img src="https://ugc-business-command-portal.vercel.app/logo/logougctaglinewhite.png" alt="UGC Logistics" />
          <div class="brand-meta">
            <div class="name">${UGC_INFO.shortName.toUpperCase()}</div>
            <div class="tag">${UGC_INFO.tagline}</div>
            <div class="micro">
              ${UGC_INFO.address}, ${UGC_INFO.city} • ${UGC_INFO.phone} • ${UGC_INFO.web}
            </div>
          </div>
        </div>

        <div class="docchip">
          <div class="chip chip-orange">REFERENCE <strong>${quotation.ticket?.ticket_code || '-'}</strong></div>
          <div class="title">Quotation</div>
          <div class="number">${quotation.quotation_number}</div>
        </div>
      </div>

      <div class="hero-foot">
        <div>
          <div><strong>Issued:</strong> ${formatDate(quotation.created_at)}</div>
          <div><strong>Valid Until:</strong> ${formatDate(quotation.valid_until)} (${quotation.validity_days} days)</div>
        </div>
        <div class="right">
          <div><strong>Prepared by:</strong> ${profile.name}</div>
          <div><strong>Email:</strong> ${profile.email || UGC_INFO.email}</div>
        </div>
      </div>
    </div>

    <!-- GREETING -->
    <div class="section keep">
      <div class="note">
        <div class="k">To</div>
        <div class="v">
          Dear <strong>${quotation.customer_name || '-'}</strong>
          ${quotation.customer_company ? `, <strong>${quotation.customer_company}</strong>` : ''}.<br/>
          Thank you for your interest in our services. Below is our quotation for
          <strong>${quotation.service_type || 'logistics services'}</strong>
          ${quotation.origin_city && quotation.destination_city ? ` from <strong>${quotation.origin_city}</strong> to <strong>${quotation.destination_city}</strong>` : ''}.
        </div>
      </div>
    </div>

    <!-- CUSTOMER + ROUTE -->
    <div class="grid-2 section keep-pad">
      <div class="card keep">
        <div class="card-h">
          <div class="h-left">
            <div class="pill"></div>
            <div>
              <div class="card-title">Customer</div>
              <div class="card-sub">Contact & address details</div>
            </div>
          </div>
        </div>
        <div class="card-b">
          <div class="kv">
            <div class="k">Name</div><div class="v">${quotation.customer_name || '-'}</div>
            <div class="k">Company</div><div class="v">${quotation.customer_company || '-'}</div>
            <div class="k">Email</div><div class="v">${quotation.customer_email || '-'}</div>
            <div class="k">Phone</div><div class="v">${quotation.customer_phone || '-'}</div>
            <div class="k">Address</div><div class="v">${quotation.customer_address || '-'}</div>
          </div>
        </div>
      </div>

      <div class="card keep">
        <div class="card-h">
          <div class="h-left">
            <div class="pill"></div>
            <div>
              <div class="card-title">Route</div>
              <div class="card-sub">Origin → Destination</div>
            </div>
          </div>
        </div>
        <div class="card-b">
          <div class="route">
            <div class="pt">
              <div class="city">${quotation.origin_city || 'Origin'}</div>
              <div class="meta">${quotation.origin_country || ''}</div>
              ${quotation.origin_port ? `<div class="micro">Port: ${quotation.origin_port}</div>` : `<div class="micro">&nbsp;</div>`}
            </div>
            <div class="arrow">→</div>
            <div class="pt">
              <div class="city">${quotation.destination_city || 'Destination'}</div>
              <div class="meta">${quotation.destination_country || ''}</div>
              ${quotation.destination_port ? `<div class="micro">Port: ${quotation.destination_port}</div>` : `<div class="micro">&nbsp;</div>`}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- SERVICE & CARGO DETAILS -->
    ${(quotation.service_type || quotation.incoterm || cargoDetails.length > 0 || quotation.cargo_description) ? `
      <div class="section keep-pad">
        <div class="sec-head">
          <div class="h">Service & Cargo</div>
          <div class="meta">Key shipment parameters</div>
        </div>

        <div class="details">
          ${quotation.service_type ? `<div class="tile"><div class="k">Service Type</div><div class="v">${quotation.service_type}</div></div>` : ''}
          ${quotation.incoterm ? `<div class="tile"><div class="k">Incoterm</div><div class="v">${quotation.incoterm}</div></div>` : ''}
          ${cargoDetails.map(d => `<div class="tile"><div class="k">${d.label}</div><div class="v">${d.value}</div></div>`).join('')}
        </div>

        ${quotation.cargo_description ? `
          <div class="note keep">
            <div class="k">Cargo Description</div>
            <div class="v">${quotation.cargo_description}</div>
          </div>
        ` : ''}
      </div>
    ` : ''}

    <!-- RATE -->
    <div class="section keep-pad">
      <div class="rate-wrap">
        <div class="rate-head keep">
          <div class="left">
            <div class="ttl">Rate Quotation</div>
            <div class="sub">
              Currency: <strong>${quotation.currency || 'IDR'}</strong>
              • Structure: <strong>${quotation.rate_structure || (isBreakdown ? 'breakdown' : 'all-in')}</strong>
            </div>
          </div>
          <div class="badge">UGC • Commercial Offer</div>
        </div>

        <div class="keep-pad" style="padding:12px;">
          ${itemsTableHTML}
        </div>

        <div class="total keep">
          <div>
            <div class="k">Total Amount</div>
            <div class="mini">Taxes / duties follow terms & conditions (if applicable)</div>
          </div>
          <div class="v">${formatCurrency(quotation.total_selling_rate, quotation.currency)}</div>
        </div>
      </div>
    </div>

    <!-- SCOPE -->
    ${quotation.scope_of_work ? `
      <div class="section keep">
        <div class="sec-head">
          <div class="h">Scope of Work</div>
          <div class="meta">Operational boundaries</div>
        </div>
        <div class="note">
          <div class="k">Scope</div>
          <div class="v">${quotation.scope_of_work}</div>
        </div>
      </div>
    ` : ''}

    <!-- TERMS -->
    ${(includesList || excludesList) ? `
      <div class="section keep-pad">
        <div class="sec-head">
          <div class="h">Terms & Conditions</div>
          <div class="meta">Included vs not included</div>
        </div>

        <div class="terms">
          ${includesList ? `
            <div class="tcard t-inc keep">
              <div class="th">Included in Quote</div>
              <div class="tb"><ul>${includesList}</ul></div>
            </div>
          ` : ''}

          ${excludesList ? `
            <div class="tcard t-exc keep">
              <div class="th">Not Included</div>
              <div class="tb"><ul>${excludesList}</ul></div>
            </div>
          ` : ''}
        </div>
      </div>
    ` : ''}

    <!-- ADDITIONAL NOTES -->
    ${quotation.terms_notes ? `
      <div class="section keep">
        <div class="note">
          <div class="k">Additional Notes</div>
          <div class="v">${quotation.terms_notes}</div>
        </div>
      </div>
    ` : ''}

    <!-- VALIDITY -->
    <div class="validity keep">
      This quotation is valid for <strong>${quotation.validity_days} days</strong> from the issue date
      (until <strong>${formatDate(quotation.valid_until)}</strong>). Prices may change after the validity period.
    </div>

    <!-- SIGNATURE -->
    <div class="sign keep">
      <div class="sign-left">
        <div class="qr">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(validationUrl)}&color=ff4600" alt="QR Code" />
          <div class="lbl">Verify</div>
        </div>
        <div class="sig">
          <div class="hand">${profile.name}</div>
          <div class="nm">${profile.name.toUpperCase()}</div>
          <div class="tl">Sales & Commercial Executive • ${UGC_INFO.shortName}</div>
        </div>
      </div>

      <div class="sign-right">
        <div class="contactline"><span class="dot"></span><span><strong>${UGC_INFO.phone}</strong> (Office)</span></div>
        <div class="contactline"><span class="dot"></span><span><strong>${profile.email || UGC_INFO.email}</strong> (Email)</span></div>
        <div class="contactline"><span class="dot"></span><span><strong>${UGC_INFO.web}</strong> (Website)</span></div>
        <div class="contactline"><span class="dot"></span><span>${UGC_INFO.city}</span></div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer keep">
      <strong>${UGC_INFO.name}</strong><br/>
      ${UGC_INFO.address}, ${UGC_INFO.city}<br/>
      <span class="hl">${UGC_INFO.phone}</span> • <span class="hl">${UGC_INFO.email}</span> • <span class="hl">${UGC_INFO.web}</span>
    </div>

    <!-- SECURITY FOOTER (Anti-tamper verification) -->
    <div class="security-footer">
      Document ID: ${quotation.quotation_number} • Validation: ${quotation.validation_code} • Verify at: ${validationUrl}
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
