// =====================================================
// Performance Page
// Team and department performance metrics and reports
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PerformanceDashboard } from '@/components/ticketing/performance-dashboard'

export const metadata = {
  title: 'Performance | UGC Business Command Portal',
  description: 'Team and department performance metrics',
}

export default async function PerformancePage() {
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  return <PerformanceDashboard profile={profile} />
}
