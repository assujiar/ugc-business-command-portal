// =====================================================
// CRM Sidebar Navigation
// Role-based menu visibility
// Mobile-responsive with off-canvas support
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  canAccessLeadInbox,
  canAccessSalesInbox,
  canAccessPipeline,
  canImportData,
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
}

const navigation = [
  { name: 'Overview', href: '/overview-crm', icon: LayoutDashboard, roles: 'all' },
  // Marketing routes
  { name: 'Lead Management', href: '/lead-management', icon: ClipboardList, permission: 'leadInbox' },
  // Sales routes
  { name: 'Lead Bidding', href: '/lead-bidding', icon: Gavel, permission: 'salesInbox' },
  { name: 'My Leads', href: '/my-leads', icon: Users, permission: 'salesInbox' },
  { name: 'Pipeline', href: '/pipeline', icon: TrendingUp, permission: 'pipeline' },
  { name: 'Accounts', href: '/accounts', icon: Building2, permission: 'pipeline' },
  { name: 'Sales Plan', href: '/sales-plan', icon: Target, permission: 'salesPlan' },
  { name: 'Activities', href: '/activities', icon: Calendar, permission: 'activities' },
  { name: 'Imports', href: '/imports', icon: Upload, permission: 'import' },
]

export function Sidebar({ profile, isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const [isCrmModuleExpanded, setIsCrmModuleExpanded] = useState(true)
  const [isTicketingModuleExpanded, setIsTicketingModuleExpanded] = useState(false)
  const [isMarketingPanelExpanded, setIsMarketingPanelExpanded] = useState(false)
  const [isDsoModuleExpanded, setIsDsoModuleExpanded] = useState(false)

  // Role checks
  const isOpsUser = isOps(profile.role)
  const isFinanceUser = isFinance(profile.role)
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
    // Close mobile menu when navigating
    if (onClose) {
      onClose()
    }
  }

  const sidebarContent = (
    <>
      <div className="p-4 border-b flex items-center justify-between">
        <Link href={isOpsUser ? '/overview-ticket' : isFinanceUser ? '/overview-crm' : '/overview-crm'} className="flex items-center gap-2" onClick={handleNavClick}>
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">UGC</span>
          </div>
          <div>
            <h1 className="font-semibold text-sm">Business Command</h1>
            <p className="text-xs text-muted-foreground">Portal</p>
          </div>
        </Link>
        {/* Mobile close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-2 rounded-md hover:bg-accent"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {/* CRM Module Parent Menu - visible for Sales, Marketing, Admin */}
        {showCRM && (
          <div>
            <button
              onClick={() => setIsCrmModuleExpanded(!isCrmModuleExpanded)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-colors',
                'text-foreground hover:bg-accent hover:text-accent-foreground font-medium'
              )}
            >
              <div className="flex items-center gap-3">
                <FolderKanban className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">CRM Module</span>
              </div>
              {isCrmModuleExpanded ? (
                <ChevronDown className="h-4 w-4 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 flex-shrink-0" />
              )}
            </button>

            {/* Submenu Items */}
            {isCrmModuleExpanded && (
              <div className="ml-3 mt-1 space-y-1 border-l border-border pl-3">
                {filteredNavigation.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={handleNavClick}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                        isActive
                          ? 'bg-brand text-white'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Ticketing Module Parent Menu */}
        {showTicketing && (
          <div>
            <button
              onClick={() => setIsTicketingModuleExpanded(!isTicketingModuleExpanded)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-colors',
                'text-foreground hover:bg-accent hover:text-accent-foreground font-medium'
              )}
            >
              <div className="flex items-center gap-3">
                <Ticket className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">Ticketing Module</span>
              </div>
              {isTicketingModuleExpanded ? (
                <ChevronDown className="h-4 w-4 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 flex-shrink-0" />
              )}
            </button>

            {/* Ticketing Submenu Items */}
            {isTicketingModuleExpanded && (
              <div className="ml-3 mt-1 space-y-1 border-l border-border pl-3">
                <Link
                  href="/overview-ticket"
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    pathname === '/overview-ticket'
                      ? 'bg-brand text-white'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">Overview</span>
                </Link>
                <Link
                  href="/tickets"
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    pathname === '/tickets' || pathname.startsWith('/tickets/')
                      ? 'bg-brand text-white'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Ticket className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">Tickets</span>
                </Link>
                <Link
                  href="/operational-costs"
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    pathname === '/operational-costs' || pathname.startsWith('/operational-costs/')
                      ? 'bg-brand text-white'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <FileText className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">Operational Costs</span>
                </Link>
                {/* Customer Quotations - visible to non-ops users only */}
                {!isOpsUser && (
                  <Link
                    href="/customer-quotations"
                    onClick={handleNavClick}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                      pathname === '/customer-quotations' || pathname.startsWith('/customer-quotations/')
                        ? 'bg-brand text-white'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">Customer Quotations</span>
                  </Link>
                )}
                {/* Performance - in ticketing context */}
                {showPerformance && (
                  <Link
                    href="/performance"
                    onClick={handleNavClick}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                      pathname === '/performance'
                        ? 'bg-brand text-white'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <BarChart3 className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">Performance</span>
                  </Link>
                )}
                <Link
                  href="/tickets/new"
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    pathname === '/tickets/new'
                      ? 'bg-brand text-white'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <PlusCircle className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">Create Ticket</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Marketing Panel Module */}
        {showMarketing && (
          <div>
            <button
              onClick={() => setIsMarketingPanelExpanded(!isMarketingPanelExpanded)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-colors',
                'text-foreground hover:bg-accent hover:text-accent-foreground font-medium'
              )}
            >
              <div className="flex items-center gap-3">
                <Megaphone className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">Marketing Panel</span>
              </div>
              {isMarketingPanelExpanded ? (
                <ChevronDown className="h-4 w-4 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 flex-shrink-0" />
              )}
            </button>

            {/* Marketing Panel Submenu Items */}
            {isMarketingPanelExpanded && (
              <div className="ml-3 mt-1 space-y-1 border-l border-border pl-3">
                <Link
                  href="/marketing/overview"
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    pathname === '/marketing/overview'
                      ? 'bg-brand text-white'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">Overview</span>
                </Link>
                <Link
                  href="/marketing/digital-performance"
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    pathname === '/marketing/digital-performance'
                      ? 'bg-brand text-white'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Globe className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">Digital Performance</span>
                </Link>
                <Link
                  href="/marketing/seo-sem"
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    pathname === '/marketing/seo-sem'
                      ? 'bg-brand text-white'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Search className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">SEO-SEM Performance</span>
                </Link>
                <Link
                  href="/marketing/email-marketing"
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    pathname === '/marketing/email-marketing'
                      ? 'bg-brand text-white'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Mail className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">Email Marketing</span>
                </Link>
                <Link
                  href="/marketing/content-plan"
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    pathname === '/marketing/content-plan'
                      ? 'bg-brand text-white'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <FileEdit className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">Content Plan</span>
                </Link>
                <Link
                  href="/marketing/design-request"
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    pathname === '/marketing/design-request'
                      ? 'bg-brand text-white'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Palette className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">Design Request</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* DSO/AR Module - Sales + Finance + Admin */}
        {showDSO && (
          <div>
            <button
              onClick={() => setIsDsoModuleExpanded(!isDsoModuleExpanded)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-colors',
                'text-foreground hover:bg-accent hover:text-accent-foreground font-medium'
              )}
            >
              <div className="flex items-center gap-3">
                <DollarSign className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">DSO/AR Module</span>
              </div>
              {isDsoModuleExpanded ? (
                <ChevronDown className="h-4 w-4 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 flex-shrink-0" />
              )}
            </button>

            {/* DSO/AR Submenu Items */}
            {isDsoModuleExpanded && (
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
      </nav>

      <div className="p-4 border-t">
        <div className="text-xs text-muted-foreground">
          <p>Logged in as:</p>
          <p className="font-medium text-foreground truncate">{profile.name}</p>
          <p className="text-brand">{profile.role}</p>
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-card border-r flex-col flex-shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Sidebar panel */}
          <aside className="relative w-72 max-w-[85vw] bg-card flex flex-col shadow-xl animate-in slide-in-from-left duration-300">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
