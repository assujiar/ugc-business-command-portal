'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  RefreshCw,
  FileText,
  Building2,
  MapPin,
  Package,
  DollarSign,
  CheckSquare,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import type { Database } from '@/types/database'
import {
  SERVICE_TYPES as GLOBAL_SERVICE_TYPES,
  SERVICE_SCOPES,
  getServicesByScope,
  getServiceTypeDisplayLabel,
  INCOTERMS,
} from '@/lib/constants'
import { RATE_COMPONENTS, RATE_COMPONENTS_BY_CATEGORY, getRateComponentLabel } from '@/lib/constants/rate-components'

type Profile = Database['public']['Tables']['profiles']['Row']

interface CustomerQuotationEditFormProps {
  quotationId: string
  profile: Profile
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

// Service types grouped by scope (using global SERVICE_TYPES from constants)
const domesticsServices = getServicesByScope('Domestics')
const exportServices = getServicesByScope('Export')
const importServices = getServicesByScope('Import')
const importDtdServices = getServicesByScope('Import DTD')

const FLEET_TYPES = [
  'Blindvan', 'Pickup', 'CDE Box', 'CDE Bak', 'CDD Box', 'CDD Bak', 'CDD Long Box',
  'CDD Long Bak', 'Fuso Box', 'Fuso Bak', 'Fuso Long Box', 'Fuso Long Bak',
  'Tronton Box', 'Tronton Bak', 'Tronton Wingbox', 'Trailer 20ft', 'Trailer 40ft',
  'Container 20ft', 'Container 40ft', 'Container 40ft HC', 'Lowbed', 'Flatbed', 'Car Carrier',
]

// Helper to check if service type is domestic
const isDomesticService = (serviceType: string): boolean => {
  return serviceType.toLowerCase().startsWith('domestics')
}

// Helper to check if service type is export/import
const isExportImportService = (serviceType: string): boolean => {
  const lower = serviceType.toLowerCase()
  return lower.startsWith('export') || lower.startsWith('import')
}

export function CustomerQuotationEditForm({ quotationId, profile }: CustomerQuotationEditFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [quotation, setQuotation] = useState<any>(null)

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

  // Leadtime & cargo value
  const [estimatedLeadtime, setEstimatedLeadtime] = useState('')
  const [estimatedCargoValue, setEstimatedCargoValue] = useState<number | null>(null)
  const [cargoValueCurrency, setCargoValueCurrency] = useState('IDR')

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

  // Calculate totals for breakdown mode
  const totalBreakdownCost = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.cost_amount || 0), 0)
  }, [items])

  const totalBreakdownSelling = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.selling_rate || 0), 0)
  }, [items])

  const totalBreakdownMarginRp = useMemo(() => {
    return totalBreakdownSelling - totalBreakdownCost
  }, [totalBreakdownSelling, totalBreakdownCost])

  const totalBreakdownMarginPercent = useMemo(() => {
    if (totalBreakdownCost === 0) return 0
    return ((totalBreakdownSelling - totalBreakdownCost) / totalBreakdownCost) * 100
  }, [totalBreakdownSelling, totalBreakdownCost])

  // Calculate selling rate based on cost and margin
  const totalSellingRate = useMemo(() => {
    if (rateStructure === 'breakdown') {
      return totalBreakdownSelling
    }
    return Math.round(totalCost * (1 + targetMarginPercent / 100))
  }, [rateStructure, totalCost, targetMarginPercent, totalBreakdownSelling])

  // Fetch quotation data
  useEffect(() => {
    const fetchQuotation = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}`)
        const result = await response.json()

        if (result.success && result.data) {
          const q = result.data
          setQuotation(q)

          // Populate form fields
          setCustomerName(q.customer_name || '')
          setCustomerCompany(q.customer_company || '')
          setCustomerEmail(q.customer_email || '')
          setCustomerPhone(q.customer_phone || '')
          setCustomerAddress(q.customer_address || '')

          setServiceType(q.service_type || '')
          setIncoterm(q.incoterm || '')
          setFleetType(q.fleet_type || '')
          setFleetQuantity(q.fleet_quantity || 1)
          setCommodity(q.commodity || '')

          setOriginAddress(q.origin_address || '')
          setOriginCity(q.origin_city || '')
          setOriginCountry(q.origin_country || '')
          setOriginPort(q.origin_port || '')
          setDestinationAddress(q.destination_address || '')
          setDestinationCity(q.destination_city || '')
          setDestinationCountry(q.destination_country || '')
          setDestinationPort(q.destination_port || '')

          setCargoDescription(q.cargo_description || '')
          setCargoWeight(q.cargo_weight || null)
          setCargoWeightUnit(q.cargo_weight_unit || 'kg')
          setCargoVolume(q.cargo_volume || null)
          setCargoVolumeUnit(q.cargo_volume_unit || 'cbm')
          setCargoQuantity(q.cargo_quantity || null)
          setCargoQuantityUnit(q.cargo_quantity_unit || 'units')

          setEstimatedLeadtime(q.estimated_leadtime || '')
          setEstimatedCargoValue(q.estimated_cargo_value || null)
          setCargoValueCurrency(q.cargo_value_currency || 'IDR')

          setRateStructure(q.rate_structure || 'bundling')
          setTotalCost(q.total_cost || 0)
          setTargetMarginPercent(q.target_margin_percent || 15)
          setCurrency(q.currency || 'IDR')

          setScopeOfWork(q.scope_of_work || '')
          setTermsIncludes(q.terms_includes || [])
          setTermsExcludes(q.terms_excludes || [])
          setTermsNotes(q.terms_notes || '')
          setValidityDays(q.validity_days || 14)

          // Load items
          if (q.items && q.items.length > 0) {
            setItems(q.items.map((item: any) => ({
              id: item.id,
              component_type: item.component_type || '',
              component_name: item.component_name || '',
              description: item.description || '',
              cost_amount: item.cost_amount || 0,
              target_margin_percent: item.target_margin_percent || 15,
              selling_rate: item.selling_rate || 0,
              quantity: item.quantity || null,
              unit: item.unit || null,
            })))
          }
        } else {
          toast({
            title: 'Error',
            description: result.error || 'Failed to load quotation',
            variant: 'destructive',
          })
          router.push('/customer-quotations')
        }
      } catch (error) {
        console.error('Error fetching quotation:', error)
        toast({
          title: 'Error',
          description: 'Failed to load quotation',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }

    fetchQuotation()
    fetchTermTemplates()
  }, [quotationId])

  // Fetch term templates
  const fetchTermTemplates = async () => {
    try {
      const response = await fetch('/api/ticketing/customer-quotations/terms')
      const result = await response.json()
      if (result.success) {
        setIncludeTemplates(result.data.includes || [])
        setExcludeTemplates(result.data.excludes || [])
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
        if (field === 'cost_amount' || field === 'target_margin_percent') {
          updated.selling_rate = Math.round(updated.cost_amount * (1 + updated.target_margin_percent / 100))
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

  // Handle save
  const handleSave = async () => {
    if (!customerName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Customer name is required',
        variant: 'destructive',
      })
      return
    }

    // Validate breakdown items have component_type
    if (rateStructure === 'breakdown') {
      const validItems = items.filter(item => item.component_type)
      if (validItems.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'Breakdown mode requires at least one item with a component type selected',
          variant: 'destructive',
        })
        return
      }
    }

    setSaving(true)
    try {
      const payload = {
        customer_data: {
          customer_name: customerName,
          customer_company: customerCompany || null,
          customer_email: customerEmail || null,
          customer_phone: customerPhone || null,
          customer_address: customerAddress || null,
        },
        service_data: {
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
          estimated_leadtime: estimatedLeadtime || null,
          estimated_cargo_value: estimatedCargoValue,
          cargo_value_currency: cargoValueCurrency,
        },
        rate_data: {
          rate_structure: rateStructure,
          total_cost: rateStructure === 'breakdown' ? totalBreakdownCost : totalCost,
          target_margin_percent: rateStructure === 'breakdown' ? totalBreakdownMarginPercent : targetMarginPercent,
          total_selling_rate: totalSellingRate,
          currency,
        },
        terms_data: {
          scope_of_work: scopeOfWork || null,
          terms_includes: termsIncludes,
          terms_excludes: termsExcludes,
          terms_notes: termsNotes || null,
          validity_days: validityDays,
        },
        items: rateStructure === 'breakdown' ? items
          .filter(item => item.component_type) // Only include items with valid component_type
          .map((item, index) => ({
            component_type: item.component_type,
            component_name: item.component_name || item.component_type,
            description: item.description,
            cost_amount: item.cost_amount,
            target_margin_percent: item.target_margin_percent,
            selling_rate: item.selling_rate,
            quantity: item.quantity,
            unit: item.unit,
            sort_order: index,
          })) : [],
      }

      const response = await fetch(`/api/ticketing/customer-quotations/${quotationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Quotation updated successfully',
        })
        router.push(`/customer-quotations/${quotationId}`)
      } else {
        throw new Error(result.error || 'Failed to update quotation')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update quotation',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // Toggle term
  const toggleIncludeTerm = (term: string) => {
    setTermsIncludes(prev =>
      prev.includes(term) ? prev.filter(t => t !== term) : [...prev, term]
    )
  }

  const toggleExcludeTerm = (term: string) => {
    setTermsExcludes(prev =>
      prev.includes(term) ? prev.filter(t => t !== term) : [...prev, term]
    )
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!quotation) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Quotation not found</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Only allow editing draft quotations
  if (quotation.status !== 'draft') {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Cannot edit quotation</p>
            <p className="text-muted-foreground mt-2">Only draft quotations can be edited.</p>
            <Button asChild className="mt-4">
              <Link href={`/customer-quotations/${quotationId}`}>View Quotation</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Edit Quotation</h1>
            <p className="text-muted-foreground font-mono">{quotation.quotation_number}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Customer Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="customer-name">Customer Name *</Label>
              <Input
                id="customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer name"
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customer-email">Email</Label>
                <Input
                  id="customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="email@example.com"
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
            </div>
            <div>
              <Label htmlFor="customer-address">Address</Label>
              <Textarea
                id="customer-address"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Customer address"
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Service & Cargo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Service & Cargo Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="service-type">Service Type</Label>
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Domestics Service (Domestics Ops Dept)</SelectLabel>
                      {domesticsServices.map((s) => (
                        <SelectItem key={s.code} value={`${s.scope} | ${s.name}`}>{s.scope} | {s.name}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Export (Exim Ops Dept)</SelectLabel>
                      {exportServices.map((s) => (
                        <SelectItem key={s.code} value={`${s.scope} | ${s.name}`}>{s.scope} | {s.name}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Import (Exim Ops Dept)</SelectLabel>
                      {importServices.map((s) => (
                        <SelectItem key={s.code} value={`${s.scope} | ${s.name}`}>{s.scope} | {s.name}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Import DTD (Import DTD Ops Dept)</SelectLabel>
                      {importDtdServices.map((s) => (
                        <SelectItem key={s.code} value={`${s.scope} | ${s.name}`}>{s.scope} | {s.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {/* Conditional: Fleet Type for Domestics, Incoterm for Export/Import */}
              {isDomesticService(serviceType) ? (
                <div>
                  <Label htmlFor="fleet-type">Fleet Type</Label>
                  <Select value={fleetType} onValueChange={setFleetType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select fleet" />
                    </SelectTrigger>
                    <SelectContent>
                      {FLEET_TYPES.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : isExportImportService(serviceType) ? (
                <div>
                  <Label htmlFor="incoterm">Incoterm</Label>
                  <Select value={incoterm} onValueChange={setIncoterm}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select incoterm" />
                    </SelectTrigger>
                    <SelectContent>
                      {INCOTERMS.map((term) => (
                        <SelectItem key={term.code} value={term.code}>{term.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label htmlFor="fleet-type">Fleet Type / Incoterm</Label>
                  <p className="text-sm text-muted-foreground mt-2">Select service type first</p>
                </div>
              )}
            </div>
            {/* Fleet quantity for domestic services */}
            {isDomesticService(serviceType) && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fleet-quantity">Fleet Quantity</Label>
                  <Input
                    id="fleet-quantity"
                    type="number"
                    min={1}
                    value={fleetQuantity}
                    onChange={(e) => setFleetQuantity(parseInt(e.target.value) || 1)}
                  />
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="cargo-description">Cargo Description</Label>
              <Textarea
                id="cargo-description"
                value={cargoDescription}
                onChange={(e) => setCargoDescription(e.target.value)}
                placeholder="Describe the cargo"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="estimated-leadtime">Estimated Leadtime</Label>
                <Input
                  id="estimated-leadtime"
                  value={estimatedLeadtime}
                  onChange={(e) => setEstimatedLeadtime(e.target.value)}
                  placeholder="e.g., 3-5 hari"
                />
              </div>
              <div>
                <Label htmlFor="estimated-cargo-value">Est. Cargo Value</Label>
                <div className="flex gap-2">
                  <Select value={cargoValueCurrency} onValueChange={setCargoValueCurrency}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IDR">IDR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    id="estimated-cargo-value"
                    type="number"
                    value={estimatedCargoValue || ''}
                    onChange={(e) => setEstimatedCargoValue(e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="Value"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Route */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Route
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <p className="text-sm font-medium text-green-600">Origin</p>
                <Input
                  value={originCity}
                  onChange={(e) => setOriginCity(e.target.value)}
                  placeholder="City"
                />
                <Input
                  value={originCountry}
                  onChange={(e) => setOriginCountry(e.target.value)}
                  placeholder="Country"
                />
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium text-red-600">Destination</p>
                <Input
                  value={destinationCity}
                  onChange={(e) => setDestinationCity(e.target.value)}
                  placeholder="City"
                />
                <Input
                  value={destinationCountry}
                  onChange={(e) => setDestinationCountry(e.target.value)}
                  placeholder="Country"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rate */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Rate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Rate Structure</Label>
              <Select value={rateStructure} onValueChange={(v) => setRateStructure(v as 'bundling' | 'breakdown')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bundling">Bundling (Single Total)</SelectItem>
                  <SelectItem value="breakdown">Breakdown (Itemized)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {rateStructure === 'bundling' ? (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Total Cost</Label>
                  <Input
                    type="number"
                    value={totalCost}
                    onChange={(e) => setTotalCost(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Margin %</Label>
                  <Input
                    type="number"
                    value={targetMarginPercent}
                    onChange={(e) => setTargetMarginPercent(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Selling Rate</Label>
                  <Input
                    value={totalSellingRate.toLocaleString()}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Totals Summary */}
                <div className="grid grid-cols-4 gap-3 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <span className="text-xs text-muted-foreground block">Total Cost</span>
                    <span className="text-lg font-bold font-mono">
                      {currency} {totalBreakdownCost.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Margin (Rp)</span>
                    <span className={`text-lg font-bold font-mono ${totalBreakdownMarginRp >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {currency} {totalBreakdownMarginRp.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Margin (%)</span>
                    <span className={`text-lg font-bold font-mono ${totalBreakdownMarginPercent >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {totalBreakdownMarginPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-2 -m-2">
                    <span className="text-xs text-muted-foreground block">Total Selling</span>
                    <span className="text-lg font-bold font-mono text-green-700 dark:text-green-400">
                      {currency} {totalBreakdownSelling.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="flex gap-2 items-start p-3 border rounded-lg">
                      <div className="flex-1 grid grid-cols-4 gap-2">
                        <Select value={item.component_type} onValueChange={(v) => {
                          updateItem(item.id, 'component_type', v)
                          // Auto-fill component name from type
                          if (!item.component_name) {
                            updateItem(item.id, 'component_name', getRateComponentLabel(v))
                          }
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            {Object.entries(RATE_COMPONENTS_BY_CATEGORY).map(([category, components]) => (
                              <SelectGroup key={category}>
                                <SelectLabel className="font-semibold text-xs text-muted-foreground">{category}</SelectLabel>
                                {components.map((comp) => (
                                  <SelectItem key={comp.value} value={comp.value}>
                                    {comp.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          value={item.cost_amount}
                          onChange={(e) => updateItem(item.id, 'cost_amount', parseFloat(e.target.value) || 0)}
                          placeholder="Cost"
                        />
                        <Input
                          type="number"
                          value={item.target_margin_percent}
                          onChange={(e) => updateItem(item.id, 'target_margin_percent', parseFloat(e.target.value) || 0)}
                          placeholder="Margin %"
                        />
                        <Input
                          value={item.selling_rate.toLocaleString()}
                          disabled
                          className="bg-muted"
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button variant="outline" onClick={addItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Terms */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              Terms & Conditions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Scope of Work</Label>
              <Textarea
                value={scopeOfWork}
                onChange={(e) => setScopeOfWork(e.target.value)}
                placeholder="Describe the scope of work..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label className="text-green-600">Included</Label>
                <div className="space-y-2 mt-2">
                  {includeTemplates.map((t) => (
                    <div key={t.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={termsIncludes.includes(t.term_text)}
                        onCheckedChange={() => toggleIncludeTerm(t.term_text)}
                      />
                      <span className="text-sm">{t.term_text}</span>
                    </div>
                  ))}
                  {/* Show custom terms that are not in templates */}
                  {termsIncludes
                    .filter(term => !includeTemplates.some(t => t.term_text === term))
                    .map((term, i) => (
                      <div key={`custom-inc-${i}`} className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 rounded px-2 py-1">
                        <Checkbox
                          checked={true}
                          onCheckedChange={() => toggleIncludeTerm(term)}
                        />
                        <span className="text-sm flex-1">{term}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => toggleIncludeTerm(term)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={customInclude}
                      onChange={(e) => setCustomInclude(e.target.value)}
                      placeholder="Add custom..."
                      onKeyDown={(e) => e.key === 'Enter' && addCustomInclude()}
                    />
                    <Button variant="outline" size="sm" onClick={addCustomInclude}>Add</Button>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-red-600">Excluded</Label>
                <div className="space-y-2 mt-2">
                  {excludeTemplates.map((t) => (
                    <div key={t.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={termsExcludes.includes(t.term_text)}
                        onCheckedChange={() => toggleExcludeTerm(t.term_text)}
                      />
                      <span className="text-sm">{t.term_text}</span>
                    </div>
                  ))}
                  {/* Show custom terms that are not in templates */}
                  {termsExcludes
                    .filter(term => !excludeTemplates.some(t => t.term_text === term))
                    .map((term, i) => (
                      <div key={`custom-exc-${i}`} className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">
                        <Checkbox
                          checked={true}
                          onCheckedChange={() => toggleExcludeTerm(term)}
                        />
                        <span className="text-sm flex-1">{term}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => toggleExcludeTerm(term)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={customExclude}
                      onChange={(e) => setCustomExclude(e.target.value)}
                      placeholder="Add custom..."
                      onKeyDown={(e) => e.key === 'Enter' && addCustomExclude()}
                    />
                    <Button variant="outline" size="sm" onClick={addCustomExclude}>Add</Button>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Validity (Days)</Label>
                <Input
                  type="number"
                  value={validityDays}
                  onChange={(e) => setValidityDays(parseInt(e.target.value) || 14)}
                />
              </div>
              <div>
                <Label>Additional Notes</Label>
                <Textarea
                  value={termsNotes}
                  onChange={(e) => setTermsNotes(e.target.value)}
                  placeholder="Additional notes..."
                  rows={2}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer Actions */}
      <div className="flex justify-end gap-4 pt-4 border-t">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  )
}
