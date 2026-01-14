// =====================================================
// CRM Layout with Sidebar Navigation
// SOURCE: PDF Section 5 - Page Routes
// Protected layout with SSR session check
// =====================================================

import { redirect } from 'next/navigation'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { Sidebar } from '@/components/crm/sidebar'
import { Header } from '@/components/crm/header'

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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar profile={profile} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header profile={profile} />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
