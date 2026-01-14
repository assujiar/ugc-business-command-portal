// =====================================================
// CRM Sidebar Navigation
// SOURCE: PDF Section 5 - Page Routes
// =====================================================

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Inbox,
  Users,
  Building2,
  Target,
  TrendingUp,
  Calendar,
  Upload,
  Leaf,
  XCircle,
  LayoutDashboard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { canAccessLeadInbox, canAccessSalesInbox, canAccessPipeline, canImportData } from '@/lib/permissions'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface SidebarProps {
  profile: Profile
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: 'all' },
  { name: 'Lead Inbox', href: '/lead-inbox', icon: Inbox, permission: 'leadInbox' },
  { name: 'Sales Inbox', href: '/sales-inbox', icon: Inbox, permission: 'salesInbox' },
  { name: 'My Leads', href: '/my-leads', icon: Users, permission: 'salesInbox' },
  { name: 'Pipeline', href: '/pipeline', icon: TrendingUp, permission: 'pipeline' },
  { name: 'Accounts', href: '/accounts', icon: Building2, permission: 'pipeline' },
  { name: 'Activities', href: '/activities', icon: Calendar, roles: 'all' },
  { name: 'Targets', href: '/targets', icon: Target, permission: 'salesInbox' },
  { name: 'Nurture Leads', href: '/nurture-leads', icon: Leaf, permission: 'leadInbox' },
  { name: 'Disqualified', href: '/disqualified-leads', icon: XCircle, permission: 'leadInbox' },
  { name: 'Imports', href: '/imports', icon: Upload, permission: 'import' },
]

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname()

  const filteredNavigation = navigation.filter((item) => {
    if (item.roles === 'all') return true
    if (item.permission === 'leadInbox') return canAccessLeadInbox(profile.role)
    if (item.permission === 'salesInbox') return canAccessSalesInbox(profile.role)
    if (item.permission === 'pipeline') return canAccessPipeline(profile.role)
    if (item.permission === 'import') return canImportData(profile.role)
    return true
  })

  return (
    <aside className="w-64 bg-card border-r flex flex-col">
      <div className="p-4 border-b">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">UGC</span>
          </div>
          <div>
            <h1 className="font-semibold text-sm">Business Command</h1>
            <p className="text-xs text-muted-foreground">CRM Module</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {filteredNavigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-brand text-white'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t">
        <div className="text-xs text-muted-foreground">
          <p>Logged in as:</p>
          <p className="font-medium text-foreground truncate">{profile.name}</p>
          <p className="text-brand">{profile.role}</p>
        </div>
      </div>
    </aside>
  )
}
