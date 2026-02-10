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
  FileEdit, Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon,
  List, LayoutGrid, Clock, AlertTriangle, CheckCircle2, Eye, Send,
  XCircle, Archive, MessageSquare, Hash, Bookmark, FileText, Search,
  MoreHorizontal, Trash2, Edit, Link2, ArrowUpRight, ArrowDownRight,
  Minus, Filter, Tag,
} from 'lucide-react'
import { SocialIconBadge, SocialIconInline, PLATFORM_CONFIGS } from '@/components/marketing/social-media-icons'

// ============================================================
// Types
// ============================================================

interface ContentPlan {
  id: string
  title: string
  caption: string | null
  notes: string | null
  platform: string
  content_type: string
  scheduled_date: string
  scheduled_time: string | null
  status: string
  status_changed_at: string | null
  created_by: string
  assigned_to: string | null
  priority: string
  visual_url: string | null
  campaign_id: string | null
  parent_plan_id: string | null
  target_views: number | null
  target_likes: number | null
  target_comments: number | null
  target_shares: number | null
  target_engagement_rate: number | null
  linked_content_id: number | null
  published_at: string | null
  created_at: string
  updated_at: string
  campaign?: { id: string; name: string; color: string } | null
  creator?: { user_id: string; name: string; role: string } | null
  assignee?: { user_id: string; name: string; role: string } | null
  hashtags?: { hashtag: { id: number; tag: string; category: string } }[]
}

interface Campaign {
  id: string; name: string; description?: string; color: string
  start_date?: string; end_date?: string; status: string
  totalPlans: number; publishedPlans: number
  creator?: { name: string }
}

interface Hashtag {
  id: number; tag: string; category: string; platforms: string[]; usage_count: number
}

interface Template {
  id: number; name: string; platform?: string; content_type?: string
  caption_template?: string; default_hashtag_ids: number[]; notes?: string; usage_count: number
}

interface Comment {
  id: number; comment: string; comment_type: string; created_at: string
  commenter?: { name: string; role: string }
}

interface KPIs {
  totalPlanned: number; published: number; inReview: number
  draft: number; approved: number; rejected: number; completionRate: number
}

// ============================================================
// Constants
// ============================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: FileEdit },
  in_review: { label: 'In Review', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', icon: Eye },
  approved: { label: 'Approved', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: XCircle },
  published: { label: 'Published', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: Send },
  archived: { label: 'Archived', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: Archive },
}

