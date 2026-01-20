'use client'

import { useState, useEffect } from 'react'
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
import { canCreateQuotes } from '@/lib/permissions'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface QuotationDetailProps {
  quotationId: string
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

export function QuotationDetail({ quotationId, profile }: QuotationDetailProps) {
  const router = useRouter()
  const [quotation, setQuotation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canManageQuotes = canCreateQuotes(profile.role)

  // Fetch quotation
  const fetchQuotation = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/ticketing/quotations/${quotationId}`)
      const result = await response.json()

      if (result.success) {
        setQuotation(result.data)
      } else {
        setError(result.error || 'Failed to load quotation')
      }
    } catch (err) {
      console.error('Error fetching quotation:', err)
      setError('Failed to load quotation')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQuotation()
  }, [quotationId])

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

  // Check if quote is expired
  const isExpired = (validUntil: string) => {
    if (!validUntil) return false
    return new Date(validUntil) < new Date()
  }

  // Update status
  const updateStatus = async (newStatus: string) => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/quotations/${quotationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const result = await response.json()

      if (result.success) {
        fetchQuotation()
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

  // Delete quotation
  const deleteQuotation = async () => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/quotations/${quotationId}`, {
        method: 'DELETE',
      })
      const result = await response.json()

      if (result.success) {
        router.push('/quotations')
      } else {
        setError(result.error || 'Failed to delete quotation')
      }
    } catch (err) {
      console.error('Error deleting quotation:', err)
      setError('Failed to delete quotation')
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

  if (error || !quotation) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">{error || 'Quotation not found'}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const ticket = quotation.ticket
  const account = ticket?.account
  const contact = ticket?.contact

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
                {quotation.quote_number}
              </h1>
              <Badge
                variant={statusVariants[quotation.status]?.variant || 'outline'}
                className="gap-1"
              >
                {statusVariants[quotation.status]?.icon}
                {statusVariants[quotation.status]?.label || quotation.status}
              </Badge>
              {isExpired(quotation.valid_until) && quotation.status !== 'accepted' && (
                <Badge variant="destructive">Expired</Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Created {formatDateTime(quotation.created_at)}
            </p>
          </div>
        </div>

        {canManageQuotes && (
          <div className="flex gap-2">
            {quotation.status === 'draft' && (
              <>
                <Button
                  onClick={() => updateStatus('sent')}
                  disabled={actionLoading}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Send Quote
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
                      <AlertDialogTitle>Delete Quotation</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this quotation? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={deleteQuotation}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {quotation.status === 'sent' && (
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
        {/* Quote Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Quote Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Amount */}
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Quote Amount</p>
                <p className="text-3xl font-bold">
                  {formatCurrency(quotation.amount, quotation.currency)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground" />
            </div>

            <Separator />

            {/* Validity */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Valid Until</p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className={isExpired(quotation.valid_until) ? 'text-destructive' : ''}>
                    {formatDate(quotation.valid_until)}
                  </span>
                </div>
              </div>
              {quotation.sent_at && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Sent At</p>
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDateTime(quotation.sent_at)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Terms */}
            {quotation.terms && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Terms & Conditions</p>
                  <p className="whitespace-pre-wrap">{quotation.terms}</p>
                </div>
              </>
            )}

            {/* Notes */}
            {quotation.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Internal Notes</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{quotation.notes}</p>
                </div>
              </>
            )}

            {/* Created By */}
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground mb-2">Created By</p>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{quotation.creator?.name || 'Unknown'}</span>
                {quotation.creator?.email && (
                  <span className="text-muted-foreground">({quotation.creator.email})</span>
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

          {/* Account */}
          {account && (
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

          {/* Contact */}
          {contact && (
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
