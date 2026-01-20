// =====================================================
// Ticket Detail Page
// Displays ticket details with timeline, comments, actions
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TicketDetail } from '@/components/ticketing/ticket-detail'

export const metadata = {
  title: 'Ticket Detail | UGC Business Command Portal',
  description: 'View and manage ticket details',
}

interface TicketDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function TicketDetailPage({ params }: TicketDetailPageProps) {
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  const { id } = await params
  const supabase = await createClient()

  // Fetch ticket with relations
  const { data: ticket, error } = await supabase
    .from('tickets')
    .select(`
      *,
      creator:profiles!tickets_created_by_fkey(user_id, name, email),
      assignee:profiles!tickets_assigned_to_fkey(user_id, name, email),
      account:accounts!tickets_account_id_fkey(account_id, company_name)
    `)
    .eq('id', id)
    .single()

  if (error || !ticket) {
    notFound()
  }

  return <TicketDetail ticket={ticket} profile={profile} />
}
