'use client'

// =====================================================
// Account Detail Component
// Displays account information, contacts, opportunities
// =====================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  Globe,
  Ticket,
  FileText,
  Activity,
  Users,
  DollarSign,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Smartphone,
  Save,
} from 'lucide-react'
import type { UserRole, AccountStatus, OpportunityStage } from '@/types/database'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

interface Contact {
  contact_id: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  job_title: string | null
  department: string | null
  is_primary: boolean
  notes: string | null
}

const EMPTY_CONTACT_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  mobile: '',
  job_title: '',
  department: '',
  is_primary: false,
  notes: '',
}

// Roles that can manage contacts
const MANAGE_CONTACTS_ROLES: UserRole[] = [
  'salesperson', 'sales support', 'sales manager',
  'super admin', 'MACX', 'Marketing Manager', 'Director',
]

// Roles that can edit account info
const EDIT_ACCOUNT_ROLES: UserRole[] = [
  'sales support', 'sales manager',
  'super admin', 'MACX', 'Marketing Manager', 'Director',
]

interface SalesUser {
  user_id: string
  name: string
  role: string
}

const EMPTY_EDIT_FORM = {
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
  owner_user_id: '',
}

interface Opportunity {
  opportunity_id: string
  name: string
  stage: OpportunityStage
  estimated_value: number | null
  deal_value: number | null
  next_step_due_date: string | null
  owner_user_id: string | null
}

interface ActivityRecord {
  activity_id: string
  activity_type: string
  subject: string
  status: string
  due_date: string
  owner?: {
    user_id: string
    name: string
  }
}

interface TicketRecord {
  id: string
  ticket_code: string
  subject: string
  status: string
  priority: string
  ticket_type: string
  created_at: string
}

interface Account {
  account_id: string
  company_name: string
  pic_name: string | null
  pic_email: string | null
  pic_phone: string | null
  industry: string | null
  address: string | null
  city: string | null
  province: string | null
  country: string | null
  domain: string | null
  phone: string | null
  npwp: string | null
  postal_code: string | null
  notes: string | null
  account_status: AccountStatus | null
  activity_status: string | null
  first_transaction_date: string | null
  last_transaction_date: string | null
  created_at: string
  updated_at: string
  owner?: {
    user_id: string
    name: string
    email: string
  } | null
  contacts?: Contact[]
  opportunities?: Opportunity[]
}

interface Profile {
  user_id: string
  name: string
  role: UserRole
}

interface AccountDetailProps {
  account: Account
  activities: ActivityRecord[]
  tickets: TicketRecord[]
  profile: Profile
}

const accountStatusLabels: Record<string, string> = {
  calon_account: 'Calon Account',
  new_account: 'New Account',
  failed_account: 'Failed Account',
  active_account: 'Active Account',
  passive_account: 'Passive Account',
  lost_account: 'Lost Account',
}

const accountStatusColors: Record<string, string> = {
  calon_account: 'bg-blue-100 text-blue-800',
  new_account: 'bg-green-100 text-green-800',
  failed_account: 'bg-red-100 text-red-800',
  active_account: 'bg-emerald-100 text-emerald-800',
  passive_account: 'bg-yellow-100 text-yellow-800',
  lost_account: 'bg-gray-100 text-gray-800',
}

const stageColors: Record<OpportunityStage, string> = {
  'Prospecting': 'bg-blue-100 text-blue-800',
  'Discovery': 'bg-purple-100 text-purple-800',
  'Quote Sent': 'bg-yellow-100 text-yellow-800',
  'Negotiation': 'bg-orange-100 text-orange-800',
  'Closed Won': 'bg-green-100 text-green-800',
  'Closed Lost': 'bg-red-100 text-red-800',
  'On Hold': 'bg-gray-100 text-gray-800',
}

const ticketStatusColors: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  need_response: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-purple-100 text-purple-800',
  waiting_customer: 'bg-orange-100 text-orange-800',
  need_adjustment: 'bg-pink-100 text-pink-800',
  pending: 'bg-gray-100 text-gray-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-slate-100 text-slate-800',
}

