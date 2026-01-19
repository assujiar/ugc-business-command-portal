// =====================================================
// API Route: /api/crm/sales-plans/[id]/potential
// Potential assessment for hunting new customer
// When marked as potential: auto-create lead, account, opportunity
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStageConfig, calculateNextStepDueDate } from '@/lib/constants'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

// POST /api/crm/sales-plans/[id]/potential - Update potential assessment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const { id } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get existing plan
    const { data: plan, error: planError } = await (adminClient as any)
      .from('sales_plans')
      .select('*')
      .eq('plan_id', id)
      .single()

    if (planError || !plan) {
      return NextResponse.json({ error: 'Sales plan not found' }, { status: 404 })
    }

    // Check permissions - only owner or admin can update potential
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const profile = profileData as { role: UserRole } | null
    const isAdmin = profile?.role === 'super admin'
    const isOwner = plan.owner_user_id === user.id

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Only hunting_new plans can be assessed
    if (plan.plan_type !== 'hunting_new') {
      return NextResponse.json({ error: 'Only hunting new customer plans can be assessed' }, { status: 400 })
    }

    // Only completed plans can be assessed
    if (plan.status !== 'completed') {
      return NextResponse.json({ error: 'Only completed plans can be assessed' }, { status: 400 })
    }

    // Only pending assessments can be updated
    if (plan.potential_status !== 'pending') {
      return NextResponse.json({ error: 'Potential status already assessed' }, { status: 400 })
    }

    const body = await request.json()
    const { is_potential, not_potential_reason } = body

    if (is_potential === undefined) {
      return NextResponse.json({ error: 'is_potential is required' }, { status: 400 })
    }

    if (!is_potential && !not_potential_reason) {
      return NextResponse.json({ error: 'Reason required for not potential' }, { status: 400 })
    }

    // Update data
    const updateData: Record<string, any> = {
      potential_status: is_potential ? 'potential' : 'not_potential',
      updated_at: new Date().toISOString(),
    }

    if (!is_potential) {
      updateData.not_potential_reason = not_potential_reason
    }

    // If potential, auto-create lead, account, and opportunity
    if (is_potential) {
      try {
        // 1. Create Lead
        const leadData = {
          company_name: plan.company_name,
          contact_name: plan.pic_name || null,
          contact_email: plan.pic_email || null,
          contact_phone: plan.pic_phone || null,
          source: 'Referral', // From sales hunting
          source_detail: `From Sales Plan: ${plan.plan_id}`,
          notes: plan.plan_notes || null,
          priority: 2, // Medium priority
          sales_owner_user_id: plan.owner_user_id,
          claimed_at: new Date().toISOString(),
          triage_status: 'Assign to Sales',
          qualified_at: new Date().toISOString(),
          claim_status: 'claimed',
          created_by: user.id,
        }

        const { data: newLead, error: leadError } = await (adminClient as any)
          .from('leads')
          .insert(leadData)
          .select('lead_id')
          .single()

        if (leadError) {
          console.error('Error creating lead from sales plan:', leadError)
          throw new Error('Failed to create lead')
        }

        const leadId = newLead.lead_id
        updateData.created_lead_id = leadId

        // 2. Create Account
        const accountData = {
          company_name: plan.company_name,
          pic_name: plan.pic_name || null,
          pic_email: plan.pic_email || null,
          pic_phone: plan.pic_phone || null,
          owner_user_id: plan.owner_user_id,
          created_by: user.id,
          account_status: 'calon_account',
          lead_id: leadId,
          original_lead_id: leadId,
          original_creator_id: plan.owner_user_id,
        }

        const { data: newAccount, error: accountError } = await (adminClient as any)
          .from('accounts')
          .insert(accountData)
          .select('account_id')
          .single()

        if (accountError) {
          console.error('Error creating account from sales plan:', accountError)
          throw new Error('Failed to create account')
        }

        const accountId = newAccount.account_id
        updateData.created_account_id = accountId

        // 3. Create Opportunity/Pipeline
        const initialStage = 'Prospecting'
        const stageConfig = getStageConfig(initialStage)
        const nextStepDueDate = calculateNextStepDueDate(initialStage)

        const opportunityData = {
          name: `Pipeline - ${plan.company_name}`,
          account_id: accountId,
          source_lead_id: leadId,
          stage: initialStage,
          estimated_value: 0,
          currency: 'IDR',
          probability: stageConfig?.probability || 10,
          owner_user_id: plan.owner_user_id,
          created_by: user.id,
          next_step: stageConfig?.nextStep || 'Initial Contact',
          next_step_due_date: nextStepDueDate.toISOString().split('T')[0],
          original_creator_id: plan.owner_user_id,
        }

        const { data: newOpportunity, error: opportunityError } = await (adminClient as any)
          .from('opportunities')
          .insert(opportunityData)
          .select('opportunity_id')
          .single()

        if (opportunityError) {
          console.error('Error creating opportunity from sales plan:', opportunityError)
          throw new Error('Failed to create opportunity')
        }

        const opportunityId = newOpportunity.opportunity_id
        updateData.created_opportunity_id = opportunityId

        // 4. Update lead with account_id and opportunity_id
        await (adminClient as any)
          .from('leads')
          .update({
            account_id: accountId,
            opportunity_id: opportunityId,
          })
          .eq('lead_id', leadId)

        console.log(`Sales plan ${id} marked as potential - created lead: ${leadId}, account: ${accountId}, opportunity: ${opportunityId}`)

      } catch (createError) {
        console.error('Error creating records for potential customer:', createError)
        return NextResponse.json({ error: 'Failed to create lead/account/opportunity' }, { status: 500 })
      }
    }

    // Update the sales plan
    const { data: updatedPlan, error: updateError } = await (adminClient as any)
      .from('sales_plans')
      .update(updateData)
      .eq('plan_id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating sales plan potential status:', updateError)
      return NextResponse.json({ error: 'Failed to update potential status' }, { status: 500 })
    }

    return NextResponse.json({
      data: updatedPlan,
      message: is_potential
        ? 'Marked as potential - Lead, Account, and Opportunity created'
        : 'Marked as not potential'
    })

  } catch (error) {
    console.error('Error in POST /api/crm/sales-plans/[id]/potential:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
