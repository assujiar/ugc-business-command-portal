// =====================================================
// CRM Sidebar Navigation
// Role-based menu visibility
// Mobile-responsive with off-canvas support
// Desktop: collapsible (icon-only / icon+text)
// =====================================================

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Users,
  Building2,
  Target,
  TrendingUp,
  Calendar,
  Upload,
  LayoutDashboard,
  ClipboardList,
  Gavel,
  X,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Ticket,
  FileText,
  BarChart3,
  PlusCircle,
  Megaphone,
  Globe,
  Search,
  Mail,
  FileEdit,
  Palette,
  DollarSign,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  canAccessLeadInbox,
  canAccessSalesInbox,
  canAccessPipeline,
  canImportData,
  isAdmin,
  canAccessSalesPlan,
  canAccessActivities,
  canAccessTicketing,
  canAccessMarketingPanel,
  canAccessDSO,
  canAccessCRM,
  canAccessPerformancePage,
  isOps,
  isFinance,
} from '@/lib/permissions'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface SidebarProps {
  profile: Profile
  isOpen?: boolean
  onClose?: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

const navigation = [
  { name: 'Overview', href: '/overview-crm', icon: LayoutDashboard, roles: 'all' },
  { name: 'Lead Management', href: '/lead-management', icon: ClipboardList, permission: 'leadInbox' },
  { name: 'Lead Bidding', href: '/lead-bidding', icon: Gavel, permission: 'salesInbox' },
  { name: 'My Leads', href: '/my-leads', icon: Users, permission: 'salesInbox' },
  { name: 'Pipeline', href: '/pipeline', icon: TrendingUp, permission: 'pipeline' },
  { name: 'Accounts', href: '/accounts', icon: Building2, permission: 'pipeline' },
  { name: 'Sales Plan', href: '/sales-plan', icon: Target, permission: 'salesPlan' },
  { name: 'Activities', href: '/activities', icon: Calendar, permission: 'activities' },
  { name: 'Imports', href: '/imports', icon: Upload, permission: 'import' },
]

export function Sidebar({ profile, isOpen = false, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname()
  const [isCrmModuleExpanded, setIsCrmModuleExpanded] = useState(true)
  const [isTicketingModuleExpanded, setIsTicketingModuleExpanded] = useState(false)
  const [isMarketingPanelExpanded, setIsMarketingPanelExpanded] = useState(false)
  const [isDsoModuleExpanded, setIsDsoModuleExpanded] = useState(false)

  // Role checks
  const isOpsUser = isOps(profile.role)
  const isFinanceUser = isFinance(profile.role)
  const isAdminUser = isAdmin(profile.role)
  const showCRM = canAccessCRM(profile.role)
  const showTicketing = canAccessTicketing(profile.role)
  const showMarketing = canAccessMarketingPanel(profile.role)
  const showDSO = canAccessDSO(profile.role)
  const showPerformance = canAccessPerformancePage(profile.role)

  const filteredNavigation = navigation.filter((item) => {
    if (item.roles === 'all') return true
    if (item.permission === 'leadInbox') return canAccessLeadInbox(profile.role)
    if (item.permission === 'salesInbox') return canAccessSalesInbox(profile.role)
    if (item.permission === 'pipeline') return canAccessPipeline(profile.role)
    if (item.permission === 'import') return canImportData(profile.role)
    if (item.permission === 'salesPlan') return canAccessSalesPlan(profile.role)
    if (item.permission === 'activities') return canAccessActivities(profile.role)
    return true
  })

  const handleNavClick = () => {
    if (onClose) onClose()
  }

  // Helper: render a nav link item
  const renderNavLink = (
    href: string,
    Icon: React.ElementType,
    label: string,
    isActive: boolean,
    collapsed: boolean,
  ) => (
    <Link
      href={href}
      onClick={handleNavClick}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md text-sm transition-colors',
        collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2',
        isActive
          ? 'bg-brand text-white'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )

  // Helper: render a module group header
  const renderModuleHeader = (
    Icon: React.ElementType,
    label: string,
    isExpanded: boolean,
    onToggle: () => void,
    collapsed: boolean,
  ) => (
    <button
      onClick={collapsed ? onToggleCollapse : onToggle}
      title={collapsed ? label : undefined}
      className={cn(
        'w-full flex items-center rounded-md text-sm transition-colors',
        'text-foreground hover:bg-accent hover:text-accent-foreground font-medium',
        collapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-3 py-2.5'
      )}
    >
      <div className={cn('flex items-center', collapsed ? '' : 'gap-3')}>
        <Icon className="h-4 w-4 flex-shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </div>
      {!collapsed && (
        isExpanded
          ? <ChevronDown className="h-4 w-4 flex-shrink-0" />
          : <ChevronRight className="h-4 w-4 flex-shrink-0" />
      )}
    </button>
  )

  // Build sidebar content (accepts collapsed param for reuse in mobile=expanded)
  const buildSidebarContent = (collapsed: boolean) => (
    <>
      {/* Header / Logo */}
      <div className={cn('border-b flex items-center', collapsed ? 'justify-center p-3' : 'justify-between p-4')}>
        <Link
          href={isOpsUser ? '/overview-ticket' : '/overview-crm'}
          className={cn('flex items-center', collapsed ? '' : 'gap-2')}
          onClick={handleNavClick}
        >
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">UGC</span>
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-semibold text-sm">Business Command</h1>
              <p className="text-xs text-muted-foreground">Portal</p>
            </div>
          )}
        </Link>
        {/* Mobile close button */}
        {!collapsed && onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-2 rounded-md hover:bg-accent"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className={cn('flex-1 space-y-1 overflow-y-auto', collapsed ? 'p-2' : 'p-4')}>
        {/* CRM Module */}
        {showCRM && (
          <div>
            {renderModuleHeader(FolderKanban, 'CRM Module', isCrmModuleExpanded, () => setIsCrmModuleExpanded(!isCrmModuleExpanded), collapsed)}
            {!collapsed && isCrmModuleExpanded && (
              <div className="ml-3 mt-1 space-y-1 border-l border-border pl-3">
                {filteredNavigation.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <div key={item.name}>
                      {renderNavLink(item.href, item.icon, item.name, isActive, false)}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Ticketing Module */}
        {showTicketing && (
          <div>
            {renderModuleHeader(Ticket, 'Ticketing Module', isTicketingModuleExpanded, () => setIsTicketingModuleExpanded(!isTicketingModuleExpanded), collapsed)}
            {!collapsed && isTicketingModuleExpanded && (
              <div className="ml-3 mt-1 space-y-1 border-l border-border pl-3">
                {renderNavLink('/overview-ticket', LayoutDashboard, 'Overview', pathname === '/overview-ticket', false)}
                {renderNavLink('/tickets', Ticket, 'Tickets', pathname === '/tickets' || pathname.startsWith('/tickets/'), false)}
                {renderNavLink('/operational-costs', FileText, 'Operational Costs', pathname === '/operational-costs' || pathname.startsWith('/operational-costs/'), false)}
                {!isOpsUser && renderNavLink('/customer-quotations', FileText, 'Customer Quotations', pathname === '/customer-quotations' || pathname.startsWith('/customer-quotations/'), false)}
                {showPerformance && renderNavLink('/performance', BarChart3, 'Performance', pathname === '/performance', false)}
                {renderNavLink('/tickets/new', PlusCircle, 'Create Ticket', pathname === '/tickets/new', false)}
              </div>
            )}
          </div>
        )}

        {/* Marketing Panel Module */}
        {showMarketing && (
          <div>
            {renderModuleHeader(Megaphone, 'Marketing Panel', isMarketingPanelExpanded, () => setIsMarketingPanelExpanded(!isMarketingPanelExpanded), collapsed)}
            {!collapsed && isMarketingPanelExpanded && (
              <div className="ml-3 mt-1 space-y-1 border-l border-border pl-3">
                {renderNavLink('/marketing/overview', LayoutDashboard, 'Overview', pathname === '/marketing/overview', false)}
                {renderNavLink('/marketing/digital-performance', Globe, 'Digital Performance', pathname === '/marketing/digital-performance', false)}
                {renderNavLink('/marketing/seo-sem', Search, 'SEO-SEM Performance', pathname === '/marketing/seo-sem', false)}
                {renderNavLink('/marketing/email-marketing', Mail, 'Email Marketing', pathname === '/marketing/email-marketing', false)}
                {renderNavLink('/marketing/content-plan', FileEdit, 'Content Plan', pathname === '/marketing/content-plan', false)}
                {renderNavLink('/marketing/design-request', Palette, 'Design Request', pathname === '/marketing/design-request', false)}
              </div>
            )}
          </div>
        )}

        {/* DSO/AR Module */}
        {showDSO && (
          <div>
            {renderModuleHeader(DollarSign, 'DSO/AR Module', isDsoModuleExpanded, () => setIsDsoModuleExpanded(!isDsoModuleExpanded), collapsed)}
            {!collapsed && isDsoModuleExpanded && (
              <div className="ml-3 mt-1 space-y-1 border-l border-border pl-3">
                <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground/50 cursor-default">
                  <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">Overview DSO</span>
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">Soon</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Admin: User Management (standalone link, not in a module group) */}
        {isAdminUser && (
          <div className="mt-2 pt-2 border-t border-border">
            {renderNavLink('/user-management', Shield, 'User Management', pathname === '/user-management', collapsed)}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className={cn('border-t', collapsed ? 'p-2' : 'p-4')}>
        {!collapsed && (
          <div className="text-xs text-muted-foreground mb-3">
            <p>Logged in as:</p>
            <p className="font-medium text-foreground truncate">{profile.name}</p>
            <p className="text-brand">{profile.role}</p>
          </div>
        )}
        {/* Collapse/Expand toggle - desktop only */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'hidden lg:flex items-center gap-2 rounded-md text-sm transition-colors w-full',
              'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              collapsed ? 'justify-center p-2' : 'px-3 py-2'
            )}
          >
            {collapsed
              ? <PanelLeftOpen className="h-4 w-4 flex-shrink-0" />
              : <PanelLeftClose className="h-4 w-4 flex-shrink-0" />
            }
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
      </div>
    </>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex bg-card border-r flex-col flex-shrink-0 transition-all duration-300',
          isCollapsed ? 'w-[60px]' : 'w-64'
        )}
      >
        {buildSidebarContent(isCollapsed)}
      </aside>

      {/* Mobile Sidebar Overlay (always expanded) */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-card flex flex-col shadow-xl animate-in slide-in-from-left duration-300">
            {buildSidebarContent(false)}
          </aside>
        </div>
      )}
    </>
  )
}
