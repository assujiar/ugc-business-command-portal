'use client'

// =====================================================
// Growth Insights Card Component
// Displays AI-generated growth insights with regenerate
// =====================================================

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  Target,
  ArrowRight,
  AlertCircle,
  Clock,
  CalendarClock,
} from 'lucide-react'
import type { InsightFilters, InsightOutput, InsightResponse, Recommendation, SummaryTableRow, YearEndOutlook } from '@/types/insights'

interface GrowthInsightsCardProps {
  filters: InsightFilters
  className?: string
}

export function GrowthInsightsCard({ filters, className }: GrowthInsightsCardProps) {
  const [insight, setInsight] = useState<InsightResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

  // Fetch latest insight
  const fetchInsight = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (filters.startDate) params.set('startDate', filters.startDate)
      if (filters.endDate) params.set('endDate', filters.endDate)
      if (filters.salespersonId) params.set('salespersonId', filters.salespersonId)
      if (filters.source) params.set('source', filters.source)

      const response = await fetch(`/api/crm/insights?${params.toString()}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch insight')
      }

      setInsight(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch insight')
    } finally {
      setLoading(false)
    }
  }, [filters])

  // Regenerate insight
  const regenerateInsight = async () => {
    try {
      setRegenerating(true)
      setError(null)

      const response = await fetch('/api/crm/insights/regenerate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: filters.startDate,
          endDate: filters.endDate,
          salespersonId: filters.salespersonId,
          source: filters.source,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to regenerate insight')
      }

      setInsight(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate insight')
    } finally {
      setRegenerating(false)
    }
  }

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchInsight()
  }, [fetchInsight])

  // Loading state
  if (loading) {
    return <InsightsSkeleton />
  }

  // No insight yet
  const hasInsight = insight?.insight && insight.status === 'completed'

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <CardTitle className="text-base lg:text-lg">AI Insights & Summary</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {hasInsight && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="h-8"
              >
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={regenerateInsight}
              disabled={regenerating}
              className="h-8"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${regenerating ? 'animate-spin' : ''}`} />
              {regenerating ? 'Generating...' : hasInsight ? 'Regenerate' : 'Generate Insight'}
            </Button>
          </div>
        </div>
        {hasInsight && insight.generated_at && (
          <CardDescription className="flex items-center gap-1 text-xs">
            <Clock className="h-3 w-3" />
            Generated {formatRelativeTime(insight.generated_at)}
          </CardDescription>
        )}
      </CardHeader>

      {error && (
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        </CardContent>
      )}

      {!hasInsight && !error && (
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-purple-300" />
            <p className="text-sm mb-4">
              No insights generated yet. Click &quot;Generate Insight&quot; to get AI-powered analysis of your dashboard data.
            </p>
          </div>
        </CardContent>
      )}

      {hasInsight && expanded && (
        <CardContent className="pt-0 space-y-6">
          <InsightContent insight={insight.insight as InsightOutput} />
        </CardContent>
      )}
    </Card>
  )
}

// =====================================================
// Sub-components
// =====================================================

