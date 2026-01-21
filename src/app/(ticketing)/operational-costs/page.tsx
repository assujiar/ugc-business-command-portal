// =====================================================
// Operational Costs List Page
// Displays all operational costs with filtering
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OperationalCostsDashboard } from '@/components/ticketing/operational-costs-dashboard'

export const metadata = {
  title: 'Operational Costs | UGC Business Command Portal',
  description: 'Manage operational costs for RFQ tickets',
}

export default async function OperationalCostsPage() {
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  return <OperationalCostsDashboard profile={profile} />
}
