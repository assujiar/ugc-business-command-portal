'use client'

// =====================================================
// Opportunity Tab Component
// Shows opportunity summary cards and table with filters
// =====================================================

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { LOST_REASONS } from '@/lib/constants'
import type { OpportunityStage, LostReason } from '@/types/database'
import { PipelineDetailDialog } from './pipeline-detail-dialog'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  XCircle,
  CheckCircle,
  Clock,
  X,
  AlertTriangle,
  Calculator,
  Loader,
  Eye,
} from 'lucide-react'

interface Opportunity {
  opportunity_id: string
  name: string
  stage: OpportunityStage
  estimated_value: number | null
  owner_name: string | null
  account_name: string | null
  lost_reason: LostReason | null
  competitor_price: number | null
  customer_budget: number | null
  lead_source: string | null
  created_at: string | null
  closed_at: string | null
  // Lead creator info for Lead Source display
  original_creator_name: string | null
  original_creator_department: string | null
}

interface OpportunityTabProps {
  opportunities: Opportunity[]
}

type FilterType = 'all' | 'lost_rev' | 'won_rev' | 'on_progress_rev' | 'total_rev' | 'lost_opp' | 'won_opp' | 'on_progress_opp' | LostReason

export function OpportunityTab({ opportunities }: OpportunityTabProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)

  const handleViewPipeline = (opportunityId: string) => {
    setSelectedOpportunityId(opportunityId)
    setDetailDialogOpen(true)
  }

  // Calculate statistics
  const stats = useMemo(() => {
    const total = opportunities.length
    const totalRevenue = opportunities.reduce((sum, o) => sum + (o.estimated_value || 0), 0)

    const lostOpps = opportunities.filter(o => o.stage === 'Closed Lost')
    const wonOpps = opportunities.filter(o => o.stage === 'Closed Won')
    const onProgressOpps = opportunities.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage))

    const lostRevenue = lostOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0)
    const wonRevenue = wonOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0)
    const onProgressRevenue = onProgressOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0)

    // Group by lost reason
    const lostByReason = LOST_REASONS.map(reason => {
      const filtered = lostOpps.filter(o => o.lost_reason === reason.value)
      const count = filtered.length
      const revenue = filtered.reduce((sum, o) => sum + (o.estimated_value || 0), 0)
      return {
        reason: reason.value,
        label: reason.label,
        count,
        countPercent: lostOpps.length > 0 ? (count / lostOpps.length * 100) : 0,
        revenue,
        revenuePercent: lostRevenue > 0 ? (revenue / lostRevenue * 100) : 0,
      }
    }).filter(r => r.count > 0)

    // Calculate average revenue per opportunity
    const avgRevenuePerOpportunity = total > 0 ? totalRevenue / total : 0

    return {
      total,
      totalRevenue,
      avgRevenuePerOpportunity,
      lost: {
        count: lostOpps.length,
        countPercent: total > 0 ? (lostOpps.length / total * 100) : 0,
        revenue: lostRevenue,
        revenuePercent: totalRevenue > 0 ? (lostRevenue / totalRevenue * 100) : 0,
      },
      won: {
        count: wonOpps.length,
        countPercent: total > 0 ? (wonOpps.length / total * 100) : 0,
        revenue: wonRevenue,
        revenuePercent: totalRevenue > 0 ? (wonRevenue / totalRevenue * 100) : 0,
      },
      onProgress: {
        count: onProgressOpps.length,
        countPercent: total > 0 ? (onProgressOpps.length / total * 100) : 0,
        revenue: onProgressRevenue,
        revenuePercent: totalRevenue > 0 ? (onProgressRevenue / totalRevenue * 100) : 0,
      },
      lostByReason,
    }
  }, [opportunities])

  // Filter opportunities based on active filter
  const filteredOpportunities = useMemo(() => {
    switch (activeFilter) {
      case 'lost_rev':
      case 'lost_opp':
        return opportunities.filter(o => o.stage === 'Closed Lost')
      case 'won_rev':
      case 'won_opp':
        return opportunities.filter(o => o.stage === 'Closed Won')
      case 'on_progress_rev':
      case 'on_progress_opp':
        return opportunities.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage))
      case 'total_rev':
        return opportunities // Show all for total revenue
      default:
        // Check if it's a lost reason filter
        if (LOST_REASONS.some(r => r.value === activeFilter)) {
          return opportunities.filter(o => o.stage === 'Closed Lost' && o.lost_reason === activeFilter)
        }
        return opportunities
    }
  }, [opportunities, activeFilter])

  const getLostReasonLabel = (reason: LostReason | null): string => {
    if (!reason) return '-'
    const found = LOST_REASONS.find(r => r.value === reason)
    return found?.label || reason
  }

  const getStageColor = (stage: OpportunityStage): string => {
    switch (stage) {
      case 'Closed Won': return 'bg-green-100 text-green-800'
      case 'Closed Lost': return 'bg-red-100 text-red-800'
      case 'Prospecting': return 'bg-blue-100 text-blue-800'
      case 'Discovery': return 'bg-cyan-100 text-cyan-800'
      case 'Quote Sent': return 'bg-yellow-100 text-yellow-800'
      case 'Negotiation': return 'bg-orange-100 text-orange-800'
      case 'On Hold': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const clearFilter = () => setActiveFilter('all')

  const hasActiveFilter = activeFilter !== 'all'

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Summary Cards - Revenue Opportunity */}
      <div>
        <h3 className="text-xs lg:text-sm font-medium text-muted-foreground mb-2">Revenue Opportunity Summary</h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 lg:gap-3">
          {/* Lost Revenue */}
          <Card
            className={`cursor-pointer transition-all hover:shadow-md ${
              activeFilter === 'lost_rev' ? 'ring-2 ring-red-500' : ''
            }`}
            onClick={() => setActiveFilter(activeFilter === 'lost_rev' ? 'all' : 'lost_rev')}
          >
            <CardContent className="p-2 lg:p-4">
              <div className="flex items-center justify-between">
                <div className="p-1.5 lg:p-2 rounded-lg bg-red-100">
                  <TrendingDown className="h-4 w-4 lg:h-5 lg:w-5 text-red-600" />
                </div>
                <div className="text-right">
                  <p className="text-sm lg:text-lg font-bold text-red-600">
                    {formatCurrency(stats.lost.revenue)}
                  </p>
                  <p className="text-[10px] lg:text-xs text-muted-foreground">
                    {stats.lost.revenuePercent.toFixed(1)}%
                  </p>
                </div>
              </div>
              <p className="text-xs lg:text-sm text-muted-foreground mt-1 lg:mt-2">Lost Rev</p>
            </CardContent>
          </Card>

          {/* Won Revenue */}
          <Card
            className={`cursor-pointer transition-all hover:shadow-md ${
              activeFilter === 'won_rev' ? 'ring-2 ring-green-500' : ''
            }`}
            onClick={() => setActiveFilter(activeFilter === 'won_rev' ? 'all' : 'won_rev')}
          >
            <CardContent className="p-2 lg:p-4">
              <div className="flex items-center justify-between">
                <div className="p-1.5 lg:p-2 rounded-lg bg-green-100">
                  <TrendingUp className="h-4 w-4 lg:h-5 lg:w-5 text-green-600" />
                </div>
                <div className="text-right">
                  <p className="text-sm lg:text-lg font-bold text-green-600">
                    {formatCurrency(stats.won.revenue)}
                  </p>
                  <p className="text-[10px] lg:text-xs text-muted-foreground">
                    {stats.won.revenuePercent.toFixed(1)}%
                  </p>
                </div>
              </div>
              <p className="text-xs lg:text-sm text-muted-foreground mt-1 lg:mt-2">Won Rev</p>
            </CardContent>
          </Card>

          {/* On Progress Revenue */}
          <Card
            className={`cursor-pointer transition-all hover:shadow-md ${
              activeFilter === 'on_progress_rev' ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => setActiveFilter(activeFilter === 'on_progress_rev' ? 'all' : 'on_progress_rev')}
          >
            <CardContent className="p-2 lg:p-4">
              <div className="flex items-center justify-between">
                <div className="p-1.5 lg:p-2 rounded-lg bg-blue-100">
                  <Clock className="h-4 w-4 lg:h-5 lg:w-5 text-blue-600" />
                </div>
                <div className="text-right">
                  <p className="text-sm lg:text-lg font-bold text-blue-600">
                    {formatCurrency(stats.onProgress.revenue)}
                  </p>
                  <p className="text-[10px] lg:text-xs text-muted-foreground">
                    {stats.onProgress.revenuePercent.toFixed(1)}%
                  </p>
                </div>
              </div>
              <p className="text-xs lg:text-sm text-muted-foreground mt-1 lg:mt-2">Progress Rev</p>
            </CardContent>
          </Card>

          {/* Total Revenue Opportunity */}
          <Card
            className={`cursor-pointer transition-all hover:shadow-md ${
              activeFilter === 'total_rev' ? 'ring-2 ring-purple-500' : ''
            }`}
            onClick={() => setActiveFilter(activeFilter === 'total_rev' ? 'all' : 'total_rev')}
          >
            <CardContent className="p-2 lg:p-4">
              <div className="flex items-center justify-between">
                <div className="p-1.5 lg:p-2 rounded-lg bg-purple-100">
                  <DollarSign className="h-4 w-4 lg:h-5 lg:w-5 text-purple-600" />
                </div>
                <div className="text-right">
                  <p className="text-sm lg:text-lg font-bold text-purple-600">
                    {formatCurrency(stats.totalRevenue)}
                  </p>
                  <p className="text-[10px] lg:text-xs text-muted-foreground">
                    100%
                  </p>
                </div>
              </div>
              <p className="text-xs lg:text-sm text-muted-foreground mt-1 lg:mt-2">Total Rev</p>
            </CardContent>
          </Card>

          {/* Avg Revenue per Opportunity */}
          <Card className="cursor-default col-span-2 lg:col-span-1">
            <CardContent className="p-2 lg:p-4">
              <div className="flex items-center justify-between">
                <div className="p-1.5 lg:p-2 rounded-lg bg-indigo-100">
                  <Calculator className="h-4 w-4 lg:h-5 lg:w-5 text-indigo-600" />
                </div>
                <div className="text-right">
                  <p className="text-sm lg:text-lg font-bold text-indigo-600">
                    {formatCurrency(stats.avgRevenuePerOpportunity)}
                  </p>
                  <p className="text-[10px] lg:text-xs text-muted-foreground">
                    per opp
                  </p>
                </div>
              </div>
              <p className="text-xs lg:text-sm text-muted-foreground mt-1 lg:mt-2">Avg Rev/Opp</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Summary Cards - Opportunity Count */}
      <div>
        <h3 className="text-xs lg:text-sm font-medium text-muted-foreground mb-2">Opportunity Summary</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
          {/* Lost Opportunity */}
          <Card
            className={`cursor-pointer transition-all hover:shadow-md ${
              activeFilter === 'lost_opp' ? 'ring-2 ring-red-500' : ''
            }`}
            onClick={() => setActiveFilter(activeFilter === 'lost_opp' ? 'all' : 'lost_opp')}
          >
            <CardContent className="p-2 lg:p-4">
              <div className="flex items-center justify-between">
                <div className="p-1.5 lg:p-2 rounded-lg bg-red-100">
                  <XCircle className="h-4 w-4 lg:h-5 lg:w-5 text-red-600" />
                </div>
                <div className="text-right">
                  <p className="text-xl lg:text-2xl font-bold text-red-600">{stats.lost.count}</p>
                  <p className="text-[10px] lg:text-xs text-muted-foreground">
                    {stats.lost.countPercent.toFixed(1)}%
                  </p>
                </div>
              </div>
              <p className="text-xs lg:text-sm text-muted-foreground mt-1 lg:mt-2">Lost Opp</p>
            </CardContent>
          </Card>

          {/* Won Opportunity */}
          <Card
            className={`cursor-pointer transition-all hover:shadow-md ${
              activeFilter === 'won_opp' ? 'ring-2 ring-green-500' : ''
            }`}
            onClick={() => setActiveFilter(activeFilter === 'won_opp' ? 'all' : 'won_opp')}
          >
            <CardContent className="p-2 lg:p-4">
              <div className="flex items-center justify-between">
                <div className="p-1.5 lg:p-2 rounded-lg bg-green-100">
                  <CheckCircle className="h-4 w-4 lg:h-5 lg:w-5 text-green-600" />
                </div>
                <div className="text-right">
                  <p className="text-xl lg:text-2xl font-bold text-green-600">{stats.won.count}</p>
                  <p className="text-[10px] lg:text-xs text-muted-foreground">
                    {stats.won.countPercent.toFixed(1)}%
                  </p>
                </div>
              </div>
              <p className="text-xs lg:text-sm text-muted-foreground mt-1 lg:mt-2">Won Opp</p>
            </CardContent>
          </Card>

          {/* On Progress Opportunity */}
          <Card
            className={`cursor-pointer transition-all hover:shadow-md ${
              activeFilter === 'on_progress_opp' ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => setActiveFilter(activeFilter === 'on_progress_opp' ? 'all' : 'on_progress_opp')}
          >
            <CardContent className="p-2 lg:p-4">
              <div className="flex items-center justify-between">
                <div className="p-1.5 lg:p-2 rounded-lg bg-blue-100">
                  <Loader className="h-4 w-4 lg:h-5 lg:w-5 text-blue-600" />
                </div>
                <div className="text-right">
                  <p className="text-xl lg:text-2xl font-bold text-blue-600">{stats.onProgress.count}</p>
                  <p className="text-[10px] lg:text-xs text-muted-foreground">
                    {stats.onProgress.countPercent.toFixed(1)}%
                  </p>
                </div>
              </div>
              <p className="text-xs lg:text-sm text-muted-foreground mt-1 lg:mt-2">Progress Opp</p>
            </CardContent>
          </Card>

          {/* Total Opportunity */}
          <Card className="cursor-default">
            <CardContent className="p-2 lg:p-4">
              <div className="flex items-center justify-between">
                <div className="p-1.5 lg:p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                  <Target className="h-4 w-4 lg:h-5 lg:w-5 text-gray-600 dark:text-gray-300" />
                </div>
                <div className="text-right">
                  <p className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
                  <p className="text-[10px] lg:text-xs text-muted-foreground">100%</p>
                </div>
              </div>
              <p className="text-xs lg:text-sm text-muted-foreground mt-1 lg:mt-2">Total Opp</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Lost Reason Breakdown */}
      {stats.lostByReason.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Lost Reason Breakdown</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {stats.lostByReason.map((item) => (
              <Card
                key={item.reason}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  activeFilter === item.reason ? 'ring-2 ring-orange-500' : ''
                }`}
                onClick={() => setActiveFilter(activeFilter === item.reason ? 'all' : item.reason as LostReason)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{item.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px] px-1">
                          {item.count} ({item.countPercent.toFixed(0)}%)
                        </Badge>
                      </div>
                      <p className="text-xs text-red-600 mt-1">
                        {formatCurrency(item.revenue)} ({item.revenuePercent.toFixed(0)}%)
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Active Filter Banner */}
      {hasActiveFilter && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
          <span className="text-sm text-muted-foreground">Filter:</span>
          <Badge variant="secondary" className="gap-1">
            {activeFilter === 'lost_rev' && 'Lost Revenue'}
            {activeFilter === 'won_rev' && 'Won Revenue'}
            {activeFilter === 'on_progress_rev' && 'On Progress Revenue'}
            {activeFilter === 'total_rev' && 'Total Revenue'}
            {activeFilter === 'lost_opp' && 'Lost Opportunity'}
            {activeFilter === 'won_opp' && 'Won Opportunity'}
            {activeFilter === 'on_progress_opp' && 'On Progress Opportunity'}
            {LOST_REASONS.some(r => r.value === activeFilter) &&
              LOST_REASONS.find(r => r.value === activeFilter)?.label}
            <X
              className="h-3 w-3 cursor-pointer"
              onClick={clearFilter}
            />
          </Badge>
          <Button variant="ghost" size="sm" onClick={clearFilter}>
            Clear
          </Button>
        </div>
      )}

      {/* Opportunity Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base lg:text-lg">
            Opportunities ({filteredOpportunities.length})
            {hasActiveFilter && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                (filtered from {opportunities.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 lg:p-6 lg:pt-0">
          {filteredOpportunities.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Opportunity ID</TableHead>
                      <TableHead>Sales Name</TableHead>
                      <TableHead>Lead Source</TableHead>
                      <TableHead>Account Name</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Create Date</TableHead>
                      <TableHead>Closed Date</TableHead>
                      <TableHead>Reason Lost</TableHead>
                      <TableHead className="text-right">Competitor Price</TableHead>
                      <TableHead className="text-right">Customer Budget</TableHead>
                      <TableHead className="text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOpportunities.map((opp) => (
                      <TableRow key={opp.opportunity_id}>
                        <TableCell className="font-mono text-xs">
                          {opp.opportunity_id.substring(0, 8)}...
                        </TableCell>
                        <TableCell>{opp.owner_name || '-'}</TableCell>
                        <TableCell className="min-w-[150px]">
                          {opp.original_creator_name || opp.lead_source ? (
                            <div className="space-y-0.5">
                              {opp.original_creator_name && (
                                <p className="text-sm font-medium">
                                  {opp.original_creator_name}
                                  {opp.original_creator_department && (
                                    <span className="text-muted-foreground"> - {opp.original_creator_department}</span>
                                  )}
                                </p>
                              )}
                              {opp.lead_source && (
                                <p className="text-xs text-muted-foreground">
                                  via {opp.lead_source}
                                </p>
                              )}
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {opp.account_name || '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(opp.estimated_value)}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStageColor(opp.stage)}>
                            {opp.stage}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {opp.created_at ? formatDate(opp.created_at) : '-'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {opp.closed_at ? formatDate(opp.closed_at) : '-'}
                        </TableCell>
                        <TableCell>
                          {opp.stage === 'Closed Lost' ? (
                            <span className="text-xs text-red-600">
                              {getLostReasonLabel(opp.lost_reason)}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {opp.competitor_price ? formatCurrency(opp.competitor_price) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {opp.customer_budget ? formatCurrency(opp.customer_budget) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewPipeline(opp.opportunity_id)}
                            title="View Pipeline"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden divide-y">
                {filteredOpportunities.map((opp) => (
                  <div key={opp.opportunity_id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-sm truncate">{opp.account_name || 'Unnamed'}</h4>
                        <p className="text-xs text-muted-foreground">{opp.owner_name || 'No owner'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${getStageColor(opp.stage)} text-xs`}>
                          {opp.stage}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleViewPipeline(opp.opportunity_id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-lg font-bold">{formatCurrency(opp.estimated_value)}</p>
                      <span className="text-xs text-muted-foreground">
                        {opp.created_at ? formatDate(opp.created_at) : '-'}
                      </span>
                    </div>

                    {opp.stage === 'Closed Lost' && opp.lost_reason && (
                      <div className="flex items-center gap-1 text-xs text-red-600">
                        <AlertTriangle className="h-3 w-3" />
                        {getLostReasonLabel(opp.lost_reason)}
                      </div>
                    )}

                    {(opp.original_creator_name || opp.lead_source) && (
                      <div className="text-xs text-muted-foreground">
                        <span>Source: </span>
                        {opp.original_creator_name && <span className="font-medium">{opp.original_creator_name}</span>}
                        {opp.lead_source && <span> via {opp.lead_source}</span>}
                      </div>
                    )}

                    {(opp.competitor_price || opp.customer_budget) && (
                      <div className="flex gap-4 text-xs">
                        {opp.competitor_price && (
                          <div>
                            <span className="text-muted-foreground">Competitor: </span>
                            <span className="font-medium">{formatCurrency(opp.competitor_price)}</span>
                          </div>
                        )}
                        {opp.customer_budget && (
                          <div>
                            <span className="text-muted-foreground">Budget: </span>
                            <span className="font-medium">{formatCurrency(opp.customer_budget)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 px-4">
              <p className="text-muted-foreground">No opportunities found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline Detail Dialog */}
      <PipelineDetailDialog
        opportunityId={selectedOpportunityId}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />
    </div>
  )
}
