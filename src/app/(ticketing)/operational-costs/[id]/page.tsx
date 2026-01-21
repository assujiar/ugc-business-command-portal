// =====================================================
// Operational Cost Detail Page
// View and manage a specific operational cost
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OperationalCostDetail } from '@/components/ticketing/operational-cost-detail'

export const metadata = {
  title: 'Operational Cost Details | UGC Business Command Portal',
  description: 'View operational cost details',
}

interface OperationalCostPageProps {
  params: Promise<{ id: string }>
}

export default async function OperationalCostPage({ params }: OperationalCostPageProps) {
  const { id } = await params
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  return <OperationalCostDetail costId={id} profile={profile} />
}
