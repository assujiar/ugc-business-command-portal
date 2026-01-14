// =====================================================
// Dashboard Page
// SOURCE: PDF Section 5 - Dashboard Overview
// Mobile-responsive design
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Inbox, TrendingUp, Building2, Calendar, Users, Target } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Fetch dashboard stats
  const [
    { count: leadCount },
    { count: oppCount },
    { count: accountCount },
    { count: activityCount },
  ] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }),
    supabase.from('opportunities').select('*', { count: 'exact', head: true }).not('stage', 'in', '("Closed Won","Closed Lost")'),
    supabase.from('accounts').select('*', { count: 'exact', head: true }),
    supabase.from('activities').select('*', { count: 'exact', head: true }).eq('status', 'Planned'),
  ])

  const stats = [
    { name: 'Active Leads', value: leadCount || 0, icon: Users, color: 'text-blue-500' },
    { name: 'Open Opportunities', value: oppCount || 0, icon: TrendingUp, color: 'text-green-500' },
    { name: 'Accounts', value: accountCount || 0, icon: Building2, color: 'text-purple-500' },
    { name: 'Pending Activities', value: activityCount || 0, icon: Calendar, color: 'text-orange-500' },
  ]

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome to UGC Business Command Portal CRM</p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 lg:p-6 lg:pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium truncate">{stat.name}</CardTitle>
              <stat.icon className={`h-3 w-3 lg:h-4 lg:w-4 ${stat.color} flex-shrink-0`} />
            </CardHeader>
            <CardContent className="p-3 pt-0 lg:p-6 lg:pt-0">
              <div className="text-xl lg:text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3 lg:pb-6">
            <CardTitle className="text-base lg:text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 lg:space-y-2">
            <a href="/lead-management" className="flex items-center gap-2 lg:gap-3 p-2 lg:p-3 rounded-lg hover:bg-muted transition-colors">
              <Inbox className="h-4 w-4 lg:h-5 lg:w-5 text-brand flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-sm lg:text-base">Lead Management</p>
                <p className="text-xs lg:text-sm text-muted-foreground truncate">Review and triage new leads</p>
              </div>
            </a>
            <a href="/lead-bidding" className="flex items-center gap-2 lg:gap-3 p-2 lg:p-3 rounded-lg hover:bg-muted transition-colors">
              <Users className="h-4 w-4 lg:h-5 lg:w-5 text-brand flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-sm lg:text-base">Lead Bidding</p>
                <p className="text-xs lg:text-sm text-muted-foreground truncate">Claim leads from handover pool</p>
              </div>
            </a>
            <a href="/pipeline" className="flex items-center gap-2 lg:gap-3 p-2 lg:p-3 rounded-lg hover:bg-muted transition-colors">
              <TrendingUp className="h-4 w-4 lg:h-5 lg:w-5 text-brand flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-sm lg:text-base">Pipeline</p>
                <p className="text-xs lg:text-sm text-muted-foreground truncate">View active opportunities</p>
              </div>
            </a>
            <a href="/targets" className="flex items-center gap-2 lg:gap-3 p-2 lg:p-3 rounded-lg hover:bg-muted transition-colors">
              <Target className="h-4 w-4 lg:h-5 lg:w-5 text-brand flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-sm lg:text-base">Sales Plan</p>
                <p className="text-xs lg:text-sm text-muted-foreground truncate">Manage prospect research</p>
              </div>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 lg:pb-6">
            <CardTitle className="text-base lg:text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs lg:text-sm">
              Activity feed will be displayed here showing recent CRM actions.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
