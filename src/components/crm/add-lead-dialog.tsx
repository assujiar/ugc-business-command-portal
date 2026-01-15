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
  DOMESTICS_SERVICE_CODES,
  EXIM_SERVICE_CODES,
  FLEET_TYPES,
  INCOTERMS,
  CARGO_CATEGORIES,
  UNITS_OF_MEASURE,
  ADDITIONAL_SERVICES,
  COUNTRIES,
} from '@/lib/constants'
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

interface ShipmentData {
  service_type_code: string
  fleet_type: string
  fleet_quantity: number
  incoterm: string
  cargo_category: string
  cargo_description: string
  origin_address: string
  origin_city: string
  origin_country: string
  destination_address: string
  destination_city: string
  destination_country: string
  quantity: number
  unit_of_measure: string
  weight_per_unit_kg: number | null
  weight_total_kg: number | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  volume_total_cbm: number | null
  scope_of_work: string
  additional_services: string[]
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

  const [shipmentData, setShipmentData] = React.useState<ShipmentData>({
    service_type_code: '',
    fleet_type: '',
    fleet_quantity: 1,
    incoterm: '',
    cargo_category: 'General Cargo',
    cargo_description: '',
    origin_address: '',
    origin_city: '',
    origin_country: 'Indonesia',
    destination_address: '',
    destination_city: '',
    destination_country: 'Indonesia',
    quantity: 1,
    unit_of_measure: 'Boxes',
    weight_per_unit_kg: null,
    weight_total_kg: null,
    length_cm: null,
    width_cm: null,
    height_cm: null,
    volume_total_cbm: null,
    scope_of_work: '',
    additional_services: [],
  })

  // Ref to always have latest shipmentData (avoid stale closure in handleSubmit)
  const shipmentDataRef = React.useRef<ShipmentData>(shipmentData)
  React.useEffect(() => {
    shipmentDataRef.current = shipmentData
  }, [shipmentData])

  // Check if selected service is domestics (shows fleet)
  const isDomesticsService = DOMESTICS_SERVICE_CODES.includes(
    shipmentData.service_type_code as any
  )

  // Check if selected service is export/import (shows incoterms)
  const isEximService = EXIM_SERVICE_CODES.includes(
    shipmentData.service_type_code as any
  )

  // Get department for selected service
  const selectedService = SERVICE_TYPES.find(
    (s) => s.code === shipmentData.service_type_code
  )

  // Auto-calculate weight total
  React.useEffect(() => {
    if (shipmentData.quantity && shipmentData.weight_per_unit_kg) {
      const total = shipmentData.quantity * shipmentData.weight_per_unit_kg
      setShipmentData((prev) => ({ ...prev, weight_total_kg: total }))
    } else {
      setShipmentData((prev) => ({ ...prev, weight_total_kg: null }))
    }
  }, [shipmentData.quantity, shipmentData.weight_per_unit_kg])

