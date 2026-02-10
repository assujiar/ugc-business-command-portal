// =====================================================
// CRM Shell - Client wrapper for mobile navigation
// Manages mobile sidebar state + desktop collapse state
// =====================================================

'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/crm/sidebar'
import { Header } from '@/components/crm/header'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface CRMShellProps {
  profile: Profile
  children: React.ReactNode
}

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed'

export function CRMShell({ profile, children }: CRMShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Restore collapsed state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (stored === 'true') setIsCollapsed(true)
  }, [])

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        profile={profile}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapsed}
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
