// =====================================================
// Customer Quotation Edit Page
// Edit an existing customer quotation
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CustomerQuotationEditForm } from '@/components/ticketing/customer-quotation-edit-form'
import { isOps } from '@/lib/permissions'

export const metadata = {
  title: 'Edit Customer Quotation | UGC Business Command Portal',
  description: 'Edit customer quotation details',
}

interface EditQuotationPageProps {
  params: Promise<{ id: string }>
}

export default async function EditQuotationPage({ params }: EditQuotationPageProps) {
  const { id } = await params
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  // Ops users should not access this page
  if (isOps(profile.role)) {
    redirect('/tickets')
  }

  return <CustomerQuotationEditForm quotationId={id} profile={profile} />
}
