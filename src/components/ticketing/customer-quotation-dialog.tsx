'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  X,
  Plus,
  Trash2,
  FileText,
  Send,
  MessageSquare,
  Mail,
  Download,
  Eye,
  ChevronDown,
  ChevronUp,
  Building2,
  MapPin,
  Package,
  DollarSign,
  CheckSquare,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
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
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { RATE_COMPONENTS, RATE_COMPONENTS_BY_CATEGORY, getRateComponentLabel } from '@/lib/constants/rate-components'

interface CustomerQuotationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticketId: string
  ticketData: {
    ticket_code: string
    subject: string
    rfq_data?: any
    account?: {
      company_name?: string
      address?: string
      city?: string
      country?: string
    }
    contact?: {
      first_name?: string
      last_name?: string
      email?: string
      phone?: string
    }
  }
  operationalCost?: {
    amount: number
    currency: string
  }
  onSuccess?: () => void
}

interface QuotationItem {
  id: string
  component_type: string
  component_name: string
  description: string
  cost_amount: number
  target_margin_percent: number
  selling_rate: number
  quantity: number | null
  unit: string | null
}

interface TermTemplate {
  id: string
  term_text: string
  term_type: 'include' | 'exclude'
  is_default: boolean
}

// Incoterms for logistics
const INCOTERMS = [
  'EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP',
  'FAS', 'FOB', 'CFR', 'CIF',
]

// Service types (matching shipment details)
const SERVICE_TYPES = [
  // Domestics Operations
  { value: 'LTL', label: 'LTL (Less Than Truckload)', department: 'Domestics Operations' },
  { value: 'FTL', label: 'FTL (Full Truckload)', department: 'Domestics Operations' },
  { value: 'AF', label: 'AF (Air Freight Domestic)', department: 'Domestics Operations' },
  { value: 'LCL', label: 'LCL (Less Container Load)', department: 'Domestics Operations' },
  { value: 'FCL', label: 'FCL (Full Container Load)', department: 'Domestics Operations' },
  { value: 'WAREHOUSING', label: 'Warehousing', department: 'Domestics Operations' },
  { value: 'FULFILLMENT', label: 'Fulfillment', department: 'Domestics Operations' },
  // Exim Operations
  { value: 'LCL Export', label: 'LCL Export', department: 'Exim Operations' },
  { value: 'FCL Export', label: 'FCL Export', department: 'Exim Operations' },
  { value: 'Airfreight Export', label: 'Airfreight Export', department: 'Exim Operations' },
  { value: 'LCL Import', label: 'LCL Import', department: 'Exim Operations' },
  { value: 'FCL Import', label: 'FCL Import', department: 'Exim Operations' },
  { value: 'Airfreight Import', label: 'Airfreight Import', department: 'Exim Operations' },
  { value: 'Customs Clearance', label: 'Customs Clearance', department: 'Exim Operations' },
  // Import DTD Operations
  { value: 'LCL DTD', label: 'LCL DTD (Door to Door)', department: 'Import DTD Operations' },
  { value: 'FCL DTD', label: 'FCL DTD (Door to Door)', department: 'Import DTD Operations' },
  { value: 'Airfreight DTD', label: 'Airfreight DTD (Door to Door)', department: 'Import DTD Operations' },
]

// Group service types by department
const SERVICE_TYPES_BY_DEPARTMENT = SERVICE_TYPES.reduce((acc, type) => {
  if (!acc[type.department]) {
    acc[type.department] = []
  }
  acc[type.department].push(type)
  return acc
}, {} as Record<string, typeof SERVICE_TYPES>)

// Fleet types (matching shipment details)
const FLEET_TYPES = [
  'Blindvan',
  'Pickup',
  'CDE Box',
  'CDE Bak',
  'CDD Box',
  'CDD Bak',
  'CDD Long',
  'CDD Refer',
  'Fuso Box',
  'Fuso Bak',
  'TWB',
  'Trailer 20 Feet',
  'Trailer 40 Feet',
  'Flatbed',
  'Lainnya',
]

