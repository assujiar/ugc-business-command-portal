// =====================================================
// Add Lead Dialog - Quick Add Lead Form with Shipment Details
// SOURCE: PDF Section 7 - UI Components (AddLeadForm)
// =====================================================

'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Upload, X, ChevronDown, ChevronUp, CheckCircle, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  LEAD_SOURCES,
  INDUSTRIES,
  PRIORITY_LEVELS,
  SERVICE_TYPES,
} from '@/lib/constants'
import { MultiShipmentForm } from '@/components/shared/multi-shipment-form'
import { ShipmentDetail, createEmptyShipment } from '@/types/shipment'
import { FormSection } from '@/components/ui/form-section'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'

interface AddLeadDialogProps {
  trigger?: React.ReactNode
}

interface CreatedLead {
  lead_id: string
  company_name: string
}

export function AddLeadDialog({ trigger }: AddLeadDialogProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [showShipmentDetails, setShowShipmentDetails] = React.useState(false)
  const [attachments, setAttachments] = React.useState<File[]>([])
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [successDialogOpen, setSuccessDialogOpen] = React.useState(false)
  const [createdLead, setCreatedLead] = React.useState<CreatedLead | null>(null)

  const [formData, setFormData] = React.useState({
    company_name: '',
    pic_name: '',
    pic_email: '',
    pic_phone: '',
    industry: '',
    source: 'Webform (SEM)' as string,
    source_detail: '',
    custom_source: '',
    priority: 2,
    inquiry_text: '',
  })

  // Multi-shipment state
  const [shipments, setShipments] = React.useState<ShipmentDetail[]>([])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      setAttachments((prev) => [...prev, ...newFiles])
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Prepare shipment data with department info
      const shipmentsWithDept = showShipmentDetails && shipments.length > 0
        ? shipments.map(s => {
            const service = SERVICE_TYPES.find(st => st.code === s.service_type_code)
            return {
              ...s,
              department: service?.department || null,
            }
          })
        : null

      // If source is "Lainnya", use custom_source as source_detail
      const submitData = {
        ...formData,
        industry: formData.industry || null,
        source_detail: formData.source === 'Lainnya'
          ? formData.custom_source || null
          : formData.source_detail || null,
        shipment_details: shipmentsWithDept, // Array of shipments
      }
      // Remove custom_source from submission (it's stored in source_detail)
      const { custom_source: _, ...dataToSubmit } = submitData

      const response = await fetch('/api/crm/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSubmit),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create lead')
      }

      const result = await response.json()

      // Upload attachments if any
      if (attachments.length > 0 && result.data?.lead_id) {
        const formDataFiles = new FormData()
        attachments.forEach((file) => {
          formDataFiles.append('files', file)
        })
        formDataFiles.append('lead_id', result.data.lead_id)

        await fetch('/api/crm/leads/attachments', {
          method: 'POST',
          body: formDataFiles,
        })
      }

      // Store created lead info for success dialog
      setCreatedLead({
        lead_id: result.data.lead_id,
        company_name: formData.company_name,
      })

      // Show success toast notification
      toast.success(
        'Lead berhasil dibuat',
        `${formData.company_name} telah ditambahkan ke Lead Inbox`
      )

      // Reset form
      setFormData({
        company_name: '',
        pic_name: '',
        pic_email: '',
        pic_phone: '',
        industry: '',
        source: 'Webform (SEM)',
        source_detail: '',
        custom_source: '',
        priority: 2,
        inquiry_text: '',
      })
      setShipments([])
      setAttachments([])
      setShowShipmentDetails(false)
      setOpen(false)

      // Show success dialog
      setSuccessDialogOpen(true)
      router.refresh()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      toast.error('Gagal membuat lead', errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[800px] max-h-[90vh] overflow-y-auto p-4 lg:p-6">
        <DialogHeader>
          <DialogTitle className="text-base lg:text-lg">Add New Lead</DialogTitle>
          <DialogDescription className="text-xs lg:text-sm">
            Create a new lead for marketing triage. The lead will appear in the
            Lead Inbox.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company Information */}
          <FormSection variant="company" title="Company Information" glass>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company_name">
                  Company Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="company_name"
                  value={formData.company_name}
                  onChange={(e) =>
                    setFormData({ ...formData, company_name: e.target.value })
                  }
                  placeholder="PT. Example Indonesia"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Select
                  value={formData.industry}
                  onValueChange={(value) =>
                    setFormData({ ...formData, industry: value })
                  }
                >
                  <SelectTrigger id="industry">
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((industry) => (
                      <SelectItem key={industry} value={industry}>
                        {industry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </FormSection>

          {/* Contact Person */}
          <FormSection variant="contact" title="Contact Person (PIC)" glass>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pic_name">Name</Label>
                <Input
                  id="pic_name"
                  value={formData.pic_name}
                  onChange={(e) =>
                    setFormData({ ...formData, pic_name: e.target.value })
                  }
                  placeholder="John Doe"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pic_phone">Phone</Label>
                <Input
                  id="pic_phone"
                  type="tel"
                  value={formData.pic_phone}
                  onChange={(e) =>
                    setFormData({ ...formData, pic_phone: e.target.value })
                  }
                  placeholder="+62 812 3456 7890"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pic_email">Email</Label>
                <Input
                  id="pic_email"
                  type="email"
                  value={formData.pic_email}
                  onChange={(e) =>
                    setFormData({ ...formData, pic_email: e.target.value })
                  }
                  placeholder="john.doe@example.com"
                />
              </div>
            </div>
          </FormSection>

          {/* Lead Details */}
          <FormSection variant="lead" title="Lead Details" glass>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="source">
                  Source <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.source}
                  onValueChange={(value) => setFormData({ ...formData, source: value, custom_source: '' })}
                >
                  <SelectTrigger id="source">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority.toString()}
                  onValueChange={(value) =>
                    setFormData({ ...formData, priority: parseInt(value) })
                  }
                >
                  <SelectTrigger id="priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_LEVELS.map((level) => (
                      <SelectItem
                        key={level.value}
                        value={level.value.toString()}
                      >
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.source === 'Lainnya' && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="custom_source">
                    Sumber Lainnya <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="custom_source"
                    value={formData.custom_source}
                    onChange={(e) => setFormData({ ...formData, custom_source: e.target.value })}
                    placeholder="Masukkan sumber lead..."
                    required
                  />
                </div>
              )}

              {formData.source !== 'Lainnya' && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="source_detail">Source Detail</Label>
                  <Input
                    id="source_detail"
                    value={formData.source_detail}
                    onChange={(e) => setFormData({ ...formData, source_detail: e.target.value })}
                    placeholder="e.g., Trade Show 2024"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="inquiry_text">Inquiry / Notes</Label>
              <Textarea
                id="inquiry_text"
                value={formData.inquiry_text}
                onChange={(e) =>
                  setFormData({ ...formData, inquiry_text: e.target.value })
                }
                placeholder="Describe the lead's inquiry or any relevant notes..."
                rows={3}
              />
            </div>
          </FormSection>

          {/* Shipment Details Toggle */}
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowShipmentDetails(!showShipmentDetails)}
              className="w-full justify-between"
            >
              <span className="flex items-center">
                <Plus className="h-4 w-4 mr-2" />
                Shipment Details
              </span>
              {showShipmentDetails ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Shipment Details Section - Multi-Shipment Form */}
          {showShipmentDetails && (
            <div className="animate-slide-in-up">
              <MultiShipmentForm
                shipments={shipments}
                onChange={setShipments}
                maxShipments={10}
              />

              {/* Attachments */}
              <div className="space-y-4 mt-6 border rounded-lg p-4 bg-muted/30">
                <h4 className="text-sm font-medium">Attachments</h4>
                <div className="space-y-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    multiple
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Files
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Supported: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG
                  </p>

                  {attachments.length > 0 && (
                    <div className="space-y-2">
                      {attachments.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 border rounded-md text-sm"
                        >
                          <span className="truncate max-w-[200px]">
                            {file.name}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAttachment(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    {/* Success Dialog */}
    <AlertDialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Lead Berhasil Dibuat
          </AlertDialogTitle>
          <AlertDialogDescription>
            Lead <span className="font-medium">{createdLead?.company_name}</span> telah berhasil dibuat dan masuk ke Lead Inbox untuk ditriage.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              setSuccessDialogOpen(false)
              setCreatedLead(null)
            }}
          >
            Tutup
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setSuccessDialogOpen(false)
              // Emit event to trigger view detail dialog
              if (createdLead?.lead_id) {
                window.dispatchEvent(new CustomEvent('viewLeadDetail', {
                  detail: { leadId: createdLead.lead_id }
                }))
              }
              setCreatedLead(null)
            }}
          >
            <Eye className="h-4 w-4 mr-2" />
            Lihat Detail
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
