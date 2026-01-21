'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle, XCircle, Clock, AlertTriangle, Building2, MapPin, Package, FileText, Calendar, User } from 'lucide-react'

interface QuotationData {
  quotation_number: string
  status: string
  created_at: string
  valid_until: string
  is_expired: boolean
  customer_name: string
  customer_company: string | null
  service_type: string | null
  incoterm: string | null
  route: string | null
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Verifying quotation...</p>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
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
          icon: <CheckCircle className="h-20 w-20 text-green-500" />,
          title: 'Quotation Verified',
          subtitle: 'This is an authentic quotation from UGC Logistics',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-500',
          textColor: 'text-green-700',
        }
      case 'expired':
        return {
          icon: <Clock className="h-20 w-20 text-amber-500" />,
          title: 'Quotation Expired',
          subtitle: 'This quotation is authentic but has passed its validity period',
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-500',
          textColor: 'text-amber-700',
        }
      case 'revoked':
        return {
          icon: <XCircle className="h-20 w-20 text-red-500" />,
          title: 'Quotation Revoked',
          subtitle: 'This quotation has been revoked and is no longer valid',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-500',
          textColor: 'text-red-700',
        }
      default:
        return {
          icon: <AlertTriangle className="h-20 w-20 text-gray-500" />,
          title: 'Invalid Code',
          subtitle: 'This quotation code is not found in our system',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-500',
          textColor: 'text-gray-700',
        }
    }
  }

  const status = getStatusDisplay()
  const data = result.data

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-[#1a365d] text-white py-6">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">UGC Logistics</h1>
              <p className="text-blue-200 text-sm">Quotation Verification</p>
            </div>
            <Building2 className="h-10 w-10 opacity-50" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Status Card */}
        <div className={`${status.bgColor} ${status.borderColor} border-l-4 rounded-lg p-6 mb-6`}>
          <div className="flex items-start gap-4">
            {status.icon}
            <div>
              <h2 className={`text-2xl font-bold ${status.textColor}`}>{status.title}</h2>
              <p className="text-gray-600 mt-1">{status.subtitle}</p>
            </div>
          </div>
        </div>

        {/* Quotation Details */}
        {data && (
          <div className="bg-white rounded-lg shadow-sm">
            {/* Quotation Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Quotation Number</p>
                  <p className="text-xl font-bold text-[#1a365d]">{data.quotation_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Total Amount</p>
                  <p className="text-2xl font-bold text-[#1a365d]">{data.total_amount}</p>
                </div>
              </div>
            </div>

            {/* Details Grid */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer Info */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Customer
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="font-medium">{data.customer_name}</p>
                  {data.customer_company && (
                    <p className="text-gray-600">{data.customer_company}</p>
                  )}
                </div>
              </div>

              {/* Dates */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Validity
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Issued:</span>
                    <span>{formatDate(data.created_at)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-gray-500">Valid Until:</span>
                    <span className={data.is_expired ? 'text-red-600' : ''}>
                      {formatDate(data.valid_until)}
                      {data.is_expired && ' (Expired)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Service Details */}
              {(data.service_type || data.incoterm) && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Service
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    {data.service_type && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Type:</span>
                        <span>{data.service_type}</span>
                      </div>
                    )}
                    {data.incoterm && (
                      <div className="flex justify-between text-sm mt-2">
                        <span className="text-gray-500">Incoterm:</span>
                        <span>{data.incoterm}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Route */}
              {data.route && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Route
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm">{data.route}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Rate Breakdown */}
            {data.items && data.items.length > 0 && (
              <div className="p-6 border-t border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Rate Breakdown
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Description</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item, index) => (
                        <tr key={index} className="border-t border-gray-100">
                          <td className="py-3 px-4">
                            {item.name}
                            {item.quantity && item.unit && (
                              <span className="text-gray-500 text-sm ml-2">
                                ({item.quantity} {item.unit})
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">{item.amount}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gray-200 font-semibold bg-gray-50">
                        <td className="py-3 px-4">Total</td>
                        <td className="py-3 px-4 text-right">{data.total_amount}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Terms */}
            {(data.terms_includes?.length || data.terms_excludes?.length) && (
              <div className="p-6 border-t border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-4">Terms & Conditions</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {data.terms_includes && data.terms_includes.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-green-700 mb-2">Included:</p>
                      <ul className="text-sm space-y-1">
                        {data.terms_includes.map((term, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>{term}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {data.terms_excludes && data.terms_excludes.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-red-700 mb-2">Excluded:</p>
                      <ul className="text-sm space-y-1">
                        {data.terms_excludes.map((term, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                            <span>{term}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Issued By */}
            <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              <p className="text-sm text-gray-500">
                Issued by <span className="font-medium text-gray-700">{data.issued_by}</span> from UGC Logistics
              </p>
            </div>
          </div>
        )}

        {/* Not Found Message */}
        {!data && result.error && (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">Quotation Not Found</h3>
            <p className="mt-2 text-gray-600">
              The verification code you provided does not match any quotation in our system.
              Please check the code and try again.
            </p>
          </div>
        )}

        {/* Footer Note */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            If you have questions about this quotation, please contact UGC Logistics at{' '}
            <a href="mailto:info@ugclogistics.com" className="text-[#1a365d] hover:underline">
              info@ugclogistics.com
            </a>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm">
          <p>PT. UGC Logistics</p>
          <p className="mt-1 text-gray-400">Jl. Raya Example No. 123, Jakarta, Indonesia</p>
          <p className="mt-4 text-gray-500">
            This verification page confirms the authenticity of quotations issued by UGC Logistics.
          </p>
        </div>
      </footer>
    </div>
  )
}
