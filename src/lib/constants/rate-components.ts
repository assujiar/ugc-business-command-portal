// Rate component types for logistics industry
export const RATE_COMPONENTS = [
  // Freight & Transportation
  { value: 'freight_charge', label: 'Freight Charge', category: 'Freight & Transportation' },
  { value: 'trucking_origin', label: 'Trucking (Origin)', category: 'Freight & Transportation' },
  { value: 'trucking_destination', label: 'Trucking (Destination)', category: 'Freight & Transportation' },
  { value: 'sea_freight', label: 'Sea Freight', category: 'Freight & Transportation' },
  { value: 'air_freight', label: 'Air Freight', category: 'Freight & Transportation' },
  { value: 'rail_freight', label: 'Rail Freight', category: 'Freight & Transportation' },
  { value: 'barge_freight', label: 'Barge Freight', category: 'Freight & Transportation' },
  { value: 'interisland_freight', label: 'Interisland Freight', category: 'Freight & Transportation' },

  // Port & Terminal Charges
  { value: 'thc_origin', label: 'THC (Origin)', category: 'Port & Terminal' },
  { value: 'thc_destination', label: 'THC (Destination)', category: 'Port & Terminal' },
  { value: 'terminal_handling', label: 'Terminal Handling', category: 'Port & Terminal' },
  { value: 'wharfage', label: 'Wharfage', category: 'Port & Terminal' },
  { value: 'port_charges', label: 'Port Charges', category: 'Port & Terminal' },
  { value: 'container_seal', label: 'Container Seal', category: 'Port & Terminal' },

  // Customs & Documentation
  { value: 'customs_clearance', label: 'Customs Clearance', category: 'Customs & Documentation' },
  { value: 'customs_broker_fee', label: 'Customs Broker Fee', category: 'Customs & Documentation' },
  { value: 'import_duty', label: 'Import Duty', category: 'Customs & Documentation' },
  { value: 'vat_ppn', label: 'VAT/PPN', category: 'Customs & Documentation' },
  { value: 'pph_import', label: 'PPh Import', category: 'Customs & Documentation' },
  { value: 'quarantine_fee', label: 'Quarantine Fee', category: 'Customs & Documentation' },
  { value: 'fumigation', label: 'Fumigation', category: 'Customs & Documentation' },
  { value: 'certificate_of_origin', label: 'Certificate of Origin', category: 'Customs & Documentation' },
  { value: 'legalization_fee', label: 'Legalization Fee', category: 'Customs & Documentation' },

  // Handling & Storage
  { value: 'handling_charge', label: 'Handling Charge', category: 'Handling & Storage' },
  { value: 'loading_unloading', label: 'Loading/Unloading', category: 'Handling & Storage' },
  { value: 'forklift_charge', label: 'Forklift Charge', category: 'Handling & Storage' },
  { value: 'warehouse_storage', label: 'Warehouse Storage', category: 'Handling & Storage' },
  { value: 'stuffing_unstuffing', label: 'Stuffing/Unstuffing', category: 'Handling & Storage' },
  { value: 'palletization', label: 'Palletization', category: 'Handling & Storage' },
  { value: 'wrapping_packing', label: 'Wrapping/Packing', category: 'Handling & Storage' },
  { value: 'labeling', label: 'Labeling', category: 'Handling & Storage' },

  // Insurance & Security
  { value: 'cargo_insurance', label: 'Cargo Insurance', category: 'Insurance & Security' },
  { value: 'marine_insurance', label: 'Marine Insurance', category: 'Insurance & Security' },
  { value: 'security_charge', label: 'Security Charge', category: 'Insurance & Security' },

  // Container & Equipment
  { value: 'container_rental', label: 'Container Rental', category: 'Container & Equipment' },
  { value: 'container_cleaning', label: 'Container Cleaning', category: 'Container & Equipment' },
  { value: 'container_repair', label: 'Container Repair', category: 'Container & Equipment' },
  { value: 'demurrage', label: 'Demurrage', category: 'Container & Equipment' },
  { value: 'detention', label: 'Detention', category: 'Container & Equipment' },
  { value: 'reefer_plug_in', label: 'Reefer Plug-in', category: 'Container & Equipment' },

  // Documentation & Admin
  { value: 'documentation_fee', label: 'Documentation Fee', category: 'Documentation & Admin' },
  { value: 'bill_of_lading_fee', label: 'Bill of Lading Fee', category: 'Documentation & Admin' },
  { value: 'telex_release', label: 'Telex Release', category: 'Documentation & Admin' },
  { value: 'manifest_fee', label: 'Manifest Fee', category: 'Documentation & Admin' },
  { value: 'admin_fee', label: 'Admin Fee', category: 'Documentation & Admin' },
  { value: 'communication_fee', label: 'Communication Fee', category: 'Documentation & Admin' },

  // Special Services
  { value: 'dangerous_goods_surcharge', label: 'Dangerous Goods Surcharge', category: 'Special Services' },
  { value: 'overweight_surcharge', label: 'Overweight Surcharge', category: 'Special Services' },
  { value: 'oversized_surcharge', label: 'Oversized Surcharge', category: 'Special Services' },
  { value: 'lift_on_lift_off', label: 'Lift On/Lift Off (LOLO)', category: 'Special Services' },
  { value: 'surveyor_fee', label: 'Surveyor Fee', category: 'Special Services' },
  { value: 'sampling_fee', label: 'Sampling Fee', category: 'Special Services' },
  { value: 'inspection_fee', label: 'Inspection Fee', category: 'Special Services' },

  // Surcharges
  { value: 'fuel_surcharge', label: 'Fuel Surcharge (BAF/FSC)', category: 'Surcharges' },
  { value: 'currency_adjustment_factor', label: 'Currency Adjustment Factor (CAF)', category: 'Surcharges' },
  { value: 'peak_season_surcharge', label: 'Peak Season Surcharge (PSS)', category: 'Surcharges' },
  { value: 'congestion_surcharge', label: 'Congestion Surcharge', category: 'Surcharges' },
  { value: 'low_sulphur_surcharge', label: 'Low Sulphur Surcharge (LSS)', category: 'Surcharges' },
  { value: 'war_risk_surcharge', label: 'War Risk Surcharge', category: 'Surcharges' },
  { value: 'piracy_surcharge', label: 'Piracy Surcharge', category: 'Surcharges' },

  // Other
  { value: 'other', label: 'Other', category: 'Other' },
] as const

export type RateComponentType = typeof RATE_COMPONENTS[number]['value']

// Group rate components by category
export const RATE_COMPONENTS_BY_CATEGORY = RATE_COMPONENTS.reduce((acc, component) => {
  if (!acc[component.category]) {
    acc[component.category] = []
  }
  acc[component.category].push(component)
  return acc
}, {} as Record<string, typeof RATE_COMPONENTS[number][]>)

// Get label for a component type
export const getRateComponentLabel = (value: string): string => {
  const component = RATE_COMPONENTS.find(c => c.value === value)
  return component?.label || value
}
