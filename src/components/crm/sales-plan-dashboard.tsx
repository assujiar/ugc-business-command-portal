'use client'

// =====================================================
// Sales Plan Dashboard Component
// CRUD interface for sales plans
// =====================================================

import { useState } from 'react'
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
} from '@/components/ui/dropdown-menu'
import { formatDate } from '@/lib/utils'
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
  XCircle,
} from 'lucide-react'

interface SalesPlan {
  plan_id: string
  activity_type: ApproachMethod
  subject: string
  description: string | null
  scheduled_date: string
  scheduled_time: string | null
  status: 'planned' | 'completed' | 'cancelled'
  completed_at: string | null
  account_id: string | null
  opportunity_id: string | null
  owner_user_id: string
  created_at: string
  owner_name: string | null
  account_name: string | null
  opportunity_name: string | null
  evidence_url: string | null
  location_address: string | null
}

interface Account {
  account_id: string
  company_name: string
}

interface SalesPlanDashboardProps {
  plans: SalesPlan[]
  accounts: Account[]
  currentUserId: string
  userRole: UserRole
  canCreate: boolean
  canDelete: boolean
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
  const [selectedPlan, setSelectedPlan] = useState<SalesPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'planned' | 'completed' | 'cancelled'>('all')

  // Form state
  const [formData, setFormData] = useState({
    activity_type: '' as ApproachMethod | '',
    subject: '',
    description: '',
    scheduled_date: '',
    scheduled_time: '',
    account_id: '',
  })

  const resetForm = () => {
    setFormData({
      activity_type: '',
      subject: '',
      description: '',
      scheduled_date: '',
      scheduled_time: '',
      account_id: '',
    })
  }

  const handleCreate = async () => {
    if (!formData.activity_type || !formData.subject || !formData.scheduled_date) {
      alert('Please fill required fields')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/crm/sales-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_type: formData.activity_type,
          subject: formData.subject,
          description: formData.description || null,
          scheduled_date: formData.scheduled_date,
          scheduled_time: formData.scheduled_time || null,
          account_id: formData.account_id || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create sales plan')
      }

      setIsCreateOpen(false)
      resetForm()
      router.refresh()
    } catch (error) {
      console.error('Error creating sales plan:', error)
      alert('Failed to create sales plan')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (plan: SalesPlan) => {
    setSelectedPlan(plan)
    setFormData({
      activity_type: plan.activity_type,
      subject: plan.subject,
      description: plan.description || '',
      scheduled_date: plan.scheduled_date,
      scheduled_time: plan.scheduled_time || '',
      account_id: plan.account_id || '',
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
          activity_type: formData.activity_type,
          subject: formData.subject,
          description: formData.description || null,
          scheduled_date: formData.scheduled_date,
          scheduled_time: formData.scheduled_time || null,
          account_id: formData.account_id || null,
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

  const handleMarkComplete = async (planId: string) => {
    try {
      const response = await fetch(`/api/crm/sales-plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })

      if (!response.ok) {
        throw new Error('Failed to mark as complete')
      }

      router.refresh()
    } catch (error) {
      console.error('Error marking complete:', error)
      alert('Failed to mark as complete')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'planned':
        return <Badge className="bg-blue-100 text-blue-800"><Clock className="h-3 w-3 mr-1" />Planned</Badge>
      case 'completed':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-800"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const filteredPlans = plans.filter(p => statusFilter === 'all' || p.status === statusFilter)

  const canEditPlan = (plan: SalesPlan) => {
    if (userRole === 'super admin' || userRole === 'Director') return true
    if (userRole === 'salesperson' && plan.owner_user_id === currentUserId) return true
    return false
  }

  // Stats
  const plannedCount = plans.filter(p => p.status === 'planned').length
  const completedCount = plans.filter(p => p.status === 'completed').length
  const todayPlans = plans.filter(p => p.status === 'planned' && p.scheduled_date === new Date().toISOString().split('T')[0]).length

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:shadow-md" onClick={() => setStatusFilter('planned')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-blue-100">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-600">{plannedCount}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Planned Activities</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md" onClick={() => setStatusFilter('completed')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-600">{completedCount}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Completed Activities</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-orange-100">
                <Calendar className="h-5 w-5 text-orange-600" />
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-orange-600">{todayPlans}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Today's Activities</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canCreate && (
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Activity
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
                  <TableHead>Sales Name</TableHead>
                  <TableHead>Activity Type</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Scheduled Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlans.length > 0 ? (
                  filteredPlans.map((plan) => (
                    <TableRow key={plan.plan_id}>
                      <TableCell>{plan.owner_name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {APPROACH_METHODS.find(m => m.value === plan.activity_type)?.label || plan.activity_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{plan.subject}</TableCell>
                      <TableCell>{plan.account_name || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3" />
                          {formatDate(plan.scheduled_date)}
                          {plan.scheduled_time && <span className="text-muted-foreground">({plan.scheduled_time})</span>}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(plan.status)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEditPlan(plan) && plan.status === 'planned' && (
                              <>
                                <DropdownMenuItem onClick={() => handleEdit(plan)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleMarkComplete(plan.plan_id)}>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Mark Complete
                                </DropdownMenuItem>
                              </>
                            )}
                            {canDelete && (
                              <DropdownMenuItem
                                onClick={() => handleDelete(plan.plan_id)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Activity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Activity Type *</Label>
              <Select
                value={formData.activity_type}
                onValueChange={(v) => setFormData({ ...formData, activity_type: v as ApproachMethod })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select activity type" />
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

            <div className="space-y-2">
              <Label>Subject *</Label>
              <Input
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Enter activity subject"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Scheduled Date *</Label>
                <Input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Scheduled Time</Label>
                <Input
                  type="time"
                  value={formData.scheduled_time}
                  onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Account</Label>
              <Select
                value={formData.account_id}
                onValueChange={(v) => setFormData({ ...formData, account_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No account</SelectItem>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.account_id} value={acc.account_id}>
                      {acc.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Activity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Activity Type *</Label>
              <Select
                value={formData.activity_type}
                onValueChange={(v) => setFormData({ ...formData, activity_type: v as ApproachMethod })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select activity type" />
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

            <div className="space-y-2">
              <Label>Subject *</Label>
              <Input
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Enter activity subject"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Scheduled Date *</Label>
                <Input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Scheduled Time</Label>
                <Input
                  type="time"
                  value={formData.scheduled_time}
                  onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Account</Label>
              <Select
                value={formData.account_id}
                onValueChange={(v) => setFormData({ ...formData, account_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No account</SelectItem>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.account_id} value={acc.account_id}>
                      {acc.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
