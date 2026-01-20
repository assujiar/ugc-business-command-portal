// =====================================================
// Quotation Detail Page
// View and manage a specific quotation
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuotationDetail } from '@/components/ticketing/quotation-detail'

export const metadata = {
  title: 'Quotation Details | UGC Business Command Portal',
  description: 'View quotation details',
}

interface QuotationPageProps {
  params: Promise<{ id: string }>
}

export default async function QuotationPage({ params }: QuotationPageProps) {
  const { id } = await params
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  return <QuotationDetail quotationId={id} profile={profile} />
}
