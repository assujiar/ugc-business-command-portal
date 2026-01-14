// =====================================================
// CRM Layout with Sidebar Navigation
// SOURCE: PDF Section 5 - Page Routes
// Protected layout with SSR session check
// Mobile-responsive with collapsible sidebar
// =====================================================

import { redirect } from 'next/navigation'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { CRMShell } from '@/components/crm/crm-shell'

export default async function CRMLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, profile } = await getSessionAndProfile()

  // Protect route - redirect to login if not authenticated
  if (!user || !profile) {
    redirect('/login')
  }

  return <CRMShell profile={profile}>{children}</CRMShell>
}
