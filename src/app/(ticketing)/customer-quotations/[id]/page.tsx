// =====================================================
// Customer Quotation Detail Page
// View and manage a specific customer quotation
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CustomerQuotationDetail } from '@/components/ticketing/customer-quotation-detail'
import { isOps } from '@/lib/permissions'

export const metadata = {
  title: 'Customer Quotation Details | UGC Business Command Portal',
  description: 'View customer quotation details',
}

interface CustomerQuotationPageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerQuotationPage({ params }: CustomerQuotationPageProps) {
  const { id } = await params
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  // Ops users should not access this page
  if (isOps(profile.role)) {
    redirect('/tickets')
  }

  return <CustomerQuotationDetail quotationId={id} profile={profile} />
}
