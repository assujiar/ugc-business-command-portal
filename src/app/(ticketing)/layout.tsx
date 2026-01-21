// =====================================================
// Ticketing Module Layout
// Reuses CRM Shell for consistent portal experience
// Protected layout with SSR session check
// =====================================================

import { redirect } from 'next/navigation'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { CRMShell } from '@/components/crm/crm-shell'
import { canAccessTicketing } from '@/lib/permissions'

export default async function TicketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, profile } = await getSessionAndProfile()

  // Protect route - redirect to login if not authenticated
  if (!user || !profile) {
    redirect('/login')
  }

  // Check ticketing access permission
  if (!canAccessTicketing(profile.role)) {
    redirect('/overview-crm')
  }

  return <CRMShell profile={profile}>{children}</CRMShell>
}
