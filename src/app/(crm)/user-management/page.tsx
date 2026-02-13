// =====================================================
// User Management Page
// Only accessible by Director and super admin
// =====================================================

import { redirect } from 'next/navigation'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/permissions'
import UserManagementClient from './user-management-client'

export const metadata = {
  title: 'User Management | UGC Business Command Portal',
  description: 'Manage users and roles',
}

export default async function UserManagementPage() {
  const { user, profile } = await getSessionAndProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  if (!isAdmin(profile.role)) {
    redirect('/overview-crm')
  }

  return <UserManagementClient />
}