  // Auto-calculate volume in CBM
  React.useEffect(() => {
    if (
      shipmentData.length_cm &&
      shipmentData.width_cm &&
      shipmentData.height_cm &&
      shipmentData.quantity
    ) {
      const volumeCbm =
        (shipmentData.length_cm *
          shipmentData.width_cm *
          shipmentData.height_cm *
          shipmentData.quantity) /
        1000000
      setShipmentData((prev) => ({
        ...prev,
        volume_total_cbm: Math.round(volumeCbm * 10000) / 10000,
      }))
    } else {
      setShipmentData((prev) => ({ ...prev, volume_total_cbm: null }))
    }
  }, [
    shipmentData.length_cm,
    shipmentData.width_cm,
    shipmentData.height_cm,
    shipmentData.quantity,
  ])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      setAttachments((prev) => [...prev, ...newFiles])
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAdditionalServiceToggle = (serviceCode: string) => {
    setShipmentData((prev) => ({
      ...prev,
      additional_services: prev.additional_services.includes(serviceCode)
        ? prev.additional_services.filter((s) => s !== serviceCode)
        : [...prev.additional_services, serviceCode],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Use ref to get latest shipmentData (avoid stale closure)
      const currentShipmentData = shipmentDataRef.current

      // Get current selected service for department
      const currentSelectedService = SERVICE_TYPES.find(
        (s) => s.code === currentShipmentData.service_type_code
      )

      // Prepare shipment data if enabled
      const shipment = showShipmentDetails
        ? {
            ...currentShipmentData,
            department: currentSelectedService?.department || null,
          }
        : null

      // If source is "Lainnya", use custom_source as source_detail
      const submitData = {
        ...formData,
        industry: formData.industry || null,
        source_detail: formData.source === 'Lainnya'
          ? formData.custom_source || null
          : formData.source_detail || null,
        shipment_details: shipment,
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
      setShipmentData({
        service_type_code: '',
        fleet_type: '',
        fleet_quantity: 1,
        incoterm: '',
        cargo_category: 'General Cargo',
        cargo_description: '',
        origin_address: '',
        origin_city: '',
        origin_country: 'Indonesia',
        destination_address: '',
        destination_city: '',
        destination_country: 'Indonesia',
        quantity: 1,
        unit_of_measure: 'Boxes',
        weight_per_unit_kg: null,
        weight_total_kg: null,
        length_cm: null,
        width_cm: null,
        height_cm: null,
        volume_total_cbm: null,
        scope_of_work: '',
        additional_services: [],
      })
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

  // Group services by department for the dropdown
  const domesticsServices = SERVICE_TYPES.filter(
    (s) => s.department === 'Domestics Operations'
  )
  const eximServices = SERVICE_TYPES.filter(
    (s) => s.department === 'Exim Operations'
  )
  const dtdServices = SERVICE_TYPES.filter(
    (s) => s.department === 'Import DTD Operations'
  )

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
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              Company Information
            </h4>

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
          </div>

          {/* Contact Person */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              Contact Person (PIC)
            </h4>

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
          </div>

          {/* Lead Details */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              Lead Details
            </h4>

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
          </div>

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

          {/* Shipment Details Section */}
          {showShipmentDetails && (
            <div className="space-y-6 border rounded-lg p-4 bg-muted/30">
              {/* Service Type */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Service Information</h4>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="service_type">Service Type</Label>
                    <Select
                      value={shipmentData.service_type_code}
                      onValueChange={(value) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          service_type_code: value,
                          fleet_type: '',
                          incoterm: '',
                        }))
                      }
                    >
                      <SelectTrigger id="service_type">
                        <SelectValue placeholder="Select service type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Domestics Operations</SelectLabel>
                          {domesticsServices.map((service) => (
                            <SelectItem key={service.code} value={service.code}>
                              {service.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Exim Operations</SelectLabel>
                          {eximServices.map((service) => (
                            <SelectItem key={service.code} value={service.code}>
                              {service.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Import DTD Operations</SelectLabel>
                          {dtdServices.map((service) => (
                            <SelectItem key={service.code} value={service.code}>
                              {service.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {selectedService && (
                      <p className="text-xs text-muted-foreground">
                        Department: {selectedService.department}
                      </p>
                    )}
                  </div>

                  {/* Fleet Type (only for Domestics) */}
                  {isDomesticsService && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="fleet_type">Fleet Requirement</Label>
                        <Select
                          value={shipmentData.fleet_type}
                          onValueChange={(value) =>
                            setShipmentData((prev) => ({ ...prev, fleet_type: value }))
                          }
                        >
                          <SelectTrigger id="fleet_type">
                            <SelectValue placeholder="Select fleet type" />
                          </SelectTrigger>
                          <SelectContent>
                            {FLEET_TYPES.map((fleet) => (
                              <SelectItem key={fleet} value={fleet}>
                                {fleet}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fleet_quantity">Fleet Quantity</Label>
                        <Input
                          id="fleet_quantity"
                          type="number"
                          min="1"
                          value={shipmentData.fleet_quantity}
                          onChange={(e) =>
                            setShipmentData((prev) => ({
                              ...prev,
                              fleet_quantity: parseInt(e.target.value) || 1,
                            }))
                          }
                          placeholder="Enter quantity"
                        />
                      </div>
                    </>
                  )}

                  {/* Incoterms (only for Export/Import) */}
                  {isEximService && (
                    <div className="space-y-2">
                      <Label htmlFor="incoterm">Incoterms</Label>
                      <Select
                        value={shipmentData.incoterm}
                        onValueChange={(value) =>
                          setShipmentData((prev) => ({ ...prev, incoterm: value }))
                        }
                      >
                        <SelectTrigger id="incoterm">
                          <SelectValue placeholder="Select incoterm" />
                        </SelectTrigger>
                        <SelectContent>
                          {INCOTERMS.map((term) => (
                            <SelectItem key={term.code} value={term.code}>
                              {term.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>

              {/* Cargo Information */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Cargo Information</h4>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cargo_category">Cargo Category</Label>
                    <Select
                      value={shipmentData.cargo_category}
                      onValueChange={(value) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          cargo_category: value,
                        }))
                      }
                    >
                      <SelectTrigger id="cargo_category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CARGO_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="cargo_description">Cargo Description</Label>
                    <Textarea
                      id="cargo_description"
                      value={shipmentData.cargo_description}
                      onChange={(e) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          cargo_description: e.target.value,
                        }))
                      }
                      placeholder="Describe the cargo..."
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* Origin & Destination */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Origin & Destination</h4>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Origin */}
                  <div className="space-y-3 p-3 border rounded-md">
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      Origin
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="origin_address">Address</Label>
                      <Input
                        id="origin_address"
                        value={shipmentData.origin_address}
                        onChange={(e) =>
                          setShipmentData((prev) => ({
                            ...prev,
                            origin_address: e.target.value,
                          }))
                        }
                        placeholder="Street address"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="origin_city">City</Label>
                      <Input
                        id="origin_city"
                        value={shipmentData.origin_city}
                        onChange={(e) =>
                          setShipmentData((prev) => ({
                            ...prev,
                            origin_city: e.target.value,
                          }))
                        }
                        placeholder="City"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="origin_country">Country</Label>
                      <Select
                        value={shipmentData.origin_country}
                        onValueChange={(value) =>
                          setShipmentData((prev) => ({
                            ...prev,
                            origin_country: value,
                          }))
                        }
                      >
                        <SelectTrigger id="origin_country">
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRIES.map((country) => (
                            <SelectItem key={country} value={country}>
                              {country}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Destination */}
                  <div className="space-y-3 p-3 border rounded-md">
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      Destination
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="destination_address">Address</Label>
                      <Input
                        id="destination_address"
                        value={shipmentData.destination_address}
                        onChange={(e) =>
                          setShipmentData((prev) => ({
                            ...prev,
                            destination_address: e.target.value,
                          }))
                        }
                        placeholder="Street address"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="destination_city">City</Label>
                      <Input
                        id="destination_city"
                        value={shipmentData.destination_city}
                        onChange={(e) =>
                          setShipmentData((prev) => ({
                            ...prev,
                            destination_city: e.target.value,
                          }))
                        }
                        placeholder="City"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="destination_country">Country</Label>
                      <Select
                        value={shipmentData.destination_country}
                        onValueChange={(value) =>
                          setShipmentData((prev) => ({
                            ...prev,
                            destination_country: value,
                          }))
                        }
                      >
                        <SelectTrigger id="destination_country">
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRIES.map((country) => (
                            <SelectItem key={country} value={country}>
                              {country}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quantity & Dimensions */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Quantity & Dimensions</h4>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity (Koli)</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      value={shipmentData.quantity}
                      onChange={(e) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          quantity: parseInt(e.target.value) || 1,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="unit_of_measure">Unit of Measure</Label>
                    <Select
                      value={shipmentData.unit_of_measure}
                      onValueChange={(value) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          unit_of_measure: value,
                        }))
                      }
                    >
                      <SelectTrigger id="unit_of_measure">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS_OF_MEASURE.map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="weight_per_unit">Weight/Unit (Kg)</Label>
                    <Input
                      id="weight_per_unit"
                      type="number"
                      step="0.01"
                      min="0"
                      value={shipmentData.weight_per_unit_kg ?? ''}
                      onChange={(e) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          weight_per_unit_kg: e.target.value
                            ? parseFloat(e.target.value)
                            : null,
                        }))
                      }
                      placeholder="Gross weight"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="length_cm">Length (cm)</Label>
                    <Input
                      id="length_cm"
                      type="number"
                      step="0.01"
                      min="0"
                      value={shipmentData.length_cm ?? ''}
                      onChange={(e) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          length_cm: e.target.value
                            ? parseFloat(e.target.value)
                            : null,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="width_cm">Width (cm)</Label>
                    <Input
                      id="width_cm"
                      type="number"
                      step="0.01"
                      min="0"
                      value={shipmentData.width_cm ?? ''}
                      onChange={(e) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          width_cm: e.target.value
                            ? parseFloat(e.target.value)
                            : null,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="height_cm">Height (cm)</Label>
                    <Input
                      id="height_cm"
                      type="number"
                      step="0.01"
                      min="0"
                      value={shipmentData.height_cm ?? ''}
                      onChange={(e) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          height_cm: e.target.value
                            ? parseFloat(e.target.value)
                            : null,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Total Volume (CBM)</Label>
                    <Input
                      value={
                        shipmentData.volume_total_cbm !== null
                          ? shipmentData.volume_total_cbm.toFixed(4)
                          : '-'
                      }
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Total Weight (Kg)</Label>
                    <Input
                      value={
                        shipmentData.weight_total_kg !== null
                          ? shipmentData.weight_total_kg.toFixed(2)
                          : '-'
                      }
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">
                      Auto-calculated: Quantity x Weight/Unit
                    </p>
                  </div>
                </div>
              </div>

              {/* Scope of Work */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Scope of Work</h4>
                <Textarea
                  id="scope_of_work"
                  value={shipmentData.scope_of_work}
                  onChange={(e) =>
                    setShipmentData((prev) => ({
                      ...prev,
                      scope_of_work: e.target.value,
                    }))
                  }
                  placeholder="Detail pekerjaan dan kebutuhan..."
                  rows={3}
                />
              </div>

              {/* Additional Services */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Additional Services</h4>
                <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {ADDITIONAL_SERVICES.map((service) => (
                    <div
                      key={service.code}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`service-${service.code}`}
                        checked={shipmentData.additional_services.includes(
                          service.code
                        )}
                        onCheckedChange={() =>
                          handleAdditionalServiceToggle(service.code)
                        }
                      />
                      <Label
                        htmlFor={`service-${service.code}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {service.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Attachments */}
              <div className="space-y-4">
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
