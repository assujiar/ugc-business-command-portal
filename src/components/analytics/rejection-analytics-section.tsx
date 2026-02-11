'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  XCircle,
  DollarSign,
  Users,
  TrendingDown,
  BarChart3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface RejectionAnalyticsSectionProps {
  profile: Profile
}

// Rejection reason labels
const quotationReasonLabels: Record<string, string> = {
  tarif_tidak_masuk: 'Tarif tidak masuk',
  kompetitor_lebih_murah: 'Kompetitor lebih murah',
  budget_customer_tidak_cukup: 'Budget customer tidak cukup',
  service_tidak_sesuai: 'Service tidak sesuai',
  waktu_tidak_sesuai: 'Waktu tidak sesuai',
  other: 'Lainnya',
}

const costReasonLabels: Record<string, string> = {
  harga_terlalu_tinggi: 'Harga terlalu tinggi',
  margin_tidak_mencukupi: 'Margin tidak mencukupi',
  vendor_tidak_sesuai: 'Vendor tidak sesuai',
  waktu_tidak_sesuai: 'Waktu tidak sesuai',
  perlu_revisi: 'Perlu revisi',
  other: 'Lainnya',
}

interface QuotationRejectionAnalytics {
  reason_type: string
  count: number
  percentage: number
  avg_competitor_amount: number | null
  avg_customer_budget: number | null
  month: string
}

interface CostRejectionAnalytics {
  reason_type: string
  count: number
  percentage: number
  avg_suggested_amount: number | null
  month: string
}

