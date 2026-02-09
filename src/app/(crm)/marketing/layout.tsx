import { redirect } from 'next/navigation'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { canAccessMarketingPanel } from '@/lib/permissions'

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  if (!canAccessMarketingPanel(profile.role)) {
    redirect('/overview-crm')
  }

  return <>{children}</>
}
