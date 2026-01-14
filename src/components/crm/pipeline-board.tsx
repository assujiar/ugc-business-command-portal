// =====================================================
// Pipeline Board Component
// SOURCE: PDF Section 5 - Pipeline View
// Kanban-style board grouped by stage
// =====================================================

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatCurrency, formatDate, isOverdue } from '@/lib/utils'
import { OPPORTUNITY_STAGES } from '@/lib/constants'
import { MoreVertical, AlertCircle, ChevronRight } from 'lucide-react'

interface Opportunity {
  opportunity_id: string
  name: string
  stage: string
  estimated_value: number | null
  account_name: string
  owner_name: string | null
  next_step_due_date: string | null
  is_overdue: boolean
}

interface PipelineBoardProps {
  opportunities: Opportunity[]
}

const ACTIVE_STAGES = ['Prospecting', 'Discovery', 'Quote Sent', 'Negotiation', 'On Hold']

export function PipelineBoard({ opportunities }: PipelineBoardProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const handleStageChange = async (oppId: string, newStage: string) => {
    setIsLoading(oppId)
    try {
      const response = await fetch(`/api/crm/opportunities/${oppId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_stage: newStage }),
      })

      if (response.ok) {
        router.refresh()
      }
    } catch (error) {
      console.error('Error changing stage:', error)
    } finally {
      setIsLoading(null)
    }
  }

  const groupedOpps = ACTIVE_STAGES.reduce((acc, stage) => {
    acc[stage] = opportunities.filter((opp) => opp.stage === stage)
    return acc
  }, {} as Record<string, Opportunity[]>)

  const getStageClass = (stage: string) => {
    switch (stage) {
      case 'Prospecting':
        return 'stage-prospecting'
      case 'Discovery':
        return 'stage-discovery'
      case 'Quote Sent':
        return 'stage-quote-sent'
      case 'Negotiation':
        return 'stage-negotiation'
      case 'On Hold':
        return 'stage-on-hold'
      default:
        return ''
    }
  }

  const getNextStages = (currentStage: string) => {
    const idx = OPPORTUNITY_STAGES.indexOf(currentStage as any)
    return OPPORTUNITY_STAGES.slice(idx + 1)
  }

  return (
    <div className="grid grid-cols-5 gap-4 overflow-x-auto pb-4">
      {ACTIVE_STAGES.map((stage) => (
        <div key={stage} className={`min-w-[280px] rounded-lg border p-3 ${getStageClass(stage)}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">{stage}</h3>
            <Badge variant="secondary">{groupedOpps[stage]?.length || 0}</Badge>
          </div>

          <div className="space-y-2">
            {groupedOpps[stage]?.map((opp) => (
              <Card key={opp.opportunity_id} className="bg-card">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{opp.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {opp.account_name}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={isLoading === opp.opportunity_id}
                        >
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {getNextStages(opp.stage).map((nextStage) => (
                          <DropdownMenuItem
                            key={nextStage}
                            onClick={() => handleStageChange(opp.opportunity_id, nextStage)}
                          >
                            <ChevronRight className="h-4 w-4 mr-2" />
                            Move to {nextStage}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-brand">
                      {formatCurrency(opp.estimated_value)}
                    </span>
                    {opp.next_step_due_date && (
                      <span className={opp.is_overdue ? 'overdue flex items-center gap-1' : 'text-muted-foreground'}>
                        {opp.is_overdue && <AlertCircle className="h-3 w-3" />}
                        {formatDate(opp.next_step_due_date)}
                      </span>
                    )}
                  </div>

                  {opp.owner_name && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Owner: {opp.owner_name}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}

            {(!groupedOpps[stage] || groupedOpps[stage].length === 0) && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No opportunities
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