// Currency options
const CURRENCIES = ['IDR', 'USD', 'SGD', 'EUR', 'CNY', 'JPY']

export function CustomerQuotationDialog({
  open,
  onOpenChange,
  ticketId,
  ticketData,
  operationalCost,
  onSuccess,
}: CustomerQuotationDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [activeSection, setActiveSection] = useState<string>('customer')

  // Customer data
  const [customerName, setCustomerName] = useState('')
  const [customerCompany, setCustomerCompany] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')

  // Service data
  const [serviceType, setServiceType] = useState('')
  const [incoterm, setIncoterm] = useState('')
  const [fleetType, setFleetType] = useState('')
  const [fleetQuantity, setFleetQuantity] = useState(1)
  const [commodity, setCommodity] = useState('')

  // Origin/Destination
  const [originAddress, setOriginAddress] = useState('')
  const [originCity, setOriginCity] = useState('')
  const [originCountry, setOriginCountry] = useState('')
  const [originPort, setOriginPort] = useState('')
  const [destinationAddress, setDestinationAddress] = useState('')
  const [destinationCity, setDestinationCity] = useState('')
  const [destinationCountry, setDestinationCountry] = useState('')
  const [destinationPort, setDestinationPort] = useState('')

  // Cargo details
  const [cargoDescription, setCargoDescription] = useState('')
  const [cargoWeight, setCargoWeight] = useState<number | null>(null)
  const [cargoWeightUnit, setCargoWeightUnit] = useState('kg')
  const [cargoVolume, setCargoVolume] = useState<number | null>(null)
  const [cargoVolumeUnit, setCargoVolumeUnit] = useState('cbm')
  const [cargoQuantity, setCargoQuantity] = useState<number | null>(null)
  const [cargoQuantityUnit, setCargoQuantityUnit] = useState('units')

  // Rate structure
  const [rateStructure, setRateStructure] = useState<'bundling' | 'breakdown'>('bundling')
  const [totalCost, setTotalCost] = useState(0)
  const [targetMarginPercent, setTargetMarginPercent] = useState(15)
  const [currency, setCurrency] = useState('IDR')
  const [items, setItems] = useState<QuotationItem[]>([])

  // Terms
  const [scopeOfWork, setScopeOfWork] = useState('')
  const [termsIncludes, setTermsIncludes] = useState<string[]>([])
  const [termsExcludes, setTermsExcludes] = useState<string[]>([])
  const [termsNotes, setTermsNotes] = useState('')
  const [validityDays, setValidityDays] = useState(14)
  const [customInclude, setCustomInclude] = useState('')
  const [customExclude, setCustomExclude] = useState('')

  // Templates
  const [includeTemplates, setIncludeTemplates] = useState<TermTemplate[]>([])
  const [excludeTemplates, setExcludeTemplates] = useState<TermTemplate[]>([])

  // Generated data
  const [quotationId, setQuotationId] = useState<string | null>(null)
  const [quotationNumber, setQuotationNumber] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  // Calculate selling rate based on cost and margin
  const totalSellingRate = useMemo(() => {
    if (rateStructure === 'bundling') {
      return totalCost * (1 + targetMarginPercent / 100)
    } else {
      return items.reduce((sum, item) => sum + item.selling_rate, 0)
    }
  }, [rateStructure, totalCost, targetMarginPercent, items])

  // Initialize from ticket data
  useEffect(() => {
    if (open && ticketData) {
      // Customer info from contact/account
      if (ticketData.contact) {
        const fullName = [ticketData.contact.first_name, ticketData.contact.last_name]
          .filter(Boolean)
          .join(' ')
        setCustomerName(fullName)
        setCustomerEmail(ticketData.contact.email || '')
        setCustomerPhone(ticketData.contact.phone || '')
      }
      if (ticketData.account) {
        setCustomerCompany(ticketData.account.company_name || '')
        setCustomerAddress(
          [ticketData.account.address, ticketData.account.city, ticketData.account.country]
            .filter(Boolean)
            .join(', ')
        )
      }

      // RFQ data
      if (ticketData.rfq_data) {
        const rfq = ticketData.rfq_data
        setServiceType(rfq.service_type || '')
        setIncoterm(rfq.incoterm || '')
        setFleetType(rfq.fleet_type || '')
        setFleetQuantity(rfq.fleet_quantity || 1)
        setCommodity(rfq.commodity || '')
        setOriginCity(rfq.origin_city || '')
        setOriginCountry(rfq.origin_country || '')
        setOriginPort(rfq.origin_port || '')
        setDestinationCity(rfq.destination_city || '')
        setDestinationCountry(rfq.destination_country || '')
        setDestinationPort(rfq.destination_port || '')
        setCargoDescription(rfq.cargo_description || '')
        setCargoWeight(rfq.cargo_weight || null)
        setCargoVolume(rfq.cargo_volume || null)
        setCargoQuantity(rfq.cargo_quantity || null)
      }

      // Operational cost
      if (operationalCost) {
        setTotalCost(operationalCost.amount)
        setCurrency(operationalCost.currency || 'IDR')
      }

      // Fetch term templates
      fetchTermTemplates()
    }
  }, [open, ticketData, operationalCost])

  // Fetch term templates
  const fetchTermTemplates = async () => {
    try {
      const response = await fetch('/api/ticketing/customer-quotations/terms')
      const result = await response.json()
      if (result.success) {
        setIncludeTemplates(result.data.includes || [])
        setExcludeTemplates(result.data.excludes || [])
        // Set defaults
        const defaultIncludes = (result.data.includes || [])
          .filter((t: TermTemplate) => t.is_default)
          .map((t: TermTemplate) => t.term_text)
        const defaultExcludes = (result.data.excludes || [])
          .filter((t: TermTemplate) => t.is_default)
          .map((t: TermTemplate) => t.term_text)
        setTermsIncludes(defaultIncludes)
        setTermsExcludes(defaultExcludes)
      }
    } catch (error) {
      console.error('Error fetching term templates:', error)
    }
  }

  // Add item to breakdown
  const addItem = () => {
    const newItem: QuotationItem = {
      id: `item-${Date.now()}`,
      component_type: '',
      component_name: '',
      description: '',
      cost_amount: 0,
      target_margin_percent: targetMarginPercent,
      selling_rate: 0,
      quantity: null,
      unit: null,
    }
    setItems([...items, newItem])
  }

  // Update item
  const updateItem = (id: string, field: keyof QuotationItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value }
        // Auto-calculate selling rate when cost or margin changes
        if (field === 'cost_amount' || field === 'target_margin_percent') {
          updated.selling_rate = updated.cost_amount * (1 + updated.target_margin_percent / 100)
        }
        // Auto-fill component name from type
        if (field === 'component_type' && !item.component_name) {
          updated.component_name = getRateComponentLabel(value)
        }
        return updated
      }
      return item
    }))
  }

  // Remove item
  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id))
  }

  // Toggle term include/exclude
  const toggleTermInclude = (term: string) => {
    if (termsIncludes.includes(term)) {
      setTermsIncludes(termsIncludes.filter(t => t !== term))
    } else {
      setTermsIncludes([...termsIncludes, term])
    }
  }

  const toggleTermExclude = (term: string) => {
    if (termsExcludes.includes(term)) {
      setTermsExcludes(termsExcludes.filter(t => t !== term))
    } else {
      setTermsExcludes([...termsExcludes, term])
    }
  }

  // Add custom term
  const addCustomInclude = () => {
    if (customInclude.trim() && !termsIncludes.includes(customInclude.trim())) {
      setTermsIncludes([...termsIncludes, customInclude.trim()])
      setCustomInclude('')
    }
  }

  const addCustomExclude = () => {
    if (customExclude.trim() && !termsExcludes.includes(customExclude.trim())) {
      setTermsExcludes([...termsExcludes, customExclude.trim()])
      setCustomExclude('')
    }
  }

  // Save quotation
  const handleSave = async () => {
    if (!customerName) {
      toast({
        title: 'Validation Error',
        description: 'Customer name is required',
        variant: 'destructive',
      })
      return
    }

    if (totalSellingRate <= 0) {
      toast({
        title: 'Validation Error',
        description: 'Selling rate must be greater than 0',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const payload = {
        ticket_id: ticketId,
        customer_name: customerName,
        customer_company: customerCompany || null,
        customer_email: customerEmail || null,
        customer_phone: customerPhone || null,
        customer_address: customerAddress || null,
        service_type: serviceType || null,
        incoterm: incoterm || null,
        fleet_type: fleetType || null,
        fleet_quantity: fleetQuantity || null,
        commodity: commodity || null,
        origin_address: originAddress || null,
        origin_city: originCity || null,
        origin_country: originCountry || null,
        origin_port: originPort || null,
        destination_address: destinationAddress || null,
        destination_city: destinationCity || null,
        destination_country: destinationCountry || null,
        destination_port: destinationPort || null,
        cargo_description: cargoDescription || null,
        cargo_weight: cargoWeight,
        cargo_weight_unit: cargoWeightUnit || null,
        cargo_volume: cargoVolume,
        cargo_volume_unit: cargoVolumeUnit || null,
        cargo_quantity: cargoQuantity,
        cargo_quantity_unit: cargoQuantityUnit || null,
        rate_structure: rateStructure,
        total_cost: totalCost,
        target_margin_percent: targetMarginPercent,
        total_selling_rate: totalSellingRate,
        currency,
        scope_of_work: scopeOfWork || null,
        terms_includes: termsIncludes,
        terms_excludes: termsExcludes,
        terms_notes: termsNotes || null,
        validity_days: validityDays,
        items: rateStructure === 'breakdown' ? items.map((item, index) => ({
          component_type: item.component_type,
          component_name: item.component_name,
          description: item.description,
          cost_amount: item.cost_amount,
          target_margin_percent: item.target_margin_percent,
          selling_rate: item.selling_rate,
          quantity: item.quantity,
          unit: item.unit,
          sort_order: index,
        })) : [],
      }

      const response = await fetch('/api/ticketing/customer-quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (result.success && result.data) {
        toast({
          title: 'Success',
          description: `Quotation ${result.data.quotation_number} created successfully`,
        })
        // Close dialog and redirect to detail page
        onOpenChange(false)
        router.push(`/customer-quotations/${result.data.id}`)
      } else {
        throw new Error(result.error || 'Failed to create quotation')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save quotation',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // Generate PDF
  const handleGeneratePDF = async () => {
    if (!quotationId) {
      toast({
        title: 'Error',
        description: 'Please save the quotation first',
        variant: 'destructive',
      })
      return
    }

    setGenerating(true)
    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}/pdf`, {
        method: 'POST',
      })

      const result = await response.json()

      if (result.success) {
        // Open PDF preview in new window
        const previewWindow = window.open('', '_blank')
        if (previewWindow) {
          previewWindow.document.write(result.html)
          previewWindow.document.close()
        }
        setPdfUrl(result.validation_url)
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
      setGenerating(false)
    }
  }

  // Send via WhatsApp
  const handleSendWhatsApp = async () => {
    if (!quotationId) {
      toast({
        title: 'Error',
        description: 'Please save the quotation first',
        variant: 'destructive',
      })
      return
    }

    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'whatsapp' }),
      })

      const result = await response.json()

      if (result.success) {
        // Copy text to clipboard
        await navigator.clipboard.writeText(result.data.whatsapp_text)
        toast({
          title: 'WhatsApp Text Copied',
          description: 'Text copied to clipboard. Click below to open WhatsApp.',
        })

        // Open WhatsApp if URL available
        if (result.data.whatsapp_url) {
          window.open(result.data.whatsapp_url, '_blank')
        }

        onSuccess?.()
      } else {
        throw new Error(result.error || 'Failed to generate WhatsApp text')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send via WhatsApp',
        variant: 'destructive',
      })
    }
  }

  // Send via Email
  const handleSendEmail = async () => {
    if (!quotationId) {
      toast({
        title: 'Error',
        description: 'Please save the quotation first',
        variant: 'destructive',
      })
      return
    }

    try {
      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'email' }),
      })

      const result = await response.json()

      if (result.success) {
        // Open email preview in new window
        const previewWindow = window.open('', '_blank')
        if (previewWindow) {
          previewWindow.document.write(result.data.email_html)
          previewWindow.document.close()
        }

        // Open default email client
        const mailtoLink = `mailto:${result.data.recipient_email || ''}?subject=${encodeURIComponent(result.data.email_subject)}`
        window.location.href = mailtoLink

        toast({
          title: 'Email Prepared',
          description: 'Email content prepared. Check the preview window and your email client.',
        })

        onSuccess?.()
      } else {
        throw new Error(result.error || 'Failed to prepare email')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send email',
        variant: 'destructive',
      })
    }
  }

  // Format currency for display
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Section components
  const sections = [
    { id: 'customer', label: 'Customer', icon: Building2 },
    { id: 'service', label: 'Service', icon: Package },
    { id: 'route', label: 'Route', icon: MapPin },
    { id: 'rate', label: 'Rate', icon: DollarSign },
    { id: 'terms', label: 'Terms', icon: CheckSquare },
    { id: 'preview', label: 'Preview', icon: Eye },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Create Customer Quotation
          </DialogTitle>
          <DialogDescription>
            Reference: {ticketData.ticket_code} - {ticketData.subject}
          </DialogDescription>
        </DialogHeader>

        {/* Section Navigation */}
        <div className="flex gap-1 border-b pb-2 overflow-x-auto">
          {sections.map((section) => (
            <Button
              key={section.id}
              variant={activeSection === section.id ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveSection(section.id)}
              className="flex items-center gap-1 whitespace-nowrap"
            >
              <section.icon className="h-4 w-4" />
              {section.label}
            </Button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Customer Section */}
          {activeSection === 'customer' && (
            <div className="space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Customer Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customer-name">Customer Name *</Label>
                  <Input
                    id="customer-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter customer name"
                  />
                </div>
                <div>
                  <Label htmlFor="customer-company">Company</Label>
                  <Input
                    id="customer-company"
                    value={customerCompany}
                    onChange={(e) => setCustomerCompany(e.target.value)}
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <Label htmlFor="customer-email">Email</Label>
                  <Input
                    id="customer-email"
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="email@company.com"
                  />
                </div>
                <div>
                  <Label htmlFor="customer-phone">Phone</Label>
                  <Input
                    id="customer-phone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+62..."
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="customer-address">Address</Label>
                  <Textarea
                    id="customer-address"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Full address"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Service Section */}
          {activeSection === 'service' && (
            <div className="space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Service Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="service-type">Service Type</Label>
                  <Select value={serviceType} onValueChange={setServiceType}>
                    <SelectTrigger id="service-type">
                      <SelectValue placeholder="Select service type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SERVICE_TYPES_BY_DEPARTMENT).map(([dept, types]) => (
                        <SelectGroup key={dept}>
                          <SelectLabel>{dept}</SelectLabel>
                          {types.map((type) => (
                            <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="incoterm">Incoterm</Label>
                  <Select value={incoterm} onValueChange={setIncoterm}>
                    <SelectTrigger id="incoterm">
                      <SelectValue placeholder="Select incoterm" />
                    </SelectTrigger>
                    <SelectContent>
                      {INCOTERMS.map((term) => (
                        <SelectItem key={term} value={term}>{term}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="fleet-type">Fleet Type</Label>
                  <Select value={fleetType} onValueChange={setFleetType}>
                    <SelectTrigger id="fleet-type">
                      <SelectValue placeholder="Select fleet type" />
                    </SelectTrigger>
                    <SelectContent>
                      {FLEET_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="fleet-quantity">Quantity</Label>
                  <Input
                    id="fleet-quantity"
                    type="number"
                    min={1}
                    value={fleetQuantity}
                    onChange={(e) => setFleetQuantity(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="commodity">Commodity</Label>
                  <Input
                    id="commodity"
                    value={commodity}
                    onChange={(e) => setCommodity(e.target.value)}
                    placeholder="Type of goods"
                  />
                </div>
              </div>

              <Separator />

              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Cargo Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="cargo-description">Description</Label>
                  <Textarea
                    id="cargo-description"
                    value={cargoDescription}
                    onChange={(e) => setCargoDescription(e.target.value)}
                    placeholder="Describe the cargo"
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label htmlFor="cargo-weight">Weight</Label>
                    <Input
                      id="cargo-weight"
                      type="number"
                      value={cargoWeight || ''}
                      onChange={(e) => setCargoWeight(e.target.value ? parseFloat(e.target.value) : null)}
                      placeholder="0"
                    />
                  </div>
                  <div className="w-24">
                    <Label>&nbsp;</Label>
                    <Select value={cargoWeightUnit} onValueChange={setCargoWeightUnit}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="ton">ton</SelectItem>
                        <SelectItem value="lbs">lbs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label htmlFor="cargo-volume">Volume</Label>
                    <Input
                      id="cargo-volume"
                      type="number"
                      value={cargoVolume || ''}
                      onChange={(e) => setCargoVolume(e.target.value ? parseFloat(e.target.value) : null)}
                      placeholder="0"
                    />
                  </div>
                  <div className="w-24">
                    <Label>&nbsp;</Label>
                    <Select value={cargoVolumeUnit} onValueChange={setCargoVolumeUnit}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cbm">cbm</SelectItem>
                        <SelectItem value="m3">m3</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Route Section */}
          {activeSection === 'route' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                {/* Origin */}
                <div className="space-y-4">
                  <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-green-600" />
                    Origin
                  </h3>
                  <div>
                    <Label htmlFor="origin-city">City *</Label>
                    <Input
                      id="origin-city"
                      value={originCity}
                      onChange={(e) => setOriginCity(e.target.value)}
                      placeholder="City name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="origin-country">Country</Label>
                    <Input
                      id="origin-country"
                      value={originCountry}
                      onChange={(e) => setOriginCountry(e.target.value)}
                      placeholder="Country"
                    />
                  </div>
                  <div>
                    <Label htmlFor="origin-port">Port (if applicable)</Label>
                    <Input
                      id="origin-port"
                      value={originPort}
                      onChange={(e) => setOriginPort(e.target.value)}
                      placeholder="Port name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="origin-address">Address</Label>
                    <Textarea
                      id="origin-address"
                      value={originAddress}
                      onChange={(e) => setOriginAddress(e.target.value)}
                      placeholder="Pickup address"
                      rows={2}
                    />
                  </div>
                </div>

                {/* Destination */}
                <div className="space-y-4">
                  <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-red-600" />
                    Destination
                  </h3>
                  <div>
                    <Label htmlFor="destination-city">City *</Label>
                    <Input
                      id="destination-city"
                      value={destinationCity}
                      onChange={(e) => setDestinationCity(e.target.value)}
                      placeholder="City name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="destination-country">Country</Label>
                    <Input
                      id="destination-country"
                      value={destinationCountry}
                      onChange={(e) => setDestinationCountry(e.target.value)}
                      placeholder="Country"
                    />
                  </div>
                  <div>
                    <Label htmlFor="destination-port">Port (if applicable)</Label>
                    <Input
                      id="destination-port"
                      value={destinationPort}
                      onChange={(e) => setDestinationPort(e.target.value)}
                      placeholder="Port name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="destination-address">Address</Label>
                    <Textarea
                      id="destination-address"
                      value={destinationAddress}
                      onChange={(e) => setDestinationAddress(e.target.value)}
                      placeholder="Delivery address"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rate Section */}
          {activeSection === 'rate' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Rate Structure</h3>
                <div className="flex gap-2">
                  <Button
                    variant={rateStructure === 'bundling' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRateStructure('bundling')}
                  >
                    Bundling
                  </Button>
                  <Button
                    variant={rateStructure === 'breakdown' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRateStructure('breakdown')}
                  >
                    Breakdown
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-32">
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((cur) => (
                        <SelectItem key={cur} value={cur}>{cur}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {rateStructure === 'bundling' ? (
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="total-cost">Total Cost (from Ops)</Label>
                      <Input
                        id="total-cost"
                        type="number"
                        value={totalCost}
                        onChange={(e) => setTotalCost(parseFloat(e.target.value) || 0)}
                        className="text-right font-mono"
                      />
                    </div>
                    <div>
                      <Label htmlFor="margin">Target Margin (%)</Label>
                      <Input
                        id="margin"
                        type="number"
                        value={targetMarginPercent}
                        onChange={(e) => setTargetMarginPercent(parseFloat(e.target.value) || 0)}
                        className="text-right"
                      />
                    </div>
                    <div>
                      <Label>Selling Rate</Label>
                      <div className="h-10 flex items-center justify-end px-3 bg-green-100 dark:bg-green-900/30 rounded-md font-mono font-bold text-green-700 dark:text-green-400">
                        {formatCurrency(totalSellingRate)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Add rate components</span>
                    <Button size="sm" variant="outline" onClick={addItem}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Item
                    </Button>
                  </div>

                  {items.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                      No items added. Click "Add Item" to start.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {items.map((item, index) => (
                        <div key={item.id} className="p-3 border rounded-lg space-y-3 bg-muted/30">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Item {index + 1}</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={() => removeItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-4 gap-3">
                            <div className="col-span-2">
                              <Label className="text-xs">Component Type</Label>
                              <Select
                                value={item.component_type}
                                onValueChange={(v) => updateItem(item.id, 'component_type', v)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select component" />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(RATE_COMPONENTS_BY_CATEGORY).map(([category, components]) => (
                                    <SelectGroup key={category}>
                                      <SelectLabel>{category}</SelectLabel>
                                      {components.map((comp) => (
                                        <SelectItem key={comp.value} value={comp.value}>
                                          {comp.label}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-2">
                              <Label className="text-xs">Display Name</Label>
                              <Input
                                value={item.component_name}
                                onChange={(e) => updateItem(item.id, 'component_name', e.target.value)}
                                placeholder="Custom name"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Cost</Label>
                              <Input
                                type="number"
                                value={item.cost_amount || ''}
                                onChange={(e) => updateItem(item.id, 'cost_amount', parseFloat(e.target.value) || 0)}
                                className="text-right font-mono"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Margin %</Label>
                              <Input
                                type="number"
                                value={item.target_margin_percent || ''}
                                onChange={(e) => updateItem(item.id, 'target_margin_percent', parseFloat(e.target.value) || 0)}
                                className="text-right"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Selling Rate</Label>
                              <Input
                                type="number"
                                value={item.selling_rate || ''}
                                onChange={(e) => updateItem(item.id, 'selling_rate', parseFloat(e.target.value) || 0)}
                                className="text-right font-mono bg-green-50 dark:bg-green-900/20"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Qty/Unit</Label>
                              <div className="flex gap-1">
                                <Input
                                  type="number"
                                  value={item.quantity || ''}
                                  onChange={(e) => updateItem(item.id, 'quantity', e.target.value ? parseInt(e.target.value) : null)}
                                  placeholder="Qty"
                                  className="w-16 text-right"
                                />
                                <Input
                                  value={item.unit || ''}
                                  onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                                  placeholder="Unit"
                                  className="flex-1"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      <div className="flex items-center justify-between p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                        <span className="font-medium">Total Selling Rate</span>
                        <span className="text-xl font-bold font-mono text-green-700 dark:text-green-400">
                          {formatCurrency(totalSellingRate)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Terms Section */}
          {activeSection === 'terms' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="scope">Scope of Work</Label>
                <Textarea
                  id="scope"
                  value={scopeOfWork}
                  onChange={(e) => setScopeOfWork(e.target.value)}
                  placeholder="Describe the scope of work for this quotation..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Includes */}
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-green-600 uppercase tracking-wide">Included</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                    {includeTemplates.map((template) => (
                      <div key={template.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={termsIncludes.includes(template.term_text)}
                          onCheckedChange={() => toggleTermInclude(template.term_text)}
                        />
                        <span className="text-sm">{template.term_text}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={customInclude}
                      onChange={(e) => setCustomInclude(e.target.value)}
                      placeholder="Add custom include..."
                      onKeyDown={(e) => e.key === 'Enter' && addCustomInclude()}
                    />
                    <Button size="icon" variant="outline" onClick={addCustomInclude}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {termsIncludes.filter(t => !includeTemplates.find(tt => tt.term_text === t)).map((term) => (
                    <Badge key={term} variant="secondary" className="mr-1 mb-1">
                      {term}
                      <button
                        className="ml-1 hover:text-destructive"
                        onClick={() => setTermsIncludes(termsIncludes.filter(t => t !== term))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>

                {/* Excludes */}
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-red-600 uppercase tracking-wide">Excluded</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                    {excludeTemplates.map((template) => (
                      <div key={template.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={termsExcludes.includes(template.term_text)}
                          onCheckedChange={() => toggleTermExclude(template.term_text)}
                        />
                        <span className="text-sm">{template.term_text}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={customExclude}
                      onChange={(e) => setCustomExclude(e.target.value)}
                      placeholder="Add custom exclude..."
                      onKeyDown={(e) => e.key === 'Enter' && addCustomExclude()}
                    />
                    <Button size="icon" variant="outline" onClick={addCustomExclude}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {termsExcludes.filter(t => !excludeTemplates.find(tt => tt.term_text === t)).map((term) => (
                    <Badge key={term} variant="secondary" className="mr-1 mb-1">
                      {term}
                      <button
                        className="ml-1 hover:text-destructive"
                        onClick={() => setTermsExcludes(termsExcludes.filter(t => t !== term))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="terms-notes">Additional Notes</Label>
                <Textarea
                  id="terms-notes"
                  value={termsNotes}
                  onChange={(e) => setTermsNotes(e.target.value)}
                  placeholder="Additional notes or conditions..."
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="validity">Validity Period (days)</Label>
                <Input
                  id="validity"
                  type="number"
                  value={validityDays}
                  onChange={(e) => setValidityDays(parseInt(e.target.value) || 14)}
                  className="w-32"
                  min={1}
                />
              </div>
            </div>
          )}

          {/* Preview Section */}
          {activeSection === 'preview' && (
            <div className="space-y-4">
              {quotationNumber ? (
                <div className="text-center py-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-muted-foreground">Quotation Number</p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{quotationNumber}</p>
                </div>
              ) : (
                <div className="text-center py-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Save the quotation to generate a quotation number</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="font-medium">Customer</div>
                  <div className="text-muted-foreground">
                    {customerName || '-'}<br />
                    {customerCompany && <>{customerCompany}<br /></>}
                    {customerEmail && <>{customerEmail}<br /></>}
                    {customerPhone && <>{customerPhone}<br /></>}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="font-medium">Service</div>
                  <div className="text-muted-foreground">
                    {serviceType || '-'}<br />
                    {incoterm && <>Incoterm: {incoterm}<br /></>}
                    {fleetType && <>{fleetType} x {fleetQuantity}</>}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="font-medium">Route</div>
                  <div className="text-muted-foreground">
                    {originCity || '-'} → {destinationCity || '-'}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="font-medium">Rate</div>
                  <div className="text-2xl font-bold text-primary">
                    {formatCurrency(totalSellingRate)}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="font-medium">Actions</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={handleGeneratePDF}
                    disabled={!quotationId || generating}
                    className="w-full"
                  >
                    {generating ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="mr-2 h-4 w-4" />
                    )}
                    Preview PDF
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSendWhatsApp}
                    disabled={!quotationId}
                    className="w-full"
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Send WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSendEmail}
                    disabled={!quotationId}
                    className="w-full"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Send Email
                  </Button>
                  {pdfUrl && (
                    <Button
                      variant="outline"
                      onClick={() => window.open(pdfUrl, '_blank')}
                      className="w-full"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open Validation Link
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            {quotationId ? 'Update Quotation' : 'Create Quotation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
