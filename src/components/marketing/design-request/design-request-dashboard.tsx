'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Palette, Plus, LayoutGrid, List, Clock, AlertTriangle, CheckCircle2, Eye, Send,
  XCircle, Search, Trash2, Edit, ExternalLink, TrendingUp, Image,
  MessageSquare, Upload, RefreshCw, Timer, Target, BarChart3, User,
  ChevronRight, FileImage, Zap, ArrowRight,
} from 'lucide-react'

// ============================================================
// Types
// ============================================================

interface DesignRequest {
  id: string; title: string; description: string; design_type: string
  design_subtype: string | null; platform_target: string[]
  dimensions: string | null; brand_guidelines: string | null
  reference_urls: string[]; reference_notes: string | null
  copy_text: string | null; cta_text: string | null
  color_preferences: string | null; mood_tone: string | null
  output_format: string[]; quantity: number; priority: string
  deadline: string | null; status: string; requested_by: string
  assigned_to: string | null; campaign_id: string | null
  submitted_at: string | null; accepted_at: string | null
  first_delivered_at: string | null; approved_at: string | null
  cancelled_at: string | null; revision_count: number
  created_at: string; updated_at: string
  requester?: { user_id: string; name: string; role: string } | null
  assignee?: { user_id: string; name: string; role: string } | null
  campaign?: { id: string; name: string; color: string } | null
  version_count?: number
}

interface DesignVersion {
  id: number; request_id: string; version_number: number
  design_url: string; design_url_2: string | null
  thumbnail_url: string | null; file_format: string | null; notes: string | null
  delivered_by: string; delivered_at: string
  review_status: string; reviewed_by: string | null
  reviewed_at: string | null; review_comment: string | null
  deliverer?: { name: string; role: string } | null
  reviewer?: { name: string; role: string } | null
}

interface Comment {
  id: number; comment: string; comment_type: string; created_at: string
  version_ref: number | null
  commenter?: { name: string; role: string } | null
}

// ============================================================
// Constants
// ============================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: Edit },
  submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: Send },
  accepted: { label: 'Diterima VSDO', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300', icon: CheckCircle2 },
  in_progress: { label: 'Dikerjakan', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', icon: RefreshCw },
  delivered: { label: 'Design Dikirim', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300', icon: Upload },
  revision_requested: { label: 'Revisi Diminta', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300', icon: RefreshCw },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: CheckCircle2 },
  cancelled: { label: 'Dibatalkan', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: XCircle },
}

const DESIGN_TYPES = [
  { value: 'social_media_post', label: 'Post Sosial Media (Feed)' },
  { value: 'social_media_story', label: 'Story / Status' },
  { value: 'social_media_banner', label: 'Banner / Cover Sosmed' },
  { value: 'social_media_ads', label: 'Iklan Sosial Media' },
  { value: 'presentation', label: 'Presentasi / Deck' },
  { value: 'infographic', label: 'Infografis' },
  { value: 'brochure', label: 'Brosur' },
  { value: 'flyer', label: 'Flyer / Leaflet' },
  { value: 'poster', label: 'Poster' },
  { value: 'banner_ads', label: 'Banner Iklan Digital' },
  { value: 'video_thumbnail', label: 'Thumbnail Video' },
  { value: 'logo', label: 'Logo / Branding' },
  { value: 'packaging', label: 'Packaging Design' },
  { value: 'event_material', label: 'Material Event' },
  { value: 'email_template', label: 'Template Email' },
  { value: 'web_banner', label: 'Banner Website' },
  { value: 'merchandise', label: 'Design Merchandise' },
  { value: 'other', label: 'Lainnya' },
]

const MOOD_OPTIONS = ['professional', 'playful', 'bold', 'minimalist', 'elegant', 'modern', 'retro', 'colorful', 'dark', 'clean']
const OUTPUT_FORMATS = ['png', 'jpg', 'pdf', 'psd', 'ai', 'svg', 'mp4', 'gif']
const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'twitter', 'website', 'email', 'print']
const PRIORITIES = [
  { value: 'low', label: 'Low (> 1 minggu)', color: 'bg-gray-100 text-gray-700' },
  { value: 'medium', label: 'Medium (< 1 minggu)', color: 'bg-blue-100 text-blue-700' },
  { value: 'high', label: 'High (< 3 hari)', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'urgent', label: 'Urgent (< 24 jam)', color: 'bg-red-100 text-red-700' },
]

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITIES.find(p => p.value === priority) || PRIORITIES[1]
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>{cfg.label.split(' ')[0]}</span>
}

function formatDate(d: string) { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) }
function formatDateTime(d: string) { return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }

function formatDuration(ms: number) {
  if (ms <= 0) return '-'
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (hours >= 24) { const days = Math.floor(hours / 24); const remainHours = hours % 24; return `${days} hari ${remainHours} jam` }
  if (hours > 0) return `${hours} jam ${mins} menit`
  return `${mins} menit`
}

// ============================================================
// Main Dashboard
// ============================================================

