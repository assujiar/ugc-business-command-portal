'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  CheckCircle2, XCircle, ExternalLink, Loader2, Plus, Trash2,
  Key, Globe, BarChart3, Gauge, RefreshCcw, Settings, AlertCircle, DollarSign
} from 'lucide-react'

interface ServiceConfig {
  id: number
  service: string
  is_active: boolean
  is_connected: boolean
  has_token: boolean
  token_valid: boolean
  property_id: string | null
  extra_config: Record<string, any>
  last_fetch_at: string | null
  last_fetch_error: string | null
  updated_at: string | null
}

interface SettingsData {
  configs: ServiceConfig[]
  oauthUrls: Record<string, string>
  hasGoogleClientId: boolean
  hasPageSpeedKey: boolean
}

export default function SEOSEMSettings() {
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [fetching, setFetching] = useState<string | null>(null)

  // PageSpeed form
  const [psApiKey, setPsApiKey] = useState('')
  const [psUrls, setPsUrls] = useState<string[]>([])
  const [newPsUrl, setNewPsUrl] = useState('')

  // GSC form
  const [gscSites, setGscSites] = useState<string[]>([])

  // GA4 form - multiple properties
  const [ga4Properties, setGa4Properties] = useState<Array<{ property_id: string; site: string; name: string }>>([])
  const [newGa4PropertyId, setNewGa4PropertyId] = useState('')
  const [newGa4Site, setNewGa4Site] = useState('')
  const [newGa4Name, setNewGa4Name] = useState('')

  // Google Ads form
  const [adsCustomerId, setAdsCustomerId] = useState('')
  const [adsDeveloperToken, setAdsDeveloperToken] = useState('')
  const [adsLoginCustomerId, setAdsLoginCustomerId] = useState('')

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/seo-sem/config')
      const data = await res.json()
      if (res.ok) {
        setSettings(data)

        // Populate forms from config
        const psConfig = data.configs?.find((c: ServiceConfig) => c.service === 'pagespeed')
        if (psConfig) {
          setPsUrls(psConfig.extra_config?.urls || [])
        }

        const gscConfig = data.configs?.find((c: ServiceConfig) => c.service === 'google_search_console')
        if (gscConfig) {
          setGscSites(gscConfig.extra_config?.sites || [])
        }

        const adsConfig = data.configs?.find((c: ServiceConfig) => c.service === 'google_ads')
        if (adsConfig) {
          setAdsCustomerId(adsConfig.extra_config?.customer_id || '')
          setAdsLoginCustomerId(adsConfig.extra_config?.login_customer_id || '')
        }

        const gaConfig = data.configs?.find((c: ServiceConfig) => c.service === 'google_analytics')
        if (gaConfig) {
          // Load multiple properties from extra_config, fallback to single property_id
          const props = gaConfig.extra_config?.properties || []
          if (props.length > 0) {
            setGa4Properties(props)
          } else if (gaConfig.property_id) {
            setGa4Properties([{ property_id: gaConfig.property_id, site: gaConfig.extra_config?.site || '', name: '' }])
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()

    // Check for success/error from OAuth redirect
    const params = new URLSearchParams(window.location.search)
    const success = params.get('success')
    const error = params.get('error')
    if (success) {
      alert(`Berhasil terhubung: ${success.replace('_', ' ')}`)
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (error) {
      alert(`Error: ${error}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [fetchSettings])

  const getConfig = (service: string) => settings?.configs?.find(c => c.service === service)

  const handleSavePageSpeedKey = async () => {
    setSaving('pagespeed_key')
    try {
      const res = await fetch('/api/marketing/seo-sem/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_pagespeed_key', service: 'pagespeed', data: { api_key: psApiKey } }),
      })
      if (res.ok) {
        setPsApiKey('')
        await fetchSettings()
        alert('PageSpeed API Key berhasil disimpan!')
      }
    } catch (err) {
      alert('Gagal menyimpan API Key')
    } finally {
      setSaving(null)
    }
  }

  const handleSavePageSpeedUrls = async () => {
    setSaving('pagespeed_urls')
    try {
      const res = await fetch('/api/marketing/seo-sem/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_pagespeed_urls', service: 'pagespeed', data: { urls: psUrls } }),
      })
      if (res.ok) {
        await fetchSettings()
        alert('URL berhasil disimpan!')
      }
    } catch (err) {
      alert('Gagal menyimpan URL')
    } finally {
      setSaving(null)
    }
  }

  const handleSaveGA4Properties = async () => {
    if (ga4Properties.length === 0) {
      alert('Tambahkan minimal 1 property')
      return
    }
    setSaving('ga4')
    try {
      const res = await fetch('/api/marketing/seo-sem/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_ga4_properties',
          service: 'google_analytics',
          data: { properties: ga4Properties },
        }),
      })
      if (res.ok) {
        await fetchSettings()
        alert('GA4 Properties berhasil disimpan!')
      }
    } catch {
      alert('Gagal menyimpan GA4 Properties')
    } finally {
      setSaving(null)
    }
  }

  const addGa4Property = () => {
    if (!newGa4PropertyId) return
    if (ga4Properties.some(p => p.property_id === newGa4PropertyId)) {
      alert('Property ID sudah ada')
      return
    }
    setGa4Properties([...ga4Properties, { property_id: newGa4PropertyId, site: newGa4Site, name: newGa4Name }])
    setNewGa4PropertyId('')
    setNewGa4Site('')
    setNewGa4Name('')
  }

  const removeGa4Property = (propertyId: string) => {
    setGa4Properties(ga4Properties.filter(p => p.property_id !== propertyId))
  }

  const handleSaveGoogleAds = async () => {
    if (!adsCustomerId) {
      alert('Customer ID wajib diisi')
      return
    }
    setSaving('google_ads')
    try {
      const res = await fetch('/api/marketing/seo-sem/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_google_ads',
          service: 'google_ads',
          data: {
            customer_id: adsCustomerId,
            developer_token: adsDeveloperToken,
            login_customer_id: adsLoginCustomerId,
          },
        }),
      })
      if (res.ok) {
        setAdsDeveloperToken('')
        await fetchSettings()
        alert('Google Ads berhasil dikonfigurasi!')
      } else {
        const err = await res.json()
        alert(err.error || 'Gagal menyimpan')
      }
    } catch {
      alert('Gagal menyimpan konfigurasi Google Ads')
    } finally {
      setSaving(null)
    }
  }

  const handleDisconnect = async (service: string) => {
    if (!confirm(`Yakin ingin disconnect ${service.replace(/_/g, ' ')}?`)) return
    setSaving(service)
    try {
      await fetch('/api/marketing/seo-sem/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect', service }),
      })
      await fetchSettings()
    } finally {
      setSaving(null)
    }
  }

  const handleManualFetch = async (service: string) => {
    setFetching(service)
    try {
      const res = await fetch('/api/marketing/seo-sem/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'manual', type: 'manual', service }),
      })
      const data = await res.json()
      const result = data.results?.find((r: any) => r.service === service) || data.results?.[0]
      if (result?.success) {
        alert(`Data ${service} berhasil di-fetch!`)
        await fetchSettings()
      } else {
        alert(`Gagal: ${result?.error || 'Unknown error'}`)
      }
    } catch {
      alert('Error saat fetch data')
    } finally {
      setFetching(null)
    }
  }

  const addPsUrl = () => {
    if (newPsUrl && !psUrls.includes(newPsUrl)) {
      const url = newPsUrl.startsWith('http') ? newPsUrl : `https://${newPsUrl}`
      setPsUrls([...psUrls, url])
      setNewPsUrl('')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Card key={i}><CardContent className="p-6"><div className="animate-pulse h-24 bg-muted rounded" /></CardContent></Card>
        ))}
      </div>
    )
  }

  const StatusBadge = ({ config }: { config: ServiceConfig | undefined }) => {
    if (!config) return <Badge variant="outline" className="text-xs">Not Found</Badge>
    if (config.is_active && config.token_valid) return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Connected</Badge>
    if (config.is_active && config.has_token && !config.token_valid) return <Badge variant="destructive" className="text-xs"><XCircle className="w-3 h-3 mr-1" />Token Expired</Badge>
    if (config.is_active && !config.has_token && (config.service === 'pagespeed' || config.service === 'google_ads')) return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Active</Badge>
    return <Badge variant="secondary" className="text-xs">Not Connected</Badge>
  }

  return (
    <div className="space-y-4">
      {/* Env Status Banner */}
      {!settings?.hasGoogleClientId && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-700">Google OAuth belum dikonfigurasi</p>
              <p className="text-muted-foreground mt-1">
                Set <code className="px-1 py-0.5 bg-muted rounded text-xs">GOOGLE_CLIENT_ID</code> dan{' '}
                <code className="px-1 py-0.5 bg-muted rounded text-xs">GOOGLE_CLIENT_SECRET</code> di environment variables Vercel.
                Lihat panduan lengkap di bawah.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== 1. PageSpeed Insights (Simplest - just API key) ===== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-orange-500" />
              <CardTitle className="text-base">PageSpeed Insights</CardTitle>
              <StatusBadge config={getConfig('pagespeed')} />
            </div>
            <div className="flex items-center gap-2">
              {getConfig('pagespeed')?.is_active && (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => handleManualFetch('pagespeed')}
                    disabled={!!fetching}>
                    {fetching === 'pagespeed' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCcw className="w-3 h-3 mr-1" />}
                    Fetch Now
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500"
                    onClick={() => handleDisconnect('pagespeed')}>
                    Disconnect
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Gratis - 25.000 queries/hari. Hanya butuh API Key (tanpa OAuth).
          </div>

          {/* API Key Input */}
          <div>
            <label className="text-xs font-medium">API Key</label>
            <div className="flex gap-2 mt-1">
              <Input
                type="password"
                placeholder={getConfig('pagespeed')?.is_active ? '********** (sudah tersimpan)' : 'Masukkan PageSpeed API Key'}
                value={psApiKey}
                onChange={e => setPsApiKey(e.target.value)}
                className="h-8 text-xs"
              />
              <Button size="sm" className="h-8 text-xs" onClick={handleSavePageSpeedKey}
                disabled={!psApiKey || saving === 'pagespeed_key'}>
                {saving === 'pagespeed_key' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3 mr-1" />}
                Save
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Buat di <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a> {' > '} Create Credentials {' > '} API Key. Enable "PageSpeed Insights API".
            </p>
          </div>

          {/* Monitored URLs */}
          <div>
            <label className="text-xs font-medium">URL yang Dimonitor</label>
            <div className="space-y-1 mt-1">
              {psUrls.map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={url} readOnly className="h-7 text-xs bg-muted/50" />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500"
                    onClick={() => setPsUrls(psUrls.filter((_, j) => j !== i))}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  placeholder="https://www.example.com"
                  value={newPsUrl}
                  onChange={e => setNewPsUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addPsUrl()}
                  className="h-7 text-xs"
                />
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addPsUrl}>
                  <Plus className="w-3 h-3 mr-1" />Add
                </Button>
              </div>
            </div>
            <Button size="sm" className="h-7 text-xs mt-2" onClick={handleSavePageSpeedUrls}
              disabled={saving === 'pagespeed_urls'}>
              {saving === 'pagespeed_urls' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Simpan URL
            </Button>
          </div>

          {getConfig('pagespeed')?.last_fetch_at && (
            <p className="text-[10px] text-muted-foreground">
              Last fetch: {new Date(getConfig('pagespeed')!.last_fetch_at!).toLocaleString('id-ID')}
              {getConfig('pagespeed')?.last_fetch_error && (
                <span className="text-red-500 ml-2">Error: {getConfig('pagespeed')!.last_fetch_error}</span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ===== 2. Google Search Console (OAuth) ===== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-500" />
              <CardTitle className="text-base">Google Search Console</CardTitle>
              <StatusBadge config={getConfig('google_search_console')} />
            </div>
            <div className="flex items-center gap-2">
              {getConfig('google_search_console')?.is_active && getConfig('google_search_console')?.token_valid && (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => handleManualFetch('google_search_console')}
                    disabled={!!fetching}>
                    {fetching === 'google_search_console' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCcw className="w-3 h-3 mr-1" />}
                    Fetch Now
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500"
                    onClick={() => handleDisconnect('google_search_console')}>
                    Disconnect
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Data keyword, halaman, klik, dan impressions dari Google Search.
          </div>

          {!getConfig('google_search_console')?.token_valid ? (
            <div>
              {settings?.oauthUrls?.google_search_console ? (
                <a href={settings.oauthUrls.google_search_console}>
                  <Button size="sm" className="h-8 text-xs">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Connect Google Search Console
                  </Button>
                </a>
              ) : (
                <p className="text-xs text-amber-600">
                  Set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET di environment variables dulu.
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium">Sites yang Terdeteksi</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {gscSites.map((site, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{site}</Badge>
                ))}
                {gscSites.length === 0 && <span className="text-xs text-muted-foreground">Belum ada sites</span>}
              </div>
            </div>
          )}

          {getConfig('google_search_console')?.last_fetch_at && (
            <p className="text-[10px] text-muted-foreground">
              Last fetch: {new Date(getConfig('google_search_console')!.last_fetch_at!).toLocaleString('id-ID')}
              {getConfig('google_search_console')?.last_fetch_error && (
                <span className="text-red-500 ml-2">Error: {getConfig('google_search_console')!.last_fetch_error}</span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ===== 3. Google Analytics 4 (OAuth) ===== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-green-500" />
              <CardTitle className="text-base">Google Analytics 4</CardTitle>
              <StatusBadge config={getConfig('google_analytics')} />
            </div>
            <div className="flex items-center gap-2">
              {getConfig('google_analytics')?.is_active && getConfig('google_analytics')?.token_valid && (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => handleManualFetch('google_analytics')}
                    disabled={!!fetching}>
                    {fetching === 'google_analytics' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCcw className="w-3 h-3 mr-1" />}
                    Fetch Now
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500"
                    onClick={() => handleDisconnect('google_analytics')}>
                    Disconnect
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Data organic sessions, engagement, bounce rate, dan conversions.
          </div>

          {!getConfig('google_analytics')?.token_valid ? (
            <div>
              {settings?.oauthUrls?.google_analytics ? (
                <a href={settings.oauthUrls.google_analytics}>
                  <Button size="sm" className="h-8 text-xs">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Connect Google Analytics
                  </Button>
                </a>
              ) : (
                <p className="text-xs text-amber-600">
                  Set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET di environment variables dulu.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">GA4 Properties ({ga4Properties.length})</label>
                <div className="space-y-1.5 mt-1">
                  {ga4Properties.map((prop, i) => (
                    <div key={prop.property_id} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] shrink-0">#{i + 1}</Badge>
                          <span className="text-xs font-mono">{prop.property_id}</span>
                          {prop.name && <span className="text-xs text-muted-foreground truncate">({prop.name})</span>}
                        </div>
                        {prop.site && <span className="text-[10px] text-muted-foreground ml-7">{prop.site}</span>}
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 shrink-0"
                        onClick={() => removeGa4Property(prop.property_id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Add new property */}
                <div className="mt-2 p-2 border border-dashed rounded space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground">Tambah Property</p>
                  <div className="flex gap-2 flex-wrap">
                    <Input
                      placeholder="Property ID (e.g. 123456789)"
                      value={newGa4PropertyId}
                      onChange={e => setNewGa4PropertyId(e.target.value)}
                      className="h-7 text-xs w-40"
                    />
                    <Input
                      placeholder="Domain (e.g. ugc.id)"
                      value={newGa4Site}
                      onChange={e => setNewGa4Site(e.target.value)}
                      className="h-7 text-xs w-36"
                    />
                    <Input
                      placeholder="Label (opsional)"
                      value={newGa4Name}
                      onChange={e => setNewGa4Name(e.target.value)}
                      className="h-7 text-xs w-32"
                    />
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addGa4Property}>
                      <Plus className="w-3 h-3 mr-1" />Add
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Property ID ada di GA4 {' > '} Admin {' > '} Property Settings
                  </p>
                </div>

                <Button size="sm" className="h-7 text-xs mt-2" onClick={handleSaveGA4Properties}
                  disabled={saving === 'ga4' || ga4Properties.length === 0}>
                  {saving === 'ga4' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Simpan Properties ({ga4Properties.length})
                </Button>
              </div>
            </div>
          )}

          {getConfig('google_analytics')?.last_fetch_at && (
            <p className="text-[10px] text-muted-foreground">
              Last fetch: {new Date(getConfig('google_analytics')!.last_fetch_at!).toLocaleString('id-ID')}
              {getConfig('google_analytics')?.last_fetch_error && (
                <span className="text-red-500 ml-2">Error: {getConfig('google_analytics')!.last_fetch_error}</span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ===== 4. Google Ads (SEM) ===== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-yellow-600" />
              <CardTitle className="text-base">Google Ads (SEM)</CardTitle>
              <StatusBadge config={getConfig('google_ads')} />
            </div>
            <div className="flex items-center gap-2">
              {getConfig('google_ads')?.is_active && (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => handleManualFetch('google_ads')}
                    disabled={!!fetching}>
                    {fetching === 'google_ads' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCcw className="w-3 h-3 mr-1" />}
                    Fetch Now
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500"
                    onClick={() => handleDisconnect('google_ads')}>
                    Disconnect
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Data campaign performance, keyword bids, dan search terms dari Google Ads.
          </div>

          {/* Step 1: OAuth Connect */}
          {!getConfig('google_ads')?.token_valid && !getConfig('google_ads')?.is_active ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium mb-2">Langkah 1: Connect akun Google</p>
                {settings?.oauthUrls?.google_ads ? (
                  <a href={settings.oauthUrls.google_ads}>
                    <Button size="sm" className="h-8 text-xs">
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Connect Google Ads
                    </Button>
                  </a>
                ) : (
                  <p className="text-xs text-amber-600">
                    Set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET di environment variables dulu.
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium mb-2">Langkah 2: Konfigurasi Akun</p>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-medium">Customer ID <span className="text-red-500">*</span></label>
                    <Input
                      placeholder="xxx-xxx-xxxx (dari Google Ads)"
                      value={adsCustomerId}
                      onChange={e => setAdsCustomerId(e.target.value)}
                      className="h-7 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Developer Token <span className="text-red-500">*</span></label>
                    <Input
                      type="password"
                      placeholder={process.env.NEXT_PUBLIC_HAS_ADS_DEV_TOKEN ? '********** (dari env var)' : 'Masukkan Developer Token'}
                      value={adsDeveloperToken}
                      onChange={e => setAdsDeveloperToken(e.target.value)}
                      className="h-7 text-xs mt-1"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Dari Google Ads {' > '} Tools {' > '} API Center. Atau set env var <code className="px-1 py-0.5 bg-muted rounded">GOOGLE_ADS_DEVELOPER_TOKEN</code>.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Manager Account ID (opsional)</label>
                    <Input
                      placeholder="MCC ID jika pakai manager account"
                      value={adsLoginCustomerId}
                      onChange={e => setAdsLoginCustomerId(e.target.value)}
                      className="h-7 text-xs mt-1"
                    />
                  </div>
                  <Button size="sm" className="h-7 text-xs" onClick={handleSaveGoogleAds}
                    disabled={saving === 'google_ads' || !adsCustomerId}>
                    {saving === 'google_ads' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Simpan & Aktifkan
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-muted/30 rounded">
                  <p className="text-[10px] text-muted-foreground">Customer ID</p>
                  <p className="text-xs font-mono">{getConfig('google_ads')?.extra_config?.customer_id || '-'}</p>
                </div>
                <div className="p-2 bg-muted/30 rounded">
                  <p className="text-[10px] text-muted-foreground">Manager Account</p>
                  <p className="text-xs font-mono">{getConfig('google_ads')?.extra_config?.login_customer_id || 'Tidak ada'}</p>
                </div>
              </div>

              {/* Edit config inline */}
              <div className="p-2 border border-dashed rounded space-y-1.5">
                <p className="text-[10px] font-medium text-muted-foreground">Update Konfigurasi</p>
                <div className="flex gap-2 flex-wrap">
                  <Input
                    placeholder="Customer ID"
                    value={adsCustomerId}
                    onChange={e => setAdsCustomerId(e.target.value)}
                    className="h-7 text-xs w-36"
                  />
                  <Input
                    type="password"
                    placeholder="Developer Token (baru)"
                    value={adsDeveloperToken}
                    onChange={e => setAdsDeveloperToken(e.target.value)}
                    className="h-7 text-xs w-40"
                  />
                  <Input
                    placeholder="MCC ID (opsional)"
                    value={adsLoginCustomerId}
                    onChange={e => setAdsLoginCustomerId(e.target.value)}
                    className="h-7 text-xs w-36"
                  />
                  <Button size="sm" className="h-7 text-xs" onClick={handleSaveGoogleAds}
                    disabled={saving === 'google_ads' || !adsCustomerId}>
                    Update
                  </Button>
                </div>
              </div>
            </div>
          )}

          {getConfig('google_ads')?.last_fetch_at && (
            <p className="text-[10px] text-muted-foreground">
              Last fetch: {new Date(getConfig('google_ads')!.last_fetch_at!).toLocaleString('id-ID')}
              {getConfig('google_ads')?.last_fetch_error && (
                <span className="text-red-500 ml-2">Error: {getConfig('google_ads')!.last_fetch_error}</span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ===== Setup Guide ===== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <CardTitle className="text-base">Panduan Setup</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-xs">
            <div>
              <h4 className="font-semibold text-sm mb-1">Fase 1: PageSpeed Insights (Paling Mudah)</h4>
              <ol className="list-decimal ml-4 space-y-0.5 text-muted-foreground">
                <li>Buka <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">Google Cloud Console</a></li>
                <li>Buat API Key baru (Create Credentials {'>'} API Key)</li>
                <li>Enable <strong>PageSpeed Insights API</strong> di <a href="https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">API Library</a></li>
                <li>Copy API Key dan paste di form di atas</li>
                <li>Tambahkan URL website yang ingin dimonitor</li>
                <li>Klik "Fetch Now" untuk test</li>
              </ol>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-1">Fase 2: Google Search Console + Analytics</h4>
              <ol className="list-decimal ml-4 space-y-0.5 text-muted-foreground">
                <li>Buka <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">Google Cloud Console</a></li>
                <li>Create OAuth 2.0 Client ID (Application type: <strong>Web application</strong>)</li>
                <li>
                  Add Authorized redirect URI:{' '}
                  <code className="px-1 py-0.5 bg-muted rounded">{typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/api/auth/google/callback</code>
                </li>
                <li>
                  Enable APIs di Library:
                  <ul className="list-disc ml-4 mt-0.5">
                    <li><a href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">Google Search Console API</a></li>
                    <li><a href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">Google Analytics Data API</a></li>
                    <li><a href="https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">Google Analytics Admin API</a></li>
                  </ul>
                </li>
                <li>
                  Set di <strong>Vercel Environment Variables</strong>:
                  <ul className="list-disc ml-4 mt-0.5">
                    <li><code className="px-1 py-0.5 bg-muted rounded">GOOGLE_CLIENT_ID</code> = Client ID dari OAuth</li>
                    <li><code className="px-1 py-0.5 bg-muted rounded">GOOGLE_CLIENT_SECRET</code> = Client Secret dari OAuth</li>
                  </ul>
                </li>
                <li>Redeploy aplikasi agar env vars aktif</li>
                <li>Kembali ke halaman ini, klik "Connect Google Search Console" / "Connect Google Analytics"</li>
                <li>Login dengan akun Google yang punya akses ke GSC & GA4</li>
              </ol>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-1">Fase 3: Google Ads (SEM)</h4>
              <ol className="list-decimal ml-4 space-y-0.5 text-muted-foreground">
                <li>Buka Google Ads, klik <strong>Tools {'>'} API Center</strong></li>
                <li>Apply untuk <strong>Developer Token</strong> (Basic Access cukup)</li>
                <li>Di Google Cloud Console, enable <a href="https://console.cloud.google.com/apis/library/googleads.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">Google Ads API</a></li>
                <li>
                  Add scope baru ke OAuth consent screen:
                  <code className="block px-1 py-0.5 bg-muted rounded mt-0.5">https://www.googleapis.com/auth/adwords</code>
                </li>
                <li>Klik "Connect Google Ads" di atas</li>
                <li>Masukkan <strong>Customer ID</strong> (format: xxx-xxx-xxxx, dari Google Ads header)</li>
                <li>Masukkan <strong>Developer Token</strong> atau set env var <code className="px-1 py-0.5 bg-muted rounded">GOOGLE_ADS_DEVELOPER_TOKEN</code></li>
                <li>Jika pakai MCC (Manager Account), masukkan MCC ID juga</li>
                <li>Klik "Simpan & Aktifkan", lalu "Fetch Now" untuk test</li>
              </ol>
            </div>

            <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
              <p className="font-medium text-blue-700">Tips:</p>
              <ul className="list-disc ml-4 mt-1 text-muted-foreground">
                <li>Pastikan akun Google yang digunakan punya akses Owner/Full di GSC dan GA4</li>
                <li>GSC data tertunda 2-3 hari (Google memproses data search)</li>
                <li>Web Vitals otomatis dijadwalkan setiap Senin (via pg_cron)</li>
                <li>SEO overview + keywords otomatis setiap hari jam 06:00 WIB</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
