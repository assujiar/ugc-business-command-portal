'use client'

// =====================================================
// Pipeline Tabs Component
// Wraps Pipeline and Opportunity tabs
// =====================================================

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PipelineDashboard } from '@/components/crm/pipeline-dashboard'
import { OpportunityTab } from '@/components/crm/opportunity-tab'
import type { OpportunityStage, LostReason, UserRole } from '@/types/database'
import { LayoutDashboard, BarChart3 } from 'lucide-react'

interface StageHistory {
  new_stage: OpportunityStage
  changed_at: string
}

interface Opportunity {
  opportunity_id: string
  name: string
  stage: OpportunityStage
  estimated_value: number | null
  deal_value: number | null
  currency: string
  probability: number | null
  expected_close_date: string | null
  next_step: string | null
  next_step_due_date: string | null
  close_reason: string | null
  lost_reason: LostReason | null
  competitor_price: number | null
  customer_budget: number | null
  closed_at: string | null
  notes: string | null
  owner_user_id: string | null
  account_id: string | null
  lead_id: string | null
  created_at: string
  updated_at: string
  account_name: string | null
  account_status: string | null
  owner_name: string | null
  is_overdue: boolean
  stage_history?: StageHistory[]
  lead_source?: string | null
  // Creator info
  original_creator_id?: string | null
  original_creator_name?: string | null
  original_creator_role?: string | null
  original_creator_department?: string | null
  original_creator_is_marketing?: boolean
  lead_created_by?: string | null
  lead_marketing_owner?: string | null
  attempt_number?: number | null
}

interface PipelineTabsProps {
  opportunities: Opportunity[]
  currentUserId: string
  userRole?: UserRole | null
  canUpdate?: boolean
}

export function PipelineTabs({ opportunities, currentUserId, userRole, canUpdate = true }: PipelineTabsProps) {
  const [activeTab, setActiveTab] = useState<string>('pipeline')

  // Transform opportunities for OpportunityTab (it only needs specific fields)
  const opportunitiesForTab = opportunities.map(opp => ({
    opportunity_id: opp.opportunity_id,
    name: opp.name,
    stage: opp.stage,
    estimated_value: opp.estimated_value,
    owner_name: opp.owner_name,
    account_name: opp.account_name,
    lost_reason: opp.lost_reason,
    competitor_price: opp.competitor_price,
    customer_budget: opp.customer_budget,
    lead_source: opp.lead_source || null,
    created_at: opp.created_at,
    closed_at: opp.closed_at,
    // Lead creator info for Lead Source display
    original_creator_name: opp.original_creator_name || null,
    original_creator_department: opp.original_creator_department || null,
  }))

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="pipeline" className="flex items-center gap-2">
          <LayoutDashboard className="h-4 w-4" />
          <span className="hidden sm:inline">Pipeline</span>
        </TabsTrigger>
        <TabsTrigger value="opportunity" className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline">Opportunity</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pipeline" className="mt-0">
        <PipelineDashboard
          opportunities={opportunities}
          currentUserId={currentUserId}
          userRole={userRole}
          canUpdate={canUpdate}
        />
      </TabsContent>

      <TabsContent value="opportunity" className="mt-0">
        <OpportunityTab opportunities={opportunitiesForTab} />
      </TabsContent>
    </Tabs>
  )
}
