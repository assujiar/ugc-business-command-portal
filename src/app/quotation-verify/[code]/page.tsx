'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { CheckCircle, XCircle, Clock, AlertTriangle, MapPin, Package, FileText, Calendar, User, Phone, Mail, Globe, Truck, Box, Scale, Ruler, MessageCircle } from 'lucide-react'

interface ShipmentData {
  index: number
  origin_city: string | null
  origin_country: string | null
  destination_city: string | null
  destination_country: string | null
  cargo_description: string | null
  weight: number | null
  volume: number | null
  route: string
  // Service type per shipment
  service_type: string | null
  incoterm: string | null
  // Multi-shipment cost support
  cost_amount: number | null
  selling_rate: number | null
  selling_rate_formatted: string | null
  fleet_type: string | null
  fleet_quantity: number | null
}

interface QuotationData {
  quotation_number: string
  status: string
  created_at: string
  updated_at: string
  valid_until: string
  is_expired: boolean
  customer_name: string
  customer_company: string | null
  service_type: string | null
  incoterm: string | null
  route: string | null
  // Multi-shipment support
  shipments: ShipmentData[] | null
  shipment_count: number
  // Cargo details
  commodity: string | null
  cargo_description: string | null
  cargo_weight: number | null
  cargo_weight_unit: string
  cargo_volume: number | null
  cargo_volume_unit: string
  cargo_value: string | null
  fleet_type: string | null
  fleet_quantity: number | null
  total_amount: string
  currency: string
  rate_structure: string
  scope_of_work: string | null
  terms_includes: string[] | null
  terms_excludes: string[] | null
  terms_notes: string | null
  items: Array<{
    name: string
    amount: string
    quantity: number | null
    unit: string | null
  }> | null
  issued_by: string
}

interface VerificationResponse {
  valid: boolean
  verification_status: 'valid' | 'expired' | 'revoked'
  data?: QuotationData
  error?: string
}

// UGC Company Info
const UGC_INFO = {
  name: 'PT. Utama Global Indo Cargo',
  shortName: 'UGC Logistics',
  address: 'Graha Fadillah, Jl Prof. Soepomo SH No. 45 BZ Blok C, Tebet, Jakarta Selatan, Indonesia 12810',
  phone: '+6221 8350778',
  fax: '+6221 8300219',
  whatsapp: '+62812 8459 6614',
  email: 'service@ugc.co.id',
  web: 'www.utamaglobalindocargo.com',
}

