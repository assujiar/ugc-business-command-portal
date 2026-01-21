// =====================================================
// Account Detail Page
// Displays account details with contacts, opportunities, activities
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AccountDetail } from '@/components/crm/account-detail'

export const metadata = {
  title: 'Account Detail | UGC Business Command Portal',
  description: 'View and manage account details',
}

interface AccountDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function AccountDetailPage({ params }: AccountDetailPageProps) {
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  const { id } = await params
  const supabase = await createClient()

  // Fetch account with relations
  const { data: account, error } = await (supabase as any)
    .from('accounts')
    .select(`
      *,
      owner:profiles!accounts_owner_user_id_fkey(user_id, name, email),
      contacts(*),
      opportunities(
        opportunity_id,
        name,
        stage,
        estimated_value,
        expected_close_date,
        owner_user_id
      )
    `)
    .eq('account_id', id)
    .single()

  if (error) {
    console.error('Error fetching account:', error.message, 'account_id:', id, 'user_role:', profile.role)
    notFound()
  }

  if (!account) {
    console.error('Account not found:', id)
    notFound()
  }

  // Fetch recent activities for this account
  const { data: activities } = await (supabase as any)
    .from('activities')
    .select(`
      *,
      owner:profiles!activities_owner_user_id_fkey(user_id, name)
    `)
    .eq('related_account_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Fetch tickets linked to this account
  const { data: tickets } = await (supabase as any)
    .from('tickets')
    .select(`
      id,
      ticket_code,
      subject,
      status,
      priority,
      ticket_type,
      created_at
    `)
    .eq('account_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <AccountDetail
      account={account}
      activities={activities || []}
      tickets={tickets || []}
      profile={profile}
    />
  )
}
