// =====================================================
// API Route: /api/crm/accounts/[id]/retry-prospect
// Retry prospecting for failed accounts
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStageConfig, calculateNextStepDueDate } from '@/lib/constants'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// POST /api/crm/accounts/[id]/retry-prospect - Create new lead and pipeline for failed account
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, role')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      company_name,
      pic_name,
      pic_email,
      pic_phone,
      industry,
      notes,
      potential_revenue
    } = body

    // Get current account
    const { data: account, error: accountError } = await (adminClient as any)
      .from('accounts')
      .select('*')
      .eq('account_id', id)
      .single()

    if (accountError || !account) {
      console.error('Account not found:', accountError)
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Log account status for debugging
    console.log('Account status check:', {
      account_id: id,
      account_status: account.account_status,
      account_status_type: typeof account.account_status
    })

    // Verify account is in failed status
    // Handle cases where account_status might not exist (migration not applied)
    const accountStatus = account.account_status
    if (accountStatus && accountStatus !== 'failed_account') {
      return NextResponse.json({
        error: `Only failed accounts can be re-prospected. Current status: ${accountStatus}`
      }, { status: 400 })
    }

    // Calculate new retry count
    const newRetryCount = (account.retry_count || 0) + 1

    // 1. Update account with new info and increment retry_count
    const { error: updateAccountError } = await (adminClient as any)
      .from('accounts')
      .update({
        company_name: company_name || account.company_name,
        pic_name: pic_name || account.pic_name,
        pic_email: pic_email || account.pic_email,
        pic_phone: pic_phone || account.pic_phone,
        industry: industry || account.industry,
        notes: notes || account.notes,
        account_status: 'calon_account', // Reset to calon_account
        retry_count: newRetryCount,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', id)

    if (updateAccountError) {
      console.error('Error updating account:', updateAccountError)
      return NextResponse.json({ error: 'Failed to update account' }, { status: 500 })
    }

    // 2. Create new lead with unique dedupe_key for retry
    const companyNameForLead = company_name || account.company_name
    const emailForLead = pic_email || account.pic_email || ''
    // Generate unique dedupe_key by appending retry count
    const dedupeKey = `${companyNameForLead.toLowerCase().trim()}-${emailForLead.toLowerCase().trim()}-retry${newRetryCount}`

    const leadData = {
      company_name: companyNameForLead,
      contact_name: pic_name || account.pic_name,
      contact_email: pic_email || account.pic_email,
      contact_phone: pic_phone || account.pic_phone,
      source: 'Retry Prospect',
      source_detail: `Retry attempt #${newRetryCount} from failed account`,
      notes: notes || account.notes,
      priority: 2,
      industry: industry || account.industry,
      potential_revenue: potential_revenue || 0,
      triage_status: 'Assign to Sales',
      claim_status: 'claimed',
      sales_owner_user_id: user.id,
      claimed_at: new Date().toISOString(),
      qualified_at: new Date().toISOString(),
      account_id: id,
      created_by: user.id,
      dedupe_key: dedupeKey, // Unique key for retry leads
    }

    const { data: newLead, error: leadError } = await (adminClient as any)
      .from('leads')
      .insert(leadData)
      .select()
      .single()

    if (leadError) {
      console.error('Error creating lead:', leadError)
      return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
    }

    // 3. Create new pipeline (opportunity) with attempt number
    const initialStage = 'Prospecting'
    const stageConfig = getStageConfig(initialStage)
    const nextStepDueDate = calculateNextStepDueDate(initialStage)

    const opportunityData = {
      name: `Pipeline - ${company_name || account.company_name}`,
      account_id: id,
      source_lead_id: newLead.lead_id,
      stage: initialStage,
      estimated_value: potential_revenue || 0,
      currency: 'IDR',
      probability: stageConfig?.probability || 10,
      owner_user_id: user.id,
      created_by: user.id,
      next_step: stageConfig?.nextStep || 'Initial Contact',
      next_step_due_date: nextStepDueDate.toISOString().split('T')[0],
      attempt_number: newRetryCount + 1, // +1 because first attempt was the original
    }

    const { data: newOpportunity, error: oppError } = await (adminClient as any)
      .from('opportunities')
      .insert(opportunityData)
      .select('opportunity_id')
      .single()

    if (oppError) {
      console.error('Error creating opportunity:', oppError)
      return NextResponse.json({ error: 'Failed to create pipeline' }, { status: 500 })
    }

    // 4. Update lead with opportunity_id
    await (adminClient as any)
      .from('leads')
      .update({ opportunity_id: newOpportunity.opportunity_id })
      .eq('lead_id', newLead.lead_id)

    // 5. Update account with new lead_id
    await (adminClient as any)
      .from('accounts')
      .update({ lead_id: newLead.lead_id })
      .eq('account_id', id)

    return NextResponse.json({
      data: {
        success: true,
        account_id: id,
        lead_id: newLead.lead_id,
        opportunity_id: newOpportunity.opportunity_id,
        attempt_number: newRetryCount + 1,
        message: `Successfully created retry prospect (Attempt #${newRetryCount + 1})`
      }
    })
  } catch (error) {
    console.error('Error in retry prospect:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
