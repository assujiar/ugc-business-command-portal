'use client'

// =====================================================
// Sales Plan Dashboard Component
// Target planning for maintenance, hunting, winback
// =====================================================

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { formatDate, formatDateTime } from '@/lib/utils'
import { APPROACH_METHODS } from '@/lib/constants'
import type { UserRole, ApproachMethod } from '@/types/database'
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  CheckCircle,
  Clock,
  Calendar,
  Building2,
  Eye,
  Upload,
  Target,
  UserPlus,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  MapPin,
  Phone,
  Mail,
  FileText,
  Image,
  ExternalLink,
  Camera,
  Loader2,
  Navigation,
  X,
} from 'lucide-react'

type SalesPlanType = 'maintenance_existing' | 'hunting_new' | 'winback_lost'
type PotentialStatus = 'pending' | 'potential' | 'not_potential'

const PLAN_TYPES = [
  { value: 'maintenance_existing', label: 'Maintenance Existing Customer', icon: Building2 },
  { value: 'hunting_new', label: 'Hunting New Customer', icon: UserPlus },
  { value: 'winback_lost', label: 'Winback Lost Customer', icon: RotateCcw },
]

interface SalesPlan {
  plan_id: string
  plan_type: SalesPlanType
  company_name: string
  pic_name: string | null
  pic_phone: string | null
  pic_email: string | null
  source_account_id: string | null
  planned_date: string
  planned_activity_method: ApproachMethod
  plan_notes: string | null
  status: 'planned' | 'completed' | 'cancelled'
  realized_at: string | null
  actual_activity_method: ApproachMethod | null
  method_change_reason: string | null
  realization_notes: string | null
  evidence_url: string | null
  evidence_file_name: string | null
  location_lat: number | null
  location_lng: number | null
  location_address: string | null
  potential_status: PotentialStatus
  not_potential_reason: string | null
  created_lead_id: string | null
  created_account_id: string | null
  created_opportunity_id: string | null
  owner_user_id: string
  created_at: string
  owner_name: string | null
  account_name: string | null
}

interface Account {
  account_id: string
  company_name: string
  pic_name: string | null
  pic_phone: string | null
  pic_email: string | null
  account_status: string | null
}

interface SalesPlanDashboardProps {
  plans: SalesPlan[]
  accounts: Account[]
  currentUserId: string
  userRole: UserRole
  canCreate: boolean
  canDelete: boolean
}

// Helper to check if URL is an image
function isImageUrl(url: string | null): boolean {
  if (!url) return false
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
  const lowerUrl = url.toLowerCase()
  return imageExtensions.some(ext => lowerUrl.includes(ext))
}