function InsightContent({ insight }: { insight: InsightOutput }) {
  return (
    <>
      {/* Executive Summary */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 rounded-lg p-4">
        <p className="text-sm leading-relaxed">{insight.executive_summary}</p>
      </div>

      {/* Summary Table */}
      {insight.summary_table && insight.summary_table.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            Key Metrics
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Metric</th>
                  <th className="text-right py-2 font-medium">Current</th>
                  <th className="text-right py-2 font-medium">Previous</th>
                  <th className="text-right py-2 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {insight.summary_table.map((row, idx) => (
                  <SummaryRow key={idx} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Key Points */}
      {insight.key_points && insight.key_points.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Key Points
          </h4>
          <ul className="space-y-2">
            {insight.key_points.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <span className="text-green-500 mt-0.5">+</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risks & Mitigations */}
      {insight.risks && insight.risks.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Risks
            </h4>
            <ul className="space-y-2">
              {insight.risks.map((risk, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-amber-500 mt-0.5">!</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </div>
          {insight.mitigations && insight.mitigations.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-500" />
                Mitigations
              </h4>
              <ul className="space-y-2">
                {insight.mitigations.map((mitigation, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <span className="text-blue-500 mt-0.5">-</span>
                    <span>{mitigation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {insight.recommendations && insight.recommendations.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-yellow-500" />
            Recommendations
          </h4>
          <div className="space-y-3">
            {insight.recommendations.map((rec, idx) => (
              <RecommendationCard key={idx} recommendation={rec} />
            ))}
          </div>
        </div>
      )}

      {/* Next Steps */}
      {insight.next_steps && insight.next_steps.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-purple-500" />
            Next Steps
          </h4>
          <ol className="space-y-2">
            {insight.next_steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <span className="text-purple-500 font-medium min-w-[1.5rem]">{idx + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Year End Outlook */}
      {insight.year_end_outlook && (
        <YearEndOutlookSection outlook={insight.year_end_outlook} />
      )}

      {/* Data Gaps */}
      {insight.data_gaps && insight.data_gaps.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="font-medium text-sm mb-2 text-muted-foreground flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Data Limitations
          </h4>
          <ul className="space-y-1">
            {insight.data_gaps.map((gap, idx) => (
              <li key={idx} className="text-xs text-muted-foreground">
                - {gap}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function SummaryRow({ row }: { row: SummaryTableRow }) {
  const getDeltaColor = (delta: string | null | undefined) => {
    if (!delta) return 'text-muted-foreground'
    if (delta.startsWith('+')) return 'text-green-600'
    if (delta.startsWith('-')) return 'text-red-600'
    return 'text-muted-foreground'
  }

  const getDeltaIcon = (delta: string | null | undefined) => {
    if (!delta) return <Minus className="h-3 w-3" />
    if (delta.startsWith('+')) return <TrendingUp className="h-3 w-3" />
    if (delta.startsWith('-')) return <TrendingDown className="h-3 w-3" />
    return <Minus className="h-3 w-3" />
  }

  return (
    <tr className="border-b last:border-0">
      <td className="py-2">
        <div>
          <span>{row.metric}</span>
          {row.note && (
            <p className="text-xs text-muted-foreground">{row.note}</p>
          )}
        </div>
      </td>
      <td className="text-right py-2 font-medium">{row.current}</td>
      <td className="text-right py-2 text-muted-foreground">
        {row.previous || '-'}
      </td>
      <td className={`text-right py-2 ${getDeltaColor(row.delta)}`}>
        <span className="flex items-center justify-end gap-1">
          {getDeltaIcon(row.delta)}
          {row.delta || '-'}
        </span>
      </td>
    </tr>
  )
}

function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const getEffortColor = (effort: string) => {
    switch (effort) {
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
      case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h5 className="font-medium text-sm">{recommendation.title}</h5>
        <div className="flex gap-1 flex-shrink-0">
          <Badge variant="outline" className={`text-xs ${getEffortColor(recommendation.effort)}`}>
            Effort: {recommendation.effort}
          </Badge>
          <Badge variant="outline" className={`text-xs ${getImpactColor(recommendation.impact)}`}>
            Impact: {recommendation.impact}
          </Badge>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-2">{recommendation.rationale}</p>
      {recommendation.owner_role && (
        <p className="text-xs text-muted-foreground">
          Owner: <span className="font-medium">{recommendation.owner_role}</span>
        </p>
      )}
    </div>
  )
}

function YearEndOutlookSection({ outlook }: { outlook: YearEndOutlook }) {
  const getScenarioBadge = (scenario: string) => {
    switch (scenario) {
      case 'optimistic':
        return <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Optimistic</Badge>
      case 'pessimistic':
        return <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">Pessimistic</Badge>
      default:
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">Baseline</Badge>
    }
  }

  return (
    <div className="border-t pt-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-indigo-500" />
          Year-End Outlook
        </h4>
        {getScenarioBadge(outlook.scenario)}
      </div>

      {/* Warning Banner */}
      {outlook.warning && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">{outlook.warning}</p>
          </div>
        </div>
      )}

      {/* Projected Metrics Table */}
      {outlook.projected_metrics && outlook.projected_metrics.length > 0 && (
        <div className="mb-4">
          <h5 className="text-xs font-medium text-muted-foreground mb-2">Projected Metrics</h5>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs">
                  <th className="text-left py-2 font-medium">Metric</th>
                  <th className="text-right py-2 font-medium">Current Run Rate</th>
                  <th className="text-right py-2 font-medium">Year-End Projection</th>
                </tr>
              </thead>
              <tbody>
                {outlook.projected_metrics.map((metric, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2">
                      <div>
                        <span className="font-medium">{metric.metric}</span>
                        {metric.assumption && (
                          <p className="text-xs text-muted-foreground">{metric.assumption}</p>
                        )}
                      </div>
                    </td>
                    <td className="text-right py-2">{metric.current_run_rate}</td>
                    <td className="text-right py-2 font-medium">{metric.projected_year_end}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Key Assumptions */}
      {outlook.key_assumptions && outlook.key_assumptions.length > 0 && (
        <div className="mb-4">
          <h5 className="text-xs font-medium text-muted-foreground mb-2">Key Assumptions</h5>
          <ul className="space-y-1">
            {outlook.key_assumptions.map((assumption, idx) => (
              <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-gray-400">•</span>
                <span>{assumption}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvement Opportunities */}
      {outlook.improvement_opportunities && outlook.improvement_opportunities.length > 0 && (
        <div>
          <h5 className="text-xs font-medium text-muted-foreground mb-2">Improvement Opportunities</h5>
          <ul className="space-y-1">
            {outlook.improvement_opportunities.map((opportunity, idx) => (
              <li key={idx} className="text-sm flex items-start gap-2">
                <span className="text-green-500">+</span>
                <span>{opportunity}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function InsightsSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-48" />
          </div>
          <Skeleton className="h-8 w-32" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </CardContent>
    </Card>
  )
}

// =====================================================
// Utilities
// =====================================================

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
