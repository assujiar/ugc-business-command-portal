'use client'

import * as React from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Package, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect } from '@/components/shared/searchable-select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
  SERVICE_TYPES,
  SERVICE_SCOPES,
  DOMESTICS_SERVICE_CODES,
  EXIM_SERVICE_CODES,
  FLEET_TYPES,
  INCOTERMS,
  CARGO_CATEGORIES,
  UNITS_OF_MEASURE,
  ADDITIONAL_SERVICES,
  getServicesByScope,
  type ServiceScope,
} from '@/lib/constants'
import { CountrySelect } from '@/components/shared/country-select'
import { ShipmentDetail, createEmptyShipment, formatShipmentRoute } from '@/types/shipment'
import { cn } from '@/lib/utils'
import { FormSection, SERVICE_CATEGORY_STYLES, FormSectionIcons } from '@/components/ui/form-section'

const { Truck, Ship, Plane, MapPin } = FormSectionIcons

interface MultiShipmentFormProps {
  shipments: ShipmentDetail[]
  onChange: (shipments: ShipmentDetail[]) => void
  maxShipments?: number
  readOnly?: boolean
  compact?: boolean
  className?: string
}

export function MultiShipmentForm({
  shipments,
  onChange,
  maxShipments = 10,
  readOnly = false,
  compact = false,
  className,
}: MultiShipmentFormProps) {
  const [expandedShipments, setExpandedShipments] = React.useState<number[]>([0])

  // Ensure at least one shipment exists
  React.useEffect(() => {
    if (shipments.length === 0) {
      onChange([createEmptyShipment(1)])
    }
  }, [shipments.length, onChange])

  const toggleExpanded = (index: number) => {
    setExpandedShipments((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index]
    )
  }

  const addShipment = () => {
    if (shipments.length >= maxShipments) return
    const newOrder = shipments.length + 1
    const newShipment = createEmptyShipment(newOrder)
    onChange([...shipments, newShipment])
    setExpandedShipments((prev) => [...prev, shipments.length])
  }

  const removeShipment = (index: number) => {
    if (shipments.length <= 1) return
    const newShipments = shipments
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, shipment_order: i + 1 }))
    onChange(newShipments)
    setExpandedShipments((prev) =>
      prev.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))
    )
  }

  const duplicateShipment = (index: number) => {
    if (shipments.length >= maxShipments) return
    const source = shipments[index]
    const newOrder = shipments.length + 1
    const duplicated: ShipmentDetail = {
      ...source,
      shipment_order: newOrder,
      shipment_label: `${source.shipment_label || 'Shipment'} (Copy)`,
      shipment_detail_id: undefined,
    }
    onChange([...shipments, duplicated])
    setExpandedShipments((prev) => [...prev, shipments.length])
  }

  const updateShipment = (index: number, updates: Partial<ShipmentDetail>) => {
    const newShipments = shipments.map((s, i) =>
      i === index ? { ...s, ...updates } : s
    )
    onChange(newShipments)
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with shipment count */}
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-muted-foreground" />
        <span className="font-medium">
          Shipment Details ({shipments.length} shipment{shipments.length > 1 ? 's' : ''})
        </span>
      </div>

      {/* Shipment cards */}
      <div className="space-y-3">
        {shipments.map((shipment, index) => (
          <ShipmentCard
            key={index}
            shipment={shipment}
            index={index}
            isExpanded={expandedShipments.includes(index)}
            onToggleExpand={() => toggleExpanded(index)}
            onUpdate={(updates) => updateShipment(index, updates)}
            onRemove={() => removeShipment(index)}
            onDuplicate={() => duplicateShipment(index)}
            canRemove={shipments.length > 1}
            canDuplicate={shipments.length < maxShipments}
            readOnly={readOnly}
            compact={compact}
          />
        ))}
      </div>

      {/* Add Shipment button - placed below shipment cards for easier access */}
      {!readOnly && shipments.length < maxShipments && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addShipment}
          className="gap-1"
        >
          <Plus className="h-4 w-4" />
          Add Shipment
        </Button>
      )}
    </div>
  )
}

