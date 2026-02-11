'use client'

import { useState, useEffect, useCallback } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Search, BarChart3, Globe, Gauge, DollarSign,
  GitCompareArrows, RefreshCcw, Settings, AlertCircle, Loader2, Lightbulb, Users, Link2, Receipt
} from 'lucide-react'

import { SummaryInsightSection } from './seo/summary-insight-section'
import { SEOOverviewSection } from './seo/seo-overview-section'
import { KeywordPerformanceSection } from './seo/keyword-performance-section'
import { PagePerformanceSection } from './seo/page-performance-section'
import WebVitalsSection from './seo/web-vitals-section'
import AdsOverviewSection from './sem/ads-overview-section'
import CombinedViewSection from './sem/combined-view-section'
import SEOSEMSettings from './seo/seo-sem-settings'
import { AudienceSection } from './seo/audience-section'
import { AcquisitionSection } from './seo/acquisition-section'
import RevenueActualsSection from './sem/revenue-actuals-section'

type TabValue = 'summary' | 'seo_overview' | 'keywords' | 'pages' | 'web_vitals' | 'audience' | 'acquisition' | 'ads' | 'revenue' | 'combined' | 'settings'

function getTodayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function SEOSEMDashboard() {
  // Global filters
  const [dateRange, setDateRange] = useState('30d')
  const [customDateFrom, setCustomDateFrom] = useState('2025-01-01')
  const [customDateTo, setCustomDateTo] = useState(getTodayStr)
  const [site, setSite] = useState('__all__')
  const [activeTab, setActiveTab] = useState<TabValue>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('tab') === 'settings') return 'settings'
    }
    return 'summary'
  })
  const [sites, setSites] = useState<string[]>([])

  // Data states
  const [overviewData, setOverviewData] = useState<any>(null)
  const [keywordData, setKeywordData] = useState<any>(null)
  const [pageData, setPageData] = useState<any>(null)
  const [vitalsData, setVitalsData] = useState<any>(null)
  const [adsData, setAdsData] = useState<any>(null)
  const [combinedData, setCombinedData] = useState<any>(null)
  const [audienceData, setAudienceData] = useState<any>(null)
  const [acquisitionData, setAcquisitionData] = useState<any>(null)

  // Loading states
  const [loadingOverview, setLoadingOverview] = useState(false)
  const [loadingKeywords, setLoadingKeywords] = useState(false)
  const [loadingPages, setLoadingPages] = useState(false)
  const [loadingVitals, setLoadingVitals] = useState(false)
  const [loadingAds, setLoadingAds] = useState(false)
  const [loadingCombined, setLoadingCombined] = useState(false)
  const [loadingAudience, setLoadingAudience] = useState(false)
  const [loadingAcquisition, setLoadingAcquisition] = useState(false)
  const [fetchingData, setFetchingData] = useState(false)

  // Keyword filters
  const [kwFilters, setKwFilters] = useState({
    device: '__all__', branded: '__all__', search: '',
    minImpressions: 10, page: 1, sort: 'clicks', dir: 'desc',
  })

  // Page filters
  const [pageFilters, setPageFilters] = useState({
    search: '', page: 1, sort: 'gsc_clicks', dir: 'desc',
  })
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null)

  // Fetch overview
  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true)
    try {
      const params = new URLSearchParams({ range: dateRange, site })
      if (dateRange === 'custom') {
        params.set('date_from', customDateFrom)
        params.set('date_to', customDateTo)
      }
      const res = await fetch(`/api/marketing/seo-sem/overview?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOverviewData(data)
      if (data.sites?.length) setSites(data.sites)
    } catch (err) {
      console.error('Overview fetch error:', err)
    } finally {
      setLoadingOverview(false)
    }
  }, [dateRange, site, customDateFrom, customDateTo])

  // Fetch keywords
  const fetchKeywords = useCallback(async () => {
    setLoadingKeywords(true)
    try {
      const params = new URLSearchParams({
        range: dateRange, site,
        device: kwFilters.device, branded: kwFilters.branded,
        search: kwFilters.search, min_impressions: String(kwFilters.minImpressions),
        page: String(kwFilters.page), limit: '50',
        sort: kwFilters.sort, dir: kwFilters.dir,
      })
      if (dateRange === 'custom') {
        params.set('date_from', customDateFrom)
        params.set('date_to', customDateTo)
      }
      const res = await fetch(`/api/marketing/seo-sem/keywords?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setKeywordData(data)
    } catch (err) {
      console.error('Keywords fetch error:', err)
    } finally {
      setLoadingKeywords(false)
    }
  }, [dateRange, site, kwFilters, customDateFrom, customDateTo])

  // Fetch pages
  const fetchPages = useCallback(async () => {
    setLoadingPages(true)
    try {
      const params = new URLSearchParams({
        range: dateRange, site,
        search: pageFilters.search,
        page: String(pageFilters.page), limit: '50',
        sort: pageFilters.sort, dir: pageFilters.dir,
      })
      if (dateRange === 'custom') {
        params.set('date_from', customDateFrom)
        params.set('date_to', customDateTo)
      }
      if (expandedUrl) params.set('expand_url', expandedUrl)
      const res = await fetch(`/api/marketing/seo-sem/pages?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPageData(data)
    } catch (err) {
      console.error('Pages fetch error:', err)
    } finally {
      setLoadingPages(false)
    }
  }, [dateRange, site, pageFilters, expandedUrl, customDateFrom, customDateTo])

  // Fetch vitals
  const fetchVitals = useCallback(async () => {
    setLoadingVitals(true)
    try {
      const res = await fetch('/api/marketing/seo-sem/web-vitals')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setVitalsData(data)
    } catch (err) {
      console.error('Vitals fetch error:', err)
    } finally {
      setLoadingVitals(false)
    }
  }, [])

  // Fetch ads
  const fetchAds = useCallback(async () => {
    setLoadingAds(true)
    try {
      const params = new URLSearchParams({ range: dateRange })
      if (dateRange === 'custom') {
        params.set('date_from', customDateFrom)
        params.set('date_to', customDateTo)
      }
      const res = await fetch(`/api/marketing/seo-sem/ads?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAdsData(data)
    } catch (err) {
      console.error('Ads fetch error:', err)
    } finally {
      setLoadingAds(false)
    }
  }, [dateRange, customDateFrom, customDateTo])

  // Fetch combined
  const fetchCombined = useCallback(async () => {
    setLoadingCombined(true)
    try {
      const params = new URLSearchParams({ range: dateRange })
      if (dateRange === 'custom') {
        params.set('date_from', customDateFrom)
        params.set('date_to', customDateTo)
      }
      const res = await fetch(`/api/marketing/seo-sem/combined?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCombinedData(data)
    } catch (err) {
      console.error('Combined fetch error:', err)
    } finally {
      setLoadingCombined(false)
    }
  }, [dateRange, customDateFrom, customDateTo])

  // Fetch audience demographics
  const fetchAudience = useCallback(async () => {
    setLoadingAudience(true)
    try {
      const params = new URLSearchParams({ range: dateRange, site })
      if (dateRange === 'custom') {
        params.set('date_from', customDateFrom)
        params.set('date_to', customDateTo)
      }
      const res = await fetch(`/api/marketing/seo-sem/demographics?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAudienceData(data)
    } catch (err) {
      console.error('Audience fetch error:', err)
    } finally {
      setLoadingAudience(false)
    }
  }, [dateRange, site, customDateFrom, customDateTo])

  // Fetch acquisition/UTM data
  const fetchAcquisition = useCallback(async () => {
    setLoadingAcquisition(true)
    try {
      const params = new URLSearchParams({ range: dateRange, site })
      if (dateRange === 'custom') {
        params.set('date_from', customDateFrom)
        params.set('date_to', customDateTo)
      }
      const res = await fetch(`/api/marketing/seo-sem/utm?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAcquisitionData(data)
    } catch (err) {
      console.error('Acquisition fetch error:', err)
    } finally {
      setLoadingAcquisition(false)
    }
  }, [dateRange, site, customDateFrom, customDateTo])

  // Manual data fetch trigger
  const handleManualFetch = async () => {
    setFetchingData(true)
    try {
      const res = await fetch('/api/marketing/seo-sem/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'manual', type: 'manual' }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Gagal fetch data')
      } else {
        const failed = data.results?.filter((r: any) => !r.success) || []
        if (failed.length > 0) {
          alert(`Sebagian gagal: ${failed.map((f: any) => `${f.service}: ${f.error}`).join(', ')}`)
        } else {
          alert('Data berhasil di-refresh!')
        }
        // Refresh current tab
        if (activeTab === 'seo_overview') fetchOverview()
        if (activeTab === 'keywords') fetchKeywords()
        if (activeTab === 'pages') fetchPages()
        if (activeTab === 'web_vitals') fetchVitals()
      }
    } catch {
      alert('Error saat fetch data')
    } finally {
      setFetchingData(false)
    }
  }

  // Load data on tab change
  useEffect(() => {
    if (activeTab === 'summary') { fetchOverview(); fetchAds() }
    if (activeTab === 'seo_overview') fetchOverview()
    if (activeTab === 'keywords') fetchKeywords()
    if (activeTab === 'pages') fetchPages()
    if (activeTab === 'web_vitals') fetchVitals()
    if (activeTab === 'ads') fetchAds()
    if (activeTab === 'audience') fetchAudience()
    if (activeTab === 'acquisition') fetchAcquisition()
    if (activeTab === 'combined') fetchCombined()
  }, [activeTab, dateRange, site, fetchOverview, fetchKeywords, fetchPages, fetchVitals, fetchAds, fetchAudience, fetchAcquisition, fetchCombined])

  // Refetch keywords on filter change
  useEffect(() => {
    if (activeTab === 'keywords') fetchKeywords()
  }, [activeTab, kwFilters, fetchKeywords])

  // Refetch pages on filter change
  useEffect(() => {
    if (activeTab === 'pages') fetchPages()
  }, [activeTab, pageFilters, expandedUrl, fetchPages])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">SEO & SEM Performance</h2>
          <p className="text-xs text-muted-foreground">
            Monitor organic search, paid ads, dan web performance
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeTab !== 'settings' && <>
          {/* Date Range */}
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 Hari</SelectItem>
              <SelectItem value="30d">30 Hari</SelectItem>
              <SelectItem value="90d">90 Hari</SelectItem>
              <SelectItem value="ytd">YTD</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>

          {/* Custom Date Range Inputs */}
          {dateRange === 'custom' && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={customDateFrom}
                min="2025-01-01"
                max={customDateTo}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                className="w-[130px] h-8 text-xs"
              />
              <span className="text-xs text-muted-foreground">-</span>
              <Input
                type="date"
                value={customDateTo}
                min={customDateFrom || '2025-01-01'}
                max={getTodayStr()}
                onChange={(e) => setCustomDateTo(e.target.value)}
                className="w-[130px] h-8 text-xs"
              />
            </div>
          )}

          {/* Site Filter */}
          <Select value={site} onValueChange={setSite}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="Semua Site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Semua Site</SelectItem>
              {sites.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Manual Fetch */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualFetch}
            disabled={fetchingData}
            className="h-8 text-xs"
          >
            {fetchingData ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCcw className="h-3 w-3 mr-1" />}
            Refresh Data
          </Button>
          </>}
        </div>
      </div>

      {/* Config Status */}
      {overviewData?.configs && (
        <div className="flex gap-2 flex-wrap">
          {overviewData.configs.map((c: any) => (
            <Badge
              key={c.service}
              variant={c.is_active ? 'default' : 'secondary'}
              className="text-[10px]"
            >
              {c.service.replace('google_', 'G. ').replace('_', ' ')}:
              {c.is_active ? (
                c.last_fetch_at ? ` ${new Date(c.last_fetch_at).toLocaleDateString('id-ID')}` : ' Aktif'
              ) : ' Belum Aktif'}
            </Badge>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="summary" className="gap-1 text-xs sm:text-sm">
            <Lightbulb className="h-3.5 w-3.5" />
            Summary & Insight
          </TabsTrigger>
          <TabsTrigger value="seo_overview" className="gap-1 text-xs sm:text-sm">
            <BarChart3 className="h-3.5 w-3.5" />
            SEO Overview
          </TabsTrigger>
          <TabsTrigger value="keywords" className="gap-1 text-xs sm:text-sm">
            <Search className="h-3.5 w-3.5" />
            Keywords
          </TabsTrigger>
          <TabsTrigger value="pages" className="gap-1 text-xs sm:text-sm">
            <Globe className="h-3.5 w-3.5" />
            Pages
          </TabsTrigger>
          <TabsTrigger value="web_vitals" className="gap-1 text-xs sm:text-sm">
            <Gauge className="h-3.5 w-3.5" />
            Web Vitals
          </TabsTrigger>
          <TabsTrigger value="audience" className="gap-1 text-xs sm:text-sm">
            <Users className="h-3.5 w-3.5" />
            Audience
          </TabsTrigger>
          <TabsTrigger value="acquisition" className="gap-1 text-xs sm:text-sm">
            <Link2 className="h-3.5 w-3.5" />
            Acquisition
          </TabsTrigger>
          <TabsTrigger value="ads" className="gap-1 text-xs sm:text-sm">
            <DollarSign className="h-3.5 w-3.5" />
            Paid Ads
          </TabsTrigger>
          <TabsTrigger value="revenue" className="gap-1 text-xs sm:text-sm">
            <Receipt className="h-3.5 w-3.5" />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="combined" className="gap-1 text-xs sm:text-sm">
            <GitCompareArrows className="h-3.5 w-3.5" />
            Combined
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1 text-xs sm:text-sm">
            <Settings className="h-3.5 w-3.5" />
            Settings
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Tab Content */}
      {activeTab === 'summary' && (
        <SummaryInsightSection
          seoData={overviewData}
          adsData={adsData}
          dateRange={dateRange}
          loading={loadingOverview || loadingAds}
        />
      )}

      {activeTab === 'seo_overview' && (
        <SEOOverviewSection
          kpis={overviewData?.kpis || null}
          dailyTrend={overviewData?.dailyTrend || []}
          deviceBreakdown={overviewData?.deviceBreakdown || null}
          loading={loadingOverview}
        />
      )}

      {activeTab === 'keywords' && (
        <KeywordPerformanceSection
          data={keywordData}
          loading={loadingKeywords}
          filters={kwFilters}
          onFilterChange={(f) => setKwFilters(prev => ({ ...prev, ...f }))}
        />
      )}

      {activeTab === 'pages' && (
        <PagePerformanceSection
          data={pageData}
          loading={loadingPages}
          filters={pageFilters}
          onFilterChange={(f) => setPageFilters(prev => ({ ...prev, ...f }))}
          onExpandRow={setExpandedUrl}
          expandedUrl={expandedUrl}
        />
      )}

      {activeTab === 'web_vitals' && (
        <WebVitalsSection
          data={vitalsData}
          loading={loadingVitals}
        />
      )}

      {activeTab === 'audience' && (
        <AudienceSection
          data={audienceData}
          loading={loadingAudience}
        />
      )}

      {activeTab === 'acquisition' && (
        <AcquisitionSection
          data={acquisitionData}
          loading={loadingAcquisition}
        />
      )}

      {activeTab === 'ads' && (
        <AdsOverviewSection
          data={adsData}
          loading={loadingAds}
        />
      )}

      {activeTab === 'revenue' && (
        <RevenueActualsSection />
      )}

      {activeTab === 'combined' && (
        <CombinedViewSection
          data={combinedData}
          loading={loadingCombined}
        />
      )}

      {activeTab === 'settings' && (
        <SEOSEMSettings />
      )}
    </div>
  )
}
