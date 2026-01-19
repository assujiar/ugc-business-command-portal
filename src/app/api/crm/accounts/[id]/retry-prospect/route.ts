// =====================================================
// API Route: /api/crm/accounts/[id]/retry-prospect
// Retry prospecting for failed accounts
// Creates new pipeline only (no new lead)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStageConfig, calculateNextStepDueDate } from '@/lib/constants'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

// POST /api/crm/accounts/[id]/retry-prospect - Create new pipeline for failed account
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

    // Determine the original creator for marketing visibility
    // Priority: account.original_creator_id > original_lead.created_by > earliest_lead_by_marketing > current_lead.created_by > account.created_by
    let marketingOriginalCreatorId = account.original_creator_id

    // Marketing roles for checking if creator is from marketing
    const marketingRoles = ['Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO']

    // If no original_creator_id on account, look up from leads
    if (!marketingOriginalCreatorId) {
      // First try original_lead_id
      if (account.original_lead_id) {
        const { data: originalLead } = await (adminClient as any)
          .from('leads')
          .select('created_by')
          .eq('lead_id', account.original_lead_id)
          .single()
        if (originalLead?.created_by) {
          marketingOriginalCreatorId = originalLead.created_by
        }
      }

      // If still not found, search for the EARLIEST lead linked to this account that was created by marketing
      // This handles cases where original_lead_id was not set (pre-migration accounts)
      if (!marketingOriginalCreatorId) {
        const { data: leadsForAccount } = await (adminClient as any)
          .from('leads')
          .select('lead_id, created_by, created_at')
          .eq('account_id', id)
          .order('created_at', { ascending: true })
          .limit(10) // Get first 10 leads to find marketing creator

        if (leadsForAccount && leadsForAccount.length > 0) {
          // Get creator IDs to lookup their profiles
          const creatorIds = Array.from(new Set(leadsForAccount.map((l: any) => l.created_by).filter(Boolean))) as string[]

          let creatorsMap: Record<string, { role: string | null; department: string | null }> = {}
          if (creatorIds.length > 0) {
            const { data: profiles } = await (adminClient as any)
              .from('profiles')
              .select('user_id, role, department')
              .in('user_id', creatorIds)

            creatorsMap = (profiles || []).reduce((acc: any, p: any) => {
              acc[p.user_id] = { role: p.role, department: p.department }
              return acc
            }, {})
          }

          // Find the first lead created by a marketing user
          for (const lead of leadsForAccount) {
            const creator = creatorsMap[lead.created_by]
            if (!creator) continue

            // Check if creator is from marketing
            if (creator.role && marketingRoles.includes(creator.role)) {
              marketingOriginalCreatorId = lead.created_by
              console.log('Found marketing creator from earliest lead:', lead.lead_id, creator.role)
              break
            }
            if (creator.department && creator.department.toLowerCase().includes('marketing')) {
              marketingOriginalCreatorId = lead.created_by
              console.log('Found marketing creator from earliest lead (by dept):', lead.lead_id, creator.department)
              break
            }
          }

          // If no marketing creator found, use the earliest lead's creator
          if (!marketingOriginalCreatorId && leadsForAccount[0]?.created_by) {
            marketingOriginalCreatorId = leadsForAccount[0].created_by
          }
        }
      }

      // Fallback: try current lead_id
      if (!marketingOriginalCreatorId && account.lead_id) {
        const { data: currentLead } = await (adminClient as any)
          .from('leads')
          .select('created_by')
          .eq('lead_id', account.lead_id)
          .single()
        if (currentLead?.created_by) {
          marketingOriginalCreatorId = currentLead.created_by
        }
      }

      // Last fallback: account.created_by
      if (!marketingOriginalCreatorId) {
        marketingOriginalCreatorId = account.created_by
      }
    }

    console.log('Retry prospect - Original creator lookup:', {
      account_id: id,
      account_original_creator_id: account.original_creator_id,
      account_original_lead_id: account.original_lead_id,
      account_lead_id: account.lead_id,
      account_created_by: account.created_by,
      resolved_original_creator: marketingOriginalCreatorId
    })

    // Log account status for debugging
    console.log('Account status check:', {
      account_id: id,
      account_status: account.account_status,
      account_status_type: typeof account.account_status
    })

    // Verify account is in failed status
    const accountStatus = account.account_status
    if (accountStatus && accountStatus !== 'failed_account') {
      return NextResponse.json({
        error: `Only failed accounts can be re-prospected. Current status: ${accountStatus}`
      }, { status: 400 })
    }

    // Calculate new retry count
    const newRetryCount = (account.retry_count || 0) + 1

    // 1. Update account with new info and increment retry_count
    // Also set original_creator_id if not already set (for marketing visibility on future retries)
    const accountUpdateData: Record<string, unknown> = {
      company_name: company_name || account.company_name,
      pic_name: pic_name || account.pic_name,
      pic_email: pic_email || account.pic_email,
      pic_phone: pic_phone || account.pic_phone,
      industry: industry || account.industry,
      notes: notes || account.notes,
      account_status: 'calon_account', // Reset to calon_account
      retry_count: newRetryCount,
      updated_at: new Date().toISOString(),
    }

    // Preserve original_creator_id on account if not already set
    if (!account.original_creator_id && marketingOriginalCreatorId) {
      accountUpdateData.original_creator_id = marketingOriginalCreatorId
    }

    const { error: updateAccountError } = await (adminClient as any)
      .from('accounts')
      .update(accountUpdateData)
      .eq('account_id', id)

    if (updateAccountError) {
      console.error('Error updating account:', updateAccountError)
      return NextResponse.json({ error: 'Failed to update account' }, { status: 500 })
    }

    // 2. Create new pipeline (opportunity) with attempt number
    // No new lead is created - we use the existing lead_id from account
    const initialStage = 'Prospecting'
    const stageConfig = getStageConfig(initialStage)
    const nextStepDueDate = calculateNextStepDueDate(initialStage)

    const opportunityData = {
      name: `Pipeline - ${company_name || account.company_name}`,
      account_id: id,
      source_lead_id: account.lead_id || account.original_lead_id || null, // Use existing lead
      stage: initialStage,
      estimated_value: potential_revenue || 0,
      currency: 'IDR',
      probability: stageConfig?.probability || 10,
      owner_user_id: user.id,
      created_by: user.id,
      next_step: stageConfig?.nextStep || 'Initial Contact',
      next_step_due_date: nextStepDueDate.toISOString().split('T')[0],
      attempt_number: newRetryCount + 1, // +1 because first attempt was the original
      // Preserve original creator for marketing visibility
      // Uses the resolved marketingOriginalCreatorId which tracks the original lead creator
      original_creator_id: marketingOriginalCreatorId,
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

    return NextResponse.json({
      data: {
        success: true,
        account_id: id,
        opportunity_id: newOpportunity.opportunity_id,
        attempt_number: newRetryCount + 1,
        original_creator_id: marketingOriginalCreatorId,
        message: `Successfully created retry pipeline (Attempt #${newRetryCount + 1})`
      }
    })
  } catch (error) {
    console.error('Error in retry prospect:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
