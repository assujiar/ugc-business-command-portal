// =====================================================
// Quotations List Page
// Displays all rate quotations with filtering
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuotationsDashboard } from '@/components/ticketing/quotations-dashboard'

export const metadata = {
  title: 'Quotations | UGC Business Command Portal',
  description: 'Manage rate quotations for RFQ tickets',
}

export default async function QuotationsPage() {
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  return <QuotationsDashboard profile={profile} />
}
