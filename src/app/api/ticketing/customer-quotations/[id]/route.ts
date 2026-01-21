import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, isAdmin } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ProfileData {
  user_id: string
  role: UserRole
}

// GET /api/ticketing/customer-quotations/[id] - Get single quotation
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
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    if (!profileData || !canAccessTicketing(profileData.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch quotation with items
    const { data: quotation, error } = await (supabase as any)
      .from('customer_quotations')
      .select(`
        *,
        ticket:tickets!customer_quotations_ticket_id_fkey(
          id, ticket_code, subject, rfq_data, status,
          account:accounts!tickets_account_id_fkey(account_id, company_name, address, city, country),
          contact:contacts!tickets_contact_id_fkey(contact_id, first_name, last_name, email, phone)
        ),
        operational_cost:ticket_rate_quotes!customer_quotations_operational_cost_id_fkey(
          id, quote_number, amount, currency
        ),
        creator:profiles!customer_quotations_created_by_fkey(user_id, name, email),
        items:customer_quotation_items(*)
      `)
      .eq('id', id)
      .single()

    if (error || !quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: quotation,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/ticketing/customer-quotations/[id] - Update quotation
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    if (!profileData || !canAccessTicketing(profileData.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get current quotation
    const { data: quotation } = await (supabase as any)
      .from('customer_quotations')
      .select('*')
      .eq('id', id)
      .single()

    if (!quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    // Check permission
    if (quotation.created_by !== user.id && !isAdmin(profileData.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const {
      customer_data,
      service_data,
      rate_data,
      terms_data,
      items,
      status,
      pdf_url,
      sent_via,
      sent_to
    } = body

    // Build update object
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Customer data
    if (customer_data) {
      if (customer_data.customer_name !== undefined) updates.customer_name = customer_data.customer_name
      if (customer_data.customer_company !== undefined) updates.customer_company = customer_data.customer_company
      if (customer_data.customer_email !== undefined) updates.customer_email = customer_data.customer_email
      if (customer_data.customer_phone !== undefined) updates.customer_phone = customer_data.customer_phone
      if (customer_data.customer_address !== undefined) updates.customer_address = customer_data.customer_address
    }

    // Service data
    if (service_data) {
      Object.keys(service_data).forEach(key => {
        updates[key] = service_data[key]
      })
    }

    // Rate data
    if (rate_data) {
      if (rate_data.rate_structure !== undefined) updates.rate_structure = rate_data.rate_structure
      if (rate_data.total_cost !== undefined) updates.total_cost = rate_data.total_cost
      if (rate_data.target_margin_percent !== undefined) updates.target_margin_percent = rate_data.target_margin_percent
      if (rate_data.total_selling_rate !== undefined) updates.total_selling_rate = rate_data.total_selling_rate
      if (rate_data.currency !== undefined) updates.currency = rate_data.currency
    }

    // Terms data
    if (terms_data) {
      if (terms_data.scope_of_work !== undefined) updates.scope_of_work = terms_data.scope_of_work
      if (terms_data.terms_includes !== undefined) updates.terms_includes = terms_data.terms_includes
      if (terms_data.terms_excludes !== undefined) updates.terms_excludes = terms_data.terms_excludes
      if (terms_data.terms_notes !== undefined) updates.terms_notes = terms_data.terms_notes
      if (terms_data.validity_days !== undefined) {
        updates.validity_days = terms_data.validity_days
        updates.valid_until = new Date(Date.now() + terms_data.validity_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
    }

    // Status updates
    if (status !== undefined) updates.status = status
    if (pdf_url !== undefined) {
      updates.pdf_url = pdf_url
      updates.pdf_generated_at = new Date().toISOString()
    }
    if (sent_via !== undefined) updates.sent_via = sent_via
    if (sent_to !== undefined) updates.sent_to = sent_to
    if (status === 'sent') {
      updates.sent_at = new Date().toISOString()
    }

    // Update quotation
    const { data: updatedQuotation, error } = await (supabase as any)
      .from('customer_quotations')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating quotation:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Update items if provided
    if (items && Array.isArray(items)) {
      // Delete existing items
      await (supabase as any)
        .from('customer_quotation_items')
        .delete()
        .eq('quotation_id', id)

      // Insert new items
      if (items.length > 0) {
        const itemsToInsert = items.map((item: any, index: number) => ({
          quotation_id: id,
          component_type: item.component_type,
          component_name: item.component_name,
          description: item.description,
          cost_amount: item.cost_amount || 0,
          target_margin_percent: item.target_margin_percent || 0,
          selling_rate: item.selling_rate || 0,
          unit_price: item.unit_price,
          quantity: item.quantity,
          unit: item.unit,
          sort_order: item.sort_order || index,
        }))

        await (supabase as any)
          .from('customer_quotation_items')
          .insert(itemsToInsert)
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedQuotation,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/ticketing/customer-quotations/[id] - Delete quotation
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    if (!profileData || !canAccessTicketing(profileData.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get quotation
    const { data: quotation } = await (supabase as any)
      .from('customer_quotations')
      .select('*')
      .eq('id', id)
      .single()

    if (!quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    // Only draft can be deleted, and only by creator or admin
    if (quotation.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft quotations can be deleted' }, { status: 400 })
    }

    if (quotation.created_by !== user.id && !isAdmin(profileData.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Delete quotation (items will be cascade deleted)
    const { error } = await (supabase as any)
      .from('customer_quotations')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting quotation:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Quotation deleted',
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
