'use client'

// =====================================================
// Accounts Client Component
// Interactive features: filtering, modals, retry prospect, edit account
// =====================================================

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Building2,
  TrendingUp,
  User,
  Calendar,
  DollarSign,
  Activity,
  Eye,
  RotateCcw,
  MoreHorizontal,
  X,
  CheckCircle,
  AlertCircle,
  Clock,
  UserX,
  Loader2,
  Pencil,
  Save,
  Ticket,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { UserRole } from '@/types/database'

interface AccountEnriched {
  account_id: string
  company_name: string
  owner_name: string | null
  owner_user_id: string | null
  pic_name: string | null
  pic_email: string | null
  pic_phone: string | null
  industry: string | null
  address: string | null
  city: string | null
  province: string | null
  country: string | null
  postal_code: string | null
  phone: string | null
  domain: string | null
  npwp: string | null
  notes: string | null
  activity_status: string | null
  account_status: string | null
  open_opportunities: number
  planned_activities: number
  overdue_activities: number
  revenue_total: number
  retry_count: number
  lead_id: string | null
  // Revenue from DSO/AR module (placeholder for future development)
  actual_revenue: number
  total_payment: number
  total_outstanding: number
}

interface SalesUser {
  user_id: string
  name: string
  email: string
  role: string
  department: string | null
}

interface AccountsClientProps {
  accounts: AccountEnriched[]
  userRole: UserRole | null
}

// Roles that can edit accounts
const EDIT_ACCOUNT_ROLES: UserRole[] = ['sales support', 'super admin', 'MACX', 'Director']

// Status configurations
const ACCOUNT_STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  calon_account: { label: 'Calon Account', icon: <Clock className="h-4 w-4" />, color: 'bg-blue-100 text-blue-800' },
  new_account: { label: 'New Account', icon: <CheckCircle className="h-4 w-4" />, color: 'bg-green-100 text-green-800' },
  active_account: { label: 'Active Account', icon: <Activity className="h-4 w-4" />, color: 'bg-emerald-100 text-emerald-800' },
  passive_account: { label: 'Passive Account', icon: <Clock className="h-4 w-4" />, color: 'bg-yellow-100 text-yellow-800' },
  failed_account: { label: 'Failed Account', icon: <AlertCircle className="h-4 w-4" />, color: 'bg-red-100 text-red-800' },
  lost_account: { label: 'Lost Account', icon: <UserX className="h-4 w-4" />, color: 'bg-gray-100 text-gray-800' },
}

const ACTIVITY_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  Active: { label: 'Active', color: 'bg-green-100 text-green-800' },
  Passive: { label: 'Passive', color: 'bg-yellow-100 text-yellow-800' },
  Inactive: { label: 'Inactive', color: 'bg-gray-100 text-gray-800' },
}

function getAttemptLabel(attemptNumber: number): string {
  const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth']
  if (attemptNumber <= 10) {
    return `${ordinals[attemptNumber - 1]} Attempt Pipeline`
  }
  return `Attempt #${attemptNumber} Pipeline`
}

