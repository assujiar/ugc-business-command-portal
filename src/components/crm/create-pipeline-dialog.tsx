// =====================================================
// Create Pipeline Dialog
// Create new opportunity/pipeline from existing account
// =====================================================

'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, ChevronDown, ChevronUp, Building2, User, Mail, Phone, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
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
  SERVICE_TYPES,
  DOMESTICS_SERVICE_CODES,
  EXIM_SERVICE_CODES,
  FLEET_TYPES,
  INCOTERMS,
  CARGO_CATEGORIES,
  UNITS_OF_MEASURE,
  ADDITIONAL_SERVICES,
  COUNTRIES,
  ACCOUNT_STATUSES,
} from '@/lib/constants'
import { toast } from '@/hooks/use-toast'
import type { AccountStatus } from '@/types/database'

interface Account {
  account_id: string
  company_name: string
  pic_name: string | null
  pic_email: string | null
  pic_phone: string | null
  industry: string | null
  account_status: AccountStatus | null
  owner_user_id: string | null
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

interface CreatePipelineDialogProps {
  trigger?: React.ReactNode
}

export function CreatePipelineDialog({ trigger }: CreatePipelineDialogProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [loadingAccounts, setLoadingAccounts] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [showShipmentDetails, setShowShipmentDetails] = React.useState(false)
  const [accounts, setAccounts] = React.useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = React.useState<Account | null>(null)

  const [formData, setFormData] = React.useState({
    account_id: '',
    name: '',
    estimated_value: '',
    notes: '',
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

  // Ref to always have latest shipmentData
  const shipmentDataRef = React.useRef<ShipmentData>(shipmentData)
  React.useEffect(() => {
    shipmentDataRef.current = shipmentData
  }, [shipmentData])

  // Fetch accounts when dialog opens
  React.useEffect(() => {
    if (open) {
      fetchAccounts()
    }
  }, [open])

  const fetchAccounts = async () => {
    setLoadingAccounts(true)
    try {
      const response = await fetch('/api/crm/accounts/my-accounts')
      const result = await response.json()
      if (result.data) {
        setAccounts(result.data)
      }
    } catch (error) {
      console.error('Error fetching accounts:', error)
    } finally {
      setLoadingAccounts(false)
    }
  }

  // Check if selected service is domestics
  const isDomesticsService = DOMESTICS_SERVICE_CODES.includes(
    shipmentData.service_type_code as any
  )

  // Check if selected service is export/import
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

  const handleAccountSelect = (accountId: string) => {
    const account = accounts.find((a) => a.account_id === accountId)
    setSelectedAccount(account || null)
    setFormData((prev) => ({
      ...prev,
      account_id: accountId,
      name: account ? `Pipeline - ${account.company_name}` : '',
    }))
  }

  const handleAdditionalServiceToggle = (serviceCode: string) => {
    setShipmentData((prev) => ({
      ...prev,
      additional_services: prev.additional_services.includes(serviceCode)
        ? prev.additional_services.filter((s) => s !== serviceCode)
        : [...prev.additional_services, serviceCode],
    }))
  }

  const getAccountStatusBadge = (status: AccountStatus | null) => {
    const statusConfig = ACCOUNT_STATUSES.find((s) => s.value === status)
    if (!statusConfig) return null

    const colorMap: Record<AccountStatus, string> = {
      calon_account: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      new_account: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      failed_account: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      active_account: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
      passive_account: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      lost_account: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    }

    return (
      <Badge className={colorMap[status!] || ''}>
        {statusConfig.label}
      </Badge>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const currentShipmentData = shipmentDataRef.current
      const currentSelectedService = SERVICE_TYPES.find(
        (s) => s.code === currentShipmentData.service_type_code
      )

      const shipment = showShipmentDetails && currentShipmentData.service_type_code
        ? {
            ...currentShipmentData,
            department: currentSelectedService?.department || null,
          }
        : null

      const submitData = {
        account_id: formData.account_id,
        name: formData.name,
        estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : 0,
        notes: formData.notes || null,
        shipment_details: shipment,
      }

      const response = await fetch('/api/crm/opportunities/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create pipeline')
      }

      toast.success(
        'Pipeline berhasil dibuat',
        `${formData.name} telah ditambahkan ke Pipeline`
      )

      // Reset form
      setFormData({
        account_id: '',
        name: '',
        estimated_value: '',
        notes: '',
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
      setSelectedAccount(null)
      setShowShipmentDetails(false)
      setOpen(false)
      router.refresh()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      toast.error('Gagal membuat pipeline', errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Group services by department
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Pipeline
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[800px] max-h-[90vh] overflow-y-auto p-4 lg:p-6">
        <DialogHeader>
          <DialogTitle className="text-base lg:text-lg">Create New Pipeline</DialogTitle>
          <DialogDescription className="text-xs lg:text-sm">
            Create a new pipeline/opportunity from an existing account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account Selection */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              Select Account
            </h4>

            <div className="space-y-2">
              <Label htmlFor="account">
                Account <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.account_id}
                onValueChange={handleAccountSelect}
                disabled={loadingAccounts}
              >
                <SelectTrigger id="account">
                  <SelectValue placeholder={loadingAccounts ? 'Loading accounts...' : 'Select account'} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.length === 0 ? (
                    <SelectItem value="no-accounts" disabled>
                      No accounts found
                    </SelectItem>
                  ) : (
                    accounts.map((account) => (
                      <SelectItem key={account.account_id} value={account.account_id}>
                        <div className="flex items-center gap-2">
                          <span>{account.company_name}</span>
                          {account.account_status && (
                            <span className="text-xs text-muted-foreground">
                              ({ACCOUNT_STATUSES.find(s => s.value === account.account_status)?.label})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Account Details */}
            {selectedAccount && (
              <div className="p-4 border rounded-lg bg-muted/30 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h5 className="font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {selectedAccount.company_name}
                  </h5>
                  {getAccountStatusBadge(selectedAccount.account_status)}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  {selectedAccount.pic_name && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span>{selectedAccount.pic_name}</span>
                    </div>
                  )}
                  {selectedAccount.pic_email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span>{selectedAccount.pic_email}</span>
                    </div>
                  )}
                  {selectedAccount.pic_phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span>{selectedAccount.pic_phone}</span>
                    </div>
                  )}
                  {selectedAccount.industry && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Briefcase className="h-4 w-4" />
                      <span>{selectedAccount.industry}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Pipeline Details */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              Pipeline Details
            </h4>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Pipeline Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Pipeline - Company Name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="estimated_value">Estimated Value (IDR)</Label>
                <Input
                  id="estimated_value"
                  type="number"
                  min="0"
                  value={formData.estimated_value}
                  onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={2}
                />
              </div>
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
            <div className="space-y-6 border rounded-lg p-4 bg-muted/30 animate-slide-in-up">
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
            <Button
              type="submit"
              disabled={loading || !formData.account_id || !formData.name}
              className="w-full sm:w-auto"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Pipeline
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
