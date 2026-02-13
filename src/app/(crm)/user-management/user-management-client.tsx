'use client'

// =====================================================
// User Management Client Component
// List, Add, Edit users (Director / super admin only)
// =====================================================

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Users,
  Plus,
  Pencil,
  Loader2,
  Search,
  UserCheck,
  UserX,
  Shield,
} from 'lucide-react'
import type { UserRole } from '@/types/database'
import { USER_ROLES } from '@/lib/constants'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

interface UserProfile {
  user_id: string
  email: string
  name: string
  role: UserRole
  department: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

const EMPTY_USER_FORM = {
  email: '',
  password: '',
  name: '',
  role: '' as string,
  department: '',
  phone: '',
}

const ROLE_COLORS: Record<string, string> = {
  'Director': 'bg-purple-100 text-purple-800',
  'super admin': 'bg-red-100 text-red-800',
  'Marketing Manager': 'bg-blue-100 text-blue-800',
  'Marcomm': 'bg-blue-50 text-blue-700',
  'DGO': 'bg-blue-50 text-blue-700',
  'MACX': 'bg-blue-50 text-blue-700',
  'VDCO': 'bg-blue-50 text-blue-700',
  'sales manager': 'bg-green-100 text-green-800',
  'salesperson': 'bg-green-50 text-green-700',
  'sales support': 'bg-green-50 text-green-700',
  'EXIM Ops': 'bg-orange-100 text-orange-800',
  'domestics Ops': 'bg-orange-100 text-orange-800',
  'Import DTD Ops': 'bg-orange-100 text-orange-800',
  'traffic & warehous': 'bg-orange-100 text-orange-800',
  'finance': 'bg-yellow-100 text-yellow-800',
}

export default function UserManagementClient() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterRole, setFilterRole] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [formData, setFormData] = useState(EMPTY_USER_FORM)
  const [editFormData, setEditFormData] = useState({
    name: '',
    role: '' as string,
    department: '',
    phone: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/users')
      const result = await response.json()
      if (response.ok) {
        setUsers(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Filtered users
  const filteredUsers = users.filter((u: UserProfile) => {
    const matchesSearch = searchQuery === '' ||
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.role.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = filterRole === 'all' || u.role === filterRole
    const matchesStatus = filterStatus === 'all' ||
      (filterStatus === 'active' && u.is_active) ||
      (filterStatus === 'inactive' && !u.is_active)
    return matchesSearch && matchesRole && matchesStatus
  })

  const handleOpenAdd = () => {
    setFormData(EMPTY_USER_FORM)
    setFormError(null)
    setShowAddModal(true)
  }

  const handleOpenEdit = (user: UserProfile) => {
    setEditingUser(user)
    setEditFormData({
      name: user.name,
      role: user.role,
      department: user.department || '',
      phone: user.phone || '',
    })
    setFormError(null)
    setShowEditModal(true)
  }

  const handleAddUser = async () => {
    if (!formData.email.trim()) { setFormError('Email is required'); return }
    if (!formData.password || formData.password.length < 6) { setFormError('Password must be at least 6 characters'); return }
    if (!formData.name.trim()) { setFormError('Name is required'); return }
    if (!formData.role) { setFormError('Role is required'); return }

    setIsSubmitting(true)
    setFormError(null)

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (!response.ok) {
        setFormError(result.error || 'Failed to create user')
        return
      }

      setUsers((prev: UserProfile[]) => [result.data, ...prev])
      setShowAddModal(false)
    } catch {
      setFormError('An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditUser = async () => {
    if (!editingUser) return
    if (!editFormData.name.trim()) { setFormError('Name is required'); return }
    if (!editFormData.role) { setFormError('Role is required'); return }

    setIsSubmitting(true)
    setFormError(null)

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: editingUser.user_id, ...editFormData }),
      })

      const result = await response.json()

      if (!response.ok) {
        setFormError(result.error || 'Failed to update user')
        return
      }

      setUsers((prev: UserProfile[]) => prev.map((u: UserProfile) => u.user_id === editingUser.user_id ? result.data : u))
      setShowEditModal(false)
    } catch {
      setFormError('An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleActive = async (user: UserProfile) => {
    const action = user.is_active ? 'deactivate' : 'activate'
    if (!confirm(`Are you sure you want to ${action} "${user.name}"?`)) return

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id, is_active: !user.is_active }),
      })

      const result = await response.json()

      if (!response.ok) {
        alert(result.error || `Failed to ${action} user`)
        return
      }

      setUsers((prev: UserProfile[]) => prev.map((u: UserProfile) => u.user_id === user.user_id ? result.data : u))
    } catch {
      alert('An error occurred')
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd MMM yyyy', { locale: idLocale })
    } catch {
      return '-'
    }
  }

  // Stats
  const activeCount = users.filter((u: UserProfile) => u.is_active).length
  const inactiveCount = users.filter((u: UserProfile) => !u.is_active).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            User Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage user accounts, roles, and permissions
          </p>
        </div>
        <Button onClick={handleOpenAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Users</span>
            </div>
            <p className="text-2xl font-bold mt-1">{users.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <UserX className="h-4 w-4 text-red-600" />
              <span className="text-sm text-muted-foreground">Inactive</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-red-600">{inactiveCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {USER_ROLES.map(role => (
              <SelectItem key={role} value={role}>{role}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users ({filteredUsers.length})</CardTitle>
          <CardDescription>All registered users in the system</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => (
                    <TableRow key={u.user_id} className={!u.is_active ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge className={ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-800'}>
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{u.department || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={u.is_active ? 'default' : 'secondary'}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(u.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleOpenEdit(u)}
                            title="Edit user"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${u.is_active ? 'text-destructive hover:text-destructive' : 'text-green-600 hover:text-green-600'}`}
                            onClick={() => handleToggleActive(u)}
                            title={u.is_active ? 'Deactivate user' : 'Activate user'}
                          >
                            {u.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add User Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add New User
            </DialogTitle>
            <DialogDescription>
              Create a new user account. The user will be able to login immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {formError && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                {formError}
              </div>
            )}

            <div>
              <Label htmlFor="add_name">Full Name *</Label>
              <Input
                id="add_name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="John Doe"
              />
            </div>

            <div>
              <Label htmlFor="add_email">Email *</Label>
              <Input
                id="add_email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="john@company.com"
              />
            </div>

            <div>
              <Label htmlFor="add_password">Password *</Label>
              <Input
                id="add_password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Minimum 6 characters"
              />
            </div>

            <div>
              <Label htmlFor="add_role">Role *</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}
              >
                <SelectTrigger id="add_role">
                  <SelectValue placeholder="Select role..." />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map(role => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="add_department">Department</Label>
              <Input
                id="add_department"
                value={formData.department}
                onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                placeholder="e.g. Sales, Marketing, Operations"
              />
            </div>

            <div>
              <Label htmlFor="add_phone">Phone</Label>
              <Input
                id="add_phone"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="0812-3456-7890"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleAddUser} disabled={isSubmitting || !formData.email || !formData.name || !formData.role || !formData.password}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create User'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Edit User
            </DialogTitle>
            <DialogDescription>
              Update user information for {editingUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {formError && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                {formError}
              </div>
            )}

            <div>
              <Label htmlFor="edit_name">Full Name *</Label>
              <Input
                id="edit_name"
                value={editFormData.name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="edit_role">Role *</Label>
              <Select
                value={editFormData.role}
                onValueChange={(value) => setEditFormData(prev => ({ ...prev, role: value }))}
              >
                <SelectTrigger id="edit_role">
                  <SelectValue placeholder="Select role..." />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map(role => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit_department">Department</Label>
              <Input
                id="edit_department"
                value={editFormData.department}
                onChange={(e) => setEditFormData(prev => ({ ...prev, department: e.target.value }))}
                placeholder="e.g. Sales, Marketing, Operations"
              />
            </div>

            <div>
              <Label htmlFor="edit_phone">Phone</Label>
              <Input
                id="edit_phone"
                value={editFormData.phone}
                onChange={(e) => setEditFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="0812-3456-7890"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleEditUser} disabled={isSubmitting || !editFormData.name || !editFormData.role}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
