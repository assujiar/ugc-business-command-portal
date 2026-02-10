// =====================================================
// Root Page - Role-based redirect
// =====================================================

import { redirect } from 'next/navigation'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { getDefaultRedirect } from '@/lib/permissions'

export default async function RootPage() {
  const { profile } = await getSessionAndProfile()
  const redirectPath = getDefaultRedirect(profile?.role)
  redirect(redirectPath)
}
