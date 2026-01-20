// =====================================================
// Tickets List Page
// Displays all tickets with filtering and actions
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TicketsDashboard } from '@/components/ticketing/tickets-dashboard'

export const metadata = {
  title: 'Tickets | UGC Business Command Portal',
  description: 'Manage support tickets and rate quote requests',
}

export default async function TicketsPage() {
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  return <TicketsDashboard profile={profile} />
}
