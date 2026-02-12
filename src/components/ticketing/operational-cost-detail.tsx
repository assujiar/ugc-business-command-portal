'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileText,
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  User,
  Mail,
  Phone,
  MapPin,
  Trash2,
  RefreshCw,
  Ticket,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { canCreateOperationalCosts, isOps } from '@/lib/permissions'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface OperationalCostDetailProps {
  costId: string
  profile: Profile
}

// Status badge variants
const statusVariants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; icon: React.ReactNode }> = {
  draft: { variant: 'outline', label: 'Draft', icon: <FileText className="h-3 w-3" /> },
  sent: { variant: 'default', label: 'Sent', icon: <Send className="h-3 w-3" /> },
  accepted: { variant: 'secondary', label: 'Accepted', icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { variant: 'destructive', label: 'Rejected', icon: <XCircle className="h-3 w-3" /> },
}

// Format currency
const formatCurrency = (amount: number, currency: string = 'IDR') => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function OperationalCostDetail({ costId, profile }: OperationalCostDetailProps) {
  const router = useRouter()
  const [cost, setCost] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canManageCosts = canCreateOperationalCosts(profile.role)

  // Fetch operational cost
  const fetchCost = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/ticketing/operational-costs/${costId}`)
      const result = await response.json()

      if (result.success) {
        setCost(result.data)
      } else {
        setError(result.error || 'Failed to load operational cost')
      }
    } catch (err) {
      console.error('Error fetching operational cost:', err)
      setError('Failed to load operational cost')
    } finally {
      setLoading(false)
    }
  }, [costId])

  useEffect(() => {
    fetchCost()
  }, [fetchCost])

  // Format date
  const formatDate = (dateString: string) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Check if cost is expired
  const isExpired = (validUntil: string) => {
    if (!validUntil) return false
    return new Date(validUntil) < new Date()
  }

  // Update status
  const updateStatus = async (newStatus: string) => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/operational-costs/${costId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const result = await response.json()

      if (result.success) {
        fetchCost()
      } else {
        setError(result.error || 'Failed to update status')
      }
    } catch (err) {
      console.error('Error updating status:', err)
      setError('Failed to update status')
    } finally {
      setActionLoading(false)
    }
  }

  // Delete operational cost
  const deleteCost = async () => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/operational-costs/${costId}`, {
        method: 'DELETE',
      })
      const result = await response.json()

      if (result.success) {
        router.push('/operational-costs')
      } else {
        setError(result.error || 'Failed to delete operational cost')
      }
    } catch (err) {
      console.error('Error deleting operational cost:', err)
      setError('Failed to delete operational cost')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !cost) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">{error || 'Operational cost not found'}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const ticket = cost.ticket
  const account = ticket?.account
  const contact = ticket?.contact
  const isOpsUser = isOps(profile.role)
  const canSeeSenderInfo = !isOpsUser || ticket?.show_sender_to_ops !== false

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight font-mono">
                {cost.cost_number || cost.quote_number}
              </h1>
              <Badge
                variant={statusVariants[cost.status]?.variant || 'outline'}
                className="gap-1"
              >
                {statusVariants[cost.status]?.icon}
                {statusVariants[cost.status]?.label || cost.status}
              </Badge>
              {isExpired(cost.valid_until) && cost.status !== 'accepted' && (
                <Badge variant="destructive">Expired</Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Created {formatDateTime(cost.created_at)}
            </p>
          </div>
        </div>

        {canManageCosts && (
          <div className="flex gap-2">
            {cost.status === 'draft' && (
              <>
                <Button
                  onClick={() => updateStatus('sent')}
                  disabled={actionLoading}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Send Cost
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={actionLoading}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Operational Cost</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this operational cost? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={deleteCost}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {cost.status === 'sent' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => updateStatus('accepted')}
                  disabled={actionLoading}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Mark Accepted
                </Button>
                <Button
                  variant="outline"
                  onClick={() => updateStatus('rejected')}
                  disabled={actionLoading}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Mark Rejected
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Cost Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cost Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Amount */}
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Cost Amount</p>
                <p className="text-3xl font-bold">
                  {formatCurrency(cost.amount, cost.currency)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground" />
            </div>

            {/* Shipment Details (if linked to a specific shipment) */}
            {cost.shipment_label && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Linked Shipment</p>
                  <div className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-blue-600" />
                      <span className="font-medium text-blue-700 dark:text-blue-300">
                        {cost.shipment_label}
                      </span>
                    </div>
                    {cost.shipment_detail_id && (
                      <p className="text-xs text-muted-foreground mt-1 font-mono">
                        ID: {cost.shipment_detail_id}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Validity */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Valid Until</p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className={isExpired(cost.valid_until) ? 'text-destructive' : ''}>
                    {formatDate(cost.valid_until)}
                  </span>
                </div>
              </div>
              {cost.sent_at && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Sent At</p>
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDateTime(cost.sent_at)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Terms */}
            {cost.terms && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Terms & Conditions</p>
                  <p className="whitespace-pre-wrap">{cost.terms}</p>
                </div>
              </>
            )}

            {/* Notes */}
            {cost.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Internal Notes</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{cost.notes}</p>
                </div>
              </>
            )}

            {/* Customer Quotation */}
            {cost.customer_quotation && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Linked Customer Quotation</p>
                  <div className="p-3 border rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <Link href={`/customer-quotations/${cost.customer_quotation.id}`} className="text-brand hover:underline font-mono font-medium">
                        {cost.customer_quotation.quotation_number}
                      </Link>
                      <Badge variant={cost.customer_quotation.status === 'rejected' ? 'destructive' : cost.customer_quotation.status === 'accepted' ? 'secondary' : 'outline'}>
                        {cost.customer_quotation.status}
                      </Badge>
                    </div>
                    {!isOpsUser && cost.customer_quotation.total_selling_rate && (
                      <p className="text-sm">Selling Rate: {formatCurrency(cost.customer_quotation.total_selling_rate, cost.customer_quotation.currency || 'IDR')}</p>
                    )}
                    {cost.customer_quotation.rejection_reason && (
                      <p className="text-sm text-destructive">Rejection: {cost.customer_quotation.rejection_reason.replace(/_/g, ' ')}</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Rejection Details */}
            {cost.rejection_details && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-destructive mb-2">Rejection Details</p>
                  <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reason</span>
                      <span className="font-medium capitalize">{(cost.rejection_details.reason_type || '').replace(/_/g, ' ')}</span>
                    </div>
                    {cost.rejection_details.competitor_name && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Competitor</span>
                        <span className="font-medium">{cost.rejection_details.competitor_name}</span>
                      </div>
                    )}
                    {cost.rejection_details.competitor_amount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Competitor Price</span>
                        <span className="font-medium">{formatCurrency(cost.rejection_details.competitor_amount, cost.rejection_details.currency || 'IDR')}</span>
                      </div>
                    )}
                    {cost.rejection_details.customer_budget > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Customer Budget</span>
                        <span className="font-medium">{formatCurrency(cost.rejection_details.customer_budget, cost.rejection_details.currency || 'IDR')}</span>
                      </div>
                    )}
                    {cost.rejection_details.notes && (
                      <div>
                        <span className="text-muted-foreground">Notes: </span>
                        <span>{cost.rejection_details.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Pipeline/Opportunity Info - hidden for Ops if show_sender_to_ops is false */}
            {canSeeSenderInfo && cost.opportunity && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Pipeline</p>
                  <div className="p-3 border rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <Link href={`/opportunities/${cost.opportunity.opportunity_id}`} className="text-brand hover:underline font-medium">
                        {cost.opportunity.name || cost.opportunity.opportunity_id}
                      </Link>
                      <Badge variant="secondary">{cost.opportunity.stage}</Badge>
                    </div>
                    {cost.opportunity.probability != null && (
                      <p className="text-sm text-muted-foreground">Probability: {cost.opportunity.probability}%</p>
                    )}
                    {cost.opportunity.competitor && (
                      <p className="text-sm text-muted-foreground">Competitor: {cost.opportunity.competitor}</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Created By */}
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground mb-2">Created By</p>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{cost.creator?.name || 'Unknown'}</span>
                {cost.creator?.email && (
                  <span className="text-muted-foreground">({cost.creator.email})</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ticket & Customer Info */}
        <div className="space-y-6">
          {/* Related Ticket */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                Related Ticket
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ticket ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Ticket Code</p>
                    <Link href={`/tickets/${ticket.id}`} className="text-brand hover:underline font-mono">
                      {ticket.ticket_code}
                    </Link>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Subject</p>
                    <p className="font-medium">{ticket.subject}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant="outline">{ticket.status}</Badge>
                  </div>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/tickets/${ticket.id}`}>View Ticket</Link>
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground">No ticket linked</p>
              )}
            </CardContent>
          </Card>

          {/* Account - hidden for Ops if show_sender_to_ops is false */}
          {canSeeSenderInfo && account && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="font-medium">{account.company_name}</p>
                </div>
                {account.address && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mt-0.5" />
                    <span>
                      {account.address}
                      {account.city && `, ${account.city}`}
                      {account.country && `, ${account.country}`}
                    </span>
                  </div>
                )}
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={`/accounts/${account.account_id}`}>View Account</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Contact - hidden for Ops if show_sender_to_ops is false */}
          {canSeeSenderInfo && contact && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="font-medium">
                    {contact.first_name} {contact.last_name}
                  </p>
                </div>
                {contact.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${contact.email}`} className="text-brand hover:underline">
                      {contact.email}
                    </a>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${contact.phone}`} className="text-brand hover:underline">
                      {contact.phone}
                    </a>
                  </div>
                )}
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={`/contacts/${contact.contact_id}`}>View Contact</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
