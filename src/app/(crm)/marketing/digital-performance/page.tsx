import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DigitalPerformanceDashboard } from '@/components/marketing/digital-performance-dashboard'

export const dynamic = 'force-dynamic'

export default async function DigitalPerformancePage() {
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  return <DigitalPerformanceDashboard />
}
