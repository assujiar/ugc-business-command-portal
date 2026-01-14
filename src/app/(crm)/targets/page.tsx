// =====================================================
// Targets Page - Prospecting Targets
// SOURCE: PDF Section 5, Page 24
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { TargetsTable } from '@/components/crm/targets-table'

export default async function TargetsPage() {
  const supabase = await createClient()

  const { data: targets } = await supabase
    .from('v_targets_active')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Prospecting Targets</h1>
        <p className="text-muted-foreground">
          Research and outreach targets for prospecting
        </p>
      </div>

      <TargetsTable targets={targets || []} />
    </div>
  )
}
