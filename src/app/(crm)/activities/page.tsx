// =====================================================
// Activities Page
// SOURCE: PDF Section 5 - Activities Planner
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { ActivitiesTable } from '@/components/crm/activities-table'

interface ActivityPlanner {
  activity_id: string
  activity_type: string
  subject: string
  description: string | null
  status: string
  due_date: string
  account_name: string | null
  opportunity_name: string | null
  lead_company: string | null
  owner_user_id: string
}

export default async function ActivitiesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: activities } = user
    ? await supabase
        .from('v_activities_planner')
        .select('*')
        .eq('owner_user_id', user.id)
        .order('due_date', { ascending: true }) as { data: ActivityPlanner[] | null }
    : { data: null }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activities</h1>
        <p className="text-muted-foreground">
          Manage your tasks, calls, and meetings
        </p>
      </div>

      <ActivitiesTable activities={activities || []} />
    </div>
  )
}
