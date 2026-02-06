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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import type { Database } from '@/types/database'
import { QUOTATION_STATUS, QUOTATION_STATUS_LABELS } from '@/lib/constants'

type Profile = Database['public']['Tables']['profiles']['Row']

interface CustomerQuotationDetailProps {
  quotationId: string
  profile: Profile
}

// Status badge variants - using SSOT constants for customer_quotation_status enum values
const statusVariants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; icon: React.ReactNode }> = {
  [QUOTATION_STATUS.DRAFT]: { variant: 'outline', label: QUOTATION_STATUS_LABELS[QUOTATION_STATUS.DRAFT], icon: <FileText className="h-3 w-3" /> },
  [QUOTATION_STATUS.SENT]: { variant: 'default', label: QUOTATION_STATUS_LABELS[QUOTATION_STATUS.SENT], icon: <Send className="h-3 w-3" /> },
  [QUOTATION_STATUS.ACCEPTED]: { variant: 'secondary', label: QUOTATION_STATUS_LABELS[QUOTATION_STATUS.ACCEPTED], icon: <CheckCircle2 className="h-3 w-3" /> },
  [QUOTATION_STATUS.REJECTED]: { variant: 'destructive', label: QUOTATION_STATUS_LABELS[QUOTATION_STATUS.REJECTED], icon: <XCircle className="h-3 w-3" /> },
  [QUOTATION_STATUS.EXPIRED]: { variant: 'destructive', label: QUOTATION_STATUS_LABELS[QUOTATION_STATUS.EXPIRED], icon: <Clock className="h-3 w-3" /> },
}

