// =====================================================
// CRM Shell - Client wrapper for mobile navigation
// Manages mobile sidebar state
// =====================================================

'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/crm/sidebar'
import { Header } from '@/components/crm/header'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface CRMShellProps {
  profile: Profile
  children: React.ReactNode
}

export function CRMShell({ profile, children }: CRMShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        profile={profile}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header
          profile={profile}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
