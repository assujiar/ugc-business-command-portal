// =====================================================
// Profile Settings Page
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileSettingsClient } from './profile-settings-client'

export default async function ProfilePage() {
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  return <ProfileSettingsClient profile={profile} userEmail={user.email || ''} />
}
