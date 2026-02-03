import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServiceTypeDisplayLabel } from '@/lib/constants'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ code: string }>
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

// GET /api/ticketing/customer-quotations/validate/[code] - Public validation endpoint
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { code } = await params
    const adminClient = createAdminClient()

    // Fetch quotation by validation code (public access - using admin client to bypass RLS)
    const { data: quotation, error } = await (adminClient as any)
      .from('customer_quotations')
      .select(`
        id,
        quotation_number,
        validation_code,
        status,
        created_at,
        updated_at,
        valid_until,
        validity_days,
        customer_name,
        customer_company,
        service_type,
        incoterm,
        origin_city,
        origin_country,
        destination_city,
        destination_country,
        commodity,
        cargo_description,
        cargo_weight,
        cargo_weight_unit,
        cargo_volume,
        cargo_volume_unit,
        estimated_cargo_value,
        cargo_value_currency,
        fleet_type,
        fleet_quantity,
        total_selling_rate,
        currency,
        rate_structure,
        scope_of_work,
        shipments,
        shipment_count,
        terms_includes,
        terms_excludes,
        terms_notes,
        items:customer_quotation_items(
          component_type,
          component_name,
          selling_rate,
          quantity,
          unit
        ),
        creator:profiles!customer_quotations_created_by_fkey(name)
      `)
      .eq('validation_code', code)
      .single()

    if (error || !quotation) {
      return NextResponse.json({
        valid: false,
        error: 'Quotation not found or invalid code',
      }, { status: 404 })
    }

    // Check if quotation is expired
    const validUntil = new Date(quotation.valid_until)
    const isExpired = validUntil < new Date()

    // Determine verification status
    let verificationStatus: 'valid' | 'expired' | 'revoked' = 'valid'
    if (quotation.status === 'revoked') {
      verificationStatus = 'revoked'
    } else if (isExpired) {
      verificationStatus = 'expired'
    }

    // Return sanitized quotation data for public display
    return NextResponse.json({
      valid: verificationStatus === 'valid',
      verification_status: verificationStatus,
      data: {
        quotation_number: quotation.quotation_number,
        status: quotation.status,
        created_at: quotation.created_at,
        updated_at: quotation.updated_at,
        valid_until: quotation.valid_until,
        is_expired: isExpired,
        customer_name: quotation.customer_name,
        customer_company: quotation.customer_company,
        service_type: quotation.service_type,
        incoterm: quotation.incoterm,
        // Parse shipments array from JSONB
        shipments: (() => {
          if (!quotation.shipments) return null
          try {
            const parsed = typeof quotation.shipments === 'string'
              ? JSON.parse(quotation.shipments)
              : quotation.shipments
            if (Array.isArray(parsed) && parsed.length > 0) {
              return parsed.map((s: any, idx: number) => ({
                index: idx + 1,
                origin_city: s.origin_city,
                origin_country: s.origin_country,
                destination_city: s.destination_city,
                destination_country: s.destination_country,
                cargo_description: s.cargo_description,
                weight: s.weight_total_kg,
                volume: s.volume_total_cbm,
                route: `${s.origin_city || 'Origin'} → ${s.destination_city || 'Destination'}`,
                // Service type per shipment
                service_type: s.service_type_code ? getServiceTypeDisplayLabel(s.service_type_code) : null,
                incoterm: s.incoterm || null,
                // Multi-shipment selling rate (NOTE: cost_amount is NOT included - never expose cost to public)
                selling_rate: s.selling_rate || null,
                selling_rate_formatted: s.selling_rate
                  ? formatCurrency(s.selling_rate, s.cost_currency || quotation.currency)
                  : null,
                fleet_type: s.fleet_type || null,
                fleet_quantity: s.fleet_quantity || 1,
              }))
            }
            return null
          } catch {
            return null
          }
        })(),
        shipment_count: quotation.shipment_count || 1,
        // Legacy single route (for backward compatibility)
        route: quotation.origin_city && quotation.destination_city
          ? `${quotation.origin_city}, ${quotation.origin_country || ''} → ${quotation.destination_city}, ${quotation.destination_country || ''}`
          : null,
        // Cargo details
        commodity: quotation.commodity,
        cargo_description: quotation.cargo_description,
        cargo_weight: quotation.cargo_weight,
        cargo_weight_unit: quotation.cargo_weight_unit || 'kg',
        cargo_volume: quotation.cargo_volume,
        cargo_volume_unit: quotation.cargo_volume_unit || 'cbm',
        cargo_value: quotation.estimated_cargo_value
          ? formatCurrency(quotation.estimated_cargo_value, quotation.cargo_value_currency || 'IDR')
          : null,
        fleet_type: quotation.fleet_type,
        fleet_quantity: quotation.fleet_quantity,
        total_amount: formatCurrency(quotation.total_selling_rate, quotation.currency),
        currency: quotation.currency,
        rate_structure: quotation.rate_structure,
        scope_of_work: quotation.scope_of_work,
        terms_includes: quotation.terms_includes,
        terms_excludes: quotation.terms_excludes,
        terms_notes: quotation.terms_notes,
        items: quotation.rate_structure === 'breakdown' ? quotation.items?.map((item: any) => ({
          name: item.component_name || item.component_type,
          amount: formatCurrency(item.selling_rate, quotation.currency),
          quantity: item.quantity,
          unit: item.unit,
        })) : null,
        issued_by: quotation.creator?.name || 'UGC Logistics',
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