const CONTENT_TYPES = ['post', 'video', 'reel', 'story', 'short', 'carousel', 'live', 'article']
const PRIORITIES = ['low', 'medium', 'high']
const PLATFORMS = PLATFORM_CONFIGS.map(p => p.id)
const HASHTAG_CATEGORIES = ['brand', 'product', 'campaign', 'industry', 'trending', 'general']

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    high: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[priority] || colors.medium}`}>{priority}</span>
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ============================================================
// Main Dashboard
// ============================================================

export default function ContentPlanDashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  const [plans, setPlans] = useState<ContentPlan[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [hashtags, setHashtags] = useState<Hashtag[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [upcoming, setUpcoming] = useState<ContentPlan[]>([])
  const [needsAttention, setNeedsAttention] = useState<ContentPlan[]>([])
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Calendar state
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })

  // Filters
  const [filterPlatform, setFilterPlatform] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<ContentPlan | null>(null)
  const [detailComments, setDetailComments] = useState<Comment[]>([])
  const [detailLinkedContent, setDetailLinkedContent] = useState<any>(null)
  const [showStatusDialog, setShowStatusDialog] = useState(false)
  const [statusTarget, setStatusTarget] = useState('')
  const [statusComment, setStatusComment] = useState('')
  const [showCampaignDialog, setShowCampaignDialog] = useState(false)
  const [showHashtagDialog, setShowHashtagDialog] = useState(false)
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)

  // Form state
  const [form, setForm] = useState({
    title: '', platform: 'instagram', content_type: 'post', scheduled_date: '',
    scheduled_time: '', caption: '', notes: '', campaign_id: '', assigned_to: '',
    priority: 'medium', visual_url: '', target_views: '', target_likes: '',
    target_engagement_rate: '', hashtag_ids: [] as number[],
    cross_post_platforms: [] as string[],
  })
  const [campaignForm, setCampaignForm] = useState({ name: '', description: '', color: '#6366f1', start_date: '', end_date: '' })
  const [hashtagForm, setHashtagForm] = useState({ tag: '', category: 'general' })
  const [templateForm, setTemplateForm] = useState({ name: '', platform: '', content_type: '', caption_template: '', notes: '' })
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [newComment, setNewComment] = useState('')

  // ============================================================
  // Data Fetching
  // ============================================================

  const fetchOverview = useCallback(async () => {
    try {
      const month = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, '0')}`
      const res = await fetch(`/api/marketing/content-plan/overview?month=${month}`)
      if (res.ok) {
        const data = await res.json()
        setKpis(data.kpis)
        setUpcoming(data.upcoming || [])
        setNeedsAttention(data.needsAttention || [])
        setRecentActivity(data.recentActivity || [])
      }
    } catch (e) { console.error('Error fetching overview:', e) }
  }, [calMonth])

  const fetchPlans = useCallback(async () => {
    try {
      const startDate = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).toISOString().split('T')[0]
      const endDate = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).toISOString().split('T')[0]
      let url = `/api/marketing/content-plan/plans?start_date=${startDate}&end_date=${endDate}&limit=100`
      if (filterPlatform !== 'all') url += `&platform=${filterPlatform}`
      if (filterStatus !== 'all') url += `&status=${filterStatus}`
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setPlans(data.plans || [])
      }
    } catch (e) { console.error('Error fetching plans:', e) }
  }, [calMonth, filterPlatform, filterStatus, searchQuery])

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/content-plan/campaigns')
      if (res.ok) { const data = await res.json(); setCampaigns(data.campaigns || []) }
    } catch (e) { console.error('Error fetching campaigns:', e) }
  }, [])

  const fetchHashtags = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/content-plan/hashtags?limit=200')
      if (res.ok) { const data = await res.json(); setHashtags(data.hashtags || []) }
    } catch (e) { console.error('Error fetching hashtags:', e) }
  }, [])

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/content-plan/templates')
      if (res.ok) { const data = await res.json(); setTemplates(data.templates || []) }
    } catch (e) { console.error('Error fetching templates:', e) }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchOverview(), fetchPlans(), fetchCampaigns(), fetchHashtags(), fetchTemplates()])
      .finally(() => setLoading(false))
  }, [fetchOverview, fetchPlans, fetchCampaigns, fetchHashtags, fetchTemplates])

  // ============================================================
  // Actions
  // ============================================================

  const handleCreatePlan = async (submitForReview = false) => {
    if (!form.title || !form.platform || !form.scheduled_date) return
    try {
      const body: any = {
        ...form,
        target_views: form.target_views ? parseInt(form.target_views) : null,
        target_likes: form.target_likes ? parseInt(form.target_likes) : null,
        target_engagement_rate: form.target_engagement_rate ? parseFloat(form.target_engagement_rate) / 100 : null,
        campaign_id: form.campaign_id || null,
        assigned_to: form.assigned_to || null,
        scheduled_time: form.scheduled_time || null,
        submit_for_review: submitForReview,
      }
      const url = editingPlanId ? `/api/marketing/content-plan/plans/${editingPlanId}` : '/api/marketing/content-plan/plans'
      const method = editingPlanId ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) {
        setShowCreateDialog(false)
        resetForm()
        fetchPlans()
        fetchOverview()
      }
    } catch (e) { console.error('Error saving plan:', e) }
  }

  const handleStatusChange = async () => {
    if (!selectedPlan || !statusTarget) return
    try {
      const res = await fetch(`/api/marketing/content-plan/plans/${selectedPlan.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusTarget, comment: statusComment || undefined }),
      })
      if (res.ok) {
        setShowStatusDialog(false)
        setStatusComment('')
        fetchPlans()
        fetchOverview()
        if (showDetailDialog) openDetail(selectedPlan.id)
      }
    } catch (e) { console.error('Error changing status:', e) }
  }

  const handleAddComment = async () => {
    if (!selectedPlan || !newComment.trim()) return
    try {
      const res = await fetch(`/api/marketing/content-plan/plans/${selectedPlan.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: newComment }),
      })
      if (res.ok) { setNewComment(''); openDetail(selectedPlan.id) }
    } catch (e) { console.error('Error adding comment:', e) }
  }

  const handleDeletePlan = async (id: string) => {
    if (!confirm('Hapus content plan ini?')) return
    try {
      const res = await fetch(`/api/marketing/content-plan/plans/${id}`, { method: 'DELETE' })
      if (res.ok) { setShowDetailDialog(false); fetchPlans(); fetchOverview() }
    } catch (e) { console.error('Error deleting plan:', e) }
  }

  const handleCreateCampaign = async () => {
    if (!campaignForm.name) return
    try {
      const res = await fetch('/api/marketing/content-plan/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignForm),
      })
      if (res.ok) { setShowCampaignDialog(false); setCampaignForm({ name: '', description: '', color: '#6366f1', start_date: '', end_date: '' }); fetchCampaigns() }
    } catch (e) { console.error('Error creating campaign:', e) }
  }

  const handleCreateHashtag = async () => {
    if (!hashtagForm.tag) return
    try {
      const res = await fetch('/api/marketing/content-plan/hashtags', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hashtagForm),
      })
      if (res.ok) { setShowHashtagDialog(false); setHashtagForm({ tag: '', category: 'general' }); fetchHashtags() }
    } catch (e) { console.error('Error creating hashtag:', e) }
  }

  const handleCreateTemplate = async () => {
    if (!templateForm.name) return
    try {
      const res = await fetch('/api/marketing/content-plan/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...templateForm, platform: templateForm.platform || null, content_type: templateForm.content_type || null }),
      })
      if (res.ok) { setShowTemplateDialog(false); setTemplateForm({ name: '', platform: '', content_type: '', caption_template: '', notes: '' }); fetchTemplates() }
    } catch (e) { console.error('Error creating template:', e) }
  }

  const openDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/marketing/content-plan/plans/${id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedPlan(data.plan)
        setDetailComments(data.comments || [])
        setDetailLinkedContent(data.linkedContent)
        setShowDetailDialog(true)
      }
    } catch (e) { console.error('Error fetching detail:', e) }
  }

  const openEdit = (plan: ContentPlan) => {
    setEditingPlanId(plan.id)
    setForm({
      title: plan.title,
      platform: plan.platform,
      content_type: plan.content_type,
      scheduled_date: plan.scheduled_date,
      scheduled_time: plan.scheduled_time || '',
      caption: plan.caption || '',
      notes: plan.notes || '',
      campaign_id: plan.campaign_id || '',
      assigned_to: plan.assigned_to || '',
      priority: plan.priority,
      visual_url: plan.visual_url || '',
      target_views: plan.target_views?.toString() || '',
      target_likes: plan.target_likes?.toString() || '',
      target_engagement_rate: plan.target_engagement_rate ? (plan.target_engagement_rate * 100).toString() : '',
      hashtag_ids: plan.hashtags?.map(h => h.hashtag.id) || [],
      cross_post_platforms: [],
    })
    setShowCreateDialog(true)
  }

  const openStatusChange = (plan: ContentPlan, targetStatus: string) => {
    setSelectedPlan(plan)
    setStatusTarget(targetStatus)
    setStatusComment('')
    setShowStatusDialog(true)
  }

  const resetForm = () => {
    setEditingPlanId(null)
    setForm({
      title: '', platform: 'instagram', content_type: 'post', scheduled_date: '',
      scheduled_time: '', caption: '', notes: '', campaign_id: '', assigned_to: '',
      priority: 'medium', visual_url: '', target_views: '', target_likes: '',
      target_engagement_rate: '', hashtag_ids: [], cross_post_platforms: [],
    })
  }

  const openCreate = (date?: string) => {
    resetForm()
    if (date) setForm(prev => ({ ...prev, scheduled_date: date }))
    setShowCreateDialog(true)
  }

  // ============================================================
  // Calendar helpers
  // ============================================================

  const calDays = (() => {
    const y = calMonth.getFullYear(), m = calMonth.getMonth()
    const firstDay = new Date(y, m, 1).getDay()
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const days: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let i = 1; i <= daysInMonth; i++) days.push(i)
    return days
  })()

  const plansForDay = (day: number) => {
    const dateStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return plans.filter(p => p.scheduled_date === dateStr)
  }

  const prevMonth = () => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
  const nextMonth = () => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
  const today = new Date().toISOString().split('T')[0]

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
            <FileEdit className="h-6 w-6" /> Content Plan
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Perencanaan dan tracking konten marketing di seluruh channel</p>
        </div>
        <Button onClick={() => openCreate()} size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Buat Konten
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="gap-1 text-xs sm:text-sm"><LayoutGrid className="h-3.5 w-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1 text-xs sm:text-sm"><CalendarIcon className="h-3.5 w-3.5" /> Kalender</TabsTrigger>
          <TabsTrigger value="list" className="gap-1 text-xs sm:text-sm"><List className="h-3.5 w-3.5" /> List</TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-1 text-xs sm:text-sm"><Bookmark className="h-3.5 w-3.5" /> Campaign</TabsTrigger>
          <TabsTrigger value="hashtags" className="gap-1 text-xs sm:text-sm"><Hash className="h-3.5 w-3.5" /> Hashtag</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1 text-xs sm:text-sm"><FileText className="h-3.5 w-3.5" /> Template</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ===== OVERVIEW TAB ===== */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* KPI Cards */}
          {kpis && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Planned', value: kpis.totalPlanned, icon: CalendarIcon, color: 'text-blue-600' },
                { label: 'Published', value: kpis.published, icon: Send, color: 'text-green-600' },
                { label: 'In Review', value: kpis.inReview, icon: Eye, color: 'text-yellow-600' },
                { label: 'Draft', value: kpis.draft, icon: FileEdit, color: 'text-gray-600' },
                { label: 'Rejected', value: kpis.rejected, icon: XCircle, color: 'text-red-600' },
                { label: 'Completion', value: `${kpis.completionRate}%`, icon: CheckCircle2, color: 'text-emerald-600' },
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
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Upcoming This Week */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><Clock className="h-4 w-4" /> Akan Datang Minggu Ini</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {upcoming.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">Tidak ada konten yang dijadwalkan minggu ini</p>}
                {upcoming.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50" onClick={() => openDetail(p.id)}>
                    <SocialIconBadge platform={p.platform} size="xs" variant="filled" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(p.scheduled_date)} {p.scheduled_time ? `• ${p.scheduled_time.slice(0, 5)}` : ''}</p>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Needs Attention */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Perlu Perhatian</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {needsAttention.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">Semua konten on track</p>}
                {needsAttention.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded border border-amber-200 dark:border-amber-800 cursor-pointer hover:bg-muted/50" onClick={() => openDetail(p.id)}>
                    <SocialIconBadge platform={p.platform} size="xs" variant="filled" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.status === 'rejected' ? 'Ditolak' : `Overdue: ${formatDate(p.scheduled_date)}`}
                      </p>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Aktivitas Terbaru</CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">Belum ada aktivitas</p>}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recentActivity.map(a => (
                  <div key={a.id} className="flex items-start gap-2 text-xs border-b last:border-0 pb-2">
                    <div className="flex-1">
                      <span className="font-medium">{a.actor?.name || 'System'}</span>{' '}
                      <span className="text-muted-foreground">
                        {a.action === 'created' && 'membuat konten baru'}
                        {a.action === 'updated' && 'mengupdate konten'}
                        {a.action === 'status_changed' && `mengubah status ${a.details?.from_status} → ${a.details?.to_status}`}
                        {a.action === 'deleted' && 'menghapus konten'}
                        {a.action === 'linked' && 'menghubungkan ke data performa'}
                      </span>
                    </div>
                    <span className="text-muted-foreground whitespace-nowrap">{formatDateTime(a.created_at)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== CALENDAR TAB ===== */}
      {activeTab === 'calendar' && (
        <div className="space-y-3">
          {/* Calendar Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <h2 className="text-sm font-semibold min-w-[140px] text-center">
                {calMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
              </h2>
              <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filterPlatform} onValueChange={setFilterPlatform}>
                <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Platform</SelectItem>
                  {PLATFORMS.map(p => <SelectItem key={p} value={p}>{PLATFORM_CONFIGS.find(c => c.id === p)?.label || p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Calendar Grid */}
          <Card>
            <CardContent className="p-2 sm:p-4">
              <div className="grid grid-cols-7 gap-px">
                {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(d => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                ))}
                {calDays.map((day, i) => {
                  if (day === null) return <div key={`empty-${i}`} className="min-h-[80px] bg-muted/30 rounded" />
                  const dateStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const dayPlans = plansForDay(day)
                  const isToday = dateStr === today
                  return (
                    <div
                      key={day}
                      className={`min-h-[80px] border rounded p-1 cursor-pointer hover:bg-muted/50 transition-colors ${isToday ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30' : ''}`}
                      onClick={() => openCreate(dateStr)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium ${isToday ? 'text-blue-600 font-bold' : ''}`}>{day}</span>
                        {dayPlans.length > 0 && <span className="text-[10px] text-muted-foreground">{dayPlans.length}</span>}
                      </div>
                      <div className="space-y-0.5">
                        {dayPlans.slice(0, 3).map(p => (
                          <div
                            key={p.id}
                            className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] bg-muted/80 truncate cursor-pointer hover:bg-muted"
                            onClick={(e) => { e.stopPropagation(); openDetail(p.id) }}
                          >
                            <SocialIconInline platform={p.platform} size={10} />
                            <span className="truncate">{p.title}</span>
                          </div>
                        ))}
                        {dayPlans.length > 3 && (
                          <p className="text-[10px] text-muted-foreground text-center">+{dayPlans.length - 3} lainnya</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== LIST TAB ===== */}
      {activeTab === 'list' && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari judul atau caption..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-9 text-sm" />
            </div>
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Platform</SelectItem>
                {PLATFORMS.map(p => <SelectItem key={p} value={p}>{PLATFORM_CONFIGS.find(c => c.id === p)?.label || p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left p-3 font-medium">Konten</th>
                      <th className="text-left p-3 font-medium hidden sm:table-cell">Platform</th>
                      <th className="text-left p-3 font-medium">Tanggal</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">Priority</th>
                      <th className="text-left p-3 font-medium hidden lg:table-cell">Campaign</th>
                      <th className="p-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.length === 0 && (
                      <tr><td colSpan={7} className="text-center text-muted-foreground py-8 text-xs">Tidak ada konten untuk periode ini</td></tr>
                    )}
                    {plans.map(p => (
                      <tr key={p.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => openDetail(p.id)}>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <SocialIconBadge platform={p.platform} size="xs" variant="filled" className="sm:hidden" />
                            <div>
                              <p className="font-medium truncate max-w-[200px]">{p.title}</p>
                              <p className="text-xs text-muted-foreground">{p.content_type}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 hidden sm:table-cell"><SocialIconBadge platform={p.platform} size="xs" variant="filled" /></td>
                        <td className="p-3 text-xs whitespace-nowrap">
                          {formatDate(p.scheduled_date)}
                          {p.scheduled_time && <span className="text-muted-foreground ml-1">{p.scheduled_time.slice(0, 5)}</span>}
                        </td>
                        <td className="p-3"><StatusBadge status={p.status} /></td>
                        <td className="p-3 hidden md:table-cell"><PriorityBadge priority={p.priority} /></td>
                        <td className="p-3 hidden lg:table-cell">
                          {p.campaign && (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.campaign.color }} />
                              {p.campaign.name}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(p) }}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== CAMPAIGNS TAB ===== */}
      {activeTab === 'campaigns' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowCampaignDialog(true)} className="gap-1"><Plus className="h-4 w-4" /> Campaign Baru</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.length === 0 && <p className="text-sm text-muted-foreground col-span-full text-center py-8">Belum ada campaign</p>}
            {campaigns.map(c => (
              <Card key={c.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                      <h3 className="font-medium text-sm">{c.name}</h3>
                    </div>
                    <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{c.status}</Badge>
                  </div>
                  {c.description && <p className="text-xs text-muted-foreground mb-2">{c.description}</p>}
                  {(c.start_date || c.end_date) && (
                    <p className="text-xs text-muted-foreground mb-2">
                      {c.start_date && formatDate(c.start_date)} {c.end_date && `— ${formatDate(c.end_date)}`}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-3 pt-2 border-t">
                    <div className="text-xs"><span className="font-semibold">{c.publishedPlans}</span><span className="text-muted-foreground">/{c.totalPlans} published</span></div>
                    <div className="flex-1 bg-muted rounded-full h-1.5">
                      <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${c.totalPlans > 0 ? (c.publishedPlans / c.totalPlans) * 100 : 0}%` }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ===== HASHTAGS TAB ===== */}
      {activeTab === 'hashtags' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowHashtagDialog(true)} className="gap-1"><Plus className="h-4 w-4" /> Hashtag Baru</Button>
          </div>
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-2">
                {hashtags.length === 0 && <p className="text-sm text-muted-foreground py-4 w-full text-center">Belum ada hashtag</p>}
                {hashtags.map(h => (
                  <div key={h.id} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border bg-muted/50 hover:bg-muted transition-colors">
                    <Hash className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm">{h.tag}</span>
                    <Badge variant="secondary" className="text-[10px] ml-1">{h.usage_count}x</Badge>
                    <Badge variant="outline" className="text-[10px]">{h.category}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== TEMPLATES TAB ===== */}
      {activeTab === 'templates' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowTemplateDialog(true)} className="gap-1"><Plus className="h-4 w-4" /> Template Baru</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.length === 0 && <p className="text-sm text-muted-foreground col-span-full text-center py-8">Belum ada template</p>}
            {templates.map(t => (
              <Card key={t.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-sm">{t.name}</h3>
                    <Badge variant="secondary" className="text-[10px]">{t.usage_count}x dipakai</Badge>
                  </div>
                  {t.platform && <div className="mb-2"><SocialIconBadge platform={t.platform} size="xs" variant="filled" /></div>}
                  {t.caption_template && (
                    <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded mt-2 line-clamp-3 whitespace-pre-wrap">{t.caption_template}</p>
                  )}
                  {t.notes && <p className="text-xs text-muted-foreground mt-1">{t.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ===== CREATE/EDIT DIALOG ===== */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlanId ? 'Edit Content Plan' : 'Buat Content Plan Baru'}</DialogTitle>
            <DialogDescription>Isi detail konten yang akan dijadwalkan</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Judul *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Judul konten" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Platform *</Label>
                <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map(p => (
                      <SelectItem key={p} value={p}>
                        <span className="flex items-center gap-2">
                          <SocialIconInline platform={p} size={14} /> {PLATFORM_CONFIGS.find(c => c.id === p)?.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tipe Konten</Label>
                <Select value={form.content_type} onValueChange={v => setForm(f => ({ ...f, content_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Tanggal *</Label>
                <Input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Jam (opsional)</Label>
                <Input type="time" value={form.scheduled_time} onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Caption</Label>
              <Textarea value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} rows={4} placeholder="Caption/copy untuk konten ini..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Campaign</Label>
                <Select value={form.campaign_id} onValueChange={v => setForm(f => ({ ...f, campaign_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih campaign" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Tanpa campaign</SelectItem>
                    {campaigns.filter(c => c.status === 'active').map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} /> {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Prioritas</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Hashtags</Label>
              <div className="flex flex-wrap gap-1 p-2 border rounded min-h-[40px]">
                {form.hashtag_ids.map(hid => {
                  const ht = hashtags.find(h => h.id === hid)
                  return ht ? (
                    <span key={hid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs">
                      #{ht.tag}
                      <button onClick={() => setForm(f => ({ ...f, hashtag_ids: f.hashtag_ids.filter(x => x !== hid) }))} className="hover:text-red-500">&times;</button>
                    </span>
                  ) : null
                })}
                <Select onValueChange={v => { const id = parseInt(v); if (!form.hashtag_ids.includes(id)) setForm(f => ({ ...f, hashtag_ids: [...f.hashtag_ids, id] })) }}>
                  <SelectTrigger className="h-6 w-20 border-0 text-xs p-0 shadow-none"><SelectValue placeholder="+ Add" /></SelectTrigger>
                  <SelectContent>
                    {hashtags.filter(h => !form.hashtag_ids.includes(h.id)).map(h => (
                      <SelectItem key={h.id} value={h.id.toString()}>#{h.tag}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Visual Reference URL (opsional)</Label>
              <Input value={form.visual_url} onChange={e => setForm(f => ({ ...f, visual_url: e.target.value }))} placeholder="https://drive.google.com/... atau URL Canva" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>Target Views</Label>
                <Input type="number" value={form.target_views} onChange={e => setForm(f => ({ ...f, target_views: e.target.value }))} placeholder="10000" />
              </div>
              <div className="grid gap-2">
                <Label>Target Likes</Label>
                <Input type="number" value={form.target_likes} onChange={e => setForm(f => ({ ...f, target_likes: e.target.value }))} placeholder="500" />
              </div>
              <div className="grid gap-2">
                <Label>Target Engagement %</Label>
                <Input type="number" step="0.1" value={form.target_engagement_rate} onChange={e => setForm(f => ({ ...f, target_engagement_rate: e.target.value }))} placeholder="5.0" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Catatan Internal</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Brief, referensi, catatan untuk tim..." />
            </div>
            {/* Cross-post */}
            {!editingPlanId && (
              <div className="grid gap-2">
                <Label>Cross-post ke Platform Lain</Label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.filter(p => p !== form.platform).map(p => (
                    <label key={p} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.cross_post_platforms.includes(p)}
                        onChange={e => setForm(f => ({
                          ...f,
                          cross_post_platforms: e.target.checked
                            ? [...f.cross_post_platforms, p]
                            : f.cross_post_platforms.filter(x => x !== p),
                        }))}
                        className="rounded"
                      />
                      <SocialIconInline platform={p} size={14} />
                      {PLATFORM_CONFIGS.find(c => c.id === p)?.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Batal</Button>
            <Button variant="secondary" onClick={() => handleCreatePlan(false)}>Simpan Draft</Button>
            {!editingPlanId && <Button onClick={() => handleCreatePlan(true)}>Submit for Review</Button>}
            {editingPlanId && <Button onClick={() => handleCreatePlan(false)}>Simpan</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DETAIL DIALOG ===== */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedPlan && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <SocialIconBadge platform={selectedPlan.platform} size="sm" variant="filled" />
                  {selectedPlan.title}
                </DialogTitle>
                <DialogDescription>
                  {selectedPlan.content_type} • {formatDate(selectedPlan.scheduled_date)}
                  {selectedPlan.scheduled_time && ` • ${selectedPlan.scheduled_time.slice(0, 5)}`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Status + Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={selectedPlan.status} />
                  <PriorityBadge priority={selectedPlan.priority} />
                  {selectedPlan.campaign && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: selectedPlan.campaign.color }} />
                      {selectedPlan.campaign.name}
                    </span>
                  )}
                  <div className="flex-1" />
                  {/* Status action buttons */}
                  {selectedPlan.status === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => openStatusChange(selectedPlan, 'in_review')} className="text-xs gap-1"><Send className="h-3 w-3" /> Submit Review</Button>
                  )}
                  {selectedPlan.status === 'in_review' && (
                    <>
                      <Button size="sm" variant="default" onClick={() => openStatusChange(selectedPlan, 'approved')} className="text-xs gap-1"><CheckCircle2 className="h-3 w-3" /> Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => openStatusChange(selectedPlan, 'rejected')} className="text-xs gap-1"><XCircle className="h-3 w-3" /> Reject</Button>
                    </>
                  )}
                  {selectedPlan.status === 'approved' && (
                    <Button size="sm" variant="default" onClick={() => openStatusChange(selectedPlan, 'published')} className="text-xs gap-1"><Send className="h-3 w-3" /> Mark Published</Button>
                  )}
                  {selectedPlan.status === 'rejected' && (
                    <Button size="sm" variant="outline" onClick={() => { openEdit(selectedPlan); setShowDetailDialog(false) }} className="text-xs gap-1"><Edit className="h-3 w-3" /> Revisi</Button>
                  )}
                </div>

                {/* Caption */}
                {selectedPlan.caption && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Caption</Label>
                    <div className="mt-1 p-3 bg-muted/50 rounded text-sm whitespace-pre-wrap">{selectedPlan.caption}</div>
                  </div>
                )}

                {/* Hashtags */}
                {selectedPlan.hashtags && selectedPlan.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedPlan.hashtags.map(h => (
                      <span key={h.hashtag.id} className="text-xs text-blue-600 dark:text-blue-400">#{h.hashtag.tag}</span>
                    ))}
                  </div>
                )}

                {/* Target vs Actual */}
                {(selectedPlan.target_views || selectedPlan.target_likes || selectedPlan.target_engagement_rate) && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Target vs Aktual</Label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {selectedPlan.target_views && (
                        <div className="p-2 border rounded text-center">
                          <p className="text-xs text-muted-foreground">Views</p>
                          <p className="font-semibold text-sm">{selectedPlan.target_views.toLocaleString()}</p>
                          {detailLinkedContent && (
                            <p className={`text-xs ${detailLinkedContent.views_count >= selectedPlan.target_views ? 'text-green-600' : 'text-red-600'}`}>
                              Aktual: {detailLinkedContent.views_count?.toLocaleString() || '-'}
                            </p>
                          )}
                        </div>
                      )}
                      {selectedPlan.target_likes && (
                        <div className="p-2 border rounded text-center">
                          <p className="text-xs text-muted-foreground">Likes</p>
                          <p className="font-semibold text-sm">{selectedPlan.target_likes.toLocaleString()}</p>
                          {detailLinkedContent && (
                            <p className={`text-xs ${detailLinkedContent.likes_count >= selectedPlan.target_likes ? 'text-green-600' : 'text-red-600'}`}>
                              Aktual: {detailLinkedContent.likes_count?.toLocaleString() || '-'}
                            </p>
                          )}
                        </div>
                      )}
                      {selectedPlan.target_engagement_rate && (
                        <div className="p-2 border rounded text-center">
                          <p className="text-xs text-muted-foreground">Engagement</p>
                          <p className="font-semibold text-sm">{(selectedPlan.target_engagement_rate * 100).toFixed(1)}%</p>
                          {detailLinkedContent && (
                            <p className={`text-xs ${(detailLinkedContent.engagement_rate || 0) >= selectedPlan.target_engagement_rate ? 'text-green-600' : 'text-red-600'}`}>
                              Aktual: {detailLinkedContent.engagement_rate ? (detailLinkedContent.engagement_rate * 100).toFixed(1) + '%' : '-'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedPlan.notes && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Catatan</Label>
                    <p className="text-sm mt-1">{selectedPlan.notes}</p>
                  </div>
                )}

                {/* Visual */}
                {selectedPlan.visual_url && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Visual Reference</Label>
                    <a href={selectedPlan.visual_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline flex items-center gap-1 mt-1">
                      <Link2 className="h-3 w-3" /> Buka Link
                    </a>
                  </div>
                )}

                {/* Meta */}
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t pt-3">
                  <div>Dibuat oleh: <span className="text-foreground">{selectedPlan.creator?.name || '-'}</span></div>
                  <div>Assigned: <span className="text-foreground">{selectedPlan.assignee?.name || '-'}</span></div>
                </div>

                {/* Comments */}
                <div className="border-t pt-3">
                  <Label className="text-xs text-muted-foreground mb-2 block">Komentar ({detailComments.length})</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                    {detailComments.map(c => (
                      <div key={c.id} className={`p-2 rounded text-sm ${c.comment_type === 'rejection' ? 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800' : c.comment_type === 'approval' ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800' : 'bg-muted/50'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-xs">{c.commenter?.name}</span>
                          <span className="text-[10px] text-muted-foreground">{formatDateTime(c.created_at)}</span>
                          {c.comment_type !== 'comment' && <Badge variant="outline" className="text-[10px]">{c.comment_type}</Badge>}
                        </div>
                        <p className="text-xs">{c.comment}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Tulis komentar..." className="text-sm" onKeyDown={e => e.key === 'Enter' && handleAddComment()} />
                    <Button size="sm" onClick={handleAddComment} disabled={!newComment.trim()}>Kirim</Button>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="ghost" size="sm" className="text-red-600 gap-1" onClick={() => handleDeletePlan(selectedPlan.id)}>
                  <Trash2 className="h-3.5 w-3.5" /> Hapus
                </Button>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={() => { openEdit(selectedPlan); setShowDetailDialog(false) }} className="gap-1">
                  <Edit className="h-3.5 w-3.5" /> Edit
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== STATUS CHANGE DIALOG ===== */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusTarget === 'approved' && 'Approve Konten'}
              {statusTarget === 'rejected' && 'Reject Konten'}
              {statusTarget === 'in_review' && 'Submit for Review'}
              {statusTarget === 'published' && 'Mark as Published'}
              {statusTarget === 'archived' && 'Archive Konten'}
              {statusTarget === 'draft' && 'Kembali ke Draft'}
            </DialogTitle>
            <DialogDescription>{selectedPlan?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>{statusTarget === 'rejected' ? 'Alasan Penolakan *' : 'Komentar (opsional)'}</Label>
              <Textarea value={statusComment} onChange={e => setStatusComment(e.target.value)} rows={3} placeholder={statusTarget === 'rejected' ? 'Jelaskan alasan penolakan...' : 'Tambahkan catatan...'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>Batal</Button>
            <Button
              onClick={handleStatusChange}
              disabled={statusTarget === 'rejected' && !statusComment.trim()}
              variant={statusTarget === 'rejected' ? 'destructive' : 'default'}
            >
              {statusTarget === 'approved' && 'Approve'}
              {statusTarget === 'rejected' && 'Reject'}
              {statusTarget === 'in_review' && 'Submit'}
              {statusTarget === 'published' && 'Confirm'}
              {statusTarget === 'archived' && 'Archive'}
              {statusTarget === 'draft' && 'Kembali ke Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== CAMPAIGN DIALOG ===== */}
      <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Campaign Baru</DialogTitle>
            <DialogDescription>Buat campaign untuk mengelompokkan konten</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2"><Label>Nama *</Label><Input value={campaignForm.name} onChange={e => setCampaignForm(f => ({ ...f, name: e.target.value }))} placeholder="Promo Lebaran 2026" /></div>
            <div className="grid gap-2"><Label>Deskripsi</Label><Textarea value={campaignForm.description} onChange={e => setCampaignForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>Mulai</Label><Input type="date" value={campaignForm.start_date} onChange={e => setCampaignForm(f => ({ ...f, start_date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Selesai</Label><Input type="date" value={campaignForm.end_date} onChange={e => setCampaignForm(f => ({ ...f, end_date: e.target.value }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Warna</Label><Input type="color" value={campaignForm.color} onChange={e => setCampaignForm(f => ({ ...f, color: e.target.value }))} className="h-10 w-20" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCampaignDialog(false)}>Batal</Button>
            <Button onClick={handleCreateCampaign} disabled={!campaignForm.name}>Buat Campaign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== HASHTAG DIALOG ===== */}
      <Dialog open={showHashtagDialog} onOpenChange={setShowHashtagDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hashtag Baru</DialogTitle>
            <DialogDescription>Tambahkan hashtag ke library</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2"><Label>Hashtag *</Label><Input value={hashtagForm.tag} onChange={e => setHashtagForm(f => ({ ...f, tag: e.target.value }))} placeholder="logistikindonesia" /></div>
            <div className="grid gap-2">
              <Label>Kategori</Label>
              <Select value={hashtagForm.category} onValueChange={v => setHashtagForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HASHTAG_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHashtagDialog(false)}>Batal</Button>
            <Button onClick={handleCreateHashtag} disabled={!hashtagForm.tag}>Tambah</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== TEMPLATE DIALOG ===== */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Template Baru</DialogTitle>
            <DialogDescription>Buat template caption yang bisa dipakai ulang</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2"><Label>Nama *</Label><Input value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} placeholder="Testimoni Pelanggan" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Platform</Label>
                <Select value={templateForm.platform} onValueChange={v => setTemplateForm(f => ({ ...f, platform: v }))}>
                  <SelectTrigger><SelectValue placeholder="Semua" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua platform</SelectItem>
                    {PLATFORMS.map(p => <SelectItem key={p} value={p}>{PLATFORM_CONFIGS.find(c => c.id === p)?.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tipe</Label>
                <Select value={templateForm.content_type} onValueChange={v => setTemplateForm(f => ({ ...f, content_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="Semua" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua tipe</SelectItem>
                    {CONTENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Template Caption</Label>
              <Textarea value={templateForm.caption_template} onChange={e => setTemplateForm(f => ({ ...f, caption_template: e.target.value }))} rows={4} placeholder="Gunakan {product}, {promo}, {cta} sebagai placeholder" />
            </div>
            <div className="grid gap-2"><Label>Catatan</Label><Textarea value={templateForm.notes} onChange={e => setTemplateForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>Batal</Button>
            <Button onClick={handleCreateTemplate} disabled={!templateForm.name}>Buat Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
