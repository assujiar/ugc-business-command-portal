// =====================================================
// Create Ticket Page
// Form to create new RFQ or General Inquiry ticket
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateTicketForm } from '@/components/ticketing/create-ticket-form'

export const metadata = {
  title: 'Create Ticket | UGC Business Command Portal',
  description: 'Create a new support ticket or rate quote request',
}

export default async function CreateTicketPage() {
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create Ticket</h1>
        <p className="text-muted-foreground">
          Submit a new support ticket or request for quote
        </p>
      </div>

      <CreateTicketForm profile={profile} />
    </div>
  )
}