export default function AccountsClient({ accounts, userRole }: AccountsClientProps) {
  const router = useRouter()
  const [filterAccountStatus, setFilterAccountStatus] = useState<string | null>(null)
  const [filterActivityStatus, setFilterActivityStatus] = useState<string | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<AccountEnriched | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showRetryModal, setShowRetryModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([])
  const [retryFormData, setRetryFormData] = useState({
    company_name: '',
    pic_name: '',
    pic_email: '',
    pic_phone: '',
    industry: '',
    notes: '',
    potential_revenue: 0
  })
  const [editFormData, setEditFormData] = useState({
    company_name: '',
    domain: '',
    npwp: '',
    industry: '',
    address: '',
    city: '',
    province: '',
    country: '',
    postal_code: '',
    phone: '',
    pic_name: '',
    pic_email: '',
    pic_phone: '',
    owner_user_id: ''
  })
  const [accountTickets, setAccountTickets] = useState<Array<{
    id: string
    ticket_code: string
    subject: string
    status: string
    priority: string
    created_at: string
  }>>([])
  const [loadingTickets, setLoadingTickets] = useState(false)

  // Check if current user can edit accounts
  const canEditAccounts = userRole && EDIT_ACCOUNT_ROLES.includes(userRole)

  // Fetch sales users when edit modal is opened
  useEffect(() => {
    if (showEditModal && salesUsers.length === 0) {
      fetch('/api/crm/users/sales')
        .then(res => res.json())
        .then(data => {
          if (data.data) {
            setSalesUsers(data.data)
          }
        })
        .catch(err => console.error('Error fetching sales users:', err))
    }
  }, [showEditModal, salesUsers.length])

  // Calculate status counts
  const accountStatusCounts = accounts.reduce((acc, account) => {
    const status = account.account_status || 'unknown'
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const activityStatusCounts = accounts.reduce((acc, account) => {
    const status = account.activity_status || 'Inactive'
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Filter accounts
  const filteredAccounts = accounts.filter(account => {
    if (filterAccountStatus && account.account_status !== filterAccountStatus) return false
    if (filterActivityStatus && account.activity_status !== filterActivityStatus) return false
    return true
  })

  // Handle view detail
  const handleViewDetail = async (account: AccountEnriched) => {
    setSelectedAccount(account)
    setShowDetailModal(true)
    setAccountTickets([])

    // Fetch tickets for this account
    setLoadingTickets(true)
    try {
      const response = await fetch(`/api/ticketing/tickets?account_id=${account.account_id}&limit=5`)
      if (response.ok) {
        const result = await response.json()
        if (result.data) {
          setAccountTickets(result.data)
        }
      }
    } catch (error) {
      console.error('Error fetching account tickets:', error)
    } finally {
      setLoadingTickets(false)
    }
  }

  // Handle edit account
  const handleOpenEditModal = async (account: AccountEnriched) => {
    try {
      // Fetch fresh account data
      const response = await fetch(`/api/crm/accounts/${account.account_id}`)
      const result = await response.json()

      if (!response.ok) {
        alert('Failed to fetch account data')
        return
      }

      const freshAccount = result.data

      setSelectedAccount(account)
      setEditFormData({
        company_name: freshAccount.company_name || '',
        domain: freshAccount.domain || '',
        npwp: freshAccount.npwp || '',
        industry: freshAccount.industry || '',
        address: freshAccount.address || '',
        city: freshAccount.city || '',
        province: freshAccount.province || '',
        country: freshAccount.country || '',
        postal_code: freshAccount.postal_code || '',
        phone: freshAccount.phone || '',
        pic_name: freshAccount.pic_name || '',
        pic_email: freshAccount.pic_email || '',
        pic_phone: freshAccount.pic_phone || '',
        owner_user_id: freshAccount.owner_user_id || ''
      })
      setShowEditModal(true)
    } catch (error) {
      console.error('Error fetching account:', error)
      alert('Failed to load account data')
    }
  }

  // Submit edit account
  const handleSubmitEdit = async () => {
    if (!selectedAccount) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/crm/accounts/${selectedAccount.account_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      })

      const result = await response.json()

      if (response.ok) {
        alert('Account updated successfully')
        setShowEditModal(false)
        // Refresh page to show updated data
        window.location.reload()
      } else {
        alert(result.error || 'Failed to update account')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle retry prospect - fetch fresh data first
  const handleOpenRetryModal = async (account: AccountEnriched) => {
    try {
      // Fetch fresh account data to verify status
      const response = await fetch(`/api/crm/accounts/${account.account_id}`)
      const result = await response.json()

      if (!response.ok) {
        alert('Failed to fetch account data')
        return
      }

      const freshAccount = result.data

      // Check if account is still in failed status
      if (freshAccount.account_status !== 'failed_account') {
        alert(`This account is no longer in failed status. Current status: ${freshAccount.account_status || 'unknown'}. Please refresh the page.`)
        return
      }

      // Update selected account with fresh data
      const updatedAccount = {
        ...account,
        account_status: freshAccount.account_status,
        retry_count: freshAccount.retry_count || 0
      }

      setSelectedAccount(updatedAccount)
      setRetryFormData({
        company_name: freshAccount.company_name || '',
        pic_name: freshAccount.pic_name || '',
        pic_email: freshAccount.pic_email || '',
        pic_phone: freshAccount.pic_phone || '',
        industry: freshAccount.industry || '',
        notes: freshAccount.notes || '',
        potential_revenue: 0
      })
      setShowRetryModal(true)
    } catch (error) {
      console.error('Error fetching account:', error)
      alert('Failed to load account data')
    }
  }

  // Submit retry prospect
  const handleSubmitRetry = async () => {
    if (!selectedAccount) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/crm/accounts/${selectedAccount.account_id}/retry-prospect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(retryFormData)
      })

      const result = await response.json()

      if (response.ok) {
        alert(result.data.message)
        setShowRetryModal(false)
        // Refresh page to show updated data
        window.location.reload()
      } else {
        alert(result.error || 'Failed to create retry prospect')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Clear all filters
  const clearFilters = () => {
    setFilterAccountStatus(null)
    setFilterActivityStatus(null)
  }

  const hasActiveFilters = filterAccountStatus || filterActivityStatus

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Summary Cards */}
      <div className="space-y-4">
        {/* Account Status Cards */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Account Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {Object.entries(ACCOUNT_STATUS_CONFIG).map(([status, config]) => {
              const count = accountStatusCounts[status] || 0
              const isActive = filterAccountStatus === status
              return (
                <Card
                  key={status}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    isActive ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setFilterAccountStatus(isActive ? null : status)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${config.color}`}>
                        {config.icon}
                      </div>
                      <div>
                        <p className="text-lg font-bold">{count}</p>
                        <p className="text-xs text-muted-foreground">{config.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Activity Status Cards */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Activity Status</h3>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(ACTIVITY_STATUS_CONFIG).map(([status, config]) => {
              const count = activityStatusCounts[status] || 0
              const isActive = filterActivityStatus === status
              return (
                <Card
                  key={status}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    isActive ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setFilterActivityStatus(isActive ? null : status)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-lg font-bold">{count}</p>
                        <p className="text-xs text-muted-foreground">{config.label}</p>
                      </div>
                      <Badge className={config.color}>{status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>

      {/* Active Filters Banner */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
          <span className="text-sm text-muted-foreground">Filters:</span>
          {filterAccountStatus && (
            <Badge variant="secondary" className="gap-1">
              {ACCOUNT_STATUS_CONFIG[filterAccountStatus]?.label || filterAccountStatus}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => setFilterAccountStatus(null)}
              />
            </Badge>
          )}
          {filterActivityStatus && (
            <Badge variant="secondary" className="gap-1">
              {filterActivityStatus}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => setFilterActivityStatus(null)}
              />
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear All
          </Button>
        </div>
      )}

      {/* Accounts Table */}
      <Card>
        <CardHeader className="pb-3 lg:pb-6">
          <CardTitle className="text-base lg:text-lg">
            All Accounts ({filteredAccounts.length})
            {hasActiveFilters && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                (filtered from {accounts.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 lg:px-6">
          {filteredAccounts.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company Name</TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          PIC
                        </div>
                      </TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Activity className="h-4 w-4" />
                          Activity
                        </div>
                      </TableHead>
                      <TableHead>Account Status</TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-4 w-4" />
                          Opps
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <DollarSign className="h-4 w-4 text-green-500" />
                          Actual Rev
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <DollarSign className="h-4 w-4 text-blue-500" />
                          Payment
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <DollarSign className="h-4 w-4 text-orange-500" />
                          Outstanding
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          Activities
                        </div>
                      </TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((account) => (
                      <TableRow key={account.account_id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <span className="font-medium">{account.company_name}</span>
                              {account.retry_count > 0 && (
                                <div className="text-xs text-orange-600">
                                  {getAttemptLabel(account.retry_count + 1)}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {account.pic_name ? (
                            <div className="text-sm">
                              <div className="font-medium">{account.pic_name}</div>
                              {account.pic_email && (
                                <div className="text-xs text-muted-foreground">{account.pic_email}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{account.owner_name || '-'}</TableCell>
                        <TableCell>
                          {account.activity_status ? (
                            <Badge className={ACTIVITY_STATUS_CONFIG[account.activity_status]?.color || ''}>
                              {account.activity_status}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {account.account_status ? (
                            <Badge className={ACCOUNT_STATUS_CONFIG[account.account_status]?.color || ''}>
                              {account.account_status.replace(/_/g, ' ')}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={account.open_opportunities > 0 ? 'default' : 'secondary'}>
                            {account.open_opportunities}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {account.actual_revenue > 0 ? (
                            <span className="text-green-600">
                              Rp {(account.actual_revenue / 1000000).toFixed(1)}M
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {account.total_payment > 0 ? (
                            <span className="text-blue-600">
                              Rp {(account.total_payment / 1000000).toFixed(1)}M
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {account.total_outstanding > 0 ? (
                            <span className="text-orange-600 font-bold">
                              Rp {(account.total_outstanding / 1000000).toFixed(1)}M
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{account.planned_activities}</span>
                            {account.overdue_activities > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                {account.overdue_activities} overdue
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDetail(account)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Detail
                              </DropdownMenuItem>
                              {canEditAccounts && (
                                <DropdownMenuItem onClick={() => handleOpenEditModal(account)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit Account
                                </DropdownMenuItem>
                              )}
                              {account.account_status === 'failed_account' && (
                                <DropdownMenuItem onClick={() => handleOpenRetryModal(account)}>
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  Retry Prospect
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3 px-4">
                {filteredAccounts.map((account) => (
                  <Card key={account.account_id} className="bg-muted/30">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <h4 className="font-medium text-sm truncate">{account.company_name}</h4>
                          </div>
                          {account.retry_count > 0 && (
                            <p className="text-xs text-orange-600 mt-1">
                              {getAttemptLabel(account.retry_count + 1)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Owner: {account.owner_name || '-'}
                          </p>
                          {account.pic_name && (
                            <p className="text-xs text-muted-foreground">
                              PIC: {account.pic_name}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          {account.account_status && (
                            <Badge className={`text-xs ${ACCOUNT_STATUS_CONFIG[account.account_status]?.color || ''}`}>
                              {account.account_status.replace(/_/g, ' ')}
                            </Badge>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDetail(account)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Detail
                              </DropdownMenuItem>
                              {canEditAccounts && (
                                <DropdownMenuItem onClick={() => handleOpenEditModal(account)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit Account
                                </DropdownMenuItem>
                              )}
                              {account.account_status === 'failed_account' && (
                                <DropdownMenuItem onClick={() => handleOpenRetryModal(account)}>
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  Retry Prospect
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mt-3">
                        <div className="text-center p-2 bg-background rounded">
                          <div className="flex items-center justify-center gap-1">
                            <Activity className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Status</span>
                          </div>
                          <p className="font-semibold text-xs">{account.activity_status || '-'}</p>
                        </div>
                        <div className="text-center p-2 bg-background rounded">
                          <div className="flex items-center justify-center gap-1">
                            <TrendingUp className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Opps</span>
                          </div>
                          <p className="font-semibold text-sm">{account.open_opportunities}</p>
                        </div>
                        <div className="text-center p-2 bg-background rounded">
                          <div className="flex items-center justify-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Planned</span>
                          </div>
                          <p className="font-semibold text-sm">{account.planned_activities}</p>
                        </div>
                      </div>

                      {/* Revenue Stats from DSO/AR */}
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <div className="text-center p-2 bg-green-50 rounded">
                          <span className="text-xs text-green-600 block">Actual Rev</span>
                          <p className="font-semibold text-xs text-green-700">
                            {account.actual_revenue > 0 ? `${(account.actual_revenue / 1000000).toFixed(1)}M` : '-'}
                          </p>
                        </div>
                        <div className="text-center p-2 bg-blue-50 rounded">
                          <span className="text-xs text-blue-600 block">Payment</span>
                          <p className="font-semibold text-xs text-blue-700">
                            {account.total_payment > 0 ? `${(account.total_payment / 1000000).toFixed(1)}M` : '-'}
                          </p>
                        </div>
                        <div className="text-center p-2 bg-orange-50 rounded">
                          <span className="text-xs text-orange-600 block">Outstanding</span>
                          <p className="font-bold text-xs text-orange-700">
                            {account.total_outstanding > 0 ? `${(account.total_outstanding / 1000000).toFixed(1)}M` : '-'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 px-4">
              <p className="text-muted-foreground">No accounts found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Account Detail
            </DialogTitle>
            <DialogDescription>
              Complete information about this account
            </DialogDescription>
          </DialogHeader>

          {selectedAccount && (
            <div className="space-y-4">
              {/* Status Badges */}
              <div className="flex flex-wrap gap-2">
                {selectedAccount.account_status && (
                  <Badge className={ACCOUNT_STATUS_CONFIG[selectedAccount.account_status]?.color || ''}>
                    {selectedAccount.account_status.replace(/_/g, ' ')}
                  </Badge>
                )}
                {selectedAccount.activity_status && (
                  <Badge className={ACTIVITY_STATUS_CONFIG[selectedAccount.activity_status]?.color || ''}>
                    {selectedAccount.activity_status}
                  </Badge>
                )}
                {selectedAccount.retry_count > 0 && (
                  <Badge variant="outline" className="text-orange-600 border-orange-600">
                    {getAttemptLabel(selectedAccount.retry_count + 1)}
                  </Badge>
                )}
              </div>

              {/* Company Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Company Name</Label>
                  <p className="font-medium">{selectedAccount.company_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Industry</Label>
                  <p className="font-medium">{selectedAccount.industry || '-'}</p>
                </div>
              </div>

              {/* PIC Info */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  PIC Information
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Name</Label>
                    <p className="font-medium">{selectedAccount.pic_name || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Email</Label>
                    <p className="font-medium">{selectedAccount.pic_email || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Phone</Label>
                    <p className="font-medium">{selectedAccount.pic_phone || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Owner</Label>
                    <p className="font-medium">{selectedAccount.owner_name || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Address Info */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Address</h4>
                <p className="text-sm">
                  {[selectedAccount.address, selectedAccount.city, selectedAccount.province]
                    .filter(Boolean)
                    .join(', ') || '-'}
                </p>
              </div>

              {/* Stats */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Statistics</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-muted rounded">
                    <p className="text-2xl font-bold">{selectedAccount.open_opportunities}</p>
                    <p className="text-xs text-muted-foreground">Open Opportunities</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded">
                    <p className="text-2xl font-bold">{selectedAccount.planned_activities}</p>
                    <p className="text-xs text-muted-foreground">Planned Activities</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded">
                    <p className="text-2xl font-bold text-red-600">{selectedAccount.overdue_activities}</p>
                    <p className="text-xs text-muted-foreground">Overdue</p>
                  </div>
                </div>
              </div>

              {/* Revenue from DSO/AR */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Revenue (DSO/AR)
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-green-50 rounded">
                    <p className="text-xl font-bold text-green-600">
                      {selectedAccount.actual_revenue > 0
                        ? `Rp ${(selectedAccount.actual_revenue / 1000000).toFixed(1)}M`
                        : '-'}
                    </p>
                    <p className="text-xs text-green-600">Actual Revenue</p>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded">
                    <p className="text-xl font-bold text-blue-600">
                      {selectedAccount.total_payment > 0
                        ? `Rp ${(selectedAccount.total_payment / 1000000).toFixed(1)}M`
                        : '-'}
                    </p>
                    <p className="text-xs text-blue-600">Total Payment</p>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded">
                    <p className="text-xl font-bold text-orange-600">
                      {selectedAccount.total_outstanding > 0
                        ? `Rp ${(selectedAccount.total_outstanding / 1000000).toFixed(1)}M`
                        : '-'}
                    </p>
                    <p className="text-xs text-orange-600">Outstanding</p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedAccount.notes && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Notes</h4>
                  <p className="text-sm text-muted-foreground">{selectedAccount.notes}</p>
                </div>
              )}

              {/* Tickets Section */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <Ticket className="h-4 w-4" />
                    Recent Tickets
                  </h4>
                  <Link
                    href={`/tickets?account_id=${selectedAccount.account_id}`}
                    className="text-sm text-brand hover:underline flex items-center gap-1"
                  >
                    View All
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                {loadingTickets ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : accountTickets.length > 0 ? (
                  <div className="space-y-2">
                    {accountTickets.map((ticket) => (
                      <Link
                        key={ticket.id}
                        href={`/tickets/${ticket.id}`}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {ticket.ticket_code}
                            </span>
                            <Badge
                              variant={
                                ticket.status === 'open' || ticket.status === 'need_response'
                                  ? 'destructive'
                                  : ticket.status === 'in_progress'
                                  ? 'default'
                                  : 'secondary'
                              }
                              className="text-xs"
                            >
                              {ticket.status.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <p className="text-sm truncate mt-1">{ticket.subject}</p>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No tickets found for this account
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailModal(false)}>
              Close
            </Button>
            {selectedAccount && (
              <Button variant="secondary" onClick={() => {
                setShowDetailModal(false)
                router.push(`/accounts/${selectedAccount.account_id}`)
              }}>
                <ExternalLink className="h-4 w-4 mr-2" />
                More Detail
              </Button>
            )}
            {canEditAccounts && selectedAccount && (
              <Button variant="secondary" onClick={() => {
                setShowDetailModal(false)
                handleOpenEditModal(selectedAccount)
              }}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
            {selectedAccount?.account_status === 'failed_account' && (
              <Button onClick={() => {
                setShowDetailModal(false)
                handleOpenRetryModal(selectedAccount)
              }}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry Prospect
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Account Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Edit Account
            </DialogTitle>
            <DialogDescription>
              Update account information. Only Sales Support, Admin, and MACX can edit accounts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Company Information */}
            <div>
              <h4 className="font-medium mb-3 text-sm text-muted-foreground">Company Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="edit_company_name">Company Name *</Label>
                  <Input
                    id="edit_company_name"
                    value={editFormData.company_name}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, company_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit_domain">Domain</Label>
                  <Input
                    id="edit_domain"
                    value={editFormData.domain}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, domain: e.target.value }))}
                    placeholder="example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="edit_npwp">NPWP</Label>
                  <Input
                    id="edit_npwp"
                    value={editFormData.npwp}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, npwp: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit_industry">Industry</Label>
                  <Input
                    id="edit_industry"
                    value={editFormData.industry}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, industry: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit_phone">Phone</Label>
                  <Input
                    id="edit_phone"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Address Information */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3 text-sm text-muted-foreground">Address</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="edit_address">Address</Label>
                  <Input
                    id="edit_address"
                    value={editFormData.address}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, address: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit_city">City</Label>
                  <Input
                    id="edit_city"
                    value={editFormData.city}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, city: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit_province">Province</Label>
                  <Input
                    id="edit_province"
                    value={editFormData.province}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, province: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit_country">Country</Label>
                  <Input
                    id="edit_country"
                    value={editFormData.country}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, country: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit_postal_code">Postal Code</Label>
                  <Input
                    id="edit_postal_code"
                    value={editFormData.postal_code}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, postal_code: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* PIC Information */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3 text-sm text-muted-foreground">PIC Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit_pic_name">PIC Name</Label>
                  <Input
                    id="edit_pic_name"
                    value={editFormData.pic_name}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, pic_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit_pic_email">PIC Email</Label>
                  <Input
                    id="edit_pic_email"
                    type="email"
                    value={editFormData.pic_email}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, pic_email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit_pic_phone">PIC Phone</Label>
                  <Input
                    id="edit_pic_phone"
                    value={editFormData.pic_phone}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, pic_phone: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Owner Assignment */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3 text-sm text-muted-foreground">Account Owner</h4>
              <div>
                <Label htmlFor="edit_owner">Owner (Sales)</Label>
                <Select
                  value={editFormData.owner_user_id}
                  onValueChange={(value) => setEditFormData(prev => ({ ...prev, owner_user_id: value }))}
                >
                  <SelectTrigger id="edit_owner">
                    <SelectValue placeholder="Select owner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {salesUsers.map((user) => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        {user.name} ({user.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Change owner when a sales person resigns and the account needs to be reassigned.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmitEdit} disabled={isSubmitting || !editFormData.company_name}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retry Prospect Modal */}
      <Dialog open={showRetryModal} onOpenChange={setShowRetryModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Retry Prospect
            </DialogTitle>
            <DialogDescription>
              Create a new pipeline for this failed account. This will be attempt #{(selectedAccount?.retry_count || 0) + 2}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current Status */}
            {selectedAccount && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Current Status:</strong> {selectedAccount.account_status?.replace(/_/g, ' ')}
                  {selectedAccount.retry_count > 0 && (
                    <span className="ml-2">
                      (Previous attempts: {selectedAccount.retry_count})
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Edit Form */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  value={retryFormData.company_name}
                  onChange={(e) => setRetryFormData(prev => ({ ...prev, company_name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="pic_name">PIC Name</Label>
                <Input
                  id="pic_name"
                  value={retryFormData.pic_name}
                  onChange={(e) => setRetryFormData(prev => ({ ...prev, pic_name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="pic_email">PIC Email</Label>
                <Input
                  id="pic_email"
                  type="email"
                  value={retryFormData.pic_email}
                  onChange={(e) => setRetryFormData(prev => ({ ...prev, pic_email: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="pic_phone">PIC Phone</Label>
                <Input
                  id="pic_phone"
                  value={retryFormData.pic_phone}
                  onChange={(e) => setRetryFormData(prev => ({ ...prev, pic_phone: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  value={retryFormData.industry}
                  onChange={(e) => setRetryFormData(prev => ({ ...prev, industry: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="potential_revenue">Potential Revenue (IDR)</Label>
                <Input
                  id="potential_revenue"
                  type="number"
                  value={retryFormData.potential_revenue}
                  onChange={(e) => setRetryFormData(prev => ({ ...prev, potential_revenue: Number(e.target.value) }))}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={retryFormData.notes}
                  onChange={(e) => setRetryFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRetryModal(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmitRetry} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Submit Retry Prospect
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
