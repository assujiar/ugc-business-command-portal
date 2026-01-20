'use client'

// =====================================================
// Dashboard Insights Section
// Client wrapper for GrowthInsightsCard with URL filter sync
// =====================================================

import { useSearchParams } from 'next/navigation'
import { GrowthInsightsCard } from './growth-insights-card'
import type { InsightFilters } from '@/types/insights'

interface DashboardInsightsSectionProps {
  className?: string
}

export function DashboardInsightsSection({ className }: DashboardInsightsSectionProps) {
  const searchParams = useSearchParams()

  // Extract filters from URL search params
  const filters: InsightFilters = {
    startDate: searchParams.get('startDate'),
    endDate: searchParams.get('endDate'),
    salespersonId: searchParams.get('salespersonId'),
    source: searchParams.get('source') as any,
  }

  return <GrowthInsightsCard filters={filters} className={className} />
}