// Rejection reason options
const rejectionReasonOptions = [
  { value: 'tarif_tidak_masuk', label: 'Tarif tidak masuk' },
  { value: 'kompetitor_lebih_murah', label: 'Kompetitor lebih murah' },
  { value: 'budget_customer_tidak_cukup', label: 'Budget customer tidak cukup' },
  { value: 'service_tidak_sesuai', label: 'Service tidak sesuai' },
  { value: 'waktu_tidak_sesuai', label: 'Waktu tidak sesuai' },
  { value: 'other', label: 'Lainnya' },
]

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

  // Rejection modal state
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectCompetitorName, setRejectCompetitorName] = useState('')
  const [rejectCompetitorAmount, setRejectCompetitorAmount] = useState('')
  const [rejectCustomerBudget, setRejectCustomerBudget] = useState('')
  const [rejectNotes, setRejectNotes] = useState('')
  const [rejectFieldErrors, setRejectFieldErrors] = useState<Record<string, string>>({})
  const [rejectModalError, setRejectModalError] = useState<string | null>(null)

  // Pipeline update confirmation dialog state
  const [showPipelineUpdateDialog, setShowPipelineUpdateDialog] = useState(false)
  const [pendingOpportunityId, setPendingOpportunityId] = useState<string | null>(null)
  const [pipelineUpdateLoading, setPipelineUpdateLoading] = useState(false)

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

  // Handle manual pipeline update to Quote Sent
  const handleUpdatePipelineToQuoteSent = async () => {
    if (!pendingOpportunityId) return

    setPipelineUpdateLoading(true)
    try {
      // Use /api/crm/pipeline/update which creates both opportunity stage update AND pipeline_updates record
      const formData = new FormData()
      formData.append('opportunity_id', pendingOpportunityId)
      formData.append('new_stage', 'Quote Sent')
      formData.append('approach_method', 'Email') // Default approach method
      formData.append('notes', `Pipeline updated after quotation ${quotation?.quotation_number} sent to customer`)

      const response = await fetch('/api/crm/pipeline/update', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json()

      if (response.ok) {
        toast({
          title: 'Pipeline Updated',
          description: 'Pipeline stage moved to Quote Sent.',
        })
        fetchQuotation() // Refresh to show updated stage
      } else {
        toast({
          title: 'Failed to Update Pipeline',
          description: result.error || 'Could not update pipeline stage.',
          variant: 'destructive',
        })
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update pipeline',
        variant: 'destructive',
      })
    } finally {
      setPipelineUpdateLoading(false)
      setShowPipelineUpdateDialog(false)
      setPendingOpportunityId(null)
    }
  }

  // Skip pipeline update
  const handleSkipPipelineUpdate = () => {
    setShowPipelineUpdateDialog(false)
    setPendingOpportunityId(null)
    toast({
      title: 'Pipeline Not Updated',
      description: 'You can manually update the pipeline stage from the Pipeline page.',
    })
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

  // Send via WhatsApp (atomic - updates quotation + opportunity + ticket)
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

        if (result.data.whatsapp_url) {
          window.open(result.data.whatsapp_url, '_blank')
        }

        // Check if pipeline was updated automatically
        // sync_result is available in both result.data.sync_result and result.sync_result
        const syncResult = result.data?.sync_result || result.sync_result || {}
        const pipelineUpdated = syncResult.pipeline_updates_created === true
        const stageChanged = syncResult.old_stage !== syncResult.new_stage
        const opportunityId = syncResult.opportunity_id || quotation?.opportunity_id
        const isSubsequentQuotation = (syncResult.quotation_sequence || 1) > 1

        if (pipelineUpdated || stageChanged) {
          toast({
            title: 'WhatsApp Text Copied',
            description: `Text copied to clipboard. Pipeline moved to ${syncResult.new_stage || 'Quote Sent'}.`,
          })
        } else if (isSubsequentQuotation) {
          // 2nd+ quotation: skip pipeline dialog, pipeline auto-updated by RPC
          toast({
            title: 'WhatsApp Text Copied',
            description: `Text copied to clipboard. ${syncResult.sequence_label || ''} quotation sent. Stage: ${syncResult.new_stage || 'unchanged'}.`,
          })
        } else {
          toast({
            title: 'WhatsApp Text Copied',
            description: 'Text copied to clipboard. Quotation sent successfully.',
          })
          // Show confirmation dialog only for 1st quotation when RPC didn't auto-update
          if (opportunityId) {
            setPendingOpportunityId(opportunityId)
            setShowPipelineUpdateDialog(true)
          }
        }

        fetchQuotation()
      } else {
        // Handle specific error codes with correlation_id
        const correlationMsg = result.correlation_id ? ` (ID: ${result.correlation_id})` : ''
        if (response.status === 403) {
          toast({
            title: 'Access Denied',
            description: `You do not have permission to send this quotation.${correlationMsg}`,
            variant: 'destructive',
          })
        } else if (response.status === 409) {
          toast({
            title: 'Conflict',
            description: `${result.error || 'State conflict'}. Please refresh and try again.${correlationMsg}`,
            variant: 'destructive',
          })
          fetchQuotation()
        } else {
          toast({
            title: 'Error',
            description: `${result.error || 'Failed to send'}${correlationMsg}`,
            variant: 'destructive',
          })
        }
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

  // Send via Email (SMTP) (atomic - updates quotation + opportunity + ticket)
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
        // Check if pipeline was updated automatically
        // sync_result is available in both result.data.sync_result and result.sync_result
        const syncResult = result.data?.sync_result || result.sync_result || {}
        const pipelineUpdated = syncResult.pipeline_updates_created === true
        const stageChanged = syncResult.old_stage !== syncResult.new_stage
        const opportunityId = syncResult.opportunity_id || quotation?.opportunity_id
        const isSubsequentQuotation = (syncResult.quotation_sequence || 1) > 1

        if (isResend) {
          toast({
            title: 'Email Resent Successfully',
            description: `Quotation has been resent to ${result.data.recipient_email}`,
          })
        } else if (pipelineUpdated || stageChanged) {
          toast({
            title: 'Email Sent Successfully',
            description: `Quotation sent to ${result.data.recipient_email}. Pipeline moved to ${syncResult.new_stage || 'Quote Sent'}.`,
          })
        } else if (isSubsequentQuotation) {
          // 2nd+ quotation: skip pipeline dialog, pipeline auto-updated by RPC
          toast({
            title: 'Email Sent Successfully',
            description: `${syncResult.sequence_label || ''} quotation sent to ${result.data.recipient_email}. Stage: ${syncResult.new_stage || 'unchanged'}.`,
          })
        } else {
          toast({
            title: 'Email Sent Successfully',
            description: `Quotation sent to ${result.data.recipient_email}.`,
          })
          // Show confirmation dialog only for 1st quotation when RPC didn't auto-update
          if (opportunityId) {
            setPendingOpportunityId(opportunityId)
            setShowPipelineUpdateDialog(true)
          }
        }

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
          // Handle specific error codes with correlation_id
          const correlationMsg = result.correlation_id ? ` (ID: ${result.correlation_id})` : ''
          if (response.status === 403) {
            toast({
              title: 'Access Denied',
              description: `You do not have permission to send this quotation.${correlationMsg}`,
              variant: 'destructive',
            })
          } else if (response.status === 409) {
            toast({
              title: 'Conflict',
              description: `${result.error || 'State conflict'}. Please refresh and try again.${correlationMsg}`,
              variant: 'destructive',
            })
            fetchQuotation()
          } else {
            toast({
              title: 'Error',
              description: `${result.error || 'Failed to send'}${correlationMsg}`,
              variant: 'destructive',
            })
          }
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

  // Accept quotation via dedicated endpoint (atomic - updates quotation + opportunity + ticket)
  const handleAcceptQuotation = async () => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const result = await response.json()

      if (result.success) {
        // Build success message with deal details if available
        const data = result.data
        let description = 'Quotation marked as accepted. Pipeline moved to Closed Won.'
        if (data?.deal_value) {
          const dealValue = formatCurrency(data.deal_value, data.currency || 'IDR')
          description = `Deal Won! Value: ${dealValue}`
          if (data.actual_margin_percent != null) {
            description += ` | Margin: ${data.actual_margin_percent}%`
          } else if (data.target_margin_percent != null) {
            description += ` | Target Margin: ${data.target_margin_percent}%`
          }
        }
        toast({
          title: '🎉 Quotation Accepted',
          description,
        })
        fetchQuotation()
      } else {
        // Handle specific error codes
        const correlationMsg = result.correlation_id ? ` (ID: ${result.correlation_id})` : ''
        if (response.status === 403) {
          toast({
            title: 'Access Denied',
            description: `You do not have permission to accept this quotation.${correlationMsg}`,
            variant: 'destructive',
          })
        } else if (response.status === 409) {
          toast({
            title: 'Conflict',
            description: `${result.error || 'State conflict detected'}. Please refresh and try again.${correlationMsg}`,
            variant: 'destructive',
          })
          fetchQuotation() // Auto-refresh on conflict
        } else {
          toast({
            title: 'Error',
            description: `${result.error || 'Failed to accept quotation'}${correlationMsg}`,
            variant: 'destructive',
          })
        }
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to accept quotation',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Revoke accepted quotation (atomic - reopens opportunity + ticket)
  const handleRevokeAcceptance = async () => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Revoked by user' }),
      })
      const result = await response.json()

      if (result.success) {
        toast({
          title: 'Quotation Revoked',
          description: 'Acceptance revoked. Pipeline reopened to Negotiation.',
        })
        fetchQuotation()
      } else {
        const correlationMsg = result.correlation_id ? ` (ID: ${result.correlation_id})` : ''
        toast({
          title: 'Error',
          description: `${result.error || 'Failed to revoke quotation'}${correlationMsg}`,
          variant: 'destructive',
        })
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to revoke quotation',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Reject quotation with reason (atomic - updates quotation + opportunity + ticket)
  const handleRejectWithReason = async () => {
    // Clear previous errors
    setRejectFieldErrors({})
    setRejectModalError(null)

    // Client-side validation
    const fieldErrors: Record<string, string> = {}

    if (!rejectReason) {
      fieldErrors.reason_type = 'Please select a rejection reason'
    }

    // Additional client-side validation for specific reason types
    if (rejectReason === 'kompetitor_lebih_murah' && !rejectCompetitorName && !rejectCompetitorAmount) {
      fieldErrors.competitor_amount = 'Competitor name or amount is required for this reason'
    }

    if (rejectReason === 'budget_customer_tidak_cukup' && !rejectCustomerBudget) {
      fieldErrors.customer_budget = 'Customer budget is required for this reason'
    }

    if (rejectReason === 'tarif_tidak_masuk' && !rejectCompetitorAmount && !rejectCustomerBudget) {
      fieldErrors.competitor_amount = 'Either competitor amount or customer budget is required'
    }

    // If client-side validation fails, set field errors and return
    if (Object.keys(fieldErrors).length > 0) {
      setRejectFieldErrors(fieldErrors)
      return
    }

    setActionLoading(true)
    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason_type: rejectReason,
          competitor_name: rejectCompetitorName || null,
          competitor_amount: rejectCompetitorAmount ? parseFloat(rejectCompetitorAmount) : null,
          customer_budget: rejectCustomerBudget ? parseFloat(rejectCustomerBudget) : null,
          notes: rejectNotes || null,
        }),
      })
      const result = await response.json()

      if (result.success) {
        toast({
          title: 'Quotation Rejected',
          description: 'Quotation rejected. Pipeline moved to Negotiation, ticket moved to need_adjustment.',
        })
        setShowRejectModal(false)
        // Reset form and errors
        setRejectReason('')
        setRejectCompetitorName('')
        setRejectCompetitorAmount('')
        setRejectCustomerBudget('')
        setRejectNotes('')
        setRejectFieldErrors({})
        setRejectModalError(null)
        fetchQuotation()
      } else {
        // Handle specific error codes with correlation_id
        const correlationMsg = result.correlation_id ? ` (ID: ${result.correlation_id})` : ''
        if (response.status === 403) {
          setRejectModalError(`Access denied: You do not have permission to reject this quotation.${correlationMsg}`)
          toast({
            title: 'Access Denied',
            description: `You do not have permission to reject this quotation.${correlationMsg}`,
            variant: 'destructive',
          })
        } else if (response.status === 409) {
          setRejectModalError(`State conflict: ${result.error || 'Quotation state changed'}. Please close and try again.${correlationMsg}`)
          toast({
            title: 'Conflict',
            description: `${result.error || 'State conflict detected'}. Please refresh and try again.${correlationMsg}`,
            variant: 'destructive',
          })
          // Don't auto-close on conflict - let user see the error
        } else if (response.status === 422 && result.field_errors) {
          // Handle field-level validation errors - display in modal fields
          setRejectFieldErrors(result.field_errors)
          setRejectModalError(`Please fix the validation errors above.${correlationMsg}`)
        } else if (response.status === 422) {
          // General validation error without field-level details
          setRejectModalError(`${result.error || 'Validation error'}${correlationMsg}`)
        } else {
          setRejectModalError(`${result.error || 'Failed to reject quotation'}${correlationMsg}`)
          toast({
            title: 'Error',
            description: `${result.error || 'Failed to reject quotation'}${correlationMsg}`,
            variant: 'destructive',
          })
        }
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject quotation',
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

  // Parse shipments - may be JSON string from database
  let shipments: any[] = []
  if (quotation.shipments) {
    try {
      shipments = typeof quotation.shipments === 'string'
        ? JSON.parse(quotation.shipments)
        : Array.isArray(quotation.shipments) ? quotation.shipments : []
    } catch {
      shipments = []
    }
  }
  const hasMultipleShipments = shipments.length > 1

  // Helper function to group items by shipment prefix
  const groupItemsByShipment = (itemsList: any[], shipmentsList: any[]): Map<number, { items: any[], subtotal: number, totalCost: number }> => {
    const itemsByShipment = new Map<number, { items: any[], subtotal: number, totalCost: number }>()
    shipmentsList.forEach((_, idx) => itemsByShipment.set(idx, { items: [], subtotal: 0, totalCost: 0 }))

    itemsList.forEach((item: any) => {
      const componentName = item.component_name || ''
      const shipmentMatch = componentName.match(/^Shipment\s*(\d+)\s*:\s*/i)
      if (shipmentMatch) {
        const shipmentIndex = parseInt(shipmentMatch[1]) - 1
        if (itemsByShipment.has(shipmentIndex)) {
          const cleanedItem = {
            ...item,
            component_name: componentName.replace(/^Shipment\s*\d+\s*:\s*/i, '')
          }
          const group = itemsByShipment.get(shipmentIndex)!
          group.items.push(cleanedItem)
          group.subtotal += item.selling_rate || 0
          group.totalCost += item.cost_amount || 0
        }
      }
    })
    return itemsByShipment
  }

  const itemsByShipment = hasMultipleShipments ? groupItemsByShipment(items, shipments) : null

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
              {isExpired(quotation.valid_until) && quotation.status !== QUOTATION_STATUS.ACCEPTED && (
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
          {quotation.status === QUOTATION_STATUS.DRAFT && (
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
                {actionLoading ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="mr-2 h-4 w-4" />
                )}
                WhatsApp
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSendEmail(false)}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
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
          {quotation.status === QUOTATION_STATUS.SENT && (
            <>
              <Button
                variant="outline"
                onClick={handleResendWhatsApp}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="mr-2 h-4 w-4" />
                )}
                Resend WhatsApp
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSendEmail(true)}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Resend Email
              </Button>
              <Button
                variant="outline"
                onClick={handleAcceptQuotation}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {actionLoading ? 'Processing...' : 'Mark Accepted'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRejectModal(true)}
                disabled={actionLoading}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Mark Rejected
              </Button>
            </>
          )}
          {quotation.status === QUOTATION_STATUS.ACCEPTED && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={actionLoading}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Revoke Acceptance
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke Quotation Acceptance</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will revoke the acceptance of this quotation. The pipeline will reopen
                    to Negotiation, the ticket will be reopened, and the account status may revert.
                    This action should only be used if the acceptance was made in error.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRevokeAcceptance} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Revoke
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {quotation.status === QUOTATION_STATUS.REJECTED && (
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
            {/* Total Amount - Show per-shipment for multi-shipment quotations */}
            {hasMultipleShipments ? (
              // Multi-shipment: show per-shipment rates
              // For breakdown: use itemsByShipment. For bundling: use shipment-level cost/selling data
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-3">
                  <Package className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold text-blue-700 dark:text-blue-300">
                    {shipments.length} Shipments
                  </span>
                </div>
                <div className="space-y-2">
                  {shipments.map((shipment: any, idx: number) => {
                    const group = itemsByShipment?.get(idx)
                    // Use items data if available (breakdown), otherwise use shipment-level data (bundling)
                    const calculatedTotal = (group && group.subtotal > 0) ? group.subtotal : (shipment.selling_rate || 0)
                    const calculatedCost = (group && group.totalCost > 0) ? group.totalCost : (shipment.cost_amount || 0)
                    const marginPercent = calculatedCost > 0
                      ? Math.round(((calculatedTotal - calculatedCost) / calculatedCost) * 100 * 100) / 100
                      : (shipment.margin_percent || 0)
                    return (
                      <div key={idx} className="p-3 bg-white dark:bg-gray-800 rounded-lg border">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">
                              {shipment.shipment_label || `Shipment ${idx + 1}`}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {shipment.origin_city || '-'} → {shipment.destination_city || '-'}
                            </p>
                          </div>
                          <p className="text-lg font-bold text-green-600 dark:text-green-400 font-mono">
                            {formatCurrency(calculatedTotal, quotation.currency)}
                          </p>
                        </div>
                        {/* Cost and Margin summary for this shipment */}
                        <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                          <span>Cost: <span className="font-mono">{formatCurrency(calculatedCost, quotation.currency)}</span></span>
                          <span>Margin: <span className="font-semibold text-blue-600">{marginPercent}%</span></span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              // Single shipment: show aggregate total
              <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Total Selling Rate</p>
                  <p className="text-3xl font-bold text-green-700 dark:text-green-400">
                    {formatCurrency(quotation.total_selling_rate, quotation.currency)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-600" />
              </div>
            )}

            {/* Cost & Margin - Only show for single shipment */}
            {!hasMultipleShipments && (
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
            )}

            {/* Breakdown Items */}
            {items.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="font-medium mb-3">Rate Breakdown</p>
                  {hasMultipleShipments && itemsByShipment ? (
                    // Multi-shipment: group items by shipment section
                    <div className="space-y-4">
                      {shipments.map((shipment: any, idx: number) => {
                        const group = itemsByShipment.get(idx)
                        if (!group || group.items.length === 0) return null
                        return (
                          <div key={idx} className="border rounded-lg overflow-hidden">
                            {/* Shipment Header */}
                            <div className="bg-blue-50 dark:bg-blue-900/30 px-4 py-3 border-b border-blue-200 dark:border-blue-800">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Package className="h-4 w-4 text-blue-600" />
                                  <span className="font-semibold text-blue-700 dark:text-blue-300">
                                    Shipment {idx + 1}
                                  </span>
                                </div>
                                <span className="text-sm text-blue-600 dark:text-blue-400">
                                  {shipment.origin_city || '-'} → {shipment.destination_city || '-'}
                                </span>
                              </div>
                            </div>
                            {/* Shipment Items */}
                            <div className="divide-y">
                              {group.items.map((item: any, itemIdx: number) => {
                                const itemMargin = item.cost_amount > 0
                                  ? Math.round(((item.selling_rate - item.cost_amount) / item.cost_amount) * 100 * 100) / 100
                                  : 0
                                return (
                                  <div key={item.id || itemIdx} className="p-3 bg-white dark:bg-gray-900">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <p className="font-medium">{item.component_name || item.component_type}</p>
                                        {item.description && (
                                          <p className="text-sm text-muted-foreground">{item.description}</p>
                                        )}
                                      </div>
                                      <p className="font-mono font-medium text-green-600">
                                        {formatCurrency(item.selling_rate, quotation.currency)}
                                      </p>
                                    </div>
                                    {/* Cost and Margin per item */}
                                    <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                                      <span>Cost: <span className="font-mono">{formatCurrency(item.cost_amount || 0, quotation.currency)}</span></span>
                                      <span>Margin: <span className="font-semibold text-blue-600">{itemMargin}%</span></span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            {/* Shipment Summary: Cost, Margin, Subtotal */}
                            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-t">
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Total Cost</span>
                                  <p className="font-mono font-medium">{formatCurrency(group.totalCost, quotation.currency)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Margin</span>
                                  <p className="font-semibold text-blue-600">
                                    {group.totalCost > 0
                                      ? Math.round(((group.subtotal - group.totalCost) / group.totalCost) * 100 * 100) / 100
                                      : 0}%
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="text-muted-foreground">Total Selling</span>
                                  <p className="font-bold font-mono text-green-600">{formatCurrency(group.subtotal, quotation.currency)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    // Single shipment: show flat list with cost and margin
                    <div className="space-y-2">
                      {items.map((item: any) => {
                        const itemMargin = item.cost_amount > 0
                          ? Math.round(((item.selling_rate - item.cost_amount) / item.cost_amount) * 100 * 100) / 100
                          : 0
                        return (
                          <div key={item.id} className="p-3 border rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{item.component_name || item.component_type}</p>
                                {item.description && (
                                  <p className="text-sm text-muted-foreground">{item.description}</p>
                                )}
                              </div>
                              <p className="font-mono font-medium text-green-600">
                                {formatCurrency(item.selling_rate, quotation.currency)}
                              </p>
                            </div>
                            {/* Cost and Margin per item */}
                            <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                              <span>Cost: <span className="font-mono">{formatCurrency(item.cost_amount || 0, quotation.currency)}</span></span>
                              <span>Margin: <span className="font-semibold text-blue-600">{itemMargin}%</span></span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
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

            {/* Route - supports multi-shipment */}
            {(quotation.origin_city || quotation.destination_city || (hasMultipleShipments && shipments.length > 0)) && (
              <>
                <Separator />
                <div>
                  <p className="font-medium mb-3 flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    Route
                  </p>
                  {hasMultipleShipments ? (
                    <div className="space-y-3">
                      {shipments.map((shipment: any, idx: number) => (
                        <div key={idx} className="p-3 border rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <Package className="h-4 w-4 text-blue-600" />
                            <span className="font-medium text-blue-700 dark:text-blue-300">
                              {shipment.shipment_label || `Shipment ${idx + 1}`}
                            </span>
                            {shipment.service_type_code && (
                              <Badge variant="outline" className="text-xs">{shipment.service_type_code}</Badge>
                            )}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="p-2 bg-muted/50 rounded">
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-green-600" />
                                Origin
                              </p>
                              <p className="font-medium text-sm">{shipment.origin_city || '—'}</p>
                              {shipment.origin_country && (
                                <p className="text-xs text-muted-foreground">{shipment.origin_country}</p>
                              )}
                            </div>
                            <div className="p-2 bg-muted/50 rounded">
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-red-600" />
                                Destination
                              </p>
                              <p className="font-medium text-sm">{shipment.destination_city || '—'}</p>
                              {shipment.destination_country && (
                                <p className="text-xs text-muted-foreground">{shipment.destination_country}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
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
                  )}
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
              {quotation.status === 'accepted' && quotation.accepted_at && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Accepted At</p>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-green-700 font-medium">{formatDateTime(quotation.accepted_at)}</span>
                  </div>
                </div>
              )}
              {quotation.status === 'rejected' && quotation.rejected_at && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Rejected At</p>
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive font-medium">{formatDateTime(quotation.rejected_at)}</span>
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

      {/* Rejection Reason Modal */}
      <Dialog open={showRejectModal} onOpenChange={(open) => {
        setShowRejectModal(open)
        if (!open) {
          // Clear all form state when closing
          setRejectFieldErrors({})
          setRejectModalError(null)
          setRejectReason('')
          setRejectCompetitorName('')
          setRejectCompetitorAmount('')
          setRejectCustomerBudget('')
          setRejectNotes('')
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Reject Quotation</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this quotation. This information will be used for analytics and improvement.
            </DialogDescription>
          </DialogHeader>

          {/* Modal-level error banner */}
          {rejectModalError && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-md p-3 text-sm">
              {rejectModalError}
            </div>
          )}

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reject-reason" className={rejectFieldErrors.reason_type ? 'text-destructive' : ''}>
                Rejection Reason *
              </Label>
              <Select value={rejectReason} onValueChange={(value) => {
                setRejectReason(value)
                // Clear field error when user selects
                if (rejectFieldErrors.reason_type) {
                  setRejectFieldErrors(prev => ({ ...prev, reason_type: '' }))
                }
              }}>
                <SelectTrigger id="reject-reason" className={rejectFieldErrors.reason_type ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {rejectionReasonOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {rejectFieldErrors.reason_type && (
                <p className="text-xs text-destructive">{rejectFieldErrors.reason_type}</p>
              )}
            </div>

            {rejectReason === 'kompetitor_lebih_murah' && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="competitor-name">Competitor Name</Label>
                  <Input
                    id="competitor-name"
                    placeholder="Enter competitor name"
                    value={rejectCompetitorName}
                    onChange={(e) => {
                      setRejectCompetitorName(e.target.value)
                      if (rejectFieldErrors.competitor_name) {
                        setRejectFieldErrors(prev => ({ ...prev, competitor_name: '' }))
                      }
                    }}
                    className={rejectFieldErrors.competitor_name ? 'border-destructive' : ''}
                  />
                  {rejectFieldErrors.competitor_name && (
                    <p className="text-xs text-destructive">{rejectFieldErrors.competitor_name}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="competitor-amount" className={rejectFieldErrors.competitor_amount ? 'text-destructive' : ''}>
                    Competitor Price (IDR) *
                  </Label>
                  <Input
                    id="competitor-amount"
                    type="number"
                    placeholder="Enter competitor price"
                    value={rejectCompetitorAmount}
                    onChange={(e) => {
                      setRejectCompetitorAmount(e.target.value)
                      if (rejectFieldErrors.competitor_amount) {
                        setRejectFieldErrors(prev => ({ ...prev, competitor_amount: '' }))
                      }
                    }}
                    className={rejectFieldErrors.competitor_amount ? 'border-destructive' : ''}
                  />
                  {rejectFieldErrors.competitor_amount ? (
                    <p className="text-xs text-destructive">{rejectFieldErrors.competitor_amount}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">At least competitor name or price is required</p>
                  )}
                </div>
              </>
            )}

            {rejectReason === 'budget_customer_tidak_cukup' && (
              <div className="grid gap-2">
                <Label htmlFor="customer-budget" className={rejectFieldErrors.customer_budget ? 'text-destructive' : ''}>
                  Customer Budget (IDR) *
                </Label>
                <Input
                  id="customer-budget"
                  type="number"
                  placeholder="Enter customer budget"
                  value={rejectCustomerBudget}
                  onChange={(e) => {
                    setRejectCustomerBudget(e.target.value)
                    if (rejectFieldErrors.customer_budget) {
                      setRejectFieldErrors(prev => ({ ...prev, customer_budget: '' }))
                    }
                  }}
                  className={rejectFieldErrors.customer_budget ? 'border-destructive' : ''}
                />
                {rejectFieldErrors.customer_budget ? (
                  <p className="text-xs text-destructive">{rejectFieldErrors.customer_budget}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Required for this reason</p>
                )}
              </div>
            )}

            {rejectReason === 'tarif_tidak_masuk' && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="competitor-amount-tarif" className={rejectFieldErrors.competitor_amount ? 'text-destructive' : ''}>
                    Competitor Price (IDR)
                  </Label>
                  <Input
                    id="competitor-amount-tarif"
                    type="number"
                    placeholder="Enter competitor price"
                    value={rejectCompetitorAmount}
                    onChange={(e) => {
                      setRejectCompetitorAmount(e.target.value)
                      if (rejectFieldErrors.competitor_amount) {
                        setRejectFieldErrors(prev => ({ ...prev, competitor_amount: '' }))
                      }
                    }}
                    className={rejectFieldErrors.competitor_amount ? 'border-destructive' : ''}
                  />
                  {rejectFieldErrors.competitor_amount && (
                    <p className="text-xs text-destructive">{rejectFieldErrors.competitor_amount}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="customer-budget-tarif" className={rejectFieldErrors.customer_budget ? 'text-destructive' : ''}>
                    Customer Budget (IDR)
                  </Label>
                  <Input
                    id="customer-budget-tarif"
                    type="number"
                    placeholder="Enter customer budget"
                    value={rejectCustomerBudget}
                    onChange={(e) => {
                      setRejectCustomerBudget(e.target.value)
                      if (rejectFieldErrors.customer_budget) {
                        setRejectFieldErrors(prev => ({ ...prev, customer_budget: '' }))
                      }
                    }}
                    className={rejectFieldErrors.customer_budget ? 'border-destructive' : ''}
                  />
                  {rejectFieldErrors.customer_budget && (
                    <p className="text-xs text-destructive">{rejectFieldErrors.customer_budget}</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Either competitor price or customer budget is required</p>
              </>
            )}

            <div className="grid gap-2">
              <Label htmlFor="reject-notes">Additional Notes</Label>
              <Textarea
                id="reject-notes"
                placeholder="Enter any additional notes or details"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectModal(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectWithReason}
              disabled={actionLoading || !rejectReason}
            >
              {actionLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                'Reject Quotation'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline Update Confirmation Dialog */}
      <AlertDialog open={showPipelineUpdateDialog} onOpenChange={setShowPipelineUpdateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Pipeline Status?</AlertDialogTitle>
            <AlertDialogDescription>
              Quotation sent to customer. Would you like to update the pipeline stage to &quot;Quote Sent&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleSkipPipelineUpdate} disabled={pipelineUpdateLoading}>
              No, Skip
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdatePipelineToQuoteSent} disabled={pipelineUpdateLoading}>
              {pipelineUpdateLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Yes, Update Pipeline'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
