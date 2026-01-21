// =====================================================
// Customer Quotations List Page
// Displays all customer quotations with filtering
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CustomerQuotationsDashboard } from '@/components/ticketing/customer-quotations-dashboard'
import { isOps } from '@/lib/permissions'

export const metadata = {
  title: 'Customer Quotations | UGC Business Command Portal',
  description: 'Manage customer quotations for RFQ tickets',
}

export default async function CustomerQuotationsPage() {
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  // Ops users should not access this page
  if (isOps(profile.role)) {
    redirect('/tickets')
  }

  return <CustomerQuotationsDashboard profile={profile} />
}
