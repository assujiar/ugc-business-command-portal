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
  XCircle, MessageSquare, Hash, Bookmark, FileText, Search,
  Trash2, Edit, Link2, BarChart3, ExternalLink, TrendingUp,
  Target, Layers, Activity,
} from 'lucide-react'
import { SocialIconBadge, SocialIconInline, PLATFORM_CONFIGS, PLATFORM_CONFIG_MAP } from '@/components/marketing/social-media-icons'

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
  actual_post_url: string | null
  actual_post_url_2: string | null
  actual_views: number | null
  actual_likes: number | null
  actual_comments: number | null
  actual_shares: number | null
  actual_engagement_rate: number | null
  actual_reach: number | null
  actual_impressions: number | null
  actual_saves: number | null
  actual_clicks: number | null
  realized_at: string | null
  realization_notes: string | null
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
  totalPlanned: number; published: number; draft: number
  planned: number; overdue: number; completionRate: number
  realized: number; withEvidence: number
}

interface ChannelKpi {
  platform: string; total: number; published: number; draft: number
  planned: number; overdue: number
  realized: number; withEvidence: number; completionRate: number
}

// ============================================================
// Constants
// ============================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: FileEdit },
  planned: { label: 'Planned', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: CalendarIcon },
  published: { label: 'Published', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: Send },
  overdue: { label: 'Overdue', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: AlertTriangle },
}

const CONTENT_TYPES = ['post', 'video', 'reel', 'story', 'short', 'carousel', 'live', 'article']
const PRIORITIES = ['low', 'medium', 'high']
const PLATFORMS = PLATFORM_CONFIGS.map(p => p.id)
const HASHTAG_CATEGORIES = ['brand', 'product', 'campaign', 'industry', 'trending', 'general']

/** Compute display status: overdue if not published and past scheduled_date */
function getDisplayStatus(plan: { status: string; scheduled_date: string }): string {
  const today = new Date().toISOString().split('T')[0]
  if (plan.status !== 'published' && plan.scheduled_date < today) return 'overdue'
  return plan.status
}