export default function QuotationVerifyPage() {
  const params = useParams()
  const code = params.code as string

  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<VerificationResponse | null>(null)

  useEffect(() => {
    const verifyQuotation = async () => {
      try {
        const response = await fetch(`/api/ticketing/customer-quotations/validate/${code}`)
        const data = await response.json()
        setResult(data)
      } catch (error) {
        setResult({
          valid: false,
          verification_status: 'revoked',
          error: 'Failed to verify quotation',
        })
      } finally {
        setLoading(false)
      }
    }

    if (code) {
      verifyQuotation()
    }
  }, [code])

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Quotation status display config
  const getQuotationStatusConfig = (status: string) => {
    const config: Record<string, { label: string; color: string; bg: string }> = {
      draft: { label: 'DRAFT', color: 'text-gray-700', bg: 'bg-gray-100' },
      sent: { label: 'ACTIVE', color: 'text-emerald-700', bg: 'bg-emerald-100' },
      accepted: { label: 'ACCEPTED', color: 'text-blue-700', bg: 'bg-blue-100' },
      rejected: { label: 'REJECTED', color: 'text-red-700', bg: 'bg-red-100' },
      expired: { label: 'EXPIRED', color: 'text-amber-700', bg: 'bg-amber-100' },
    }
    return config[status] || config.draft
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#ff4600] via-[#ff6b35] to-[#ff8c42] flex items-center justify-center">
        <div className="text-center bg-white/95 backdrop-blur-sm rounded-2xl p-8 shadow-2xl">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#ff4600] border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-700 font-medium">Verifying quotation...</p>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#ff4600] via-[#ff6b35] to-[#ff8c42] flex items-center justify-center p-4">
        <div className="text-center bg-white rounded-2xl p-8 shadow-2xl max-w-md w-full">
          <XCircle className="h-16 w-16 text-red-500 mx-auto" />
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Verification Error</h1>
          <p className="mt-2 text-gray-600">Unable to verify the quotation. Please try again.</p>
        </div>
      </div>
    )
  }

  const getStatusDisplay = () => {
    switch (result.verification_status) {
      case 'valid':
        return {
          icon: <CheckCircle className="h-16 w-16 text-emerald-500" />,
          title: 'Quotation Verified',
          subtitle: 'This is an authentic quotation from UGC Logistics',
          bgColor: 'bg-emerald-50',
          borderColor: 'border-emerald-400',
          textColor: 'text-emerald-700',
          badgeColor: 'bg-emerald-500',
        }
      case 'expired':
        return {
          icon: <Clock className="h-16 w-16 text-amber-500" />,
          title: 'Quotation Expired',
          subtitle: 'This quotation is authentic but has passed its validity period',
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-400',
          textColor: 'text-amber-700',
          badgeColor: 'bg-amber-500',
        }
      case 'revoked':
        return {
          icon: <XCircle className="h-16 w-16 text-red-500" />,
          title: 'Quotation Revoked',
          subtitle: 'This quotation has been revoked and is no longer valid',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-400',
          textColor: 'text-red-700',
          badgeColor: 'bg-red-500',
        }
      default:
        return {
          icon: <AlertTriangle className="h-16 w-16 text-gray-500" />,
          title: 'Invalid Code',
          subtitle: 'This quotation code is not found in our system',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-400',
          textColor: 'text-gray-700',
          badgeColor: 'bg-gray-500',
        }
    }
  }

  const status = getStatusDisplay()
  const data = result.data

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header with Orange Gradient */}
      <header className="bg-gradient-to-r from-[#ff4600] to-[#ff6b35] text-white py-6 shadow-lg">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Image
                src="/logo/logougctaglinewhite.png"
                alt="UGC Logo"
                width={160}
                height={50}
                className="h-12 w-auto"
              />
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-white/90 text-sm font-medium">Quotation Verification Portal</p>
              <p className="text-white/70 text-xs mt-1">{UGC_INFO.web}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Status Card */}
        <div className={`${status.bgColor} border-2 ${status.borderColor} rounded-2xl p-6 mb-6 shadow-sm`}>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
            <div className="flex-shrink-0">{status.icon}</div>
            <div>
              <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
                <h2 className={`text-2xl font-bold ${status.textColor}`}>{status.title}</h2>
                <span className={`${status.badgeColor} text-white text-xs px-3 py-1 rounded-full font-medium uppercase tracking-wide`}>
                  {result.verification_status}
                </span>
              </div>
              <p className="text-gray-600 mt-2">{status.subtitle}</p>
            </div>
          </div>
        </div>

        {/* Quotation Details */}
        {data && (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Quotation Header with Orange Accent */}
            <div className="bg-gradient-to-r from-[#ff4600] to-[#ff6b35] p-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-center sm:text-left">
                  <p className="text-white/80 text-sm font-medium">Quotation Number</p>
                  <p className="text-2xl font-bold text-white tracking-wide">{data.quotation_number}</p>
                  {/* Status Badge */}
                  <span className={`inline-block mt-2 px-3 py-1 rounded text-xs font-bold ${getQuotationStatusConfig(data.status).bg} ${getQuotationStatusConfig(data.status).color}`}>
                    {getQuotationStatusConfig(data.status).label}
                  </span>
                </div>
                {/* Only show aggregate total for single shipment */}
                {(!data.shipments || data.shipments.length <= 1) && (
                  <div className="text-center sm:text-right">
                    <p className="text-white/80 text-sm font-medium">Total Amount</p>
                    <p className="text-3xl font-bold text-white">{data.total_amount}</p>
                  </div>
                )}
                {/* For multi-shipment, show shipment count indicator */}
                {data.shipments && data.shipments.length > 1 && (
                  <div className="text-center sm:text-right">
                    <p className="text-white/80 text-sm font-medium">Multiple Shipments</p>
                    <p className="text-2xl font-bold text-white">{data.shipments.length} Shipments</p>
                    <p className="text-white/70 text-xs mt-1">See rates below</p>
                  </div>
                )}
              </div>
            </div>

            {/* Details Grid */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer Info */}
              <div className="space-y-3">
                <h3 className="font-semibold text-[#ff4600] flex items-center gap-2 text-sm uppercase tracking-wide">
                  <User className="h-4 w-4" />
                  Customer
                </h3>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="font-semibold text-gray-900">{data.customer_name}</p>
                  {data.customer_company && (
                    <p className="text-gray-600 text-sm mt-1">{data.customer_company}</p>
                  )}
                </div>
              </div>

              {/* Dates */}
              <div className="space-y-3">
                <h3 className="font-semibold text-[#ff4600] flex items-center gap-2 text-sm uppercase tracking-wide">
                  <Calendar className="h-4 w-4" />
                  Important Dates
                </h3>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Issue Date:</span>
                    <span className="font-medium text-gray-900">{formatDateTime(data.created_at)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Status Update:</span>
                    <span className="font-medium text-gray-900">{formatDateTime(data.updated_at)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Valid Until:</span>
                    <span className={`font-medium ${data.is_expired ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatDate(data.valid_until)}
                      {data.is_expired && <span className="ml-1 text-xs">(Expired)</span>}
                    </span>
                  </div>
                </div>
              </div>

              {/* Service Details */}
              {(data.service_type || data.incoterm) && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-[#ff4600] flex items-center gap-2 text-sm uppercase tracking-wide">
                    <Package className="h-4 w-4" />
                    Service Details
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    {data.service_type && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Type:</span>
                        <span className="font-medium text-gray-900">{data.service_type}</span>
                      </div>
                    )}
                    {data.incoterm && (
                      <div className="flex justify-between text-sm mt-2">
                        <span className="text-gray-500">Incoterm:</span>
                        <span className="font-medium text-gray-900">{data.incoterm}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Route / Multi-Shipment */}
              {data.shipments && data.shipments.length > 1 ? (
                <div className="space-y-3 md:col-span-2">
                  <h3 className="font-semibold text-[#ff4600] flex items-center gap-2 text-sm uppercase tracking-wide">
                    <MapPin className="h-4 w-4" />
                    Shipments ({data.shipments.length})
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                    {data.shipments.map((shipment) => (
                      <div key={shipment.index} className="flex items-start gap-3 pb-3 border-b border-gray-200 last:border-0 last:pb-0">
                        <span className="flex-shrink-0 bg-[#ff4600] text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                          {shipment.index}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{shipment.route}</p>
                              {/* Service type, weight, volume per shipment */}
                              {(shipment.service_type || shipment.weight || shipment.volume || shipment.incoterm) && (
                                <p className="text-xs font-semibold text-[#ff4600] mt-1">
                                  {[
                                    shipment.service_type,
                                    shipment.weight && `${shipment.weight.toLocaleString()} kg`,
                                    shipment.volume && `${shipment.volume.toLocaleString()} cbm`,
                                    shipment.incoterm,
                                  ].filter(Boolean).join(' • ')}
                                </p>
                              )}
                              {shipment.cargo_description && (
                                <p className="text-xs text-gray-500 mt-1">{shipment.cargo_description}</p>
                              )}
                              <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-400">
                                {shipment.fleet_type && (
                                  <span className="text-[#ff4600]">
                                    Fleet: {shipment.fleet_type}
                                    {shipment.fleet_quantity && shipment.fleet_quantity > 1 && ` × ${shipment.fleet_quantity}`}
                                  </span>
                                )}
                              </div>
                            </div>
                            {shipment.selling_rate_formatted && (
                              <span className="text-sm font-bold text-[#ff4600] whitespace-nowrap">
                                {shipment.selling_rate_formatted}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : data.route && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-[#ff4600] flex items-center gap-2 text-sm uppercase tracking-wide">
                    <MapPin className="h-4 w-4" />
                    Route
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <p className="text-sm text-gray-900">{data.route}</p>
                  </div>
                </div>
              )}

              {/* Fleet */}
              {data.fleet_type && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-[#ff4600] flex items-center gap-2 text-sm uppercase tracking-wide">
                    <Truck className="h-4 w-4" />
                    Fleet
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <p className="text-sm font-medium text-gray-900">
                      {data.fleet_type}
                      {data.fleet_quantity && data.fleet_quantity > 1 && (
                        <span className="text-[#ff4600]"> × {data.fleet_quantity} unit</span>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Cargo Details Section */}
            {(data.commodity || data.cargo_description || data.cargo_weight || data.cargo_volume || data.cargo_value) && (
              <div className="px-6 pb-6">
                <h3 className="font-semibold text-[#ff4600] mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                  <Box className="h-4 w-4" />
                  Cargo Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.commodity && (
                    <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Commodity</p>
                      <p className="font-semibold text-gray-900 mt-1">{data.commodity}</p>
                    </div>
                  )}
                  {data.cargo_description && (
                    <div className="bg-orange-50 rounded-xl p-4 border border-orange-100 sm:col-span-2 lg:col-span-2">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Description</p>
                      <p className="font-medium text-gray-900 mt-1">{data.cargo_description}</p>
                    </div>
                  )}
                  {data.cargo_weight && (
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <div className="flex items-center gap-2">
                        <Scale className="h-4 w-4 text-[#ff4600]" />
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Total Weight</p>
                      </div>
                      <p className="font-semibold text-gray-900 mt-1">
                        {data.cargo_weight.toLocaleString()} {data.cargo_weight_unit}
                      </p>
                    </div>
                  )}
                  {data.cargo_volume && (
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <div className="flex items-center gap-2">
                        <Ruler className="h-4 w-4 text-[#ff4600]" />
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Total Volume</p>
                      </div>
                      <p className="font-semibold text-gray-900 mt-1">
                        {data.cargo_volume.toLocaleString()} {data.cargo_volume_unit}
                      </p>
                    </div>
                  )}
                  {data.cargo_value && (
                    <div className="bg-[#ff4600]/10 rounded-xl p-4 border border-[#ff4600]/20">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Cargo Value</p>
                      <p className="font-bold text-[#ff4600] mt-1 text-lg">{data.cargo_value}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Rate Breakdown - Single shipment with breakdown */}
            {data.items && data.items.length > 0 && (!data.shipments || data.shipments.length <= 1) && (
              <div className="px-6 pb-6">
                <h3 className="font-semibold text-[#ff4600] mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                  <FileText className="h-4 w-4" />
                  Rate Breakdown
                </h3>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#ff4600]">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-white">Description</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-white">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item, index) => (
                        <tr key={index} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 text-gray-900">
                            {item.name}
                            {item.quantity && item.unit && (
                              <span className="text-gray-500 text-sm ml-2">
                                ({item.quantity} {item.unit})
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-gray-900">{item.amount}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-[#ff4600] bg-orange-50">
                        <td className="py-3 px-4 font-bold text-[#ff4600]">Total</td>
                        <td className="py-3 px-4 text-right font-bold text-[#ff4600] text-lg">{data.total_amount}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Rate Breakdown - Multi-shipment: grouped by shipment section */}
            {data.items && data.items.length > 0 && data.shipments && data.shipments.length > 1 && (() => {
              // Group items by shipment prefix
              const itemsByShipment = new Map<number, { items: typeof data.items, subtotal: number }>()
              data.shipments!.forEach((_, idx) => itemsByShipment.set(idx, { items: [], subtotal: 0 }))

              data.items!.forEach((item) => {
                const shipmentMatch = item.name.match(/^Shipment\s*(\d+)\s*:\s*/i)
                if (shipmentMatch) {
                  const shipmentIndex = parseInt(shipmentMatch[1]) - 1
                  if (itemsByShipment.has(shipmentIndex)) {
                    const group = itemsByShipment.get(shipmentIndex)!
                    const cleanedItem = {
                      ...item,
                      name: item.name.replace(/^Shipment\s*\d+\s*:\s*/i, '')
                    }
                    group.items!.push(cleanedItem)
                    // Parse amount string to number for subtotal (remove currency and format)
                    const amountNum = parseFloat(item.amount.replace(/[^0-9.-]/g, '')) || 0
                    group.subtotal += amountNum
                  }
                }
              })

              return (
                <div className="px-6 pb-6">
                  <h3 className="font-semibold text-[#ff4600] mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <FileText className="h-4 w-4" />
                    Rate Breakdown by Shipment
                  </h3>
                  <div className="space-y-4">
                    {data.shipments!.map((shipment, idx) => {
                      const group = itemsByShipment.get(idx)
                      if (!group || !group.items || group.items.length === 0) return null
                      return (
                        <div key={idx} className="overflow-hidden rounded-xl border border-gray-200">
                          {/* Shipment Header */}
                          <div className="bg-blue-50 px-4 py-3 border-b border-blue-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="flex-shrink-0 bg-[#ff4600] text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <span className="font-semibold text-blue-700">Shipment {idx + 1}</span>
                            </div>
                            <span className="text-sm text-blue-600">{shipment.route}</span>
                          </div>
                          {/* Items Table */}
                          <table className="w-full">
                            <tbody>
                              {group.items.map((item, itemIdx) => (
                                <tr key={itemIdx} className="border-t border-gray-100 hover:bg-gray-50">
                                  <td className="py-3 px-4 text-gray-900">
                                    {item.name}
                                    {item.quantity && item.unit && (
                                      <span className="text-gray-500 text-sm ml-2">
                                        ({item.quantity} {item.unit})
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-right font-medium text-gray-900">{item.amount}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {/* Shipment Subtotal */}
                          <div className="bg-green-50 px-4 py-3 border-t border-green-200 flex items-center justify-between">
                            <span className="font-semibold text-green-700">Subtotal Shipment {idx + 1}</span>
                            <span className="font-bold text-green-700">
                              {shipment.selling_rate_formatted || new Intl.NumberFormat('id-ID', { style: 'currency', currency: data.currency, minimumFractionDigits: 0 }).format(group.subtotal)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Terms */}
            {(data.terms_includes?.length || data.terms_excludes?.length) && (
              <div className="px-6 pb-6">
                <h3 className="font-semibold text-[#ff4600] mb-4 text-sm uppercase tracking-wide">Terms & Conditions</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.terms_includes && data.terms_includes.length > 0 && (
                    <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                      <p className="text-sm font-semibold text-emerald-700 mb-3">Included:</p>
                      <ul className="text-sm space-y-2">
                        {data.terms_includes.map((term, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            <span className="text-gray-700">{term}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {data.terms_excludes && data.terms_excludes.length > 0 && (
                    <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                      <p className="text-sm font-semibold text-red-700 mb-3">Excluded:</p>
                      <ul className="text-sm space-y-2">
                        {data.terms_excludes.map((term, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                            <span className="text-gray-700">{term}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Issued By */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Issued by <span className="font-semibold text-[#ff4600]">{data.issued_by}</span> from {UGC_INFO.shortName}
              </p>
            </div>
          </div>
        )}

        {/* Not Found Message */}
        {!data && result.error && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto" />
            <h3 className="mt-4 text-xl font-bold text-gray-900">Quotation Not Found</h3>
            <p className="mt-2 text-gray-600">
              The verification code you provided does not match any quotation in our system.
              Please check the code and try again.
            </p>
          </div>
        )}

        {/* Contact Info Card */}
        <div className="mt-8 bg-white rounded-2xl shadow-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4 text-center">Questions about this quotation?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <a href={`https://wa.me/${UGC_INFO.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 p-3 bg-gray-50 rounded-xl hover:bg-[#25D366] hover:text-white transition-colors group">
              <MessageCircle className="h-4 w-4 text-[#25D366] group-hover:text-white" />
              <span className="text-gray-700 group-hover:text-white">{UGC_INFO.whatsapp}</span>
            </a>
            <a href={`mailto:${UGC_INFO.email}`} className="flex items-center justify-center gap-2 p-3 bg-gray-50 rounded-xl hover:bg-[#ff4600] hover:text-white transition-colors group">
              <Mail className="h-4 w-4 text-[#ff4600] group-hover:text-white" />
              <span className="text-gray-700 group-hover:text-white">{UGC_INFO.email}</span>
            </a>
            <a href={`https://${UGC_INFO.web}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 p-3 bg-gray-50 rounded-xl hover:bg-[#ff4600] hover:text-white transition-colors group">
              <Globe className="h-4 w-4 text-[#ff4600] group-hover:text-white" />
              <span className="text-gray-700 group-hover:text-white">{UGC_INFO.web}</span>
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-[#ff4600] to-[#ff6b35] text-white py-8 mt-12">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <Image
                src="/logo/logougctaglinewhite.png"
                alt="UGC Logo"
                width={140}
                height={45}
                className="h-10 w-auto mx-auto md:mx-0"
              />
              <p className="mt-3 text-white/80 text-sm max-w-md">
                {UGC_INFO.address}
              </p>
            </div>
            <div className="text-center md:text-right text-sm text-white/90">
              <p className="flex items-center justify-center md:justify-end gap-2">
                <MessageCircle className="h-3 w-3" /> {UGC_INFO.whatsapp}
              </p>
              <p className="mt-1 flex items-center justify-center md:justify-end gap-2">
                <Mail className="h-3 w-3" /> {UGC_INFO.email}
              </p>
              <p className="mt-3 text-white/70 text-xs">
                This verification page confirms the authenticity of quotations issued by UGC Logistics.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