export function AccountDetail({ account, activities, tickets, profile }: AccountDetailProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('overview')

  // Contacts CRUD state
  const [contacts, setContacts] = useState<Contact[]>(account.contacts || [])
  const [showContactModal, setShowContactModal] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT_FORM)
  const [isContactSubmitting, setIsContactSubmitting] = useState(false)
  const [contactError, setContactError] = useState<string | null>(null)

  const canManageContacts = MANAGE_CONTACTS_ROLES.includes(profile.role)
  const canEditAccount = EDIT_ACCOUNT_ROLES.includes(profile.role)

  // Edit account state
  const [showEditAccountModal, setShowEditAccountModal] = useState(false)
  const [editFormData, setEditFormData] = useState(EMPTY_EDIT_FORM)
  const [isEditSubmitting, setIsEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([])

  const handleOpenEditAccount = async () => {
    try {
      // Fetch fresh account data
      const response = await fetch(`/api/crm/accounts/${account.account_id}`)
      const result = await response.json()

      if (!response.ok) {
        alert('Failed to fetch account data')
        return
      }

      const fresh = result.data
      setEditFormData({
        company_name: fresh.company_name || '',
        domain: fresh.domain || '',
        npwp: fresh.npwp || '',
        industry: fresh.industry || '',
        address: fresh.address || '',
        city: fresh.city || '',
        province: fresh.province || '',
        country: fresh.country || '',
        postal_code: fresh.postal_code || '',
        phone: fresh.phone || '',
        pic_name: fresh.pic_name || '',
        pic_email: fresh.pic_email || '',
        pic_phone: fresh.pic_phone || '',
        owner_user_id: fresh.owner_user_id || '',
      })
      setEditError(null)
      setShowEditAccountModal(true)

      // Fetch sales users for owner dropdown
      if (salesUsers.length === 0) {
        fetch('/api/crm/users/sales')
          .then(res => res.json())
          .then(data => {
            if (data.data) setSalesUsers(data.data)
          })
          .catch(err => console.error('Error fetching sales users:', err))
      }
    } catch {
      alert('Failed to load account data')
    }
  }

  const handleSubmitEditAccount = async () => {
    if (!editFormData.company_name.trim()) {
      setEditError('Company name is required')
      return
    }

    setIsEditSubmitting(true)
    setEditError(null)

    try {
      const response = await fetch(`/api/crm/accounts/${account.account_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      })

      const result = await response.json()

      if (response.ok) {
        setShowEditAccountModal(false)
        window.location.reload()
      } else {
        setEditError(result.error || 'Failed to update account')
      }
    } catch {
      setEditError('An error occurred')
    } finally {
      setIsEditSubmitting(false)
    }
  }

  const handleOpenAddContact = () => {
    setEditingContact(null)
    setContactForm(EMPTY_CONTACT_FORM)
    setContactError(null)
    setShowContactModal(true)
  }

  const handleOpenEditContact = (contact: Contact) => {
    setEditingContact(contact)
    setContactForm({
      first_name: contact.first_name,
      last_name: contact.last_name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      mobile: contact.mobile || '',
      job_title: contact.job_title || '',
      department: contact.department || '',
      is_primary: contact.is_primary,
      notes: contact.notes || '',
    })
    setContactError(null)
    setShowContactModal(true)
  }

  const handleSubmitContact = async () => {
    if (!contactForm.first_name.trim()) {
      setContactError('First name is required')
      return
    }

    setIsContactSubmitting(true)
    setContactError(null)

    try {
      const method = editingContact ? 'PATCH' : 'POST'
      const payload: Record<string, unknown> = { ...contactForm }
      if (editingContact) {
        payload.contact_id = editingContact.contact_id
      }

      const response = await fetch(`/api/crm/accounts/${account.account_id}/contacts`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        setContactError(result.error || 'Failed to save contact')
        return
      }

      // Update local state
      if (editingContact) {
        if (contactForm.is_primary && !editingContact.is_primary) {
          // If new primary, unset others locally
          setContacts((prev: Contact[]) => prev.map((c: Contact) =>
            c.contact_id === editingContact.contact_id
              ? result.data
              : { ...c, is_primary: false }
          ))
        } else {
          setContacts((prev: Contact[]) => prev.map((c: Contact) =>
            c.contact_id === editingContact.contact_id ? result.data : c
          ))
        }
      } else {
        if (contactForm.is_primary) {
          setContacts((prev: Contact[]) => [...prev.map((c: Contact) => ({ ...c, is_primary: false })), result.data])
        } else {
          setContacts((prev: Contact[]) => [...prev, result.data])
        }
      }

      setShowContactModal(false)
    } catch {
      setContactError('An error occurred')
    } finally {
      setIsContactSubmitting(false)
    }
  }

  const handleDeleteContact = async (contact: Contact) => {
    if (!confirm(`Delete contact "${contact.first_name} ${contact.last_name || ''}"?`)) {
      return
    }

    try {
      const response = await fetch(
        `/api/crm/accounts/${account.account_id}/contacts?contact_id=${contact.contact_id}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const result = await response.json()
        alert(result.error || 'Failed to delete contact')
        return
      }

      setContacts((prev: Contact[]) => prev.filter((c: Contact) => c.contact_id !== contact.contact_id))
    } catch {
      alert('An error occurred')
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    try {
      return format(new Date(dateStr), 'dd MMM yyyy', { locale: idLocale })
    } catch {
      return '-'
    }
  }

  const formatCurrency = (value: number | null) => {
    if (!value) return '-'
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value)
  }

  const primaryContact = contacts.find((c: Contact) => c.is_primary) || contacts[0]

  // Calculate both estimated and deal values
  const totalEstimatedValue = account.opportunities?.reduce((sum, opp) =>
    sum + (opp.estimated_value || 0), 0) || 0
  const totalDealValue = account.opportunities?.reduce((sum, opp) =>
    sum + (opp.deal_value || 0), 0) || 0
  // For display: use deal_value for won deals, estimated_value for others
  const totalPipelineValue = account.opportunities?.reduce((sum, opp) =>
    sum + (opp.deal_value || opp.estimated_value || 0), 0) || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl lg:text-2xl font-bold">{account.company_name}</h1>
              {account.account_status && (
                <Badge className={accountStatusColors[account.account_status] || 'bg-gray-100'}>
                  {accountStatusLabels[account.account_status] || account.account_status}
                </Badge>
              )}
              {account.activity_status && (
                <Badge variant="outline">
                  {account.activity_status}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {account.industry || 'No industry specified'}
            </p>
          </div>
        </div>
        {canEditAccount && (
          <Button variant="outline" size="sm" onClick={handleOpenEditAccount}>
            <Pencil className="h-4 w-4 mr-1" />
            Edit Account
          </Button>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Contacts</span>
            </div>
            <p className="text-2xl font-bold mt-1">{contacts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Opportunities</span>
            </div>
            <p className="text-2xl font-bold mt-1">{account.opportunities?.length || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Tickets</span>
            </div>
            <p className="text-2xl font-bold mt-1">{tickets.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Pipeline</span>
            </div>
            {totalDealValue > 0 ? (
              <div className="mt-1">
                <p className="text-lg font-bold text-green-600">{formatCurrency(totalDealValue)}</p>
                <p className="text-xs text-muted-foreground">Deal Value</p>
                {totalEstimatedValue > 0 && totalEstimatedValue !== totalDealValue && (
                  <p className="text-xs text-muted-foreground">
                    Est: {formatCurrency(totalEstimatedValue)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-lg font-bold mt-1">{formatCurrency(totalEstimatedValue)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Account Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Account Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Company Name</span>
                  <span className="font-medium">{account.company_name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Industry</span>
                  <span>{account.industry || '-'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Domain</span>
                  {account.domain ? (
                    <a
                      href={`https://${account.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Globe className="h-3 w-3" />
                      {account.domain}
                    </a>
                  ) : (
                    <span>-</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Owner</span>
                  <span>{account.owner?.name || '-'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Created</span>
                  <span>{formatDate(account.created_at)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Address & Contact */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Address & Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <span className="text-muted-foreground block mb-1">Address</span>
                  <span>
                    {[account.address, account.city, account.province, account.country]
                      .filter(Boolean)
                      .join(', ') || '-'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">PIC Name</span>
                  <span>{account.pic_name || '-'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">PIC Email</span>
                  {account.pic_email ? (
                    <a href={`mailto:${account.pic_email}`} className="text-blue-600 hover:underline flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {account.pic_email}
                    </a>
                  ) : (
                    <span>-</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">PIC Phone</span>
                  {account.pic_phone ? (
                    <a href={`tel:${account.pic_phone}`} className="text-blue-600 hover:underline flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {account.pic_phone}
                    </a>
                  ) : (
                    <span>-</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Company Phone</span>
                  {account.phone ? (
                    <a href={`tel:${account.phone}`} className="text-blue-600 hover:underline flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {account.phone}
                    </a>
                  ) : (
                    <span>-</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Notes */}
          {account.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{account.notes}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Contacts ({contacts.length})</CardTitle>
                <CardDescription>People associated with this account</CardDescription>
              </div>
              {canManageContacts && (
                <Button size="sm" onClick={handleOpenAddContact}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Contact
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {contacts.length > 0 ? (
                <div className="space-y-4">
                  {contacts.map((contact) => (
                    <div
                      key={contact.contact_id}
                      className="flex items-start justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {contact.first_name} {contact.last_name || ''}
                            </span>
                            {contact.is_primary && (
                              <Badge variant="secondary" className="text-xs">Primary</Badge>
                            )}
                          </div>
                          {(contact.job_title || contact.department) && (
                            <p className="text-sm text-muted-foreground">
                              {[contact.job_title, contact.department].filter(Boolean).join(' - ')}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-muted-foreground">
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} className="flex items-center gap-1 hover:text-foreground">
                                <Mail className="h-3 w-3" />
                                {contact.email}
                              </a>
                            )}
                            {contact.phone && (
                              <a href={`tel:${contact.phone}`} className="flex items-center gap-1 hover:text-foreground">
                                <Phone className="h-3 w-3" />
                                {contact.phone}
                              </a>
                            )}
                            {contact.mobile && (
                              <a href={`tel:${contact.mobile}`} className="flex items-center gap-1 hover:text-foreground">
                                <Smartphone className="h-3 w-3" />
                                {contact.mobile}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                      {canManageContacts && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleOpenEditContact(contact)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteContact(contact)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-3">
                    No contacts found for this account
                  </p>
                  {canManageContacts && (
                    <Button variant="outline" size="sm" onClick={handleOpenAddContact}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add First Contact
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Opportunities Tab */}
        <TabsContent value="opportunities">
          <Card>
            <CardHeader>
              <CardTitle>Opportunities ({account.opportunities?.length || 0})</CardTitle>
              <CardDescription>Sales opportunities for this account</CardDescription>
            </CardHeader>
            <CardContent>
              {account.opportunities && account.opportunities.length > 0 ? (
                <div className="space-y-3">
                  {account.opportunities.map((opp) => (
                    <div
                      key={opp.opportunity_id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => router.push(`/pipeline?opportunity=${opp.opportunity_id}`)}
                    >
                      <div>
                        <p className="font-medium">{opp.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={stageColors[opp.stage]}>{opp.stage}</Badge>
                          {opp.next_step_due_date && (
                            <span className="text-xs text-muted-foreground">
                              Next Step: {formatDate(opp.next_step_due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(opp.estimated_value)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No opportunities found for this account
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tickets Tab */}
        <TabsContent value="tickets">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Tickets ({tickets.length})</CardTitle>
                <CardDescription>Support tickets for this account</CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams({
                    from: 'account',
                    account_id: account.account_id,
                    company_name: account.company_name,
                    contact_name: account.pic_name || '',
                    contact_email: account.pic_email || '',
                    contact_phone: account.pic_phone || '',
                  })
                  router.push(`/tickets/new?${params.toString()}`)
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Create Ticket
              </Button>
            </CardHeader>
            <CardContent>
              {tickets.length > 0 ? (
                <div className="space-y-3">
                  {tickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => router.push(`/tickets/${ticket.id}`)}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-muted-foreground">
                            {ticket.ticket_code}
                          </span>
                          <Badge variant="outline">{ticket.ticket_type}</Badge>
                        </div>
                        <p className="font-medium mt-1">{ticket.subject}</p>
                      </div>
                      <div className="text-right">
                        <Badge className={ticketStatusColors[ticket.status] || 'bg-gray-100'}>
                          {ticket.status.replace(/_/g, ' ')}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(ticket.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No tickets found for this account
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activities Tab */}
        <TabsContent value="activities">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activities ({activities.length})</CardTitle>
              <CardDescription>Recent activities for this account</CardDescription>
            </CardHeader>
            <CardContent>
              {activities.length > 0 ? (
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <div
                      key={activity.activity_id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          <Activity className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{activity.subject}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="outline">{activity.activity_type}</Badge>
                            <span>{activity.owner?.name || '-'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge
                          variant={activity.status === 'Completed' || activity.status === 'Done' ? 'default' : 'secondary'}
                        >
                          {activity.status}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(activity.due_date)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No activities found for this account
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Contact Add/Edit Modal */}
      <Dialog open={showContactModal} onOpenChange={setShowContactModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingContact ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editingContact ? 'Edit Contact' : 'Add Contact'}
            </DialogTitle>
            <DialogDescription>
              {editingContact ? 'Update contact information.' : 'Add a new contact to this account.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {contactError && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                {contactError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact_first_name">First Name *</Label>
                <Input
                  id="contact_first_name"
                  value={contactForm.first_name}
                  onChange={(e) => setContactForm(prev => ({ ...prev, first_name: e.target.value }))}
                  placeholder="John"
                />
              </div>
              <div>
                <Label htmlFor="contact_last_name">Last Name</Label>
                <Input
                  id="contact_last_name"
                  value={contactForm.last_name}
                  onChange={(e) => setContactForm(prev => ({ ...prev, last_name: e.target.value }))}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact_job_title">Job Title</Label>
                <Input
                  id="contact_job_title"
                  value={contactForm.job_title}
                  onChange={(e) => setContactForm(prev => ({ ...prev, job_title: e.target.value }))}
                  placeholder="Manager"
                />
              </div>
              <div>
                <Label htmlFor="contact_department">Department</Label>
                <Input
                  id="contact_department"
                  value={contactForm.department}
                  onChange={(e) => setContactForm(prev => ({ ...prev, department: e.target.value }))}
                  placeholder="Logistics"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="contact_email">Email</Label>
              <Input
                id="contact_email"
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="john@example.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact_phone">Phone</Label>
                <Input
                  id="contact_phone"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="021-1234567"
                />
              </div>
              <div>
                <Label htmlFor="contact_mobile">Mobile</Label>
                <Input
                  id="contact_mobile"
                  value={contactForm.mobile}
                  onChange={(e) => setContactForm(prev => ({ ...prev, mobile: e.target.value }))}
                  placeholder="0812-3456-7890"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="contact_is_primary"
                checked={contactForm.is_primary}
                onChange={(e) => setContactForm(prev => ({ ...prev, is_primary: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <Label htmlFor="contact_is_primary" className="font-normal">
                Set as primary contact (will sync to account PIC)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowContactModal(false)} disabled={isContactSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmitContact} disabled={isContactSubmitting || !contactForm.first_name.trim()}>
              {isContactSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                editingContact ? 'Save Changes' : 'Add Contact'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Account Modal */}
      <Dialog open={showEditAccountModal} onOpenChange={setShowEditAccountModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Edit Account
            </DialogTitle>
            <DialogDescription>
              Update account information.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {editError && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                {editError}
              </div>
            )}

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
            <Button variant="outline" onClick={() => setShowEditAccountModal(false)} disabled={isEditSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmitEditAccount} disabled={isEditSubmitting || !editFormData.company_name.trim()}>
              {isEditSubmitting ? (
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
    </div>
  )
}
