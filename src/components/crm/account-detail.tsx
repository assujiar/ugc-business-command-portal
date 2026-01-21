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
import {
  ArrowLeft,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  Globe,
  Calendar,
  Ticket,
  FileText,
  Activity,
  Users,
  DollarSign,
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
  job_title: string | null
  is_primary: boolean
}

interface Opportunity {
  opportunity_id: string
  name: string
  stage: OpportunityStage
  estimated_value: number | null
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

  const primaryContact = account.contacts?.find(c => c.is_primary) || account.contacts?.[0]
  const totalPipelineValue = account.opportunities?.reduce((sum, opp) =>
    sum + (opp.estimated_value || 0), 0) || 0

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
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Contacts</span>
            </div>
            <p className="text-2xl font-bold mt-1">{account.contacts?.length || 0}</p>
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
            <p className="text-lg font-bold mt-1">{formatCurrency(totalPipelineValue)}</p>
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
            <CardHeader>
              <CardTitle>Contacts ({account.contacts?.length || 0})</CardTitle>
              <CardDescription>People associated with this account</CardDescription>
            </CardHeader>
            <CardContent>
              {account.contacts && account.contacts.length > 0 ? (
                <div className="space-y-4">
                  {account.contacts.map((contact) => (
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
                          <p className="text-sm text-muted-foreground">{contact.job_title || 'No title'}</p>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
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
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No contacts found for this account
                </p>
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
            <CardHeader>
              <CardTitle>Tickets ({tickets.length})</CardTitle>
              <CardDescription>Support tickets for this account</CardDescription>
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
    </div>
  )
}
