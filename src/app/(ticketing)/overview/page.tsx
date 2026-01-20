// =====================================================
// Ticketing Overview Page
// Enhanced Dashboard with SLA metrics and performance
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OverviewDashboard } from '@/components/ticketing/overview-dashboard'

export const metadata = {
  title: 'Overview | UGC Business Command Portal',
  description: 'Ticketing dashboard and performance metrics',
}

export default async function OverviewPage() {
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  return <OverviewDashboard profile={profile} />
}
