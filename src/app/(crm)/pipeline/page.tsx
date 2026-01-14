// =====================================================
// Pipeline Page - Active Opportunities
// SOURCE: PDF Section 5, Page 17
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { PipelineBoard } from '@/components/crm/pipeline-board'

export default async function PipelinePage() {
  const supabase = await createClient()

  const { data: opportunities } = await supabase
    .from('v_pipeline_active')
    .select('*')
    .order('next_step_due_date', { ascending: true })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-muted-foreground">
          Active opportunities across all stages
        </p>
      </div>

      <PipelineBoard opportunities={opportunities || []} />
    </div>
  )
}