export function RejectionAnalyticsSection({ profile }: RejectionAnalyticsSectionProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [quotationAnalytics, setQuotationAnalytics] = useState<QuotationRejectionAnalytics[]>([])
  const [costAnalytics, setCostAnalytics] = useState<CostRejectionAnalytics[]>([])

  // Fetch rejection analytics from views
  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch quotation rejection analytics
      const quotationResponse = await fetch('/api/ticketing/analytics/quotation-rejections')
      if (quotationResponse.ok) {
        const quotationResult = await quotationResponse.json()
        if (quotationResult.success) {
          setQuotationAnalytics(quotationResult.data || [])
        }
      }

      // Fetch cost rejection analytics
      const costResponse = await fetch('/api/ticketing/analytics/cost-rejections')
      if (costResponse.ok) {
        const costResult = await costResponse.json()
        if (costResult.success) {
          setCostAnalytics(costResult.data || [])
        }
      }
    } catch (err: any) {
      console.error('Error fetching rejection analytics:', err)
      toast({
        title: 'Error',
        description: err.message || 'Failed to load rejection analytics',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  // Define aggregation types
  type QuotationAggregation = {
    count: number
    totalCompetitorAmount: number
    competitorCount: number
    totalBudget: number
    budgetCount: number
  }

  type CostAggregation = {
    count: number
    totalSuggestedAmount: number
    suggestedCount: number
  }

  // Aggregate quotation analytics by reason type
  const aggregatedQuotationReasons = quotationAnalytics.reduce<Record<string, QuotationAggregation>>((acc, item) => {
    if (!acc[item.reason_type]) {
      acc[item.reason_type] = {
        count: 0,
        totalCompetitorAmount: 0,
        competitorCount: 0,
        totalBudget: 0,
        budgetCount: 0,
      }
    }
    acc[item.reason_type].count += item.count
    if (item.avg_competitor_amount) {
      acc[item.reason_type].totalCompetitorAmount += item.avg_competitor_amount * item.count
      acc[item.reason_type].competitorCount += item.count
    }
    if (item.avg_customer_budget) {
      acc[item.reason_type].totalBudget += item.avg_customer_budget * item.count
      acc[item.reason_type].budgetCount += item.count
    }
    return acc
  }, {})

  const totalQuotationRejections = Object.values(aggregatedQuotationReasons).reduce((sum: number, r: QuotationAggregation) => sum + r.count, 0)

  // Aggregate cost analytics by reason type
  const aggregatedCostReasons = costAnalytics.reduce<Record<string, CostAggregation>>((acc, item) => {
    if (!acc[item.reason_type]) {
      acc[item.reason_type] = {
        count: 0,
        totalSuggestedAmount: 0,
        suggestedCount: 0,
      }
    }
    acc[item.reason_type].count += item.count
    if (item.avg_suggested_amount) {
      acc[item.reason_type].totalSuggestedAmount += item.avg_suggested_amount * item.count
      acc[item.reason_type].suggestedCount += item.count
    }
    return acc
  }, {})

  const totalCostRejections = Object.values(aggregatedCostReasons).reduce((sum: number, r: CostAggregation) => sum + r.count, 0)

  // Format currency
  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'N/A'
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Total Quotation Rejections
            </CardDescription>
            <CardTitle className="text-2xl">{totalQuotationRejections}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              Customer quotations rejected
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-orange-500" />
              Total Cost Rejections
            </CardDescription>
            <CardTitle className="text-2xl">{totalCostRejections}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              Operational costs rejected
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-blue-500" />
              Top Quotation Reason
            </CardDescription>
            <CardTitle className="text-lg">
              {Object.entries(aggregatedQuotationReasons).length > 0
                ? quotationReasonLabels[
                    Object.entries(aggregatedQuotationReasons).sort((a: [string, QuotationAggregation], b: [string, QuotationAggregation]) => b[1].count - a[1].count)[0][0]
                  ] || 'N/A'
                : 'N/A'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              Most common rejection reason
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-500" />
              Top Cost Reason
            </CardDescription>
            <CardTitle className="text-lg">
              {Object.entries(aggregatedCostReasons).length > 0
                ? costReasonLabels[
                    Object.entries(aggregatedCostReasons).sort((a: [string, CostAggregation], b: [string, CostAggregation]) => b[1].count - a[1].count)[0][0]
                  ] || 'N/A'
                : 'N/A'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              Most common rejection reason
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="quotations" className="w-full">
        <TabsList>
          <TabsTrigger value="quotations" className="flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            Quotation Rejections
          </TabsTrigger>
          <TabsTrigger value="costs" className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Cost Rejections
          </TabsTrigger>
        </TabsList>

        {/* Quotation Rejections */}
        <TabsContent value="quotations">
          <Card>
            <CardHeader>
              <CardTitle>Quotation Rejection Reasons</CardTitle>
              <CardDescription>
                Breakdown of why customer quotations are being rejected
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-center">Count</TableHead>
                    <TableHead className="text-center">Percentage</TableHead>
                    <TableHead className="text-right">Avg Competitor Price</TableHead>
                    <TableHead className="text-right">Avg Customer Budget</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(aggregatedQuotationReasons)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([reason, data]) => {
                      const percentage = totalQuotationRejections > 0
                        ? Math.round((data.count / totalQuotationRejections) * 100)
                        : 0
                      const avgCompetitor = data.competitorCount > 0
                        ? data.totalCompetitorAmount / data.competitorCount
                        : null
                      const avgBudget = data.budgetCount > 0
                        ? data.totalBudget / data.budgetCount
                        : null

                      return (
                        <TableRow key={reason}>
                          <TableCell className="font-medium">
                            {quotationReasonLabels[reason] || reason}
                          </TableCell>
                          <TableCell className="text-center">{data.count}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={percentage > 30 ? 'destructive' : 'secondary'}>
                              {percentage}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(avgCompetitor)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(avgBudget)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  {Object.keys(aggregatedQuotationReasons).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No quotation rejection data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cost Rejections */}
        <TabsContent value="costs">
          <Card>
            <CardHeader>
              <CardTitle>Operational Cost Rejection Reasons</CardTitle>
              <CardDescription>
                Breakdown of why operational costs are being rejected
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-center">Count</TableHead>
                    <TableHead className="text-center">Percentage</TableHead>
                    <TableHead className="text-right">Avg Suggested Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(aggregatedCostReasons)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([reason, data]) => {
                      const percentage = totalCostRejections > 0
                        ? Math.round((data.count / totalCostRejections) * 100)
                        : 0
                      const avgSuggested = data.suggestedCount > 0
                        ? data.totalSuggestedAmount / data.suggestedCount
                        : null

                      return (
                        <TableRow key={reason}>
                          <TableCell className="font-medium">
                            {costReasonLabels[reason] || reason}
                          </TableCell>
                          <TableCell className="text-center">{data.count}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={percentage > 30 ? 'destructive' : 'secondary'}>
                              {percentage}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(avgSuggested)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  {Object.keys(aggregatedCostReasons).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No cost rejection data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={fetchAnalytics}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh Data
        </Button>
      </div>
    </div>
  )
}