export function SalesPlanDashboard({
  plans,
  accounts,
  currentUserId,
  userRole,
  canCreate,
  canDelete,
}: SalesPlanDashboardProps) {
  const router = useRouter()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isUpdateOpen, setIsUpdateOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [isPotentialOpen, setIsPotentialOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<SalesPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'planned' | 'completed'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | SalesPlanType>('all')

  // Form state
  const [formData, setFormData] = useState({
    plan_type: '' as SalesPlanType | '',
    company_name: '',
    pic_name: '',
    pic_phone: '',
    pic_email: '',
    source_account_id: '',
    planned_date: '',
    planned_activity_method: '' as ApproachMethod | '',
    plan_notes: '',
  })

  // Update realization form state
  const [updateData, setUpdateData] = useState({
    actual_activity_method: '' as ApproachMethod | '',
    method_change_reason: '',
    realization_notes: '',
    evidence_url: '',
    location_lat: null as number | null,
    location_lng: null as number | null,
    location_address: '',
  })

  // File upload state
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isGettingLocation, setIsGettingLocation] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Potential assessment state
  const [potentialData, setPotentialData] = useState({
    is_potential: true,
    not_potential_reason: '',
  })

  // Existing accounts filtered by status
  const existingAccounts = accounts.filter(a =>
    a.account_status === 'new_account' || a.account_status === 'active_account'
  )
  const lostAccounts = accounts.filter(a => a.account_status === 'lost_account')

  const resetForm = () => {
    setFormData({
      plan_type: '',
      company_name: '',
      pic_name: '',
      pic_phone: '',
      pic_email: '',
      source_account_id: '',
      planned_date: '',
      planned_activity_method: '',
      plan_notes: '',
    })
  }

  // When plan type changes, reset company/account fields
  const handlePlanTypeChange = (type: SalesPlanType) => {
    setFormData({
      ...formData,
      plan_type: type,
      company_name: '',
      pic_name: '',
      pic_phone: '',
      pic_email: '',
      source_account_id: '',
    })
  }

  // When selecting existing account, populate PIC info
  const handleAccountSelect = (accountId: string) => {
    const account = accounts.find(a => a.account_id === accountId)
    if (account) {
      setFormData({
        ...formData,
        source_account_id: accountId,
        company_name: account.company_name,
        pic_name: account.pic_name || '',
        pic_phone: account.pic_phone || '',
        pic_email: account.pic_email || '',
      })
    }
  }

  const handleCreate = async () => {
    if (!formData.plan_type || !formData.company_name || !formData.planned_date || !formData.planned_activity_method) {
      alert('Please fill required fields')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/crm/sales-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_type: formData.plan_type,
          company_name: formData.company_name,
          pic_name: formData.pic_name || null,
          pic_phone: formData.pic_phone || null,
          pic_email: formData.pic_email || null,
          source_account_id: formData.source_account_id || null,
          planned_date: formData.planned_date,
          planned_activity_method: formData.planned_activity_method,
          plan_notes: formData.plan_notes || null,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to create sales plan')
      }

      setIsCreateOpen(false)
      resetForm()
      router.refresh()
    } catch (error: any) {
      console.error('Error creating sales plan:', error)
      alert(error.message || 'Failed to create sales plan')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (plan: SalesPlan) => {
    setSelectedPlan(plan)
    setFormData({
      plan_type: plan.plan_type,
      company_name: plan.company_name,
      pic_name: plan.pic_name || '',
      pic_phone: plan.pic_phone || '',
      pic_email: plan.pic_email || '',
      source_account_id: plan.source_account_id || '',
      planned_date: plan.planned_date,
      planned_activity_method: plan.planned_activity_method,
      plan_notes: plan.plan_notes || '',
    })
    setIsEditOpen(true)
  }

  const handleUpdate = async () => {
    if (!selectedPlan) return

    setLoading(true)
    try {
      const response = await fetch(`/api/crm/sales-plans/${selectedPlan.plan_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: formData.company_name,
          pic_name: formData.pic_name || null,
          pic_phone: formData.pic_phone || null,
          pic_email: formData.pic_email || null,
          planned_date: formData.planned_date,
          planned_activity_method: formData.planned_activity_method,
          plan_notes: formData.plan_notes || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update sales plan')
      }

      setIsEditOpen(false)
      setSelectedPlan(null)
      resetForm()
      router.refresh()
    } catch (error) {
      console.error('Error updating sales plan:', error)
      alert('Failed to update sales plan')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this sales plan?')) return

    try {
      const response = await fetch(`/api/crm/sales-plans/${planId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete sales plan')
      }

      router.refresh()
    } catch (error) {
      console.error('Error deleting sales plan:', error)
      alert('Failed to delete sales plan')
    }
  }

  const openUpdateRealization = (plan: SalesPlan) => {
    setSelectedPlan(plan)
    setUpdateData({
      actual_activity_method: plan.planned_activity_method,
      method_change_reason: '',
      realization_notes: '',
      evidence_url: '',
      location_lat: null,
      location_lng: null,
      location_address: '',
    })
    setEvidenceFile(null)
    setIsUpdateOpen(true)
    // Auto-get location when opening the dialog
    handleGetLocation()
  }

  // Handle file selection from gallery
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setEvidenceFile(file)
    }
  }

  // Handle camera capture
  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setEvidenceFile(file)
    }
  }

  // Clear selected file
  const handleClearFile = () => {
    setEvidenceFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  // Get current GPS location
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      return
    }

    setIsGettingLocation(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude

        setUpdateData(prev => ({
          ...prev,
          location_lat: lat,
          location_lng: lng,
        }))

        // Reverse geocode to get address
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            { headers: { 'Accept-Language': 'id' } }
          )
          const data = await response.json()
          if (data.display_name) {
            setUpdateData(prev => ({
              ...prev,
              location_address: data.display_name,
            }))
          }
        } catch (error) {
          console.error('Error getting address:', error)
          setUpdateData(prev => ({
            ...prev,
            location_address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          }))
        }

        setIsGettingLocation(false)
      },
      (error) => {
        console.error('Error getting location:', error)
        setIsGettingLocation(false)
        let errorMessage = 'Failed to get location'
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied. Please enable location permissions.'
            break
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable.'
            break
          case error.TIMEOUT:
            errorMessage = 'Location request timed out.'
            break
        }
        alert(errorMessage)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )
  }

  // Upload evidence file to Supabase storage
  const uploadEvidenceFile = async (): Promise<string | null> => {
    if (!evidenceFile || !selectedPlan) return null

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('evidence', evidenceFile)
      if (updateData.location_lat) formData.append('location_lat', updateData.location_lat.toString())
      if (updateData.location_lng) formData.append('location_lng', updateData.location_lng.toString())
      if (updateData.location_address) formData.append('location_address', updateData.location_address)

      const response = await fetch(`/api/crm/sales-plans/${selectedPlan.plan_id}/evidence`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Failed to upload evidence')
      }

      const result = await response.json()
      return result.data.evidence_url
    } catch (error) {
      console.error('Error uploading evidence:', error)
      return null
    } finally {
      setIsUploading(false)
    }
  }

  const handleUpdateRealization = async () => {
    if (!selectedPlan || !updateData.actual_activity_method) {
      alert('Please select activity method')
      return
    }

    // Check if method changed and reason is required
    if (updateData.actual_activity_method !== selectedPlan.planned_activity_method && !updateData.method_change_reason) {
      alert('Please provide reason for method change')
      return
    }

    setLoading(true)
    try {
      // Upload evidence file if selected
      let evidenceUrl = updateData.evidence_url
      if (evidenceFile) {
        const uploadedUrl = await uploadEvidenceFile()
        if (uploadedUrl) {
          evidenceUrl = uploadedUrl
        } else if (!updateData.evidence_url) {
          // Upload failed and no URL provided
          console.warn('Evidence upload failed, continuing without evidence')
        }
      }

      const response = await fetch(`/api/crm/sales-plans/${selectedPlan.plan_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          actual_activity_method: updateData.actual_activity_method,
          method_change_reason: updateData.method_change_reason || null,
          realization_notes: updateData.realization_notes || null,
          evidence_url: evidenceUrl || null,
          location_lat: updateData.location_lat,
          location_lng: updateData.location_lng,
          location_address: updateData.location_address || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update realization')
      }

      setIsUpdateOpen(false)
      setEvidenceFile(null)

      // If hunting new customer, open potential assessment
      if (selectedPlan.plan_type === 'hunting_new') {
        setIsPotentialOpen(true)
      } else {
        setSelectedPlan(null)
        router.refresh()
      }
    } catch (error) {
      console.error('Error updating realization:', error)
      alert('Failed to update realization')
    } finally {
      setLoading(false)
    }
  }

  const handlePotentialAssessment = async (isPotential: boolean) => {
    if (!selectedPlan) return

    if (!isPotential && !potentialData.not_potential_reason) {
      alert('Please provide reason for not potential')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/crm/sales-plans/${selectedPlan.plan_id}/potential`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_potential: isPotential,
          not_potential_reason: isPotential ? null : potentialData.not_potential_reason,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update potential status')
      }

      setIsPotentialOpen(false)
      setSelectedPlan(null)
      setPotentialData({ is_potential: true, not_potential_reason: '' })
      router.refresh()
    } catch (error) {
      console.error('Error updating potential status:', error)
      alert('Failed to update potential status')
    } finally {
      setLoading(false)
    }
  }

  const handleViewActivity = (plan: SalesPlan) => {
    setSelectedPlan(plan)
    setIsViewOpen(true)
  }

  const getPlanTypeBadge = (type: SalesPlanType) => {
    switch (type) {
      case 'maintenance_existing':
        return <Badge className="bg-blue-100 text-blue-800"><Building2 className="h-3 w-3 mr-1" />Maintenance</Badge>
      case 'hunting_new':
        return <Badge className="bg-green-100 text-green-800"><UserPlus className="h-3 w-3 mr-1" />Hunting</Badge>
      case 'winback_lost':
        return <Badge className="bg-orange-100 text-orange-800"><RotateCcw className="h-3 w-3 mr-1" />Winback</Badge>
      default:
        return <Badge variant="outline">{type}</Badge>
    }
  }

  const getStatusBadge = (status: string, potentialStatus?: PotentialStatus) => {
    if (status === 'completed' && potentialStatus === 'potential') {
      return <Badge className="bg-emerald-100 text-emerald-800"><ThumbsUp className="h-3 w-3 mr-1" />Potential</Badge>
    }
    if (status === 'completed' && potentialStatus === 'not_potential') {
      return <Badge className="bg-red-100 text-red-800"><ThumbsDown className="h-3 w-3 mr-1" />Not Potential</Badge>
    }
    switch (status) {
      case 'planned':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Planned</Badge>
      case 'completed':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-800">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const filteredPlans = plans
    .filter(p => statusFilter === 'all' || p.status === statusFilter)
    .filter(p => typeFilter === 'all' || p.plan_type === typeFilter)

  const canEditPlan = (plan: SalesPlan) => {
    if (userRole === 'super admin' || userRole === 'Director') return true
    if (userRole === 'salesperson' && plan.owner_user_id === currentUserId && plan.status === 'planned') return true
    return false
  }

  const canUpdateRealization = (plan: SalesPlan) => {
    if (plan.status !== 'planned') return false
    if (userRole === 'super admin') return true
    if (userRole === 'salesperson' && plan.owner_user_id === currentUserId) return true
    return false
  }

  // Stats
  const plannedCount = plans.filter(p => p.status === 'planned').length
  const completedCount = plans.filter(p => p.status === 'completed').length
  const huntingPotentialCount = plans.filter(p => p.plan_type === 'hunting_new' && p.potential_status === 'potential').length
  const maintenanceCount = plans.filter(p => p.plan_type === 'maintenance_existing').length
  const huntingCount = plans.filter(p => p.plan_type === 'hunting_new').length
  const winbackCount = plans.filter(p => p.plan_type === 'winback_lost').length

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="cursor-pointer hover:shadow-md" onClick={() => setStatusFilter('planned')}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <Clock className="h-5 w-5 text-yellow-600" />
              <p className="text-xl font-bold text-yellow-600">{plannedCount}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Planned</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md" onClick={() => setStatusFilter('completed')}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <p className="text-xl font-bold text-green-600">{completedCount}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Completed</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md" onClick={() => setTypeFilter('maintenance_existing')}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <Building2 className="h-5 w-5 text-blue-600" />
              <p className="text-xl font-bold text-blue-600">{maintenanceCount}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Maintenance</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md" onClick={() => setTypeFilter('hunting_new')}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <UserPlus className="h-5 w-5 text-emerald-600" />
              <p className="text-xl font-bold text-emerald-600">{huntingCount}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Hunting</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md" onClick={() => setTypeFilter('winback_lost')}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <RotateCcw className="h-5 w-5 text-orange-600" />
              <p className="text-xl font-bold text-orange-600">{winbackCount}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Winback</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <Target className="h-5 w-5 text-purple-600" />
              <p className="text-xl font-bold text-purple-600">{huntingPotentialCount}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">New Potential</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Plan Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="maintenance_existing">Maintenance</SelectItem>
              <SelectItem value="hunting_new">Hunting</SelectItem>
              <SelectItem value="winback_lost">Winback</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canCreate && (
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Plan
          </Button>
        )}
      </div>

      {/* Plans Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>PIC</TableHead>
                  <TableHead>Planned Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Realized</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlans.length > 0 ? (
                  filteredPlans.map((plan) => (
                    <TableRow key={plan.plan_id}>
                      <TableCell>{plan.owner_name || '-'}</TableCell>
                      <TableCell>{getPlanTypeBadge(plan.plan_type)}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{plan.company_name}</TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <p>{plan.pic_name || '-'}</p>
                          {plan.pic_phone && <p className="text-muted-foreground">{plan.pic_phone}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3" />
                          {formatDate(plan.planned_date)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {APPROACH_METHODS.find(m => m.value === plan.planned_activity_method)?.label || plan.planned_activity_method}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(plan.status, plan.potential_status)}</TableCell>
                      <TableCell>
                        {plan.realized_at ? (
                          <span className="text-xs text-green-600">
                            {formatDateTime(plan.realized_at)}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewActivity(plan)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Activity
                            </DropdownMenuItem>
                            {canEditPlan(plan) && (
                              <DropdownMenuItem onClick={() => handleEdit(plan)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {canUpdateRealization(plan) && (
                              <DropdownMenuItem onClick={() => openUpdateRealization(plan)}>
                                <Upload className="h-4 w-4 mr-2" />
                                Update Realization
                              </DropdownMenuItem>
                            )}
                            {plan.status === 'completed' && plan.plan_type === 'hunting_new' && plan.potential_status === 'pending' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => { setSelectedPlan(plan); setIsPotentialOpen(true); }}>
                                  <Target className="h-4 w-4 mr-2" />
                                  Assess Potential
                                </DropdownMenuItem>
                              </>
                            )}
                            {canDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleDelete(plan.plan_id)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No sales plans found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Sales Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Plan Type */}
            <div className="space-y-2">
              <Label>Plan Type *</Label>
              <Select
                value={formData.plan_type}
                onValueChange={(v) => handlePlanTypeChange(v as SalesPlanType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select plan type" />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Company Selection based on type */}
            {formData.plan_type === 'hunting_new' && (
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <Input
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  placeholder="Enter new company name"
                />
              </div>
            )}

            {formData.plan_type === 'maintenance_existing' && (
              <div className="space-y-2">
                <Label>Select Existing Account *</Label>
                <Select
                  value={formData.source_account_id}
                  onValueChange={handleAccountSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select existing account" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingAccounts.map((acc) => (
                      <SelectItem key={acc.account_id} value={acc.account_id}>
                        {acc.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.plan_type === 'winback_lost' && (
              <div className="space-y-2">
                <Label>Select Lost Account *</Label>
                <Select
                  value={formData.source_account_id}
                  onValueChange={handleAccountSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select lost account" />
                  </SelectTrigger>
                  <SelectContent>
                    {lostAccounts.map((acc) => (
                      <SelectItem key={acc.account_id} value={acc.account_id}>
                        {acc.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* PIC Info */}
            <div className="space-y-2">
              <Label>PIC Name</Label>
              <Input
                value={formData.pic_name}
                onChange={(e) => setFormData({ ...formData, pic_name: e.target.value })}
                placeholder="Contact person name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PIC Phone</Label>
                <Input
                  value={formData.pic_phone}
                  onChange={(e) => setFormData({ ...formData, pic_phone: e.target.value })}
                  placeholder="Phone number"
                />
              </div>
              <div className="space-y-2">
                <Label>PIC Email</Label>
                <Input
                  type="email"
                  value={formData.pic_email}
                  onChange={(e) => setFormData({ ...formData, pic_email: e.target.value })}
                  placeholder="Email address"
                />
              </div>
            </div>

            {/* Planning */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Planned Date *</Label>
                <Input
                  type="date"
                  value={formData.planned_date}
                  onChange={(e) => setFormData({ ...formData, planned_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Activity Method *</Label>
                <Select
                  value={formData.planned_activity_method}
                  onValueChange={(v) => setFormData({ ...formData, planned_activity_method: v as ApproachMethod })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    {APPROACH_METHODS.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        {method.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.plan_notes}
                onChange={(e) => setFormData({ ...formData, plan_notes: e.target.value })}
                placeholder="Additional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreateOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating...' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Sales Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                disabled={formData.plan_type !== 'hunting_new'}
              />
            </div>

            <div className="space-y-2">
              <Label>PIC Name</Label>
              <Input
                value={formData.pic_name}
                onChange={(e) => setFormData({ ...formData, pic_name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PIC Phone</Label>
                <Input
                  value={formData.pic_phone}
                  onChange={(e) => setFormData({ ...formData, pic_phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>PIC Email</Label>
                <Input
                  type="email"
                  value={formData.pic_email}
                  onChange={(e) => setFormData({ ...formData, pic_email: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Planned Date</Label>
                <Input
                  type="date"
                  value={formData.planned_date}
                  onChange={(e) => setFormData({ ...formData, planned_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Activity Method</Label>
                <Select
                  value={formData.planned_activity_method}
                  onValueChange={(v) => setFormData({ ...formData, planned_activity_method: v as ApproachMethod })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPROACH_METHODS.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        {method.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.plan_notes}
                onChange={(e) => setFormData({ ...formData, plan_notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Realization Dialog */}
      <Dialog open={isUpdateOpen} onOpenChange={setIsUpdateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update Activity Realization</DialogTitle>
            <DialogDescription>
              Record the actual activity performed
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Activity Method *</Label>
              <Select
                value={updateData.actual_activity_method}
                onValueChange={(v) => setUpdateData({ ...updateData, actual_activity_method: v as ApproachMethod })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPROACH_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPlan && updateData.actual_activity_method !== selectedPlan.planned_activity_method && (
                <p className="text-xs text-orange-600">Method changed from planned</p>
              )}
            </div>

            {selectedPlan && updateData.actual_activity_method !== selectedPlan.planned_activity_method && (
              <div className="space-y-2">
                <Label>Reason for Change *</Label>
                <Input
                  value={updateData.method_change_reason}
                  onChange={(e) => setUpdateData({ ...updateData, method_change_reason: e.target.value })}
                  placeholder="e.g., PIC tidak ada ditempat, hujan, dll"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Evidence Photo</Label>
              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.doc,.docx"
                className="hidden"
                onChange={handleFileSelect}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCameraCapture}
              />

              {/* Upload buttons */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Camera
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Gallery
                </Button>
              </div>

              {/* Selected file preview */}
              {evidenceFile && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  {evidenceFile.type.startsWith('image/') ? (
                    <Image className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm flex-1 truncate">{evidenceFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearFile}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {isUploading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Location (Auto GPS)</Label>
              <div className="flex gap-2">
                <Input
                  value={updateData.location_address}
                  onChange={(e) => setUpdateData({ ...updateData, location_address: e.target.value })}
                  placeholder="Getting location..."
                  className="flex-1"
                  readOnly
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGetLocation}
                  disabled={isGettingLocation}
                >
                  {isGettingLocation ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Navigation className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {updateData.location_lat && updateData.location_lng && (
                <p className="text-xs text-muted-foreground">
                  GPS: {updateData.location_lat.toFixed(6)}, {updateData.location_lng.toFixed(6)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={updateData.realization_notes}
                onChange={(e) => setUpdateData({ ...updateData, realization_notes: e.target.value })}
                placeholder="Activity notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUpdateOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateRealization} disabled={loading || isUploading || isGettingLocation}>
              {loading || isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isUploading ? 'Uploading...' : 'Saving...'}
                </>
              ) : (
                'Complete Activity'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Potential Assessment Dialog */}
      <Dialog open={isPotentialOpen} onOpenChange={setIsPotentialOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Potential Assessment</DialogTitle>
            <DialogDescription>
              Is this a potential customer?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant={potentialData.is_potential ? 'default' : 'outline'}
                className="h-20"
                onClick={() => setPotentialData({ ...potentialData, is_potential: true })}
              >
                <div className="flex flex-col items-center">
                  <ThumbsUp className="h-6 w-6 mb-2" />
                  Potential
                </div>
              </Button>
              <Button
                variant={!potentialData.is_potential ? 'destructive' : 'outline'}
                className="h-20"
                onClick={() => setPotentialData({ ...potentialData, is_potential: false })}
              >
                <div className="flex flex-col items-center">
                  <ThumbsDown className="h-6 w-6 mb-2" />
                  Not Potential
                </div>
              </Button>
            </div>

            {!potentialData.is_potential && (
              <div className="space-y-2">
                <Label>Reason for Not Potential *</Label>
                <Textarea
                  value={potentialData.not_potential_reason}
                  onChange={(e) => setPotentialData({ ...potentialData, not_potential_reason: e.target.value })}
                  placeholder="Explain why this is not a potential customer"
                />
              </div>
            )}

            {potentialData.is_potential && (
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200">
                  Marking as potential will automatically create:
                </p>
                <ul className="text-sm text-green-700 dark:text-green-300 mt-2 list-disc list-inside">
                  <li>Lead record</li>
                  <li>Account record</li>
                  <li>Pipeline/Opportunity record</li>
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPotentialOpen(false)}>Cancel</Button>
            <Button
              onClick={() => handlePotentialAssessment(potentialData.is_potential)}
              disabled={loading}
              variant={potentialData.is_potential ? 'default' : 'destructive'}
            >
              {loading ? 'Processing...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Activity Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Activity Detail</DialogTitle>
          </DialogHeader>
          {selectedPlan && (
            <div className="space-y-4">
              {/* Plan Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Plan Type</p>
                  {getPlanTypeBadge(selectedPlan.plan_type)}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  {getStatusBadge(selectedPlan.status, selectedPlan.potential_status)}
                </div>
              </div>

              {/* Company Info */}
              <div>
                <p className="text-xs text-muted-foreground">Company</p>
                <p className="font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {selectedPlan.company_name}
                </p>
              </div>

              {/* PIC Info */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">PIC Name</p>
                  <p className="font-medium">{selectedPlan.pic_name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  {selectedPlan.pic_phone ? (
                    <a href={`tel:${selectedPlan.pic_phone}`} className="font-medium flex items-center gap-1 text-brand hover:underline">
                      <Phone className="h-3 w-3" />
                      {selectedPlan.pic_phone}
                    </a>
                  ) : '-'}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  {selectedPlan.pic_email ? (
                    <a href={`mailto:${selectedPlan.pic_email}`} className="font-medium flex items-center gap-1 text-brand hover:underline text-sm">
                      <Mail className="h-3 w-3" />
                      {selectedPlan.pic_email}
                    </a>
                  ) : '-'}
                </div>
              </div>

              {/* Planning */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Planned Date</p>
                  <p className="font-medium flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(selectedPlan.planned_date)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Planned Method</p>
                  <Badge variant="outline">
                    {APPROACH_METHODS.find(m => m.value === selectedPlan.planned_activity_method)?.label}
                  </Badge>
                </div>
              </div>

              {selectedPlan.plan_notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Plan Notes</p>
                  <p className="text-sm">{selectedPlan.plan_notes}</p>
                </div>
              )}

              {/* Realization (if completed) */}
              {selectedPlan.status === 'completed' && (
                <>
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Realization</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Realized At</p>
                        <p className="font-medium text-green-600">
                          {selectedPlan.realized_at ? formatDateTime(selectedPlan.realized_at) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Actual Method</p>
                        <Badge variant="outline">
                          {APPROACH_METHODS.find(m => m.value === selectedPlan.actual_activity_method)?.label || '-'}
                        </Badge>
                      </div>
                    </div>

                    {selectedPlan.method_change_reason && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground">Method Change Reason</p>
                        <p className="text-sm text-orange-600">{selectedPlan.method_change_reason}</p>
                      </div>
                    )}

                    {selectedPlan.realization_notes && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground">Realization Notes</p>
                        <p className="text-sm">{selectedPlan.realization_notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Evidence */}
                  {selectedPlan.evidence_url && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Evidence</p>
                      {isImageUrl(selectedPlan.evidence_url) ? (
                        <a href={selectedPlan.evidence_url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={selectedPlan.evidence_url}
                            alt="Evidence"
                            className="rounded-lg max-h-48 object-cover border"
                          />
                        </a>
                      ) : (
                        <a
                          href={selectedPlan.evidence_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-brand hover:underline"
                        >
                          <FileText className="h-4 w-4" />
                          View Evidence
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Location */}
                  {selectedPlan.location_address && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Location</p>
                      <p className="text-sm flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        {selectedPlan.location_address}
                      </p>
                      {selectedPlan.location_lat && selectedPlan.location_lng && (
                        <a
                          href={`https://www.google.com/maps?q=${selectedPlan.location_lat},${selectedPlan.location_lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-brand hover:underline mt-2"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View in Google Maps
                        </a>
                      )}
                    </div>
                  )}

                  {/* Potential Status (for hunting) */}
                  {selectedPlan.plan_type === 'hunting_new' && selectedPlan.potential_status !== 'pending' && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Potential Assessment</h4>
                      <div className="flex items-center gap-2">
                        {selectedPlan.potential_status === 'potential' ? (
                          <Badge className="bg-emerald-100 text-emerald-800">
                            <ThumbsUp className="h-3 w-3 mr-1" />
                            Potential Customer
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800">
                            <ThumbsDown className="h-3 w-3 mr-1" />
                            Not Potential
                          </Badge>
                        )}
                      </div>
                      {selectedPlan.not_potential_reason && (
                        <p className="text-sm text-red-600 mt-2">{selectedPlan.not_potential_reason}</p>
                      )}
                      {selectedPlan.created_lead_id && (
                        <p className="text-sm text-green-600 mt-2">
                          Lead created: {selectedPlan.created_lead_id}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
