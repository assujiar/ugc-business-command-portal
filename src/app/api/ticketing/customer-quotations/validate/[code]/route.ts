import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    const supabase = await createClient()

    // Fetch quotation by validation code (public access - no auth required)
    const { data: quotation, error } = await (supabase as any)
      .from('customer_quotations')
      .select(`
        id,
        quotation_number,
        validation_code,
        status,
        created_at,
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
        total_selling_rate,
        currency,
        rate_structure,
        scope_of_work,
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
        valid_until: quotation.valid_until,
        is_expired: isExpired,
        customer_name: quotation.customer_name,
        customer_company: quotation.customer_company,
        service_type: quotation.service_type,
        incoterm: quotation.incoterm,
        route: quotation.origin_city && quotation.destination_city
          ? `${quotation.origin_city}, ${quotation.origin_country || ''} → ${quotation.destination_city}, ${quotation.destination_country || ''}`
          : null,
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