// Individual shipment card component
interface ShipmentCardProps {
  shipment: ShipmentDetail
  index: number
  isExpanded: boolean
  onToggleExpand: () => void
  onUpdate: (updates: Partial<ShipmentDetail>) => void
  onRemove: () => void
  onDuplicate: () => void
  canRemove: boolean
  canDuplicate: boolean
  readOnly: boolean
  compact: boolean
}

function ShipmentCard({
  shipment,
  index,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onDuplicate,
  canRemove,
  canDuplicate,
  readOnly,
  compact,
}: ShipmentCardProps) {
  const isDomesticsService = DOMESTICS_SERVICE_CODES.includes(
    shipment.service_type_code as any
  )
  const isEximService = EXIM_SERVICE_CODES.includes(
    shipment.service_type_code as any
  )

  // Auto-calculate weight total
  React.useEffect(() => {
    if (shipment.quantity && shipment.weight_per_unit_kg) {
      const total = shipment.quantity * shipment.weight_per_unit_kg
      if (total !== shipment.weight_total_kg) {
        onUpdate({ weight_total_kg: total })
      }
    }
  }, [shipment.quantity, shipment.weight_per_unit_kg])

  // Auto-calculate volume in CBM
  React.useEffect(() => {
    if (
      shipment.length_cm &&
      shipment.width_cm &&
      shipment.height_cm &&
      shipment.quantity
    ) {
      const volumeCbm =
        (shipment.length_cm *
          shipment.width_cm *
          shipment.height_cm *
          shipment.quantity) /
        1000000
      const rounded = Math.round(volumeCbm * 10000) / 10000
      if (rounded !== shipment.volume_total_cbm) {
        onUpdate({ volume_total_cbm: rounded })
      }
    }
  }, [shipment.length_cm, shipment.width_cm, shipment.height_cm, shipment.quantity])

  const routeSummary = formatShipmentRoute(shipment)

  return (
    <Card className={cn('overflow-hidden', isExpanded ? 'ring-1 ring-primary/20' : '')}>
      <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="font-mono">
                  #{shipment.shipment_order}
                </Badge>
                <div className="flex flex-col">
                  <CardTitle className="text-sm font-medium">
                    {shipment.shipment_label || `Shipment ${shipment.shipment_order}`}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {routeSummary}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {shipment.service_type_code && (
                  <Badge variant="outline" className="text-xs">
                    {shipment.service_type_code}
                  </Badge>
                )}
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 px-4 pb-4">
            {/* Action buttons */}
            {!readOnly && (
              <div className="flex justify-end gap-2 mb-4 pb-4 border-b">
                {canDuplicate && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onDuplicate}
                    className="gap-1 text-xs"
                  >
                    <Copy className="h-3 w-3" />
                    Duplicate
                  </Button>
                )}
                {canRemove && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove Shipment?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to remove &quot;{shipment.shipment_label || `Shipment ${shipment.shipment_order}`}&quot;?
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={onRemove} className="bg-destructive hover:bg-destructive/90">
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}

            {/* Shipment label */}
            <div className="grid gap-4 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`label-${index}`}>Shipment Label</Label>
                  <Input
                    id={`label-${index}`}
                    placeholder="e.g., Jakarta Route, Shipment A"
                    value={shipment.shipment_label || ''}
                    onChange={(e) => onUpdate({ shipment_label: e.target.value })}
                    disabled={readOnly}
                  />
                </div>
              </div>
            </div>

            {/* Service Type Section */}
            <FormSection variant="service" title="Service Type" icon={Truck} glass>
              <SearchableSelect
                value={shipment.service_type_code || ''}
                onValueChange={(value) => onUpdate({ service_type_code: value })}
                disabled={readOnly}
                placeholder="Select service type"
                searchPlaceholder="Search service..."
                popoverWidth="w-[320px]"
                groups={SERVICE_SCOPES.map((scopeItem) => ({
                  label: scopeItem.label,
                  options: getServicesByScope(scopeItem.value).map((service) => ({
                    value: service.code,
                    label: service.name,
                  })),
                }))}
              />

              {/* Fleet Type (Domestics only) */}
              {isDomesticsService && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label>Fleet Type</Label>
                    <SearchableSelect
                      value={shipment.fleet_type || ''}
                      onValueChange={(value) => onUpdate({ fleet_type: value })}
                      disabled={readOnly}
                      placeholder="Select fleet"
                      searchPlaceholder="Search fleet..."
                      options={FLEET_TYPES.map((fleet) => ({ value: fleet, label: fleet }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fleet Quantity</Label>
                    <Input
                      type="number"
                      min={1}
                      value={shipment.fleet_quantity || 1}
                      onChange={(e) => onUpdate({ fleet_quantity: parseInt(e.target.value) || 1 })}
                      disabled={readOnly}
                    />
                  </div>
                </div>
              )}

              {/* Incoterm (Exim only) */}
              {isEximService && (
                <div className="space-y-2 pt-2">
                  <Label>Incoterm</Label>
                  <SearchableSelect
                    value={shipment.incoterm || ''}
                    onValueChange={(value) => onUpdate({ incoterm: value })}
                    disabled={readOnly}
                    placeholder="Select incoterm"
                    searchPlaceholder="Search incoterm..."
                    options={INCOTERMS.map((term) => ({ value: term.code, label: term.name }))}
                  />
                </div>
              )}
            </FormSection>

            {/* Cargo Information Section */}
            <div className="mt-4">
              <FormSection variant="cargo" title="Cargo Information" glass>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Cargo Category</Label>
                    <Select
                      value={shipment.cargo_category || 'General Cargo'}
                      onValueChange={(value) => onUpdate({ cargo_category: value })}
                      disabled={readOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
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
                </div>
                <div className="space-y-2">
                  <Label>Cargo Description</Label>
                  <Textarea
                    placeholder="Describe the cargo..."
                    value={shipment.cargo_description || ''}
                    onChange={(e) => onUpdate({ cargo_description: e.target.value })}
                    disabled={readOnly}
                    rows={2}
                  />
                </div>
              </FormSection>
            </div>

            {/* Origin & Destination Section */}
            <div className="mt-4">
              <FormSection variant="route" title="Origin & Destination" icon={MapPin} glass>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Origin */}
                  <div className="space-y-3 p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/20">
                    <span className="text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-400">Origin</span>
                    <div className="space-y-2">
                      <Label className="text-xs">Address</Label>
                      <Input
                        placeholder="Street address"
                        value={shipment.origin_address || ''}
                        onChange={(e) => onUpdate({ origin_address: e.target.value })}
                        disabled={readOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">City</Label>
                      <Input
                        placeholder="City"
                        value={shipment.origin_city || ''}
                        onChange={(e) => onUpdate({ origin_city: e.target.value })}
                        disabled={readOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Country</Label>
                      <CountrySelect
                        value={shipment.origin_country || 'Indonesia'}
                        onValueChange={(value) => onUpdate({ origin_country: value })}
                        disabled={readOnly}
                      />
                    </div>
                  </div>

                  {/* Destination */}
                  <div className="space-y-3 p-3 bg-rose-500/5 rounded-lg border border-rose-500/20">
                    <span className="text-xs font-semibold uppercase text-rose-600 dark:text-rose-400">Destination</span>
                    <div className="space-y-2">
                      <Label className="text-xs">Address</Label>
                      <Input
                        placeholder="Street address"
                        value={shipment.destination_address || ''}
                        onChange={(e) => onUpdate({ destination_address: e.target.value })}
                        disabled={readOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">City</Label>
                      <Input
                        placeholder="City"
                        value={shipment.destination_city || ''}
                        onChange={(e) => onUpdate({ destination_city: e.target.value })}
                        disabled={readOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Country</Label>
                      <CountrySelect
                        value={shipment.destination_country || 'Indonesia'}
                        onValueChange={(value) => onUpdate({ destination_country: value })}
                        disabled={readOnly}
                      />
                    </div>
                  </div>
                </div>
              </FormSection>
            </div>

            {/* Quantity & Dimensions Section */}
            <div className="mt-4">
              <FormSection variant="dimensions" title="Quantity & Dimensions" glass>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Quantity</Label>
                    <Input
                      type="number"
                      min={1}
                      value={shipment.quantity || 1}
                      onChange={(e) => onUpdate({ quantity: parseInt(e.target.value) || 1 })}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Unit of Measure</Label>
                    <SearchableSelect
                      value={shipment.unit_of_measure || 'Boxes'}
                      onValueChange={(value) => onUpdate({ unit_of_measure: value })}
                      disabled={readOnly}
                      placeholder="Select unit"
                      searchPlaceholder="Search unit..."
                      options={UNITS_OF_MEASURE.map((unit) => ({ value: unit, label: unit }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Weight/Unit (Kg)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Gross weight"
                      value={shipment.weight_per_unit_kg || ''}
                      onChange={(e) => onUpdate({ weight_per_unit_kg: parseFloat(e.target.value) || null })}
                      disabled={readOnly}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Length (cm)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={shipment.length_cm || ''}
                      onChange={(e) => onUpdate({ length_cm: parseFloat(e.target.value) || null })}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Width (cm)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={shipment.width_cm || ''}
                      onChange={(e) => onUpdate({ width_cm: parseFloat(e.target.value) || null })}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Height (cm)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={shipment.height_cm || ''}
                      onChange={(e) => onUpdate({ height_cm: parseFloat(e.target.value) || null })}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Volume (CBM)</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={shipment.volume_total_cbm || ''}
                      disabled
                      className="bg-muted"
                    />
                    <span className="text-xs text-muted-foreground">Auto-calculated</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Total Weight (Kg)</Label>
                  <Input
                    value={shipment.weight_total_kg ? `${shipment.weight_total_kg} kg` : '-'}
                    disabled
                    className="bg-muted max-w-[200px]"
                  />
                  <span className="text-xs text-muted-foreground">Auto-calculated: Quantity x Weight/Unit</span>
                </div>
              </FormSection>
            </div>

            {/* Scope of Work Section */}
            <div className="mt-4">
              <FormSection variant="scope" title="Scope of Work" glass>
                <Textarea
                  placeholder="Detail pekerjaan dan kebutuhan..."
                  value={shipment.scope_of_work || ''}
                  onChange={(e) => onUpdate({ scope_of_work: e.target.value })}
                  disabled={readOnly}
                  rows={3}
                />
              </FormSection>
            </div>

            {/* Additional Services Section */}
            <div className="mt-4">
              <FormSection variant="additional" title="Additional Services" glass>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {ADDITIONAL_SERVICES.map((service) => (
                    <div key={service.code} className="flex items-center space-x-2">
                      <Checkbox
                        id={`service-${index}-${service.code}`}
                        checked={shipment.additional_services?.includes(service.code) || false}
                        onCheckedChange={(checked) => {
                          const current = shipment.additional_services || []
                          const updated = checked
                            ? [...current, service.code]
                            : current.filter((s) => s !== service.code)
                          onUpdate({ additional_services: updated })
                        }}
                        disabled={readOnly}
                      />
                      <label
                        htmlFor={`service-${index}-${service.code}`}
                        className="text-sm cursor-pointer"
                      >
                        {service.name}
                      </label>
                    </div>
                  ))}
                </div>
              </FormSection>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

// Compact view component for displaying shipments in read-only lists
export function ShipmentSummaryList({
  shipments,
  className,
}: {
  shipments: ShipmentDetail[]
  className?: string
}) {
  if (!shipments || shipments.length === 0) {
    return <span className="text-muted-foreground text-sm">No shipments</span>
  }

  return (
    <div className={cn('space-y-2', className)}>
      {shipments.map((shipment, index) => (
        <div
          key={index}
          className="flex items-center gap-2 p-2 bg-muted/30 rounded-md text-sm"
        >
          <Badge variant="secondary" className="font-mono text-xs">
            #{shipment.shipment_order}
          </Badge>
          <span className="font-medium truncate">
            {shipment.shipment_label || `Shipment ${shipment.shipment_order}`}
          </span>
          <span className="text-muted-foreground truncate flex-1">
            {formatShipmentRoute(shipment)}
          </span>
          {shipment.service_type_code && (
            <Badge variant="outline" className="text-xs shrink-0">
              {shipment.service_type_code}
            </Badge>
          )}
        </div>
      ))}
    </div>
  )
}
