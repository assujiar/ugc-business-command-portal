'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  DollarSign, Save, Plus, TrendingUp, AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const CHANNEL_LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  meta_ads: 'Meta Ads',
  organic: 'Organic',
  direct: 'Direct',
  referral: 'Referral',
  social: 'Social',
  other: 'Lainnya',
}

const CHANNEL_COLORS: Record<string, string> = {
  google_ads: '#4285f4',
  meta_ads: '#1877f2',
  organic: '#22c55e',
  direct: '#f59e0b',
  referral: '#8b5cf6',
  social: '#ec4899',
  other: '#6b7280',
}

function formatCurrency(num: number): string {
  if (num >= 1000000000) return `Rp ${(num / 1000000000).toFixed(1)}M`
  if (num >= 1000000) return `Rp ${(num / 1000000).toFixed(1)}jt`
  if (num >= 1000) return `Rp ${(num / 1000).toFixed(0)}rb`
  return `Rp ${Math.round(num).toLocaleString('id-ID')}`
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  return `${months[parseInt(m, 10) - 1]} ${y}`
}

interface RevenueRow {
  id?: string
  channel: string
  month: string
  revenue: number
  leads_count: number
  deals_count: number
  notes: string
  ad_spend: number
  ad_clicks: number
  ad_conversions: number
  roas: number | null
  crm_leads: number
  crm_deals: number
  crm_deal_value: number
  isNew?: boolean
}

