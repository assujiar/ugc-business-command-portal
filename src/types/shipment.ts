// =====================================================
// Shipment Types - Multi-Shipment Support
// =====================================================

export interface ShipmentDetail {
  // Identity
  shipment_detail_id?: string
  shipment_order: number
  shipment_label?: string | null

  // Service Information
  service_type_code?: string | null
  department?: string | null

  // Fleet (for Domestics)
  fleet_type?: string | null
  fleet_quantity?: number | null

  // Incoterms (for Export/Import)
  incoterm?: string | null

  // Cargo Information
  cargo_category?: string | null
  cargo_description?: string | null

  // Origin Details
  origin_address?: string | null
  origin_city?: string | null
  origin_country?: string | null
  origin_port?: string | null

  // Destination Details
  destination_address?: string | null
  destination_city?: string | null
  destination_country?: string | null
  destination_port?: string | null

  // Quantity & Dimensions
  quantity?: number | null
  unit_of_measure?: string | null
  weight_per_unit_kg?: number | null
  weight_total_kg?: number | null
  length_cm?: number | null
  width_cm?: number | null
  height_cm?: number | null
  volume_total_cbm?: number | null

  // Scope & Services
  scope_of_work?: string | null
  additional_services?: string[]

  // For quotation display
  commodity?: string | null
  cargo_weight?: number | null
  cargo_weight_unit?: string | null
  cargo_volume?: number | null
  cargo_volume_unit?: string | null
  cargo_quantity?: number | null
  cargo_quantity_unit?: string | null
  service_type?: string | null
}

// Default empty shipment for new entries
export const createEmptyShipment = (order: number = 1): ShipmentDetail => ({
  shipment_order: order,
  shipment_label: order === 1 ? 'Shipment 1' : `Shipment ${order}`,
  service_type_code: '',
  department: null,
  fleet_type: null,
  fleet_quantity: 1,
  incoterm: null,
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

// Helper to convert legacy single shipment to array
export const normalizeShipments = (data: ShipmentDetail | ShipmentDetail[] | null | undefined): ShipmentDetail[] => {
  if (!data) return []
  if (Array.isArray(data)) return data
  // Single shipment object - wrap in array
  return [{ ...data, shipment_order: data.shipment_order || 1 }]
}

// Helper to get summary text for a shipment
export const getShipmentSummary = (shipment: ShipmentDetail): string => {
  const parts: string[] = []

  if (shipment.origin_city && shipment.destination_city) {
    parts.push(`${shipment.origin_city} → ${shipment.destination_city}`)
  }

  if (shipment.service_type_code) {
    parts.push(shipment.service_type_code)
  }

  if (shipment.cargo_description) {
    parts.push(shipment.cargo_description.substring(0, 30) + (shipment.cargo_description.length > 30 ? '...' : ''))
  }

  return parts.join(' | ') || `Shipment ${shipment.shipment_order}`
}

// Helper to format shipment route
export const formatShipmentRoute = (shipment: ShipmentDetail): string => {
  const origin = shipment.origin_city || shipment.origin_country || 'Origin'
  const destination = shipment.destination_city || shipment.destination_country || 'Destination'
  return `${origin} → ${destination}`
}