function StatusBadge({ status, scheduledDate }: { status: string; scheduledDate?: string }) {
  const displayStatus = scheduledDate ? getDisplayStatus({ status, scheduled_date: scheduledDate }) : status
  const cfg = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.draft
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

function ProgressBar({ value, max, color = 'bg-green-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium min-w-[32px] text-right">{pct}%</span>
    </div>
  )
}

function MetricCard({ label, actual, target, suffix = '' }: { label: string; actual: number | null; target: number | null; suffix?: string }) {
  const hasTarget = target !== null && target !== undefined && target > 0
  const hasActual = actual !== null && actual !== undefined
  const achievement = hasTarget && hasActual ? Math.round((actual / target) * 100) : null
  return (
    <div className="p-2 border rounded text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      {hasActual ? (
        <p className="font-bold text-sm">{actual.toLocaleString()}{suffix}</p>
      ) : (
        <p className="text-sm text-muted-foreground">-</p>
      )}
      {hasTarget && (
        <p className="text-[10px] text-muted-foreground">Target: {target.toLocaleString()}{suffix}</p>
      )}
      {achievement !== null && (
        <p className={`text-[10px] font-medium ${achievement >= 100 ? 'text-green-600' : achievement >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
          {achievement}% tercapai
        </p>
      )}
    </div>
  )
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
  const [channelKpis, setChannelKpis] = useState<ChannelKpi[]>([])
  const [contentTypeDist, setContentTypeDist] = useState<Record<string, number>>({})
  const [upcoming, setUpcoming] = useState<ContentPlan[]>([])
  const [overdueItems, setOverdueItems] = useState<ContentPlan[]>([])
  const [needsRealization, setNeedsRealization] = useState<ContentPlan[]>([])
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Calendar state
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [calSelectedDay, setCalSelectedDay] = useState<string | null>(null)

  // Filters
  const [filterPlatform, setFilterPlatform] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterContentType, setFilterContentType] = useState('all')
  const [filterCampaign, setFilterCampaign] = useState('all')
  const [filterOverdue, setFilterOverdue] = useState(false)
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
  const [showRealizeDialog, setShowRealizeDialog] = useState(false)
  const [showCalDayDialog, setShowCalDayDialog] = useState(false)

  // Form state
  const [form, setForm] = useState({
    title: '', platform: 'instagram', content_type: 'post', scheduled_date: '',
    scheduled_time: '', caption: '', notes: '', campaign_id: '', assigned_to: '',
    priority: 'medium', visual_url: '', target_views: '', target_likes: '',
    target_comments: '', target_shares: '', target_engagement_rate: '',
    hashtag_ids: [] as number[], cross_post_platforms: [] as string[],
  })
  const [campaignForm, setCampaignForm] = useState({ name: '', description: '', color: '#6366f1', start_date: '', end_date: '' })
  const [hashtagForm, setHashtagForm] = useState({ tag: '', category: 'general' })
  const [templateForm, setTemplateForm] = useState({ name: '', platform: '', content_type: '', caption_template: '', notes: '' })
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [editingOriginalStatus, setEditingOriginalStatus] = useState<string | null>(null)
  const [newComment, setNewComment] = useState('')
  const [realizeForm, setRealizeForm] = useState({
    actual_post_url: '', actual_post_url_2: '',
    actual_views: '', actual_likes: '', actual_comments: '', actual_shares: '',
    actual_engagement_rate: '', actual_reach: '', actual_impressions: '',
    actual_saves: '', actual_clicks: '', realization_notes: '',
  })

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
        setChannelKpis(data.channelKpis || [])
        setContentTypeDist(data.contentTypeDist || {})
        setUpcoming(data.upcoming || [])
        setOverdueItems(data.overdueItems || [])
        setNeedsRealization(data.needsRealization || [])
        setRecentActivity(data.recentActivity || [])
      }
    } catch (e) { console.error('Error fetching overview:', e) }
  }, [calMonth])

  const fetchPlans = useCallback(async () => {
    try {
      const startDate = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).toISOString().split('T')[0]
      const endDate = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).toISOString().split('T')[0]
      let url = `/api/marketing/content-plan/plans?start_date=${startDate}&end_date=${endDate}&limit=200`
      if (filterPlatform !== 'all') url += `&platform=${filterPlatform}`
      if (filterContentType !== 'all') url += `&content_type=${filterContentType}`
      if (filterCampaign !== 'all') url += `&campaign_id=${filterCampaign}`
      if (filterOverdue) {
        url += `&overdue=true`
      } else if (filterStatus !== 'all') {
        url += `&status=${filterStatus}`
      }
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setPlans(data.plans || [])
      }
    } catch (e) { console.error('Error fetching plans:', e) }
  }, [calMonth, filterPlatform, filterStatus, filterContentType, filterCampaign, filterOverdue, searchQuery])

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
  // Drilldown helper
  // ============================================================

  const drilldown = (opts: { status?: string; platform?: string; contentType?: string; campaignId?: string; overdue?: boolean }) => {
    // Reset all filters first, then apply specific ones
    setFilterPlatform(opts.platform || 'all')
    setFilterContentType(opts.contentType || 'all')
    setFilterCampaign(opts.campaignId || 'all')
    if (opts.overdue) {
      setFilterOverdue(true)
      setFilterStatus('all')
    } else {
      setFilterOverdue(false)
      setFilterStatus(opts.status || 'all')
    }
    setActiveTab('list')
  }

  // ============================================================
  // Actions
  // ============================================================

  const handleCreatePlan = async (saveAsDraft = false) => {
    if (!form.title || !form.platform || !form.scheduled_date) return
    try {
      const isEdit = !!editingPlanId
      const url = isEdit ? `/api/marketing/content-plan/plans/${editingPlanId}` : '/api/marketing/content-plan/plans'
      const method = isEdit ? 'PATCH' : 'POST'

      let body: any
      if (isEdit) {
        // For PATCH: only send updateable column fields
        body = {
          title: form.title,
          platform: form.platform,
          content_type: form.content_type,
          scheduled_date: form.scheduled_date,
          scheduled_time: form.scheduled_time || null,
          caption: form.caption || null,
          notes: form.notes || null,
          campaign_id: form.campaign_id || null,
          assigned_to: form.assigned_to || null,
          priority: form.priority,
          visual_url: form.visual_url || null,
          target_views: form.target_views ? parseInt(form.target_views) : null,
          target_likes: form.target_likes ? parseInt(form.target_likes) : null,
          target_comments: form.target_comments ? parseInt(form.target_comments) : null,
          target_shares: form.target_shares ? parseInt(form.target_shares) : null,
          target_engagement_rate: form.target_engagement_rate ? parseFloat(form.target_engagement_rate) / 100 : null,
          hashtag_ids: form.hashtag_ids,
          // For published content, keep status as-is; for draft/planned, allow toggle
          status: editingOriginalStatus === 'published' ? 'published' : (saveAsDraft ? 'draft' : 'planned'),
        }
      } else {
        // For POST: include cross_post and save_as_draft
        body = {
          ...form,
          target_views: form.target_views ? parseInt(form.target_views) : null,
          target_likes: form.target_likes ? parseInt(form.target_likes) : null,
          target_comments: form.target_comments ? parseInt(form.target_comments) : null,
          target_shares: form.target_shares ? parseInt(form.target_shares) : null,
          target_engagement_rate: form.target_engagement_rate ? parseFloat(form.target_engagement_rate) / 100 : null,
          campaign_id: form.campaign_id || null,
          assigned_to: form.assigned_to || null,
          scheduled_time: form.scheduled_time || null,
          save_as_draft: saveAsDraft,
        }
      }

      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) {
        const savedId = editingPlanId
        setShowCreateDialog(false)
        resetForm()
        fetchPlans()
        fetchOverview()
        if (savedId) openDetail(savedId)
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Gagal menyimpan content plan')
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
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Gagal mengubah status')
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

  const handleRealize = async () => {
    if (!selectedPlan) return
    try {
      const body: any = {}
      if (realizeForm.actual_post_url) body.actual_post_url = realizeForm.actual_post_url
      if (realizeForm.actual_post_url_2) body.actual_post_url_2 = realizeForm.actual_post_url_2
      if (realizeForm.actual_views) body.actual_views = parseInt(realizeForm.actual_views)
      if (realizeForm.actual_likes) body.actual_likes = parseInt(realizeForm.actual_likes)
      if (realizeForm.actual_comments) body.actual_comments = parseInt(realizeForm.actual_comments)
      if (realizeForm.actual_shares) body.actual_shares = parseInt(realizeForm.actual_shares)
      if (realizeForm.actual_engagement_rate) body.actual_engagement_rate = parseFloat(realizeForm.actual_engagement_rate) / 100
      if (realizeForm.actual_reach) body.actual_reach = parseInt(realizeForm.actual_reach)
      if (realizeForm.actual_impressions) body.actual_impressions = parseInt(realizeForm.actual_impressions)
      if (realizeForm.actual_saves) body.actual_saves = parseInt(realizeForm.actual_saves)
      if (realizeForm.actual_clicks) body.actual_clicks = parseInt(realizeForm.actual_clicks)
      if (realizeForm.realization_notes) body.realization_notes = realizeForm.realization_notes

      const res = await fetch(`/api/marketing/content-plan/plans/${selectedPlan.id}/realize`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setShowRealizeDialog(false)
        fetchPlans()
        fetchOverview()
        if (showDetailDialog) openDetail(selectedPlan.id)
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Gagal menyimpan realisasi')
      }
    } catch (e) { console.error('Error realizing plan:', e) }
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
    setEditingOriginalStatus(plan.status)
    setForm({
      title: plan.title, platform: plan.platform, content_type: plan.content_type,
      scheduled_date: plan.scheduled_date, scheduled_time: plan.scheduled_time || '',
      caption: plan.caption || '', notes: plan.notes || '', campaign_id: plan.campaign_id || '',
      assigned_to: plan.assigned_to || '', priority: plan.priority, visual_url: plan.visual_url || '',
      target_views: plan.target_views?.toString() || '', target_likes: plan.target_likes?.toString() || '',
      target_comments: plan.target_comments?.toString() || '', target_shares: plan.target_shares?.toString() || '',
      target_engagement_rate: plan.target_engagement_rate ? (plan.target_engagement_rate * 100).toString() : '',
      hashtag_ids: plan.hashtags?.map(h => h.hashtag.id) || [], cross_post_platforms: [],
    })
    setShowCreateDialog(true)
  }

  const openRealize = (plan: ContentPlan) => {
    setSelectedPlan(plan)
    setRealizeForm({
      actual_post_url: plan.actual_post_url || '', actual_post_url_2: plan.actual_post_url_2 || '',
      actual_views: plan.actual_views?.toString() || '', actual_likes: plan.actual_likes?.toString() || '',
      actual_comments: plan.actual_comments?.toString() || '', actual_shares: plan.actual_shares?.toString() || '',
      actual_engagement_rate: plan.actual_engagement_rate ? (plan.actual_engagement_rate * 100).toString() : '',
      actual_reach: plan.actual_reach?.toString() || '', actual_impressions: plan.actual_impressions?.toString() || '',
      actual_saves: plan.actual_saves?.toString() || '', actual_clicks: plan.actual_clicks?.toString() || '',
      realization_notes: plan.realization_notes || '',
    })
    setShowRealizeDialog(true)
  }

  const openStatusChange = (plan: ContentPlan, targetStatus: string) => {
    setSelectedPlan(plan)
    setStatusTarget(targetStatus)
    setStatusComment('')
    setShowStatusDialog(true)
  }

  const resetForm = () => {
    setEditingPlanId(null)
    setEditingOriginalStatus(null)
    setForm({
      title: '', platform: 'instagram', content_type: 'post', scheduled_date: '',
      scheduled_time: '', caption: '', notes: '', campaign_id: '', assigned_to: '',
      priority: 'medium', visual_url: '', target_views: '', target_likes: '',
      target_comments: '', target_shares: '', target_engagement_rate: '',
      hashtag_ids: [], cross_post_platforms: [],
    })
  }

  const openCreate = (date?: string, platform?: string) => {
    resetForm()
    if (date) setForm(prev => ({ ...prev, scheduled_date: date }))
    if (platform) setForm(prev => ({ ...prev, platform }))
    setShowCreateDialog(true)
  }

  const applyTemplate = (t: Template) => {
    setForm(f => ({
      ...f,
      caption: t.caption_template || f.caption,
      platform: t.platform || f.platform,
      content_type: t.content_type || f.content_type,
      hashtag_ids: t.default_hashtag_ids?.length ? t.default_hashtag_ids : f.hashtag_ids,
    }))
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

  const handleCalDayClick = (day: number) => {
    const dateStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setCalSelectedDay(dateStr)
    setShowCalDayDialog(true)
  }

  const calDayPlans = calSelectedDay ? plans.filter(p => p.scheduled_date === calSelectedDay) : []

  // Filtered plans for list tab (apply local overdue filter too)
  const filteredPlans = filterOverdue
    ? plans.filter(p => getDisplayStatus(p) === 'overdue')
    : plans

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
          <p className="text-sm text-muted-foreground mt-1">Perencanaan, tracking, dan realisasi konten di seluruh digital channel</p>
        </div>
        <Button onClick={() => openCreate()} size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Buat Konten Baru
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v !== 'list') { setFilterOverdue(false); setFilterStatus('all'); setFilterPlatform('all'); setFilterContentType('all'); setFilterCampaign('all') } }}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="gap-1 text-xs sm:text-sm"><LayoutGrid className="h-3.5 w-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="channels" className="gap-1 text-xs sm:text-sm"><BarChart3 className="h-3.5 w-3.5" /> Channel</TabsTrigger>
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
          {/* KPI Cards — all drillable */}
          {kpis && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Konten', value: kpis.totalPlanned, icon: Layers, color: 'text-blue-600', onClick: () => drilldown({}) },
                { label: 'Draft', value: kpis.draft, icon: FileEdit, color: 'text-gray-500', onClick: () => drilldown({ status: 'draft' }) },
                { label: 'Planned', value: kpis.planned, icon: CalendarIcon, color: 'text-blue-600', onClick: () => drilldown({ status: 'planned' }) },
                { label: 'Published', value: kpis.published, icon: Send, color: 'text-green-600', onClick: () => drilldown({ status: 'published' }) },
                { label: 'Overdue', value: kpis.overdue, icon: AlertTriangle, color: 'text-red-600', onClick: () => drilldown({ overdue: true }) },
                { label: 'Completion', value: `${kpis.completionRate}%`, icon: Target, color: 'text-purple-600', onClick: () => drilldown({}) },
              ].map(kpi => (
                <Card key={kpi.label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={kpi.onClick}>
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

          {/* Channel Breakdown Cards — drillable */}
          {channelKpis.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Breakdown per Channel</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {channelKpis.map(ch => {
                  const cfg = PLATFORM_CONFIG_MAP[ch.platform]
                  return (
                    <Card key={ch.platform} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => drilldown({ platform: ch.platform })}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <SocialIconBadge platform={ch.platform} size="sm" variant="filled" />
                            <span className="font-medium text-sm">{cfg?.label || ch.platform}</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">{ch.total} konten</Badge>
                        </div>
                        <div className="grid grid-cols-4 gap-1 text-center text-[10px] mb-2">
                          <div className="cursor-pointer hover:bg-muted rounded p-0.5" onClick={(e) => { e.stopPropagation(); drilldown({ platform: ch.platform, status: 'draft' }) }}><p className="text-muted-foreground">Draft</p><p className="font-bold">{ch.draft}</p></div>
                          <div className="cursor-pointer hover:bg-muted rounded p-0.5" onClick={(e) => { e.stopPropagation(); drilldown({ platform: ch.platform, status: 'planned' }) }}><p className="text-muted-foreground">Planned</p><p className="font-bold">{ch.planned}</p></div>
                          <div className="cursor-pointer hover:bg-muted rounded p-0.5" onClick={(e) => { e.stopPropagation(); drilldown({ platform: ch.platform, status: 'published' }) }}><p className="text-muted-foreground">Published</p><p className="font-bold text-green-600">{ch.published}</p></div>
                          <div className="cursor-pointer hover:bg-muted rounded p-0.5" onClick={(e) => { e.stopPropagation(); drilldown({ platform: ch.platform, overdue: true }) }}><p className="text-muted-foreground">Overdue</p><p className="font-bold text-red-600">{ch.overdue}</p></div>
                        </div>
                        <ProgressBar value={ch.published} max={ch.total} color={cfg?.color ? `bg-[${cfg.color}]` : 'bg-green-500'} />
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* Content Type Distribution — drillable */}
          {Object.keys(contentTypeDist).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><Layers className="h-4 w-4" /> Distribusi Tipe Konten</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(contentTypeDist).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted transition-colors" onClick={() => drilldown({ contentType: type })}>
                      <span className="text-sm font-medium capitalize">{type}</span>
                      <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Upcoming This Week — drillable items */}
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
                    <StatusBadge status={p.status} scheduledDate={p.scheduled_date} />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Overdue — drillable items */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 cursor-pointer hover:text-primary" onClick={() => drilldown({ overdue: true })}>
                  <AlertTriangle className="h-4 w-4 text-red-500" /> Overdue ({overdueItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {overdueItems.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">Semua konten on track</p>}
                {overdueItems.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded border border-red-200 dark:border-red-800 cursor-pointer hover:bg-muted/50" onClick={() => openDetail(p.id)}>
                    <SocialIconBadge platform={p.platform} size="xs" variant="filled" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <p className="text-xs text-red-600">Jadwal: {formatDate(p.scheduled_date)} — belum published</p>
                    </div>
                    <StatusBadge status="overdue" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Needs Realization — drillable items */}
          {needsRealization.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><Target className="h-4 w-4 text-blue-500" /> Belum Diupdate Realisasi ({needsRealization.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {needsRealization.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded border border-blue-200 dark:border-blue-800 cursor-pointer hover:bg-muted/50" onClick={() => openDetail(p.id)}>
                    <SocialIconBadge platform={p.platform} size="xs" variant="filled" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground">{p.content_type} • Published {p.published_at ? formatDateTime(p.published_at) : ''}</p>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs gap-1 shrink-0" onClick={(e) => { e.stopPropagation(); openRealize(p as ContentPlan) }}>
                      <TrendingUp className="h-3 w-3" /> Update Realisasi
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2"><Activity className="h-4 w-4" /> Aktivitas Terbaru</CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">Belum ada aktivitas</p>}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recentActivity.map(a => (
                  <div key={a.id} className="flex items-start gap-2 text-xs border-b last:border-0 pb-2 cursor-pointer hover:bg-muted/30 rounded px-1" onClick={() => a.entity_id && openDetail(a.entity_id)}>
                    <div className="flex-1">
                      <span className="font-medium">{a.actor?.name || 'System'}</span>{' '}
                      <span className="text-muted-foreground">
                        {a.action === 'created' && 'membuat konten baru'}
                        {a.action === 'updated' && 'mengupdate konten'}
                        {a.action === 'status_changed' && `mengubah status ${a.details?.from_status || ''} → ${a.details?.to_status || ''}`}
                        {a.action === 'deleted' && 'menghapus konten'}
                        {a.action === 'linked' && 'menghubungkan ke data performa'}
                        {a.action === 'realized' && 'mengupdate realisasi konten'}
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

      {/* ===== CHANNEL TAB ===== */}
      {activeTab === 'channels' && (
        <ChannelBreakdownTab
          calMonth={calMonth}
          prevMonth={prevMonth}
          nextMonth={nextMonth}
          plans={plans}
          onOpenDetail={openDetail}
          onOpenCreate={openCreate}
          onOpenRealize={openRealize}
          onDrilldown={drilldown}
        />
      )}

      {/* ===== CALENDAR TAB ===== */}
      {activeTab === 'calendar' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <h2 className="text-sm font-semibold min-w-[140px] text-center">
                {calMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
              </h2>
              <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filterPlatform} onValueChange={v => setFilterPlatform(v)}>
                <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Platform</SelectItem>
                  {PLATFORMS.map(p => <SelectItem key={p} value={p}>{PLATFORM_CONFIGS.find(c => c.id === p)?.label || p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

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
                      onClick={() => handleCalDayClick(day)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium ${isToday ? 'text-blue-600 font-bold' : ''}`}>{day}</span>
                        {dayPlans.length > 0 && <span className="text-[10px] text-muted-foreground">{dayPlans.length}</span>}
                      </div>
                      <div className="space-y-0.5">
                        {dayPlans.slice(0, 3).map(p => (
                          <div
                            key={p.id}
                            className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] truncate cursor-pointer hover:bg-muted ${
                              getDisplayStatus(p) === 'overdue' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                              p.status === 'published' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' :
                              p.status === 'planned' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                              'bg-muted/80'
                            }`}
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

          {/* Calendar Legend */}
          <div className="flex flex-wrap gap-4 justify-center">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs">
                <span className={`h-2.5 w-2.5 rounded-full ${cfg.color.split(' ')[0]}`} />
                <span className="text-muted-foreground">{cfg.label}</span>
              </div>
            ))}
          </div>
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
            <Select value={filterOverdue ? 'overdue' : filterStatus} onValueChange={v => {
              if (v === 'overdue') { setFilterOverdue(true); setFilterStatus('all') }
              else { setFilterOverdue(false); setFilterStatus(v) }
            }}>
              <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterContentType} onValueChange={setFilterContentType}>
              <SelectTrigger className="w-[120px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tipe</SelectItem>
                {CONTENT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCampaign} onValueChange={setFilterCampaign}>
              <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Campaign</SelectItem>
                {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Active filters indicator */}
          {(filterPlatform !== 'all' || filterStatus !== 'all' || filterOverdue || filterContentType !== 'all' || filterCampaign !== 'all') && (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-muted-foreground">Filter aktif:</span>
              {filterPlatform !== 'all' && <Badge variant="secondary" className="text-[10px]">{PLATFORM_CONFIG_MAP[filterPlatform]?.label || filterPlatform}</Badge>}
              {filterOverdue && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
              {!filterOverdue && filterStatus !== 'all' && <Badge variant="secondary" className="text-[10px]">{STATUS_CONFIG[filterStatus]?.label || filterStatus}</Badge>}
              {filterContentType !== 'all' && <Badge variant="secondary" className="text-[10px] capitalize">{filterContentType}</Badge>}
              {filterCampaign !== 'all' && <Badge variant="secondary" className="text-[10px]">{campaigns.find(c => c.id === filterCampaign)?.name || 'Campaign'}</Badge>}
              <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={() => { setFilterPlatform('all'); setFilterStatus('all'); setFilterOverdue(false); setFilterContentType('all'); setFilterCampaign('all') }}>Reset</Button>
            </div>
          )}

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
                      <th className="text-left p-3 font-medium hidden lg:table-cell">Realisasi</th>
                      <th className="p-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlans.length === 0 && (
                      <tr><td colSpan={7} className="text-center text-muted-foreground py-8 text-xs">Tidak ada konten untuk filter ini</td></tr>
                    )}
                    {filteredPlans.map(p => (
                      <tr key={p.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => openDetail(p.id)}>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <SocialIconBadge platform={p.platform} size="xs" variant="filled" className="sm:hidden" />
                            <div>
                              <p className="font-medium truncate max-w-[200px]">{p.title}</p>
                              <p className="text-xs text-muted-foreground">{p.content_type}{p.campaign ? ` • ${p.campaign.name}` : ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 hidden sm:table-cell"><SocialIconBadge platform={p.platform} size="xs" variant="filled" /></td>
                        <td className="p-3 text-xs whitespace-nowrap">
                          {formatDate(p.scheduled_date)}
                          {p.scheduled_time && <span className="text-muted-foreground ml-1">{p.scheduled_time.slice(0, 5)}</span>}
                        </td>
                        <td className="p-3"><StatusBadge status={p.status} scheduledDate={p.scheduled_date} /></td>
                        <td className="p-3 hidden md:table-cell"><PriorityBadge priority={p.priority} /></td>
                        <td className="p-3 hidden lg:table-cell">
                          {p.realized_at ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3 w-3" /> Done</span>
                          ) : p.status === 'published' ? (
                            <Button size="sm" variant="ghost" className="text-xs h-6 px-2 text-blue-600" onClick={(e) => { e.stopPropagation(); openRealize(p) }}>
                              <TrendingUp className="h-3 w-3 mr-1" /> Update
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
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
              <Card key={c.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => drilldown({ campaignId: c.id })}>
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
                    <ProgressBar value={c.publishedPlans} max={c.totalPlans} />
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
                  <div key={h.id} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border bg-muted/50 hover:bg-muted transition-colors cursor-pointer" onClick={() => { setSearchQuery(`#${h.tag}`); setActiveTab('list') }}>
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
              <Card key={t.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { applyTemplate(t); openCreate() }}>
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
      <CreateEditDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        form={form}
        setForm={setForm}
        editingPlanId={editingPlanId}
        editingOriginalStatus={editingOriginalStatus}
        campaigns={campaigns}
        hashtags={hashtags}
        templates={templates}
        onSave={handleCreatePlan}
        onApplyTemplate={applyTemplate}
      />

      {/* ===== DETAIL DIALOG ===== */}
      <DetailDialog
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        plan={selectedPlan}
        comments={detailComments}
        linkedContent={detailLinkedContent}
        newComment={newComment}
        setNewComment={setNewComment}
        onAddComment={handleAddComment}
        onStatusChange={openStatusChange}
        onEdit={(p) => { openEdit(p); setShowDetailDialog(false) }}
        onDelete={handleDeletePlan}
        onRealize={openRealize}
      />

      {/* ===== STATUS CHANGE DIALOG ===== */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusTarget === 'planned' && 'Ubah ke Planned'}
              {statusTarget === 'published' && 'Mark as Published'}
              {statusTarget === 'draft' && 'Kembali ke Draft'}
            </DialogTitle>
            <DialogDescription>{selectedPlan?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>Komentar (opsional)</Label>
              <Textarea value={statusComment} onChange={e => setStatusComment(e.target.value)} rows={3} placeholder="Tambahkan catatan..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>Batal</Button>
            <Button onClick={handleStatusChange}>
              {statusTarget === 'planned' && 'Set Planned'}
              {statusTarget === 'published' && 'Confirm Published'}
              {statusTarget === 'draft' && 'Kembali ke Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== REALIZE DIALOG ===== */}
      <Dialog open={showRealizeDialog} onOpenChange={setShowRealizeDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" /> Update Realisasi & Publish
            </DialogTitle>
            <DialogDescription>{selectedPlan?.title} • {selectedPlan?.platform}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
              Masukkan link bukti posting dan metrik aktual. Jika konten masih berstatus Planned, akan otomatis berubah ke Published saat evidence URL diisi.
            </div>
            <div className="grid gap-2">
              <Label>Link Bukti Posting (Evidence URL) *</Label>
              <Input value={realizeForm.actual_post_url} onChange={e => setRealizeForm(f => ({ ...f, actual_post_url: e.target.value }))} placeholder="https://www.instagram.com/p/..." />
            </div>
            <div className="grid gap-2">
              <Label>Link Tambahan (opsional)</Label>
              <Input value={realizeForm.actual_post_url_2} onChange={e => setRealizeForm(f => ({ ...f, actual_post_url_2: e.target.value }))} placeholder="URL backup atau cross-post link" />
            </div>
            <div className="border-t pt-3">
              <Label className="text-xs text-muted-foreground mb-2 block">Metrik Aktual</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Views</Label>
                  <Input type="number" value={realizeForm.actual_views} onChange={e => setRealizeForm(f => ({ ...f, actual_views: e.target.value }))} placeholder="0" />
                  {selectedPlan?.target_views && <p className="text-[10px] text-muted-foreground">Target: {selectedPlan.target_views.toLocaleString()}</p>}
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Likes</Label>
                  <Input type="number" value={realizeForm.actual_likes} onChange={e => setRealizeForm(f => ({ ...f, actual_likes: e.target.value }))} placeholder="0" />
                  {selectedPlan?.target_likes && <p className="text-[10px] text-muted-foreground">Target: {selectedPlan.target_likes.toLocaleString()}</p>}
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Comments</Label>
                  <Input type="number" value={realizeForm.actual_comments} onChange={e => setRealizeForm(f => ({ ...f, actual_comments: e.target.value }))} placeholder="0" />
                  {selectedPlan?.target_comments && <p className="text-[10px] text-muted-foreground">Target: {selectedPlan.target_comments.toLocaleString()}</p>}
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Shares</Label>
                  <Input type="number" value={realizeForm.actual_shares} onChange={e => setRealizeForm(f => ({ ...f, actual_shares: e.target.value }))} placeholder="0" />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Reach</Label>
                  <Input type="number" value={realizeForm.actual_reach} onChange={e => setRealizeForm(f => ({ ...f, actual_reach: e.target.value }))} placeholder="0" />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Impressions</Label>
                  <Input type="number" value={realizeForm.actual_impressions} onChange={e => setRealizeForm(f => ({ ...f, actual_impressions: e.target.value }))} placeholder="0" />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Saves</Label>
                  <Input type="number" value={realizeForm.actual_saves} onChange={e => setRealizeForm(f => ({ ...f, actual_saves: e.target.value }))} placeholder="0" />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Clicks</Label>
                  <Input type="number" value={realizeForm.actual_clicks} onChange={e => setRealizeForm(f => ({ ...f, actual_clicks: e.target.value }))} placeholder="0" />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Engagement Rate %</Label>
                  <Input type="number" step="0.01" value={realizeForm.actual_engagement_rate} onChange={e => setRealizeForm(f => ({ ...f, actual_engagement_rate: e.target.value }))} placeholder="0.00" />
                  {selectedPlan?.target_engagement_rate && <p className="text-[10px] text-muted-foreground">Target: {(selectedPlan.target_engagement_rate * 100).toFixed(2)}%</p>}
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Catatan Realisasi</Label>
              <Textarea value={realizeForm.realization_notes} onChange={e => setRealizeForm(f => ({ ...f, realization_notes: e.target.value }))} rows={2} placeholder="Catatan tambahan tentang performa konten ini..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRealizeDialog(false)}>Batal</Button>
            <Button onClick={handleRealize} disabled={!realizeForm.actual_post_url} className="gap-1">
              <CheckCircle2 className="h-4 w-4" /> Simpan Realisasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== CALENDAR DAY DIALOG ===== */}
      <Dialog open={showCalDayDialog} onOpenChange={setShowCalDayDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              {calSelectedDay && formatDate(calSelectedDay)}
            </DialogTitle>
            <DialogDescription>{calDayPlans.length} konten dijadwalkan</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {calDayPlans.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Belum ada konten untuk tanggal ini</p>
            )}
            {calDayPlans.map(p => (
              <div key={p.id} className="flex items-center gap-2 p-2.5 rounded border cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => { setShowCalDayDialog(false); openDetail(p.id) }}>
                <SocialIconBadge platform={p.platform} size="xs" variant="filled" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.content_type}
                    {p.scheduled_time && ` • ${p.scheduled_time.slice(0, 5)}`}
                    {p.campaign && ` • ${p.campaign.name}`}
                  </p>
                </div>
                <StatusBadge status={p.status} scheduledDate={p.scheduled_date} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCalDayDialog(false)}>Tutup</Button>
            <Button onClick={() => { setShowCalDayDialog(false); openCreate(calSelectedDay || undefined) }} className="gap-1">
              <Plus className="h-4 w-4" /> Buat Konten
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
                <Select value={templateForm.platform || '__all__'} onValueChange={v => setTemplateForm(f => ({ ...f, platform: v === '__all__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Semua" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Semua platform</SelectItem>
                    {PLATFORMS.map(p => <SelectItem key={p} value={p}>{PLATFORM_CONFIGS.find(c => c.id === p)?.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tipe</Label>
                <Select value={templateForm.content_type || '__all__'} onValueChange={v => setTemplateForm(f => ({ ...f, content_type: v === '__all__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Semua" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Semua tipe</SelectItem>
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

// ============================================================
// Channel Breakdown Tab (Sub-component)
// ============================================================

function ChannelBreakdownTab({ calMonth, prevMonth, nextMonth, plans, onOpenDetail, onOpenCreate, onOpenRealize, onDrilldown }: {
  calMonth: Date; prevMonth: () => void; nextMonth: () => void
  plans: ContentPlan[]; onOpenDetail: (id: string) => void
  onOpenCreate: (date?: string, platform?: string) => void
  onOpenRealize: (plan: ContentPlan) => void
  onDrilldown: (opts: { status?: string; platform?: string; contentType?: string; campaignId?: string; overdue?: boolean }) => void
}) {
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null)
  const today = new Date().toISOString().split('T')[0]

  const channelData = PLATFORM_CONFIGS.map(cfg => {
    const pp = plans.filter(p => p.platform === cfg.id)
    const published = pp.filter(p => p.status === 'published')
    const realized = pp.filter(p => p.realized_at)
    const overdue = pp.filter(p => p.status !== 'published' && p.scheduled_date < today)
    const contentTypes: Record<string, number> = {}
    pp.forEach(p => { contentTypes[p.content_type] = (contentTypes[p.content_type] || 0) + 1 })
    const statusDist: Record<string, number> = { draft: 0, planned: 0, published: 0, overdue: 0 }
    pp.forEach(p => {
      if (p.status !== 'published' && p.scheduled_date < today) statusDist.overdue++
      else statusDist[p.status] = (statusDist[p.status] || 0) + 1
    })

    return {
      platform: cfg.id, label: cfg.label, color: cfg.color,
      total: pp.length, published: published.length, realized: realized.length,
      overdue: overdue.length,
      plans: pp, contentTypes, statusDist,
      totalViews: realized.reduce((s, p) => s + (p.actual_views || 0), 0),
      totalLikes: realized.reduce((s, p) => s + (p.actual_likes || 0), 0),
      totalComments: realized.reduce((s, p) => s + (p.actual_comments || 0), 0),
      totalShares: realized.reduce((s, p) => s + (p.actual_shares || 0), 0),
      withEvidence: realized.filter(p => p.actual_post_url).length,
    }
  })

  const activeChannels = channelData.filter(c => c.total > 0)
  const detail = selectedChannel ? channelData.find(c => c.platform === selectedChannel) : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Breakdown per Digital Channel</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium min-w-[120px] text-center">{calMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Channel Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {channelData.map(ch => (
          <Card
            key={ch.platform}
            className={`cursor-pointer transition-all hover:shadow-md ${selectedChannel === ch.platform ? 'ring-2 ring-primary' : ''} ${ch.total === 0 ? 'opacity-50' : ''}`}
            onClick={() => setSelectedChannel(selectedChannel === ch.platform ? null : ch.platform)}
          >
            <CardContent className="p-3 text-center">
              <SocialIconBadge platform={ch.platform} size="sm" variant="filled" className="mx-auto mb-1" />
              <p className="text-xs font-medium">{ch.label}</p>
              <p className="text-lg font-bold">{ch.total}</p>
              <p className="text-[10px] text-muted-foreground">{ch.published} published</p>
              {ch.overdue > 0 && <p className="text-[10px] text-red-600">{ch.overdue} overdue</p>}
              {ch.total > 0 && (
                <div className="mt-1">
                  <ProgressBar value={ch.published} max={ch.total} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Channel Detail */}
      {detail && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <SocialIconBadge platform={detail.platform} size="sm" variant="filled" />
              {detail.label} — Detail Bulan Ini
              <Button size="sm" variant="outline" className="ml-auto text-xs gap-1" onClick={() => onOpenCreate(undefined, detail.platform)}>
                <Plus className="h-3 w-3" /> Buat Konten {detail.label}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stats Row — drillable */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(detail.statusDist).filter(([, count]) => count > 0).map(([status, count]) => (
                <div key={status} className="text-center p-2 rounded border cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => status === 'overdue' ? onDrilldown({ platform: detail.platform, overdue: true }) : onDrilldown({ platform: detail.platform, status })}>
                  <StatusBadge status={status} />
                  <p className="text-lg font-bold mt-1">{count}</p>
                </div>
              ))}
              <div className="text-center p-2 rounded border border-green-200 dark:border-green-800">
                <p className="text-[10px] text-muted-foreground">Terealisasi</p>
                <p className="text-lg font-bold text-green-600">{detail.realized}</p>
              </div>
              <div className="text-center p-2 rounded border border-blue-200 dark:border-blue-800">
                <p className="text-[10px] text-muted-foreground">Evidence</p>
                <p className="text-lg font-bold text-blue-600">{detail.withEvidence}</p>
              </div>
            </div>

            {/* Content Type Distribution — drillable */}
            {Object.keys(detail.contentTypes).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Tipe Konten:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(detail.contentTypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                    <Badge key={type} variant="secondary" className="text-xs capitalize cursor-pointer hover:bg-accent" onClick={() => onDrilldown({ platform: detail.platform, contentType: type })}>{type}: {count}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Aggregate Metrics */}
            {detail.realized > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total Metrik Realisasi:</p>
                <div className="grid grid-cols-4 gap-2">
                  <div className="text-center p-2 border rounded"><p className="text-[10px] text-muted-foreground">Views</p><p className="font-bold text-sm">{detail.totalViews.toLocaleString()}</p></div>
                  <div className="text-center p-2 border rounded"><p className="text-[10px] text-muted-foreground">Likes</p><p className="font-bold text-sm">{detail.totalLikes.toLocaleString()}</p></div>
                  <div className="text-center p-2 border rounded"><p className="text-[10px] text-muted-foreground">Comments</p><p className="font-bold text-sm">{detail.totalComments.toLocaleString()}</p></div>
                  <div className="text-center p-2 border rounded"><p className="text-[10px] text-muted-foreground">Shares</p><p className="font-bold text-sm">{detail.totalShares.toLocaleString()}</p></div>
                </div>
              </div>
            )}

            {/* Plans List — all drillable */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Daftar Konten ({detail.plans.length}):</p>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {detail.plans.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded border hover:bg-muted/50 cursor-pointer" onClick={() => onOpenDetail(p.id)}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground">{p.content_type} • {formatDate(p.scheduled_date)}</p>
                    </div>
                    <StatusBadge status={p.status} scheduledDate={p.scheduled_date} />
                    {p.status === 'published' && !p.realized_at && (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-blue-600" onClick={(e) => { e.stopPropagation(); onOpenRealize(p) }}>
                        <TrendingUp className="h-3 w-3" />
                      </Button>
                    )}
                    {p.actual_post_url && (
                      <a href={p.actual_post_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-600">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!selectedChannel && activeChannels.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Belum ada konten yang direncanakan bulan ini</p>
            <Button size="sm" className="mt-3 gap-1" onClick={() => onOpenCreate()}>
              <Plus className="h-4 w-4" /> Buat Konten Pertama
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================
// Create/Edit Dialog (Sub-component)
// ============================================================

function CreateEditDialog({ open, onOpenChange, form, setForm, editingPlanId, editingOriginalStatus, campaigns, hashtags, templates, onSave, onApplyTemplate }: {
  open: boolean; onOpenChange: (v: boolean) => void
  form: any; setForm: (fn: any) => void
  editingPlanId: string | null
  editingOriginalStatus: string | null
  campaigns: Campaign[]; hashtags: Hashtag[]; templates: Template[]
  onSave: (saveAsDraft?: boolean) => void
  onApplyTemplate: (t: Template) => void
}) {
  const isPublished = editingOriginalStatus === 'published'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingPlanId ? 'Edit Content Plan' : 'Buat Content Plan Baru'}</DialogTitle>
          <DialogDescription>Isi detail konten yang akan dijadwalkan</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {/* Template Quick Apply */}
          {!editingPlanId && templates.length > 0 && (
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">Gunakan Template</Label>
              <div className="flex flex-wrap gap-1">
                {templates.slice(0, 5).map(t => (
                  <Button key={t.id} variant="outline" size="sm" className="text-xs h-7" onClick={() => onApplyTemplate(t)}>
                    <FileText className="h-3 w-3 mr-1" /> {t.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Judul Konten *</Label>
            <Input value={form.title} onChange={(e: any) => setForm((f: any) => ({ ...f, title: e.target.value }))} placeholder="Judul konten / topik utama" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Platform *</Label>
              <Select value={form.platform} onValueChange={(v: string) => setForm((f: any) => ({ ...f, platform: v }))}>
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
              <Label>Tipe Konten *</Label>
              <Select value={form.content_type} onValueChange={(v: string) => setForm((f: any) => ({ ...f, content_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>Tanggal Posting *</Label>
              <Input type="date" value={form.scheduled_date} onChange={(e: any) => setForm((f: any) => ({ ...f, scheduled_date: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Jam Posting</Label>
              <Input type="time" value={form.scheduled_time} onChange={(e: any) => setForm((f: any) => ({ ...f, scheduled_time: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Prioritas</Label>
              <Select value={form.priority} onValueChange={(v: string) => setForm((f: any) => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Caption / Copy</Label>
            <Textarea value={form.caption} onChange={(e: any) => setForm((f: any) => ({ ...f, caption: e.target.value }))} rows={4} placeholder="Caption/copy untuk konten ini..." />
          </div>
          <div className="grid gap-2">
            <Label>Campaign</Label>
            <Select value={form.campaign_id || '__none__'} onValueChange={(v: string) => setForm((f: any) => ({ ...f, campaign_id: v === '__none__' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="Pilih campaign" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Tanpa campaign</SelectItem>
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
            <Label>Hashtags</Label>
            <div className="flex flex-wrap gap-1 p-2 border rounded min-h-[40px]">
              {form.hashtag_ids.map((hid: number) => {
                const ht = hashtags.find(h => h.id === hid)
                return ht ? (
                  <span key={hid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs">
                    #{ht.tag}
                    <button onClick={() => setForm((f: any) => ({ ...f, hashtag_ids: f.hashtag_ids.filter((x: number) => x !== hid) }))} className="hover:text-red-500">&times;</button>
                  </span>
                ) : null
              })}
              <Select onValueChange={(v: string) => { const id = parseInt(v); if (!form.hashtag_ids.includes(id)) setForm((f: any) => ({ ...f, hashtag_ids: [...f.hashtag_ids, id] })) }}>
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
            <Label>Visual Reference URL</Label>
            <Input value={form.visual_url} onChange={(e: any) => setForm((f: any) => ({ ...f, visual_url: e.target.value }))} placeholder="https://drive.google.com/... atau URL Canva" />
          </div>
          <div className="border-t pt-3">
            <Label className="text-xs text-muted-foreground mb-2 block">Target Metrik (opsional)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="grid gap-1"><Label className="text-xs">Target Views</Label><Input type="number" value={form.target_views} onChange={(e: any) => setForm((f: any) => ({ ...f, target_views: e.target.value }))} placeholder="0" /></div>
              <div className="grid gap-1"><Label className="text-xs">Target Likes</Label><Input type="number" value={form.target_likes} onChange={(e: any) => setForm((f: any) => ({ ...f, target_likes: e.target.value }))} placeholder="0" /></div>
              <div className="grid gap-1"><Label className="text-xs">Target Comments</Label><Input type="number" value={form.target_comments} onChange={(e: any) => setForm((f: any) => ({ ...f, target_comments: e.target.value }))} placeholder="0" /></div>
              <div className="grid gap-1"><Label className="text-xs">Target Shares</Label><Input type="number" value={form.target_shares} onChange={(e: any) => setForm((f: any) => ({ ...f, target_shares: e.target.value }))} placeholder="0" /></div>
              <div className="grid gap-1"><Label className="text-xs">Target Engagement %</Label><Input type="number" step="0.1" value={form.target_engagement_rate} onChange={(e: any) => setForm((f: any) => ({ ...f, target_engagement_rate: e.target.value }))} placeholder="0.0" /></div>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Catatan Internal / Brief</Label>
            <Textarea value={form.notes} onChange={(e: any) => setForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Brief, referensi, catatan untuk tim..." />
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
                      onChange={(e: any) => setForm((f: any) => ({
                        ...f,
                        cross_post_platforms: e.target.checked
                          ? [...f.cross_post_platforms, p]
                          : f.cross_post_platforms.filter((x: string) => x !== p),
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          {isPublished ? (
            <Button onClick={() => onSave(false)}>Simpan Perubahan</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onSave(true)}>Simpan Draft</Button>
              <Button onClick={() => onSave(false)}>Simpan</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Detail Dialog (Sub-component)
// ============================================================

function DetailDialog({ open, onOpenChange, plan, comments, linkedContent, newComment, setNewComment, onAddComment, onStatusChange, onEdit, onDelete, onRealize }: {
  open: boolean; onOpenChange: (v: boolean) => void
  plan: ContentPlan | null; comments: Comment[]
  linkedContent: any; newComment: string; setNewComment: (v: string) => void
  onAddComment: () => void
  onStatusChange: (plan: ContentPlan, status: string) => void
  onEdit: (plan: ContentPlan) => void
  onDelete: (id: string) => void
  onRealize: (plan: ContentPlan) => void
}) {
  if (!plan) return null
  const displayStatus = getDisplayStatus(plan)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SocialIconBadge platform={plan.platform} size="sm" variant="filled" />
            {plan.title}
          </DialogTitle>
          <DialogDescription>
            {plan.content_type} • {formatDate(plan.scheduled_date)}
            {plan.scheduled_time && ` • ${plan.scheduled_time.slice(0, 5)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status + Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={plan.status} scheduledDate={plan.scheduled_date} />
            <PriorityBadge priority={plan.priority} />
            {plan.campaign && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: plan.campaign.color }} />
                {plan.campaign.name}
              </span>
            )}
            <div className="flex-1" />
            {/* Draft: can set to Planned or Edit */}
            {plan.status === 'draft' && (
              <Button size="sm" variant="default" onClick={() => onStatusChange(plan, 'planned')} className="text-xs gap-1"><CalendarIcon className="h-3 w-3" /> Set Planned</Button>
            )}
            {/* Planned: can Publish (with realization) or go back to Draft */}
            {plan.status === 'planned' && (
              <>
                <Button size="sm" variant="outline" onClick={() => onStatusChange(plan, 'draft')} className="text-xs gap-1"><FileEdit className="h-3 w-3" /> Kembali Draft</Button>
                <Button size="sm" variant="default" onClick={() => onRealize(plan)} className="text-xs gap-1"><Send className="h-3 w-3" /> Publish & Realisasi</Button>
              </>
            )}
            {/* Published: update realisasi */}
            {plan.status === 'published' && (
              <Button size="sm" variant="outline" onClick={() => onRealize(plan)} className="text-xs gap-1 text-blue-600"><TrendingUp className="h-3 w-3" /> {plan.realized_at ? 'Update' : ''} Realisasi</Button>
            )}
          </div>

          {/* Overdue warning */}
          {displayStatus === 'overdue' && (
            <div className="p-3 bg-red-50 dark:bg-red-950 rounded border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Konten ini sudah melewati jadwal posting ({formatDate(plan.scheduled_date)}) tapi belum dipublish.
            </div>
          )}

          {/* Caption */}
          {plan.caption && (
            <div>
              <Label className="text-xs text-muted-foreground">Caption</Label>
              <div className="mt-1 p-3 bg-muted/50 rounded text-sm whitespace-pre-wrap">{plan.caption}</div>
            </div>
          )}

          {/* Hashtags */}
          {plan.hashtags && plan.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {plan.hashtags.map(h => (
                <span key={h.hashtag.id} className="text-xs text-blue-600 dark:text-blue-400">#{h.hashtag.tag}</span>
              ))}
            </div>
          )}

          {/* Evidence Links */}
          {(plan.actual_post_url || plan.actual_post_url_2) && (
            <div className="p-3 bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800">
              <Label className="text-xs text-green-700 dark:text-green-300 mb-1 block">Link Bukti Posting</Label>
              {plan.actual_post_url && (
                <a href={plan.actual_post_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> {plan.actual_post_url}
                </a>
              )}
              {plan.actual_post_url_2 && (
                <a href={plan.actual_post_url_2} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline flex items-center gap-1 mt-1">
                  <ExternalLink className="h-3 w-3" /> {plan.actual_post_url_2}
                </a>
              )}
            </div>
          )}

          {/* Target vs Actual Metrics */}
          {(plan.target_views || plan.target_likes || plan.target_engagement_rate || plan.actual_views != null) && (
            <div>
              <Label className="text-xs text-muted-foreground">Target vs Realisasi</Label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-1">
                <MetricCard label="Views" actual={plan.actual_views} target={plan.target_views} />
                <MetricCard label="Likes" actual={plan.actual_likes} target={plan.target_likes} />
                <MetricCard label="Comments" actual={plan.actual_comments} target={plan.target_comments} />
                <MetricCard label="Shares" actual={plan.actual_shares} target={plan.target_shares} />
                <MetricCard label="Engagement" actual={plan.actual_engagement_rate ? Math.round(plan.actual_engagement_rate * 10000) / 100 : null} target={plan.target_engagement_rate ? Math.round(plan.target_engagement_rate * 10000) / 100 : null} suffix="%" />
              </div>
            </div>
          )}

          {/* Additional Metrics */}
          {(plan.actual_reach || plan.actual_impressions || plan.actual_saves || plan.actual_clicks) && (
            <div className="grid grid-cols-4 gap-2">
              {plan.actual_reach && <div className="p-2 border rounded text-center"><p className="text-[10px] text-muted-foreground">Reach</p><p className="font-bold text-sm">{plan.actual_reach.toLocaleString()}</p></div>}
              {plan.actual_impressions && <div className="p-2 border rounded text-center"><p className="text-[10px] text-muted-foreground">Impressions</p><p className="font-bold text-sm">{plan.actual_impressions.toLocaleString()}</p></div>}
              {plan.actual_saves && <div className="p-2 border rounded text-center"><p className="text-[10px] text-muted-foreground">Saves</p><p className="font-bold text-sm">{plan.actual_saves.toLocaleString()}</p></div>}
              {plan.actual_clicks && <div className="p-2 border rounded text-center"><p className="text-[10px] text-muted-foreground">Clicks</p><p className="font-bold text-sm">{plan.actual_clicks.toLocaleString()}</p></div>}
            </div>
          )}

          {/* Notes */}
          {plan.notes && (
            <div>
              <Label className="text-xs text-muted-foreground">Catatan / Brief</Label>
              <p className="text-sm mt-1 bg-muted/30 p-2 rounded">{plan.notes}</p>
            </div>
          )}

          {/* Visual */}
          {plan.visual_url && (
            <div>
              <Label className="text-xs text-muted-foreground">Visual Reference</Label>
              <a href={plan.visual_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline flex items-center gap-1 mt-1">
                <Link2 className="h-3 w-3" /> Buka Visual Reference
              </a>
            </div>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t pt-3">
            <div>Dibuat oleh: <span className="text-foreground">{plan.creator?.name || '-'}</span></div>
            <div>Assigned: <span className="text-foreground">{plan.assignee?.name || '-'}</span></div>
            {plan.realized_at && <div>Realisasi: <span className="text-foreground">{formatDateTime(plan.realized_at)}</span></div>}
            {plan.published_at && <div>Published: <span className="text-foreground">{formatDateTime(plan.published_at)}</span></div>}
          </div>

          {/* Comments */}
          <div className="border-t pt-3">
            <Label className="text-xs text-muted-foreground mb-2 block">Komentar ({comments.length})</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
              {comments.map(c => (
                <div key={c.id} className="p-2 rounded text-sm bg-muted/50">
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
              <Input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Tulis komentar..." className="text-sm" onKeyDown={e => e.key === 'Enter' && onAddComment()} />
              <Button size="sm" onClick={onAddComment} disabled={!newComment.trim()}>Kirim</Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {plan.status === 'draft' && (
            <Button variant="ghost" size="sm" className="text-red-600 gap-1" onClick={() => onDelete(plan.id)}>
              <Trash2 className="h-3.5 w-3.5" /> Hapus
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => onEdit(plan)} className="gap-1">
            <Edit className="h-3.5 w-3.5" /> Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