export default function RevenueActualsSection() {
  const [rows, setRows] = useState<RevenueRow[]>([])
  const [missingEntries, setMissingEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirtyRows, setDirtyRows] = useState<Set<string>>(new Set())
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/seo-sem/revenue')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRows(data.rows || [])
      setMissingEntries(data.missingEntries || [])
    } catch (err) {
      console.error('Revenue fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleFieldChange = (channel: string, month: string, field: string, value: string) => {
    const key = `${channel}|${month}`
    setDirtyRows(prev => new Set(prev).add(key))

    setRows(prev => {
      const idx = prev.findIndex(r => r.channel === channel && r.month === month)
      if (idx >= 0) {
        const updated = [...prev]
        const row = { ...updated[idx] }
        if (field === 'revenue') row.revenue = parseFloat(value) || 0
        if (field === 'leads_count') row.leads_count = parseInt(value) || 0
        if (field === 'deals_count') row.deals_count = parseInt(value) || 0
        if (field === 'notes') row.notes = value
        // Recalculate ROAS
        row.roas = row.ad_spend > 0 ? row.revenue / row.ad_spend : null
        updated[idx] = row
        return updated
      }
      return prev
    })
  }

  const addMissingRow = (entry: any) => {
    const newRow: RevenueRow = {
      channel: entry.channel,
      month: entry.month,
      revenue: entry.crm_deal_value || 0,
      leads_count: 0,
      deals_count: 0,
      notes: '',
      ad_spend: entry.ad_spend,
      ad_clicks: entry.ad_clicks,
      ad_conversions: entry.ad_conversions,
      roas: null,
      crm_leads: entry.crm_leads || 0,
      crm_deals: entry.crm_deals || 0,
      crm_deal_value: entry.crm_deal_value || 0,
      isNew: true,
    }
    // Auto-calculate ROAS if we have deal value and spend
    if (newRow.crm_deal_value > 0 && newRow.ad_spend > 0) {
      newRow.revenue = newRow.crm_deal_value
      newRow.roas = newRow.revenue / newRow.ad_spend
    }
    setRows(prev => [newRow, ...prev])
    setMissingEntries(prev => prev.filter(e => !(e.channel === entry.channel && e.month === entry.month)))
    setDirtyRows(prev => new Set(prev).add(`${entry.channel}|${entry.month}`))
  }

  const addAllMissing = () => {
    const newRows: RevenueRow[] = missingEntries.map(entry => {
      const revenue = entry.crm_deal_value || 0
      return {
        channel: entry.channel,
        month: entry.month,
        revenue,
        leads_count: 0,
        deals_count: 0,
        notes: '',
        ad_spend: entry.ad_spend,
        ad_clicks: entry.ad_clicks,
        ad_conversions: entry.ad_conversions,
        roas: entry.ad_spend > 0 && revenue > 0 ? revenue / entry.ad_spend : null,
        crm_leads: entry.crm_leads || 0,
        crm_deals: entry.crm_deals || 0,
        crm_deal_value: entry.crm_deal_value || 0,
        isNew: true,
      }
    })
    const newDirty = new Set(dirtyRows)
    for (const entry of missingEntries) {
      newDirty.add(`${entry.channel}|${entry.month}`)
    }
    setRows(prev => [...newRows, ...prev])
    setMissingEntries([])
    setDirtyRows(newDirty)
  }

  const handleSave = async () => {
    if (dirtyRows.size === 0) return
    setSaving(true)
    setSaveStatus('idle')

    const entries = rows
      .filter(r => dirtyRows.has(`${r.channel}|${r.month}`))
      .map(r => ({
        channel: r.channel,
        month: r.month,
        revenue: r.revenue,
        leads_count: r.leads_count,
        deals_count: r.deals_count,
        notes: r.notes,
      }))

    try {
      const res = await fetch('/api/marketing/seo-sem/revenue', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDirtyRows(new Set())
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
      fetchData()
    } catch (err) {
      console.error('Revenue save error:', err)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } finally {
      setSaving(false)
    }
  }

  // Sort rows: by month desc, then channel
  const sortedRows = [...rows].sort((a, b) => {
    const monthCmp = b.month.localeCompare(a.month)
    if (monthCmp !== 0) return monthCmp
    return a.channel.localeCompare(b.channel)
  })

  // Summary stats
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const totalSpend = rows.reduce((s, r) => s + r.ad_spend, 0)
  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : null

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Revenue (Aktual)</p>
            <p className="text-xl font-bold">{formatCurrency(totalRevenue)}</p>
            <p className="text-[10px] text-muted-foreground">dari {rows.filter(r => r.revenue > 0).length} entri</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Ad Spend</p>
            <p className="text-xl font-bold">{formatCurrency(totalSpend)}</p>
            <p className="text-[10px] text-muted-foreground">seluruh channel</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Overall ROAS (Aktual)</p>
            <p className={cn('text-xl font-bold', overallRoas !== null && overallRoas >= 3 ? 'text-green-600' : overallRoas !== null && overallRoas >= 1 ? 'text-amber-600' : overallRoas !== null ? 'text-red-500' : '')}>
              {overallRoas !== null ? `${overallRoas.toFixed(2)}x` : 'N/A'}
            </p>
            <p className="text-[10px] text-muted-foreground">revenue / ad spend</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Leads (CRM)</p>
            <p className="text-xl font-bold">{rows.reduce((s, r) => s + (r.crm_leads || 0), 0).toLocaleString('id-ID')}</p>
            <p className="text-[10px] text-muted-foreground">{rows.reduce((s, r) => s + (r.crm_deals || 0), 0)} deals won</p>
          </CardContent>
        </Card>
      </div>

      {/* Missing entries alert */}
      {missingEntries.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {missingEntries.length} channel × bulan ada data tapi belum ada entri revenue
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={addAllMissing} className="text-xs h-7">
                <Plus className="h-3 w-3 mr-1" />
                Tambahkan Semua
              </Button>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {missingEntries.slice(0, 6).map((e, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-[10px] cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900"
                  onClick={() => addMissingRow(e)}
                >
                  {CHANNEL_LABELS[e.channel] || e.channel} - {formatMonth(e.month)}{e.ad_spend > 0 ? ` (${formatCurrency(e.ad_spend)})` : ''}{e.crm_leads > 0 ? ` ${e.crm_leads} leads` : ''}
                </Badge>
              ))}
              {missingEntries.length > 6 && (
                <Badge variant="outline" className="text-[10px]">+{missingEntries.length - 6} lainnya</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revenue Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Revenue Aktual per Channel per Bulan
            </CardTitle>
            <div className="flex items-center gap-2">
              {saveStatus === 'success' && (
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  Tersimpan
                </div>
              )}
              {saveStatus === 'error' && (
                <div className="flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle className="h-3 w-3" />
                  Gagal simpan
                </div>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={dirtyRows.size === 0 || saving}
                className="h-7 text-xs"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                Simpan {dirtyRows.size > 0 ? `(${dirtyRows.size})` : ''}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Leads &amp; Deals otomatis dari CRM. Input Revenue aktual dari tim finance, ROAS dihitung otomatis = Revenue / Ad Spend.
          </p>
        </CardHeader>
        <CardContent>
          {sortedRows.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Belum ada data revenue. Data akan muncul setelah ada ad spend yang tercatat.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-[90px]">Bulan</TableHead>
                    <TableHead className="text-xs w-[90px]">Channel</TableHead>
                    <TableHead className="text-xs text-right w-[100px]">Ad Spend</TableHead>
                    <TableHead className="text-xs text-right w-[70px]">
                      <span title="Dari CRM - auto">Leads</span>
                    </TableHead>
                    <TableHead className="text-xs text-right w-[70px]">
                      <span title="Dari CRM - Closed Won">Deals</span>
                    </TableHead>
                    <TableHead className="text-xs text-right w-[100px]">
                      <span title="Dari CRM - estimated_value Closed Won">Deal Value</span>
                    </TableHead>
                    <TableHead className="text-xs text-right w-[130px]">Revenue (Rp)</TableHead>
                    <TableHead className="text-xs text-right w-[70px]">ROAS</TableHead>
                    <TableHead className="text-xs w-[130px]">Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map((row, i) => {
                    const key = `${row.channel}|${row.month}`
                    const isDirty = dirtyRows.has(key)
                    return (
                      <TableRow key={i} className={cn(isDirty && 'bg-blue-50/50 dark:bg-blue-950/20')}>
                        <TableCell className="text-xs font-medium">{formatMonth(row.month)}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: CHANNEL_COLORS[row.channel] || '#666' }} />
                            {CHANNEL_LABELS[row.channel] || row.channel}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">
                          {formatCurrency(row.ad_spend)}
                        </TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">
                          {row.crm_leads || 0}
                        </TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">
                          {row.crm_deals || 0}
                        </TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">
                          {row.crm_deal_value > 0 ? formatCurrency(row.crm_deal_value) : '-'}
                        </TableCell>
                        <TableCell className="text-xs text-right p-1">
                          <Input
                            type="number"
                            value={row.revenue || ''}
                            onChange={(e) => handleFieldChange(row.channel, row.month, 'revenue', e.target.value)}
                            placeholder="0"
                            className="h-7 text-xs text-right w-[110px] ml-auto"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          {row.roas !== null ? (
                            <span className={cn(
                              'font-semibold',
                              row.roas >= 3 ? 'text-green-600' : row.roas >= 1 ? 'text-amber-600' : 'text-red-500'
                            )}>
                              {row.roas.toFixed(2)}x
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs p-1">
                          <Input
                            type="text"
                            value={row.notes || ''}
                            onChange={(e) => handleFieldChange(row.channel, row.month, 'notes', e.target.value)}
                            placeholder="Catatan..."
                            className="h-7 text-xs w-[130px]"
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ROAS by Channel Summary */}
      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              ROAS per Channel (Aktual)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {Object.keys(CHANNEL_LABELS)
                .filter(ch => rows.some(r => r.channel === ch))
                .map(ch => {
                  const channelRows = rows.filter(r => r.channel === ch)
                  const chRevenue = channelRows.reduce((s, r) => s + r.revenue, 0)
                  const chSpend = channelRows.reduce((s, r) => s + r.ad_spend, 0)
                  const chRoas = chSpend > 0 ? chRevenue / chSpend : null
                  const chLeads = channelRows.reduce((s, r) => s + (r.crm_leads || 0), 0)
                  const chDeals = channelRows.reduce((s, r) => s + (r.crm_deals || 0), 0)
                  const chDealValue = channelRows.reduce((s, r) => s + (r.crm_deal_value || 0), 0)
                  const costPerLead = chLeads > 0 && chSpend > 0 ? chSpend / chLeads : null
                  return (
                    <div key={ch} className="rounded-lg border p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHANNEL_COLORS[ch] || '#666' }} />
                        <span className="text-xs font-medium">{CHANNEL_LABELS[ch]}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Revenue</span>
                          <span className="font-medium">{formatCurrency(chRevenue)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Ad Spend</span>
                          <span>{formatCurrency(chSpend)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">ROAS</span>
                          <span className={cn(
                            'font-semibold',
                            chRoas !== null && chRoas >= 3 ? 'text-green-600' : chRoas !== null && chRoas >= 1 ? 'text-amber-600' : chRoas !== null ? 'text-red-500' : ''
                          )}>
                            {chRoas !== null ? `${chRoas.toFixed(2)}x` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Leads</span>
                          <span>{chLeads}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Deals Won</span>
                          <span>{chDeals}</span>
                        </div>
                        {chDealValue > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Deal Value</span>
                            <span>{formatCurrency(chDealValue)}</span>
                          </div>
                        )}
                        {costPerLead !== null && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Cost/Lead</span>
                            <span>{formatCurrency(costPerLead)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
