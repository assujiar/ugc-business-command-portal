// =====================================================
// API Route: /api/crm/leads
// SOURCE: PDF Section 5 - Lead Operations
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSales } from '@/lib/permissions'
import { getStageConfig, calculateNextStepDueDate } from '@/lib/constants'
import type { UserRole } from '@/types/database'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// GET /api/crm/leads - List leads (filtered by RLS)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('leads' as any as any)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('triage_status', status)
    }

    const { data, count, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, count })
  } catch (error) {
    console.error('Error fetching leads:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/crm/leads - Create new lead with optional shipment details
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's profile to check role
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single() as { data: { role: string } | null }

    const userRole = profile?.role as UserRole | undefined
    const isSalesUser = isSales(userRole)

    const body = await request.json()
    const { shipment_details, ...leadData } = body

    // Map form fields to database columns
    // If salesperson creates lead, auto-assign to them and mark as claimed
    const mappedLeadData: Record<string, any> = {
      company_name: leadData.company_name,
      contact_name: leadData.pic_name || null,
      contact_email: leadData.pic_email || null,
      contact_phone: leadData.pic_phone || null,
      source: leadData.source,
      source_detail: leadData.source_detail || null,
      notes: leadData.inquiry_text || null,
      priority: leadData.priority ?? 2, // Default to Medium if not specified
      industry: leadData.industry || null,
      created_by: user.id,
    }

    if (isSalesUser) {
      // Salesperson creating lead - auto-assign to themselves
      // Use 'Assign to Sales' with claim_status 'claimed' (skips triage, auto-claimed)
      mappedLeadData.sales_owner_user_id = user.id
      mappedLeadData.claimed_at = new Date().toISOString()
      mappedLeadData.triage_status = 'Assign to Sales'
      mappedLeadData.qualified_at = new Date().toISOString()
      mappedLeadData.claim_status = 'claimed'
    } else {
      // Marketing creating lead - set marketing owner
      mappedLeadData.marketing_owner_user_id = user.id
    }

    // Create lead
    const { data: leadResult, error: leadError } = await (supabase as any)
      .from('leads' as any as any)
      .insert(mappedLeadData)
      .select()
      .single()

    if (leadError) {
      return NextResponse.json({ error: leadError.message }, { status: 500 })
    }

    // If salesperson created the lead, auto-create Account and Pipeline
    console.log('isSalesUser:', isSalesUser, 'userRole:', userRole)
    if (isSalesUser && leadResult) {
      try {
        console.log('Sales user creating lead - will auto-create Account and Pipeline')

        // Check if service role key is available
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          console.error('SUPABASE_SERVICE_ROLE_KEY is not configured - cannot create admin client')
          throw new Error('Admin client not available')
        }

        const { createAdminClient } = await import('@/lib/supabase/admin')
        const adminClient = createAdminClient()
        console.log('Admin client created successfully')

        // Create Account
        const accountData = {
          company_name: leadData.company_name,
          pic_name: leadData.pic_name || null,
          pic_email: leadData.pic_email || null,
          pic_phone: leadData.pic_phone || null,
          owner_user_id: user.id,
          created_by: user.id,
          account_status: 'calon_account',
          lead_id: leadResult.lead_id,
          original_lead_id: leadResult.lead_id, // Track original lead for marketing visibility
          original_creator_id: user.id, // Track original creator for marketing visibility
        }

        console.log('Creating account with data:', accountData)
        const { data: newAccount, error: accountError } = await (adminClient as any)
          .from('accounts')
          .insert(accountData)
          .select('account_id')
          .single()

        let accountId: string | null = null
        if (accountError) {
          console.error('Error creating account for sales lead:', accountError)
        } else if (newAccount) {
          accountId = newAccount.account_id
          console.log('Account created for sales lead:', accountId)
        }

        // Create Pipeline (Opportunity)
        if (accountId) {
          const initialStage = 'Prospecting'
          const stageConfig = getStageConfig(initialStage)
          const nextStepDueDate = calculateNextStepDueDate(initialStage)

          const opportunityData = {
            name: `Pipeline - ${leadData.company_name}`,
            account_id: accountId,
            source_lead_id: leadResult.lead_id,
            stage: initialStage,
            estimated_value: leadData.potential_revenue || 0,
            currency: 'IDR',
            probability: stageConfig?.probability || 10,
            owner_user_id: user.id,
            created_by: user.id,
            next_step: stageConfig?.nextStep || 'Initial Contact',
            next_step_due_date: nextStepDueDate.toISOString().split('T')[0],
            original_creator_id: user.id, // Track original creator for marketing visibility
          }

          console.log('Creating pipeline with data:', opportunityData)
          const { data: newOpportunity, error: opportunityError } = await (adminClient as any)
            .from('opportunities')
            .insert(opportunityData)
            .select('opportunity_id')
            .single()

          if (opportunityError) {
            console.error('Error creating pipeline for sales lead:', opportunityError)
          } else if (newOpportunity) {
            console.log('Pipeline created for sales lead:', newOpportunity.opportunity_id)

            // Update lead with account_id and opportunity_id
            const { error: updateError } = await (adminClient as any)
              .from('leads')
              .update({
                account_id: accountId,
                opportunity_id: newOpportunity.opportunity_id,
              })
              .eq('lead_id', leadResult.lead_id)

            if (updateError) {
              console.error('Error updating lead with account/opportunity:', updateError)
            } else {
              console.log('Lead updated with account_id and opportunity_id')
              // Update leadResult for response
              leadResult.account_id = accountId
              leadResult.opportunity_id = newOpportunity.opportunity_id
            }
          }
        }
      } catch (autoCreateError) {
        console.error('Unexpected error in auto-create account/pipeline:', autoCreateError)
      }
    }

    // Create shipment details if provided (save even without service_type_code)
    if (shipment_details) {
      const shipmentInsertData = {
        lead_id: leadResult.lead_id,
        service_type_code: shipment_details.service_type_code || null,
        department: shipment_details.department || null,
        fleet_type: shipment_details.fleet_type || null,
        fleet_quantity: shipment_details.fleet_quantity || 1,
        incoterm: shipment_details.incoterm || null,
        cargo_category: shipment_details.cargo_category || 'General Cargo',
        cargo_description: shipment_details.cargo_description || null,
        origin_address: shipment_details.origin_address || null,
        origin_city: shipment_details.origin_city || null,
        origin_country: shipment_details.origin_country || 'Indonesia',
        destination_address: shipment_details.destination_address || null,
        destination_city: shipment_details.destination_city || null,
        destination_country: shipment_details.destination_country || 'Indonesia',
        quantity: shipment_details.quantity || 1,
        unit_of_measure: shipment_details.unit_of_measure || 'Boxes',
        weight_per_unit_kg: shipment_details.weight_per_unit_kg || null,
        weight_total_kg: shipment_details.weight_total_kg || null,
        length_cm: shipment_details.length_cm || null,
        width_cm: shipment_details.width_cm || null,
        height_cm: shipment_details.height_cm || null,
        volume_total_cbm: shipment_details.volume_total_cbm || null,
        scope_of_work: shipment_details.scope_of_work || null,
        additional_services: shipment_details.additional_services || [],
        created_by: user.id,
      }

      const { error: shipmentError } = await (supabase as any)
        .from('shipment_details' as any)
        .insert(shipmentInsertData)

      if (shipmentError) {
        console.error('Error creating shipment details:', shipmentError)
      }
    }

    return NextResponse.json({ data: leadResult }, { status: 201 })
  } catch (error) {
    console.error('Error creating lead:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
