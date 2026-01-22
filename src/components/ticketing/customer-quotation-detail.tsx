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
  Eye,
  MessageSquare,
  ExternalLink,
  Package,
  Truck,
  Pencil,
  Download,
  Users,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useToast } from '@/hooks/use-toast'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface CustomerQuotationDetailProps {
  quotationId: string
  profile: Profile
}

// Status badge variants
const statusVariants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; icon: React.ReactNode }> = {
  draft: { variant: 'outline', label: 'Draft', icon: <FileText className="h-3 w-3" /> },
  sent: { variant: 'default', label: 'Sent', icon: <Send className="h-3 w-3" /> },
  viewed: { variant: 'secondary', label: 'Viewed', icon: <Eye className="h-3 w-3" /> },
  accepted: { variant: 'secondary', label: 'Accepted', icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { variant: 'destructive', label: 'Rejected', icon: <XCircle className="h-3 w-3" /> },
  expired: { variant: 'destructive', label: 'Expired', icon: <Clock className="h-3 w-3" /> },
  revoked: { variant: 'destructive', label: 'Revoked', icon: <XCircle className="h-3 w-3" /> },
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

export function CustomerQuotationDetail({ quotationId, profile }: CustomerQuotationDetailProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [quotation, setQuotation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch quotation
  const fetchQuotation = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}`)
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

  // Check if quotation is expired
  const isExpired = (validUntil: string) => {
    if (!validUntil) return false
    return new Date(validUntil) < new Date()
  }

  // Generate PDF preview
  const handleGeneratePDF = async () => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}/pdf`, {
        method: 'POST',
      })
      const result = await response.json()

      if (result.success) {
        const previewWindow = window.open('', '_blank')
        if (previewWindow) {
          previewWindow.document.write(result.html)
          previewWindow.document.close()
        }
        toast({
          title: 'PDF Generated',
          description: 'PDF preview opened in new tab. Use browser print to save as PDF.',
        })
      } else {
        throw new Error(result.error || 'Failed to generate PDF')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate PDF',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Download PDF directly
  const handleDownloadPDF = async () => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}/pdf`, {
        method: 'POST',
      })
      const result = await response.json()

      if (result.success) {
        // Create iframe for printing
        const iframe = document.createElement('iframe')
        iframe.style.position = 'fixed'
        iframe.style.right = '0'
        iframe.style.bottom = '0'
        iframe.style.width = '0'
        iframe.style.height = '0'
        iframe.style.border = 'none'
        document.body.appendChild(iframe)

        const iframeDoc = iframe.contentWindow?.document
        if (iframeDoc) {
          iframeDoc.open()
          iframeDoc.write(result.html)
          iframeDoc.close()

          // Wait for content to load then print
          iframe.onload = () => {
            setTimeout(() => {
              iframe.contentWindow?.print()
              // Remove iframe after a delay
              setTimeout(() => {
                document.body.removeChild(iframe)
              }, 1000)
            }, 500)
          }
        }

        toast({
          title: 'Download PDF',
          description: 'Print dialog opened. Select "Save as PDF" to download.',
        })
      } else {
        throw new Error(result.error || 'Failed to generate PDF')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to download PDF',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Send via WhatsApp
  const handleSendWhatsApp = async () => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'whatsapp' }),
      })
      const result = await response.json()

      if (result.success) {
        await navigator.clipboard.writeText(result.data.whatsapp_text)
        toast({
          title: 'WhatsApp Text Copied',
          description: 'Text copied to clipboard. Opening WhatsApp...',
        })

        if (result.data.whatsapp_url) {
          window.open(result.data.whatsapp_url, '_blank')
        }

        fetchQuotation()
      } else {
        throw new Error(result.error || 'Failed to send')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send via WhatsApp',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Send via Email (SMTP)
  const handleSendEmail = async (isResend: boolean = false) => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'email', isResend }),
      })
      const result = await response.json()

      if (result.success) {
        // Email sent successfully via SMTP
        toast({
          title: isResend ? 'Email Resent Successfully' : 'Email Sent Successfully',
          description: `Quotation has been sent to ${result.data.recipient_email}`,
        })

        // Always refresh quotation data to get updated status
        fetchQuotation()
      } else {
        // Check if there's fallback data (email service not configured)
        if (result.fallback) {
          // Fallback to mailto if SMTP not configured
          const mailtoBody = encodeURIComponent(result.fallback.email_text)
          const mailtoLink = `mailto:${result.fallback.recipient_email || ''}?subject=${encodeURIComponent(result.fallback.email_subject)}&body=${mailtoBody}`

          // Copy to clipboard
          await navigator.clipboard.writeText(result.fallback.email_text)

          // Open mailto
          window.location.href = mailtoLink

          toast({
            title: 'Email Service Not Configured',
            description: 'Opening email client as fallback. Content copied to clipboard.',
            variant: 'destructive',
          })
        } else {
          throw new Error(result.error || 'Failed to send')
        }
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send email',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Resend via WhatsApp (doesn't update status)
  const handleResendWhatsApp = async () => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'whatsapp', isResend: true }),
      })
      const result = await response.json()

      if (result.success) {
        await navigator.clipboard.writeText(result.data.whatsapp_text)
        toast({
          title: 'WhatsApp Text Copied',
          description: 'Text copied to clipboard. Opening WhatsApp...',
        })

        if (result.data.whatsapp_url) {
          window.open(result.data.whatsapp_url, '_blank')
        }
      } else {
        throw new Error(result.error || 'Failed to resend')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to resend via WhatsApp',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Update status
  const updateStatus = async (newStatus: string) => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const result = await response.json()

      if (result.success) {
        toast({
          title: 'Success',
          description: `Quotation marked as ${newStatus}`,
        })
        fetchQuotation()
      } else {
        throw new Error(result.error || 'Failed to update status')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update status',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Recreate quotation (request adjustment)
  const handleRecreateQuotation = async () => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}/recreate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Customer requested adjustment' }),
      })
      const result = await response.json()

      if (result.success) {
        toast({
          title: 'Quotation Recreated',
          description: `New quotation ${result.data.new_quotation_number} created. Redirecting...`,
        })
        // Navigate to the new quotation edit page
        router.push(`/customer-quotations/${result.data.new_quotation_id}/edit`)
      } else {
        throw new Error(result.error || 'Failed to recreate quotation')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to recreate quotation',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Delete quotation
  const deleteQuotation = async () => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}`, {
        method: 'DELETE',
      })
      const result = await response.json()

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Quotation deleted',
        })
        router.push('/customer-quotations')
      } else {
        throw new Error(result.error || 'Failed to delete quotation')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete quotation',
        variant: 'destructive',
      })
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
  const items = quotation.items || []

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
                {quotation.quotation_number}
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

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleGeneratePDF}
            disabled={actionLoading}
          >
            <Eye className="mr-2 h-4 w-4" />
            Preview PDF
          </Button>
          <Button
            variant="default"
            onClick={handleDownloadPDF}
            disabled={actionLoading}
          >
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
          {quotation.status === 'draft' && (
            <>
              <Button
                variant="outline"
                onClick={() => router.push(`/customer-quotations/${quotationId}/edit`)}
                disabled={actionLoading}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                onClick={handleSendWhatsApp}
                disabled={actionLoading}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                WhatsApp
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSendEmail(false)}
                disabled={actionLoading}
              >
                <Mail className="mr-2 h-4 w-4" />
                Email
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
                onClick={handleResendWhatsApp}
                disabled={actionLoading}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Resend WhatsApp
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSendEmail(true)}
                disabled={actionLoading}
              >
                <Mail className="mr-2 h-4 w-4" />
                Resend Email
              </Button>
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
          {quotation.status === 'rejected' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="default" disabled={actionLoading}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Recreate Quotation
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Recreate Quotation</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create a new quotation based on the current one. The new quotation
                    will be in draft status, allowing you to make adjustments before sending.
                    {quotation.ticket_id && (
                      <span className="block mt-2 text-yellow-600 dark:text-yellow-400">
                        Note: This will trigger a rate adjustment request on the linked RFQ ticket.
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRecreateQuotation}>
                    Recreate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quotation Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Quotation Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Total Amount */}
            <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Total Selling Rate</p>
                <p className="text-3xl font-bold text-green-700 dark:text-green-400">
                  {formatCurrency(quotation.total_selling_rate, quotation.currency)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>

            {/* Cost & Margin */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Total Cost</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(quotation.total_cost, quotation.currency)}
                </p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Target Margin</p>
                <p className="text-lg font-semibold">{quotation.target_margin_percent || 0}%</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Rate Structure</p>
                <p className="text-lg font-semibold capitalize">{quotation.rate_structure}</p>
              </div>
            </div>

            {/* Breakdown Items */}
            {items.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="font-medium mb-3">Rate Breakdown</p>
                  <div className="space-y-2">
                    {items.map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{item.component_name || item.component_type}</p>
                          {item.description && (
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                          )}
                        </div>
                        <p className="font-mono font-medium">
                          {formatCurrency(item.selling_rate, quotation.currency)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Service Details */}
            <div>
              <p className="font-medium mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Service Details
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {quotation.service_type && (
                  <div>
                    <p className="text-sm text-muted-foreground">Service Type</p>
                    <p>{quotation.service_type}</p>
                  </div>
                )}
                {quotation.incoterm && (
                  <div>
                    <p className="text-sm text-muted-foreground">Incoterm</p>
                    <p>{quotation.incoterm}</p>
                  </div>
                )}
                {quotation.fleet_type && (
                  <div>
                    <p className="text-sm text-muted-foreground">Fleet</p>
                    <p>{quotation.fleet_type} x {quotation.fleet_quantity || 1}</p>
                  </div>
                )}
                {quotation.commodity && (
                  <div>
                    <p className="text-sm text-muted-foreground">Commodity</p>
                    <p>{quotation.commodity}</p>
                  </div>
                )}
                {quotation.estimated_leadtime && (
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated Leadtime</p>
                    <p>{quotation.estimated_leadtime}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Cargo Details */}
            {(quotation.cargo_description || quotation.cargo_weight || quotation.cargo_volume || quotation.estimated_cargo_value) && (
              <>
                <Separator />
                <div>
                  <p className="font-medium mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Cargo Details
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {quotation.cargo_description && (
                      <div className="sm:col-span-2 lg:col-span-4">
                        <p className="text-sm text-muted-foreground">Description</p>
                        <p>{quotation.cargo_description}</p>
                      </div>
                    )}
                    {quotation.cargo_weight && (
                      <div>
                        <p className="text-sm text-muted-foreground">Weight</p>
                        <p className="font-medium">{quotation.cargo_weight} {quotation.cargo_weight_unit || 'kg'}</p>
                      </div>
                    )}
                    {quotation.cargo_volume && (
                      <div>
                        <p className="text-sm text-muted-foreground">Volume</p>
                        <p className="font-medium">{quotation.cargo_volume} {quotation.cargo_volume_unit || 'cbm'}</p>
                      </div>
                    )}
                    {quotation.cargo_quantity && (
                      <div>
                        <p className="text-sm text-muted-foreground">Quantity</p>
                        <p className="font-medium">{quotation.cargo_quantity} {quotation.cargo_quantity_unit || 'units'}</p>
                      </div>
                    )}
                    {quotation.estimated_cargo_value && (
                      <div>
                        <p className="text-sm text-muted-foreground">Cargo Value</p>
                        <p className="font-medium text-primary">
                          {formatCurrency(quotation.estimated_cargo_value, quotation.cargo_value_currency || 'IDR')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Route */}
            {(quotation.origin_city || quotation.destination_city) && (
              <>
                <Separator />
                <div>
                  <p className="font-medium mb-3 flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    Route
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="p-3 border rounded-lg">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-green-600" />
                        Origin
                      </p>
                      <p className="font-medium">{quotation.origin_city || '—'}</p>
                      {quotation.origin_country && (
                        <p className="text-sm text-muted-foreground">{quotation.origin_country}</p>
                      )}
                      {quotation.origin_port && (
                        <p className="text-sm text-muted-foreground">Port: {quotation.origin_port}</p>
                      )}
                    </div>
                    <div className="p-3 border rounded-lg">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-red-600" />
                        Destination
                      </p>
                      <p className="font-medium">{quotation.destination_city || '—'}</p>
                      {quotation.destination_country && (
                        <p className="text-sm text-muted-foreground">{quotation.destination_country}</p>
                      )}
                      {quotation.destination_port && (
                        <p className="text-sm text-muted-foreground">Port: {quotation.destination_port}</p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Terms */}
            {(quotation.terms_includes?.length > 0 || quotation.terms_excludes?.length > 0) && (
              <>
                <Separator />
                <div>
                  <p className="font-medium mb-3">Terms & Conditions</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {quotation.terms_includes?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-green-600 mb-2">Included</p>
                        <ul className="text-sm space-y-1">
                          {quotation.terms_includes.map((term: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                              {term}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {quotation.terms_excludes?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-red-600 mb-2">Excluded</p>
                        <ul className="text-sm space-y-1">
                          {quotation.terms_excludes.map((term: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                              {term}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Validity */}
            <Separator />
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
                    {quotation.sent_via && (
                      <Badge variant="outline" className="capitalize">{quotation.sent_via}</Badge>
                    )}
                  </div>
                </div>
              )}
            </div>

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

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="font-medium">{quotation.customer_name}</p>
                {quotation.customer_company && (
                  <p className="text-sm text-muted-foreground">{quotation.customer_company}</p>
                )}
              </div>
              {quotation.customer_email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${quotation.customer_email}`} className="text-brand hover:underline">
                    {quotation.customer_email}
                  </a>
                </div>
              )}
              {quotation.customer_phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${quotation.customer_phone}`} className="text-brand hover:underline">
                    {quotation.customer_phone}
                  </a>
                </div>
              )}
              {quotation.customer_address && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 mt-0.5" />
                  <span>{quotation.customer_address}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reference Ticket */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                Reference Ticket
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

          {/* Lead */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Lead
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quotation.lead ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Company</p>
                    <p className="font-medium">{quotation.lead.company_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Contact</p>
                    <p>{quotation.lead.contact_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Source</p>
                    <Badge variant="outline">{quotation.lead.source || '—'}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant="secondary">{quotation.lead.status || '—'}</Badge>
                  </div>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/leads/${quotation.lead.lead_id}`}>View Lead</Link>
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground">No lead linked</p>
              )}
            </CardContent>
          </Card>

          {/* Pipeline / Opportunity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quotation.opportunity ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Opportunity Name</p>
                    <p className="font-medium">{quotation.opportunity.opportunity_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Stage</p>
                    <Badge variant="secondary">{quotation.opportunity.stage || '—'}</Badge>
                  </div>
                  {quotation.opportunity.expected_revenue && (
                    <div>
                      <p className="text-sm text-muted-foreground">Expected Revenue</p>
                      <p className="font-medium text-green-600">
                        {formatCurrency(quotation.opportunity.expected_revenue, 'IDR')}
                      </p>
                    </div>
                  )}
                  {quotation.opportunity.probability && (
                    <div>
                      <p className="text-sm text-muted-foreground">Probability</p>
                      <p className="font-medium">{quotation.opportunity.probability}%</p>
                    </div>
                  )}
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/opportunities/${quotation.opportunity.opportunity_id}`}>View Pipeline</Link>
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground">No pipeline linked</p>
              )}
            </CardContent>
          </Card>

          {/* Validation Link */}
          {quotation.validation_code && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Validation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Share this link for quotation verification
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const url = `${window.location.origin}/quotation-verify/${quotation.validation_code}`
                    navigator.clipboard.writeText(url)
                    toast({
                      title: 'Link Copied',
                      description: 'Validation link copied to clipboard',
                    })
                  }}
                >
                  Copy Validation Link
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
