// =====================================================
// Ticketing Overview Page - V2
// Paket 11: Comprehensive Dashboard with SLA, Response Metrics,
// Quotation Analytics, Ops Analytics, and Role-based Leaderboards
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OverviewDashboardV2 } from '@/components/ticketing/overview-dashboard-v2'

export const metadata = {
  title: 'Ticketing Overview | UGC Business Command Portal',
  description: 'Ticketing module dashboard and performance metrics',
}

export default async function OverviewPage() {
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  return <OverviewDashboardV2 profile={profile} />
}
