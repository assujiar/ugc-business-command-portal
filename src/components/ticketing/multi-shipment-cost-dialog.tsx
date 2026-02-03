'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  DollarSign,
  Package,
  Plus,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { RATE_COMPONENTS_BY_CATEGORY, getRateComponentLabel } from '@/lib/constants/rate-components'
import type { ShipmentDetail } from '@/types/shipment'

interface ShipmentCostData {
  shipment_detail_id: string | null
  shipment_label: string
  amount: string
  rate_structure: 'bundling' | 'breakdown'
  items: Array<{
    id: string
    component_type: string
    component_name: string
    description: string
    cost_amount: number
    quantity: number | null
    unit: string | null
  }>
  expanded: boolean
}

interface MultiShipmentCostDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticketId: string
  ticketCode: string
  shipments: ShipmentDetail[]
  existingCosts?: Array<{
    id: string
    shipment_detail_id: string | null
    shipment_label: string | null
    amount: number
    status: string
  }>
  onSuccess?: () => void
}

const formatCurrency = (amount: number, currency: string = 'IDR') => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function MultiShipmentCostDialog({
  open,
  onOpenChange,
  ticketId,
  ticketCode,
  shipments,
  existingCosts = [],
  onSuccess,
}: MultiShipmentCostDialogProps) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [currency, setCurrency] = useState('IDR')
  const [shipmentCosts, setShipmentCosts] = useState<ShipmentCostData[]>([])

  // Initialize shipment costs from shipments prop
  useEffect(() => {
    if (!open) return

    const initialCosts: ShipmentCostData[] = shipments.map((shipment, idx) => {
      // Check if this shipment already has a submitted cost
      const existingCost = existingCosts.find(
        c => c.shipment_detail_id === shipment.shipment_detail_id && c.status === 'submitted'
      )

      return {
        shipment_detail_id: shipment.shipment_detail_id || null,
        shipment_label: shipment.shipment_label || `Shipment ${idx + 1}`,
        amount: existingCost ? String(existingCost.amount) : '',
        rate_structure: 'bundling' as const,
        items: [],
        expanded: idx === 0, // Expand first shipment by default
      }
    })

    setShipmentCosts(initialCosts)
  }, [open, shipments, existingCosts])

  // Calculate totals
  const totals = useMemo(() => {
    let grandTotal = 0
    let filledCount = 0

    shipmentCosts.forEach(cost => {
      const amount = cost.rate_structure === 'breakdown'
        ? cost.items.reduce((sum, item) => sum + (item.cost_amount || 0), 0)
        : parseFloat(cost.amount) || 0

      if (amount > 0) {
        grandTotal += amount
        filledCount++
      }
    })

    return {
      grandTotal,
      filledCount,
      totalShipments: shipmentCosts.length,
      allFilled: filledCount === shipmentCosts.length && shipmentCosts.length > 0,
    }
  }, [shipmentCosts])

  // Update a specific shipment cost
  const updateShipmentCost = (index: number, field: keyof ShipmentCostData, value: any) => {
    setShipmentCosts(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  // Toggle shipment expansion
  const toggleExpanded = (index: number) => {
    updateShipmentCost(index, 'expanded', !shipmentCosts[index].expanded)
  }

  // Add breakdown item to a shipment
  const addItemToShipment = (shipmentIndex: number) => {
    const newItem = {
      id: `item-${Date.now()}`,
      component_type: '',
      component_name: '',
      description: '',
      cost_amount: 0,
      quantity: null,
      unit: null,
    }
    setShipmentCosts(prev => {
      const updated = [...prev]
      updated[shipmentIndex] = {
        ...updated[shipmentIndex],
        items: [...updated[shipmentIndex].items, newItem],
      }
      return updated
    })
  }

  // Update breakdown item
  const updateItem = (shipmentIndex: number, itemId: string, field: string, value: any) => {
    setShipmentCosts(prev => {
      const updated = [...prev]
      updated[shipmentIndex] = {
        ...updated[shipmentIndex],
        items: updated[shipmentIndex].items.map(item => {
          if (item.id === itemId) {
            const updatedItem = { ...item, [field]: value }
            // Auto-fill component name from type
            if (field === 'component_type' && !item.component_name) {
              updatedItem.component_name = getRateComponentLabel(value)
            }
            return updatedItem
          }
          return item
        }),
      }
      return updated
    })
  }

  // Remove breakdown item
  const removeItem = (shipmentIndex: number, itemId: string) => {
    setShipmentCosts(prev => {
      const updated = [...prev]
      updated[shipmentIndex] = {
        ...updated[shipmentIndex],
        items: updated[shipmentIndex].items.filter(item => item.id !== itemId),
      }
      return updated
    })
  }

  // Calculate breakdown total for a shipment
  const getBreakdownTotal = (items: ShipmentCostData['items']) => {
    return items.reduce((sum, item) => sum + (item.cost_amount || 0), 0)
  }

  // Get shipment cost amount
  const getShipmentAmount = (cost: ShipmentCostData) => {
    if (cost.rate_structure === 'breakdown') {
      return getBreakdownTotal(cost.items)
    }
    return parseFloat(cost.amount) || 0
  }

  // Check if shipment has existing cost
  const hasExistingCost = (shipmentDetailId: string | null) => {
    return existingCosts.some(
      c => c.shipment_detail_id === shipmentDetailId && c.status === 'submitted'
    )
  }

  // Handle submit
  const handleSubmit = async () => {
    // Filter shipments that have costs to submit (skip existing)
    const costsToSubmit = shipmentCosts
      .filter(cost => {
        const amount = getShipmentAmount(cost)
        const alreadyExists = hasExistingCost(cost.shipment_detail_id)
        return amount > 0 && !alreadyExists
      })
      .map(cost => ({
        shipment_detail_id: cost.shipment_detail_id,
        shipment_label: cost.shipment_label,
        amount: getShipmentAmount(cost),
        rate_structure: cost.rate_structure,
        items: cost.rate_structure === 'breakdown'
          ? cost.items.filter(item => item.component_type && item.cost_amount > 0).map((item, idx) => ({
              component_type: item.component_type,
              component_name: item.component_name,
              description: item.description,
              cost_amount: item.cost_amount,
              quantity: item.quantity,
              unit: item.unit,
              sort_order: idx,
            }))
          : undefined,
      }))

    if (costsToSubmit.length === 0) {
      toast({
        title: 'No Costs to Submit',
        description: 'Please enter at least one cost for a shipment that does not already have a submitted cost.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/ticketing/operational-costs/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: ticketId,
          currency,
          shipment_costs: costsToSubmit,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit costs')
      }

      toast({
        title: 'Costs Submitted Successfully',
        description: `${result.costs_count} operational cost(s) created for ${ticketCode}`,
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit costs',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Submit Operational Costs
          </DialogTitle>
          <DialogDescription>
            Enter costs for all shipments in {ticketCode}. Each shipment can have its own cost.
          </DialogDescription>
        </DialogHeader>

        {/* Summary Header */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total Cost</p>
              <p className="text-lg font-bold font-mono text-primary">
                {formatCurrency(totals.grandTotal, currency)}
              </p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <p className="text-xs text-muted-foreground">Shipments Costed</p>
              <p className="text-sm font-medium">
                {totals.filledCount} of {totals.totalShipments}
                {totals.allFilled && <Check className="inline ml-1 h-4 w-4 text-green-500" />}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="currency" className="text-sm">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="currency" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IDR">IDR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="SGD">SGD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Shipment Costs List */}
        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          {shipmentCosts.map((cost, shipmentIndex) => {
            const shipment = shipments[shipmentIndex]
            const amount = getShipmentAmount(cost)
            const alreadyHasCost = hasExistingCost(cost.shipment_detail_id)

            return (
              <div
                key={cost.shipment_detail_id || shipmentIndex}
                className={`border rounded-lg overflow-hidden ${
                  alreadyHasCost ? 'bg-green-50 dark:bg-green-900/10 border-green-200' : ''
                }`}
              >
                {/* Shipment Header */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(shipmentIndex)}
                  className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <div className="text-left">
                      <p className="font-medium text-sm">{cost.shipment_label}</p>
                      <p className="text-xs text-muted-foreground">
                        {shipment?.origin_city || '-'} → {shipment?.destination_city || '-'}
                        {shipment?.service_type_code && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {shipment.service_type_code}
                          </Badge>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {alreadyHasCost && (
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                        <Check className="h-3 w-3 mr-1" />
                        Cost Submitted
                      </Badge>
                    )}
                    {amount > 0 && !alreadyHasCost && (
                      <span className="font-mono font-bold text-primary">
                        {formatCurrency(amount, currency)}
                      </span>
                    )}
                    {cost.expanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Shipment Details (Expanded) */}
                {cost.expanded && (
                  <div className="p-3 border-t space-y-4">
                    {alreadyHasCost ? (
                      <div className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        This shipment already has a submitted cost. To revise, use the existing cost management.
                      </div>
                    ) : (
                      <>
                        {/* Shipment Info Summary */}
                        {shipment && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs p-2 bg-slate-50 dark:bg-slate-900/50 rounded">
                            {shipment.fleet_type && (
                              <div>
                                <span className="text-muted-foreground">Fleet:</span>{' '}
                                <span className="font-medium">{shipment.fleet_type} x {shipment.fleet_quantity || 1}</span>
                              </div>
                            )}
                            {shipment.incoterm && (
                              <div>
                                <span className="text-muted-foreground">Incoterm:</span>{' '}
                                <span className="font-medium">{shipment.incoterm}</span>
                              </div>
                            )}
                            {shipment.weight_total_kg && (
                              <div>
                                <span className="text-muted-foreground">Weight:</span>{' '}
                                <span className="font-medium">{shipment.weight_total_kg.toLocaleString()} kg</span>
                              </div>
                            )}
                            {shipment.volume_total_cbm && (
                              <div>
                                <span className="text-muted-foreground">Volume:</span>{' '}
                                <span className="font-medium">{shipment.volume_total_cbm} CBM</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Rate Structure Toggle */}
                        <div className="flex items-center gap-2">
                          <Label className="text-sm">Cost Structure:</Label>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant={cost.rate_structure === 'bundling' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => updateShipmentCost(shipmentIndex, 'rate_structure', 'bundling')}
                            >
                              Bundling
                            </Button>
                            <Button
                              type="button"
                              variant={cost.rate_structure === 'breakdown' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => updateShipmentCost(shipmentIndex, 'rate_structure', 'breakdown')}
                            >
                              Breakdown
                            </Button>
                          </div>
                        </div>

                        {/* Bundling Mode */}
                        {cost.rate_structure === 'bundling' && (
                          <div className="p-3 bg-muted/30 rounded-lg">
                            <Label htmlFor={`amount-${shipmentIndex}`}>Total Cost *</Label>
                            <Input
                              id={`amount-${shipmentIndex}`}
                              type="number"
                              placeholder="Enter total cost amount"
                              value={cost.amount}
                              onChange={(e) => updateShipmentCost(shipmentIndex, 'amount', e.target.value)}
                              className="mt-2 text-right font-mono"
                            />
                          </div>
                        )}

                        {/* Breakdown Mode */}
                        {cost.rate_structure === 'breakdown' && (
                          <div className="space-y-3">
                            {/* Total */}
                            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded">
                              <span className="text-xs text-muted-foreground">Breakdown Total: </span>
                              <span className="font-bold font-mono text-green-700 dark:text-green-400">
                                {formatCurrency(getBreakdownTotal(cost.items), currency)}
                              </span>
                            </div>

                            {/* Add Item Button */}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => addItemToShipment(shipmentIndex)}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Add Item
                            </Button>

                            {/* Items */}
                            {cost.items.length === 0 ? (
                              <div className="text-center py-4 text-muted-foreground text-sm border border-dashed rounded">
                                No items added. Click "Add Item" to start.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {cost.items.map((item, itemIndex) => (
                                  <div key={item.id} className="p-2 border rounded space-y-2 bg-background">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-medium">Item {itemIndex + 1}</span>
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-destructive"
                                        onClick={() => removeItem(shipmentIndex, item.id)}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                      <div>
                                        <Label className="text-xs">Component *</Label>
                                        <Select
                                          value={item.component_type}
                                          onValueChange={(v) => updateItem(shipmentIndex, item.id, 'component_type', v)}
                                        >
                                          <SelectTrigger className="h-8 text-xs">
                                            <SelectValue placeholder="Select" />
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
                                      <div>
                                        <Label className="text-xs">Name</Label>
                                        <Input
                                          className="h-8 text-xs"
                                          value={item.component_name}
                                          onChange={(e) => updateItem(shipmentIndex, item.id, 'component_name', e.target.value)}
                                          placeholder="Custom name"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Amount *</Label>
                                        <Input
                                          className="h-8 text-xs text-right font-mono"
                                          type="number"
                                          value={item.cost_amount || ''}
                                          onChange={(e) => updateItem(shipmentIndex, item.id, 'cost_amount', parseFloat(e.target.value) || 0)}
                                          placeholder="0"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || totals.filledCount === 0}>
            {submitting ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <DollarSign className="mr-2 h-4 w-4" />
            )}
            Submit {totals.filledCount > 0 ? `${totals.filledCount} Cost${totals.filledCount > 1 ? 's' : ''}` : 'Costs'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