export default function DesignRequestDashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  const [requests, setRequests] = useState<DesignRequest[]>([])
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showMyOnly, setShowMyOnly] = useState(false)

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<DesignRequest | null>(null)
  const [detailVersions, setDetailVersions] = useState<DesignVersion[]>([])
  const [detailComments, setDetailComments] = useState<Comment[]>([])
  const [detailTimeMetrics, setDetailTimeMetrics] = useState<any>(null)
  const [showDeliverDialog, setShowDeliverDialog] = useState(false)
  const [showReviewDialog, setShowReviewDialog] = useState(false)
  const [showStatusDialog, setShowStatusDialog] = useState(false)
  const [reviewingVersion, setReviewingVersion] = useState<DesignVersion | null>(null)
  const [statusTarget, setStatusTarget] = useState('')
  const [statusComment, setStatusComment] = useState('')

  // Form state
  const [form, setForm] = useState({
    title: '', description: '', design_type: 'social_media_post', design_subtype: '',
    platform_target: [] as string[], dimensions: '', brand_guidelines: '',
    reference_urls: [''] as string[], reference_notes: '', copy_text: '', cta_text: '',
    color_preferences: '', mood_tone: '', output_format: ['png'] as string[],
    quantity: '1', priority: 'medium', deadline: '', campaign_id: '',
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deliverForm, setDeliverForm] = useState({ design_url: '', design_url_2: '', file_format: 'png', notes: '' })
  const [reviewForm, setReviewForm] = useState({ review_status: 'approved', review_comment: '' })
  const [newComment, setNewComment] = useState('')

  // ============================================================
  // Data Fetching
  // ============================================================

  const fetchRequests = useCallback(async () => {
    try {
      let url = `/api/marketing/design-requests?limit=100`
      if (filterStatus !== 'all') url += `&status=${filterStatus}`
      if (filterType !== 'all') url += `&design_type=${filterType}`
      if (filterPriority !== 'all') url += `&priority=${filterPriority}`
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`
      if (showMyOnly) url += `&my_requests=true`
      const res = await fetch(url)
      if (res.ok) { const data = await res.json(); setRequests(data.requests || []) }
    } catch (e) { console.error('Error fetching requests:', e) }
  }, [filterStatus, filterType, filterPriority, searchQuery, showMyOnly])

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/design-requests/analytics')
      if (res.ok) setAnalytics(await res.json())
    } catch (e) { console.error('Error fetching analytics:', e) }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchRequests(), fetchAnalytics()]).finally(() => setLoading(false))
  }, [fetchRequests, fetchAnalytics])

  // ============================================================
  // Actions
  // ============================================================

  const handleCreate = async (submitImmediately = false) => {
    if (!form.title || !form.description || !form.design_type) return
    try {
      const body: any = {
        ...form,
        quantity: parseInt(form.quantity) || 1,
        reference_urls: form.reference_urls.filter(u => u.trim()),
        platform_target: form.platform_target,
        output_format: form.output_format,
        deadline: form.deadline || null,
        campaign_id: form.campaign_id || null,
        design_subtype: form.design_subtype || null,
        submit_immediately: submitImmediately,
      }
      const url = editingId ? `/api/marketing/design-requests/${editingId}` : '/api/marketing/design-requests'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) { setShowCreateDialog(false); resetForm(); fetchRequests(); fetchAnalytics() }
    } catch (e) { console.error('Error saving request:', e) }
  }

  const handleStatusChange = async () => {
    if (!selectedRequest || !statusTarget) return
    try {
      const res = await fetch(`/api/marketing/design-requests/${selectedRequest.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusTarget, comment: statusComment || undefined }),
      })
      if (res.ok) { setShowStatusDialog(false); setStatusComment(''); fetchRequests(); fetchAnalytics(); if (showDetailDialog) openDetail(selectedRequest.id) }
    } catch (e) { console.error('Error:', e) }
  }

  const handleDeliver = async () => {
    if (!selectedRequest || !deliverForm.design_url) return
    try {
      const res = await fetch(`/api/marketing/design-requests/${selectedRequest.id}/versions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...deliverForm, design_url_2: deliverForm.design_url_2 || null }),
      })
      if (res.ok) { setShowDeliverDialog(false); setDeliverForm({ design_url: '', design_url_2: '', file_format: 'png', notes: '' }); fetchRequests(); openDetail(selectedRequest.id) }
    } catch (e) { console.error('Error:', e) }
  }

  const handleReview = async () => {
    if (!selectedRequest || !reviewingVersion) return
    try {
      const res = await fetch(`/api/marketing/design-requests/${selectedRequest.id}/versions/${reviewingVersion.id}/review`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewForm),
      })
      if (res.ok) { setShowReviewDialog(false); setReviewForm({ review_status: 'approved', review_comment: '' }); fetchRequests(); fetchAnalytics(); openDetail(selectedRequest.id) }
    } catch (e) { console.error('Error:', e) }
  }

  const handleAddComment = async () => {
    if (!selectedRequest || !newComment.trim()) return
    try {
      const res = await fetch(`/api/marketing/design-requests/${selectedRequest.id}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: newComment }),
      })
      if (res.ok) { setNewComment(''); openDetail(selectedRequest.id) }
    } catch (e) { console.error('Error:', e) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus design request ini?')) return
    try {
      const res = await fetch(`/api/marketing/design-requests/${id}`, { method: 'DELETE' })
      if (res.ok) { setShowDetailDialog(false); fetchRequests(); fetchAnalytics() }
    } catch (e) { console.error('Error:', e) }
  }

  const openDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/marketing/design-requests/${id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedRequest(data.request)
        setDetailVersions(data.versions || [])
        setDetailComments(data.comments || [])
        setDetailTimeMetrics(data.timeMetrics || {})
        setShowDetailDialog(true)
      }
    } catch (e) { console.error('Error:', e) }
  }

  const openStatusChange = (req: DesignRequest, target: string) => {
    setSelectedRequest(req); setStatusTarget(target); setStatusComment(''); setShowStatusDialog(true)
  }

  const resetForm = () => {
    setEditingId(null)
    setForm({
      title: '', description: '', design_type: 'social_media_post', design_subtype: '',
      platform_target: [], dimensions: '', brand_guidelines: '',
      reference_urls: [''], reference_notes: '', copy_text: '', cta_text: '',
      color_preferences: '', mood_tone: '', output_format: ['png'],
      quantity: '1', priority: 'medium', deadline: '', campaign_id: '',
    })
  }

  // Active requests for overview
  const activeRequests = requests.filter(r => !['approved', 'cancelled', 'draft'].includes(r.status))
  const overdueRequests = requests.filter(r => r.deadline && r.deadline < new Date().toISOString().split('T')[0] && !['approved', 'cancelled'].includes(r.status))

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
            <Palette className="h-6 w-6" /> Design Request (VDCO)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Request dan tracking produksi visual design oleh VSDO</p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreateDialog(true) }} size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Buat Request Baru
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="gap-1 text-xs sm:text-sm"><LayoutGrid className="h-3.5 w-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="requests" className="gap-1 text-xs sm:text-sm"><List className="h-3.5 w-3.5" /> Semua Request</TabsTrigger>
          <TabsTrigger value="my_requests" className="gap-1 text-xs sm:text-sm"><User className="h-3.5 w-3.5" /> Request Saya</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1 text-xs sm:text-sm"><BarChart3 className="h-3.5 w-3.5" /> Analytics</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ===== OVERVIEW ===== */}
      {activeTab === 'overview' && analytics && (
        <div className="space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Total Request', value: analytics.kpis.total, icon: FileImage, color: 'text-blue-600' },
              { label: 'Sedang Aktif', value: analytics.kpis.active, icon: RefreshCw, color: 'text-yellow-600' },
              { label: 'Selesai', value: analytics.kpis.completed, icon: CheckCircle2, color: 'text-green-600' },
              { label: 'Menunggu Review', value: analytics.kpis.waitingReview, icon: Eye, color: 'text-purple-600' },
              { label: 'Perlu Revisi', value: analytics.kpis.revisionRequested, icon: RefreshCw, color: 'text-orange-600' },
            ].map(kpi => (
              <Card key={kpi.label}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                    <span className="text-xs text-muted-foreground">{kpi.label}</span>
                  </div>
                  <p className="text-xl font-bold">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Time Metrics */}
          {analytics.timeMetrics.completedCount > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card><CardContent className="p-3 text-center">
                <Timer className="h-4 w-4 mx-auto mb-1 text-blue-600" />
                <p className="text-[10px] text-muted-foreground uppercase">Avg Turnaround</p>
                <p className="font-bold text-sm">{formatDuration(analytics.timeMetrics.avgTurnaroundMs)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <Zap className="h-4 w-4 mx-auto mb-1 text-yellow-600" />
                <p className="text-[10px] text-muted-foreground uppercase">Avg First Delivery</p>
                <p className="font-bold text-sm">{formatDuration(analytics.timeMetrics.avgFirstDeliveryMs)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <RefreshCw className="h-4 w-4 mx-auto mb-1 text-orange-600" />
                <p className="text-[10px] text-muted-foreground uppercase">Avg Revisi</p>
                <p className="font-bold text-sm">{analytics.timeMetrics.avgRevisions}x</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <Target className="h-4 w-4 mx-auto mb-1 text-green-600" />
                <p className="text-[10px] text-muted-foreground uppercase">SLA On Time</p>
                <p className="font-bold text-sm">{analytics.timeMetrics.slaOnTime}/{analytics.timeMetrics.slaTotal}</p>
              </CardContent></Card>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Active Requests */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><Clock className="h-4 w-4" /> Request Aktif ({activeRequests.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-80 overflow-y-auto">
                {activeRequests.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">Tidak ada request aktif</p>}
                {activeRequests.map(r => (
                  <div key={r.id} className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50" onClick={() => openDetail(r.id)}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{DESIGN_TYPES.find(t => t.value === r.design_type)?.label || r.design_type} • {r.requester?.name}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Overdue */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Overdue ({overdueRequests.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-80 overflow-y-auto">
                {overdueRequests.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">Semua request on track</p>}
                {overdueRequests.map(r => (
                  <div key={r.id} className="flex items-center gap-2 p-2 rounded border border-amber-200 dark:border-amber-800 cursor-pointer hover:bg-muted/50" onClick={() => openDetail(r.id)}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <p className="text-xs text-red-600">Deadline: {formatDate(r.deadline!)}</p>
                    </div>
                    <PriorityBadge priority={r.priority} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Design Type Distribution */}
          {analytics.byType && Object.keys(analytics.byType).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><Image className="h-4 w-4" /> Distribusi Tipe Design</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(analytics.byType as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/30">
                      <span className="text-xs">{DESIGN_TYPES.find(t => t.value === type)?.label || type}</span>
                      <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ===== REQUEST LIST ===== */}
      {(activeTab === 'requests' || activeTab === 'my_requests') && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari judul atau deskripsi..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-9 text-sm" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tipe</SelectItem>
                {DESIGN_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-[120px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Prioritas</SelectItem>
                {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label.split(' ')[0]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left p-3 font-medium">Request</th>
                      <th className="text-left p-3 font-medium hidden sm:table-cell">Tipe</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">Prioritas</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">Deadline</th>
                      <th className="text-left p-3 font-medium hidden lg:table-cell">Requester</th>
                      <th className="text-left p-3 font-medium hidden lg:table-cell">VSDO</th>
                      <th className="text-left p-3 font-medium hidden lg:table-cell">Versi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.length === 0 && (
                      <tr><td colSpan={8} className="text-center text-muted-foreground py-8 text-xs">Tidak ada request</td></tr>
                    )}
                    {requests.filter(r => activeTab === 'my_requests' ? true : true).map(r => (
                      <tr key={r.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => openDetail(r.id)}>
                        <td className="p-3">
                          <p className="font-medium truncate max-w-[200px]">{r.title}</p>
                          <p className="text-xs text-muted-foreground sm:hidden">{DESIGN_TYPES.find(t => t.value === r.design_type)?.label}</p>
                        </td>
                        <td className="p-3 hidden sm:table-cell text-xs">{DESIGN_TYPES.find(t => t.value === r.design_type)?.label || r.design_type}</td>
                        <td className="p-3"><StatusBadge status={r.status} /></td>
                        <td className="p-3 hidden md:table-cell"><PriorityBadge priority={r.priority} /></td>
                        <td className="p-3 hidden md:table-cell text-xs">{r.deadline ? formatDate(r.deadline) : '-'}</td>
                        <td className="p-3 hidden lg:table-cell text-xs">{r.requester?.name || '-'}</td>
                        <td className="p-3 hidden lg:table-cell text-xs">{r.assignee?.name || '-'}</td>
                        <td className="p-3 hidden lg:table-cell text-xs">{r.version_count || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== ANALYTICS ===== */}
      {activeTab === 'analytics' && analytics && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Request</p>
              <p className="text-2xl font-bold">{analytics.kpis.total}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Completion Rate</p>
              <p className="text-2xl font-bold">{analytics.kpis.total > 0 ? Math.round((analytics.kpis.completed / analytics.kpis.total) * 100) : 0}%</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Avg Turnaround</p>
              <p className="text-lg font-bold">{formatDuration(analytics.timeMetrics.avgTurnaroundMs)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Avg Revisi</p>
              <p className="text-2xl font-bold">{analytics.timeMetrics.avgRevisions}x</p>
            </CardContent></Card>
          </div>

          {/* Status Breakdown */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Status Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(analytics.byStatus as Record<string, number>).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-2 p-2 border rounded">
                    <StatusBadge status={status} />
                    <span className="font-bold ml-auto">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Requesters */}
          {analytics.topRequesters?.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top Requester</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analytics.topRequesters.map((r: any) => (
                    <div key={r.user_id} className="flex items-center gap-2 p-2 border rounded">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1"><p className="text-sm font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.role}</p></div>
                      <Badge variant="secondary">{r.count} request</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {analytics.overdue > 0 && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="font-medium text-sm">{analytics.overdue} request melewati deadline</p>
                  <p className="text-xs text-muted-foreground">Lihat tab request untuk detail</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ===== CREATE REQUEST DIALOG ===== */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> {editingId ? 'Edit' : 'Buat'} Design Request</DialogTitle>
            <DialogDescription>Isi brief selengkap mungkin agar VSDO memahami kebutuhan Anda</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {/* Section 1: Basic Info */}
            <div className="p-3 bg-muted/30 rounded-lg space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Informasi Dasar</p>
              <div className="grid gap-2">
                <Label>Judul Request *</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Contoh: Design Post Instagram untuk Promo Lebaran" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Tipe Design *</Label>
                  <Select value={form.design_type} onValueChange={v => setForm(f => ({ ...f, design_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DESIGN_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Sub-tipe (opsional)</Label>
                  <Input value={form.design_subtype} onChange={e => setForm(f => ({ ...f, design_subtype: e.target.value }))} placeholder="Variasi, seri, dll" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label>Prioritas *</Label>
                  <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Deadline</Label>
                  <Input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Jumlah Variasi</Label>
                  <Input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Section 2: Brief & Description */}
            <div className="p-3 bg-muted/30 rounded-lg space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Brief & Deskripsi</p>
              <div className="grid gap-2">
                <Label>Deskripsi Detail Kebutuhan *</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4}
                  placeholder="Jelaskan detail kebutuhan design: tujuan, konteks penggunaan, target audience, pesan utama yang ingin disampaikan, dll." />
              </div>
              <div className="grid gap-2">
                <Label>Teks / Copywriting yang Harus Ada di Design</Label>
                <Textarea value={form.copy_text} onChange={e => setForm(f => ({ ...f, copy_text: e.target.value }))} rows={3}
                  placeholder="Contoh: Headline: 'Diskon 50% untuk Semua Layanan' / Subheadline: 'Berlaku 1-30 Maret 2026'" />
              </div>
              <div className="grid gap-2">
                <Label>Call-to-Action (CTA)</Label>
                <Input value={form.cta_text} onChange={e => setForm(f => ({ ...f, cta_text: e.target.value }))} placeholder="Contoh: Hubungi Kami Sekarang, Daftar Gratis, Pesan Sekarang" />
              </div>
              <div className="grid gap-2">
                <Label>Platform Tujuan</Label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map(p => (
                    <label key={p} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="checkbox" checked={form.platform_target.includes(p)} onChange={e => setForm(f => ({
                        ...f, platform_target: e.target.checked ? [...f.platform_target, p] : f.platform_target.filter(x => x !== p),
                      }))} className="rounded" />
                      <span className="capitalize">{p}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 3: Visual Specs */}
            <div className="p-3 bg-muted/30 rounded-lg space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Spesifikasi Visual</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Dimensi / Ukuran</Label>
                  <Input value={form.dimensions} onChange={e => setForm(f => ({ ...f, dimensions: e.target.value }))} placeholder="Contoh: 1080x1080, 1920x1080, A4" />
                </div>
                <div className="grid gap-2">
                  <Label>Preferensi Warna</Label>
                  <Input value={form.color_preferences} onChange={e => setForm(f => ({ ...f, color_preferences: e.target.value }))} placeholder="Contoh: Biru navy, Emas, sesuai brand" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Mood / Tone</Label>
                <div className="flex flex-wrap gap-2">
                  {MOOD_OPTIONS.map(m => (
                    <label key={m} className={`px-3 py-1 rounded-full border text-xs cursor-pointer transition-colors ${form.mood_tone === m ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                      <input type="radio" name="mood" value={m} checked={form.mood_tone === m} onChange={() => setForm(f => ({ ...f, mood_tone: m }))} className="sr-only" />
                      {m}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Brand Guidelines / Catatan</Label>
                <Textarea value={form.brand_guidelines} onChange={e => setForm(f => ({ ...f, brand_guidelines: e.target.value }))} rows={2}
                  placeholder="Font, logo usage, elemen brand yang harus ada, dll." />
              </div>
              <div className="grid gap-2">
                <Label>Format Output</Label>
                <div className="flex flex-wrap gap-2">
                  {OUTPUT_FORMATS.map(fmt => (
                    <label key={fmt} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="checkbox" checked={form.output_format.includes(fmt)} onChange={e => setForm(f => ({
                        ...f, output_format: e.target.checked ? [...f.output_format, fmt] : f.output_format.filter(x => x !== fmt),
                      }))} className="rounded" />
                      <span className="uppercase">{fmt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 4: References */}
            <div className="p-3 bg-muted/30 rounded-lg space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Referensi Visual</p>
              <div className="grid gap-2">
                <Label>URL Referensi (sampai 5 link)</Label>
                {form.reference_urls.map((url, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={url} onChange={e => { const urls = [...form.reference_urls]; urls[i] = e.target.value; setForm(f => ({ ...f, reference_urls: urls })) }}
                      placeholder="https://dribbble.com/... atau URL Pinterest/Google Drive" className="text-sm" />
                    {form.reference_urls.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setForm(f => ({ ...f, reference_urls: f.reference_urls.filter((_, j) => j !== i) }))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                {form.reference_urls.length < 5 && (
                  <Button variant="outline" size="sm" className="text-xs w-fit" onClick={() => setForm(f => ({ ...f, reference_urls: [...f.reference_urls, ''] }))}>
                    <Plus className="h-3 w-3 mr-1" /> Tambah Link Referensi
                  </Button>
                )}
              </div>
              <div className="grid gap-2">
                <Label>Catatan Referensi</Label>
                <Textarea value={form.reference_notes} onChange={e => setForm(f => ({ ...f, reference_notes: e.target.value }))} rows={2}
                  placeholder="Jelaskan apa yang disukai dari referensi: warnanya, layoutnya, stylenya, dll." />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Batal</Button>
            <Button variant="secondary" onClick={() => handleCreate(false)}>Simpan Draft</Button>
            <Button onClick={() => handleCreate(true)} className="gap-1"><Send className="h-4 w-4" /> Kirim ke VSDO</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DETAIL DIALOG ===== */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedRequest && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedRequest.title}</DialogTitle>
                <DialogDescription>
                  {DESIGN_TYPES.find(t => t.value === selectedRequest.design_type)?.label} •
                  Oleh {selectedRequest.requester?.name} •
                  {selectedRequest.deadline ? ` Deadline: ${formatDate(selectedRequest.deadline)}` : ' Tanpa deadline'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* Status + Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={selectedRequest.status} />
                  <PriorityBadge priority={selectedRequest.priority} />
                  {selectedRequest.revision_count > 0 && <Badge variant="outline" className="text-xs">{selectedRequest.revision_count}x revisi</Badge>}
                  {selectedRequest.assignee && <Badge variant="secondary" className="text-xs">VSDO: {selectedRequest.assignee.name}</Badge>}
                  <div className="flex-1" />
                  {/* Action buttons */}
                  {selectedRequest.status === 'draft' && <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => openStatusChange(selectedRequest, 'submitted')}><Send className="h-3 w-3" /> Kirim ke VSDO</Button>}
                  {selectedRequest.status === 'submitted' && <Button size="sm" variant="default" className="text-xs gap-1" onClick={() => openStatusChange(selectedRequest, 'accepted')}><CheckCircle2 className="h-3 w-3" /> Terima Request</Button>}
                  {selectedRequest.status === 'accepted' && <Button size="sm" variant="default" className="text-xs gap-1" onClick={() => openStatusChange(selectedRequest, 'in_progress')}><RefreshCw className="h-3 w-3" /> Mulai Kerjakan</Button>}
                  {(selectedRequest.status === 'in_progress' || selectedRequest.status === 'accepted') && (
                    <Button size="sm" variant="default" className="text-xs gap-1" onClick={() => { setDeliverForm({ design_url: '', design_url_2: '', file_format: 'png', notes: '' }); setShowDeliverDialog(true) }}>
                      <Upload className="h-3 w-3" /> Kirim Design
                    </Button>
                  )}
                  {selectedRequest.status === 'revision_requested' && <Button size="sm" variant="default" className="text-xs gap-1" onClick={() => openStatusChange(selectedRequest, 'in_progress')}><RefreshCw className="h-3 w-3" /> Mulai Revisi</Button>}
                </div>

                {/* Time Metrics */}
                {detailTimeMetrics && Object.keys(detailTimeMetrics).length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {detailTimeMetrics.timeToAcceptMs && <div className="p-2 border rounded text-center"><p className="text-[10px] text-muted-foreground">Waktu Diterima</p><p className="font-bold text-xs">{formatDuration(detailTimeMetrics.timeToAcceptMs)}</p></div>}
                    {detailTimeMetrics.timeToFirstDeliveryMs && <div className="p-2 border rounded text-center"><p className="text-[10px] text-muted-foreground">Delivery Pertama</p><p className="font-bold text-xs">{formatDuration(detailTimeMetrics.timeToFirstDeliveryMs)}</p></div>}
                    {detailTimeMetrics.totalTurnaroundMs && <div className="p-2 border rounded text-center"><p className="text-[10px] text-muted-foreground">Total Waktu</p><p className="font-bold text-xs">{formatDuration(detailTimeMetrics.totalTurnaroundMs)}</p></div>}
                    {detailTimeMetrics.slaStatus && (
                      <div className={`p-2 border rounded text-center ${detailTimeMetrics.slaStatus === 'on_time' || detailTimeMetrics.slaStatus === 'on_track' ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800'}`}>
                        <p className="text-[10px] text-muted-foreground">SLA</p>
                        <p className={`font-bold text-xs ${detailTimeMetrics.slaStatus === 'on_time' || detailTimeMetrics.slaStatus === 'on_track' ? 'text-green-600' : 'text-red-600'}`}>
                          {detailTimeMetrics.slaStatus === 'on_time' ? 'On Time' : detailTimeMetrics.slaStatus === 'on_track' ? 'On Track' : detailTimeMetrics.slaStatus === 'at_risk' ? 'At Risk' : 'Overdue'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Brief */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Brief / Deskripsi</Label>
                  <div className="p-3 bg-muted/50 rounded text-sm whitespace-pre-wrap">{selectedRequest.description}</div>
                </div>
                {selectedRequest.copy_text && <div><Label className="text-xs text-muted-foreground">Copy / Teks</Label><p className="text-sm mt-1 p-2 bg-muted/30 rounded whitespace-pre-wrap">{selectedRequest.copy_text}</p></div>}
                {selectedRequest.cta_text && <div><Label className="text-xs text-muted-foreground">CTA</Label><p className="text-sm mt-1">{selectedRequest.cta_text}</p></div>}

                {/* Specs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {selectedRequest.dimensions && <div className="p-2 border rounded"><p className="text-muted-foreground">Dimensi</p><p className="font-medium">{selectedRequest.dimensions}</p></div>}
                  {selectedRequest.color_preferences && <div className="p-2 border rounded"><p className="text-muted-foreground">Warna</p><p className="font-medium">{selectedRequest.color_preferences}</p></div>}
                  {selectedRequest.mood_tone && <div className="p-2 border rounded"><p className="text-muted-foreground">Mood</p><p className="font-medium capitalize">{selectedRequest.mood_tone}</p></div>}
                  {selectedRequest.output_format?.length > 0 && <div className="p-2 border rounded"><p className="text-muted-foreground">Format</p><p className="font-medium uppercase">{selectedRequest.output_format.join(', ')}</p></div>}
                </div>

                {/* References */}
                {selectedRequest.reference_urls?.length > 0 && selectedRequest.reference_urls.some(u => u) && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Referensi Visual</Label>
                    <div className="space-y-1 mt-1">
                      {selectedRequest.reference_urls.filter(u => u).map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> {url}
                        </a>
                      ))}
                    </div>
                    {selectedRequest.reference_notes && <p className="text-xs text-muted-foreground mt-1">{selectedRequest.reference_notes}</p>}
                  </div>
                )}

                {/* Version Gallery */}
                {detailVersions.length > 0 && (
                  <div className="border-t pt-3">
                    <Label className="text-xs text-muted-foreground mb-2 block">Design Versions ({detailVersions.length})</Label>
                    <div className="space-y-3">
                      {detailVersions.map(v => (
                        <div key={v.id} className={`p-3 rounded border ${v.review_status === 'approved' ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30' : v.review_status === 'revision_requested' ? 'border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/30' : 'border-border'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">v{v.version_number}</Badge>
                              <span className="text-xs text-muted-foreground">oleh {v.deliverer?.name} • {formatDateTime(v.delivered_at)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {v.review_status === 'approved' && <Badge className="bg-green-600 text-xs">Approved</Badge>}
                              {v.review_status === 'revision_requested' && <Badge variant="destructive" className="text-xs">Revisi</Badge>}
                              {v.review_status === 'pending' && selectedRequest.status === 'delivered' && (
                                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setReviewingVersion(v); setReviewForm({ review_status: 'approved', review_comment: '' }); setShowReviewDialog(true) }}>
                                  <Eye className="h-3 w-3 mr-1" /> Review
                                </Button>
                              )}
                            </div>
                          </div>
                          <a href={v.design_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" /> Buka Design v{v.version_number}
                          </a>
                          {v.design_url_2 && (
                            <a href={v.design_url_2} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline flex items-center gap-1 mt-1">
                              <ExternalLink className="h-3 w-3" /> Link Tambahan
                            </a>
                          )}
                          {v.notes && <p className="text-xs text-muted-foreground mt-1">{v.notes}</p>}
                          {v.review_comment && (
                            <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                              <span className="font-medium">{v.reviewer?.name}: </span>{v.review_comment}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments */}
                <div className="border-t pt-3">
                  <Label className="text-xs text-muted-foreground mb-2 block">Diskusi ({detailComments.length})</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                    {detailComments.map(c => (
                      <div key={c.id} className={`p-2 rounded text-sm ${c.comment_type === 'revision_feedback' ? 'bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800' : c.comment_type === 'approval' ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800' : c.comment_type === 'system' ? 'bg-muted/30 italic' : 'bg-muted/50'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-xs">{c.commenter?.name}</span>
                          <span className="text-[10px] text-muted-foreground">{formatDateTime(c.created_at)}</span>
                          {c.comment_type !== 'comment' && <Badge variant="outline" className="text-[10px]">{c.comment_type}</Badge>}
                          {c.version_ref && <Badge variant="secondary" className="text-[10px]">v{c.version_ref}</Badge>}
                        </div>
                        <p className="text-xs">{c.comment}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Tulis pesan..." className="text-sm" onKeyDown={e => e.key === 'Enter' && handleAddComment()} />
                    <Button size="sm" onClick={handleAddComment} disabled={!newComment.trim()}>Kirim</Button>
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                {selectedRequest.status === 'draft' && (
                  <Button variant="ghost" size="sm" className="text-red-600 gap-1" onClick={() => handleDelete(selectedRequest.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Hapus
                  </Button>
                )}
                <div className="flex-1" />
                {['draft', 'submitted'].includes(selectedRequest.status) && !['approved', 'cancelled'].includes(selectedRequest.status) && (
                  <Button variant="ghost" size="sm" className="text-red-600 text-xs" onClick={() => openStatusChange(selectedRequest, 'cancelled')}>Batalkan</Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== DELIVER DIALOG ===== */}
      <Dialog open={showDeliverDialog} onOpenChange={setShowDeliverDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Kirim Design</DialogTitle>
            <DialogDescription>Upload URL hasil design untuk {selectedRequest?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>URL Design Utama *</Label>
              <Input value={deliverForm.design_url} onChange={e => setDeliverForm(f => ({ ...f, design_url: e.target.value }))} placeholder="https://drive.google.com/... atau URL Figma" />
            </div>
            <div className="grid gap-2">
              <Label>URL Tambahan (opsional)</Label>
              <Input value={deliverForm.design_url_2} onChange={e => setDeliverForm(f => ({ ...f, design_url_2: e.target.value }))} placeholder="URL backup atau alternatif" />
            </div>
            <div className="grid gap-2">
              <Label>Format File</Label>
              <Select value={deliverForm.file_format} onValueChange={v => setDeliverForm(f => ({ ...f, file_format: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OUTPUT_FORMATS.map(fmt => <SelectItem key={fmt} value={fmt}>{fmt.toUpperCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Catatan untuk Requester</Label>
              <Textarea value={deliverForm.notes} onChange={e => setDeliverForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Catatan tentang design ini..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeliverDialog(false)}>Batal</Button>
            <Button onClick={handleDeliver} disabled={!deliverForm.design_url} className="gap-1"><Send className="h-4 w-4" /> Kirim Design</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== REVIEW DIALOG ===== */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Design v{reviewingVersion?.version_number}</DialogTitle>
            <DialogDescription>Approve design atau minta revisi</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {reviewingVersion && (
              <a href={reviewingVersion.design_url} target="_blank" rel="noopener noreferrer" className="p-3 border rounded flex items-center gap-2 text-blue-600 hover:bg-muted/50">
                <ExternalLink className="h-4 w-4" /> Buka Design v{reviewingVersion.version_number}
              </a>
            )}
            <div className="grid gap-2">
              <Label>Keputusan *</Label>
              <div className="flex gap-2">
                <Button variant={reviewForm.review_status === 'approved' ? 'default' : 'outline'} size="sm" className="flex-1 gap-1"
                  onClick={() => setReviewForm(f => ({ ...f, review_status: 'approved' }))}>
                  <CheckCircle2 className="h-4 w-4" /> Approve
                </Button>
                <Button variant={reviewForm.review_status === 'revision_requested' ? 'destructive' : 'outline'} size="sm" className="flex-1 gap-1"
                  onClick={() => setReviewForm(f => ({ ...f, review_status: 'revision_requested' }))}>
                  <RefreshCw className="h-4 w-4" /> Minta Revisi
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{reviewForm.review_status === 'revision_requested' ? 'Feedback Revisi *' : 'Komentar (opsional)'}</Label>
              <Textarea value={reviewForm.review_comment} onChange={e => setReviewForm(f => ({ ...f, review_comment: e.target.value }))} rows={3}
                placeholder={reviewForm.review_status === 'revision_requested' ? 'Jelaskan apa yang perlu direvisi...' : 'Tambahkan catatan...'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReviewDialog(false)}>Batal</Button>
            <Button onClick={handleReview} disabled={reviewForm.review_status === 'revision_requested' && !reviewForm.review_comment.trim()}
              variant={reviewForm.review_status === 'revision_requested' ? 'destructive' : 'default'}>
              {reviewForm.review_status === 'approved' ? 'Approve Design' : 'Kirim Feedback Revisi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== STATUS CHANGE DIALOG ===== */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusTarget === 'submitted' && 'Kirim ke VSDO'}
              {statusTarget === 'accepted' && 'Terima Request'}
              {statusTarget === 'in_progress' && 'Mulai Kerjakan'}
              {statusTarget === 'cancelled' && 'Batalkan Request'}
              {statusTarget === 'revision_requested' && 'Minta Revisi'}
            </DialogTitle>
            <DialogDescription>{selectedRequest?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {statusTarget === 'submitted' && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded text-xs text-blue-700 dark:text-blue-300">
                Request akan dikirim ke tim VSDO. Pastikan brief sudah lengkap.
              </div>
            )}
            {statusTarget === 'cancelled' && (
              <div className="p-3 bg-red-50 dark:bg-red-950 rounded text-xs text-red-700 dark:text-red-300">
                Request yang dibatalkan tidak bisa dikerjakan lagi.
              </div>
            )}
            <div className="grid gap-2">
              <Label>{statusTarget === 'cancelled' ? 'Alasan Pembatalan' : 'Catatan (opsional)'}</Label>
              <Textarea value={statusComment} onChange={e => setStatusComment(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>Batal</Button>
            <Button onClick={handleStatusChange} variant={statusTarget === 'cancelled' ? 'destructive' : 'default'}>
              {statusTarget === 'submitted' && 'Kirim'}
              {statusTarget === 'accepted' && 'Terima'}
              {statusTarget === 'in_progress' && 'Mulai'}
              {statusTarget === 'cancelled' && 'Batalkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
