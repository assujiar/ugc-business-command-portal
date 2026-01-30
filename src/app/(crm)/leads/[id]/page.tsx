// =====================================================
// Lead Detail Page
// Shows lead information with navigation back to leads list
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Building2, User, Mail, Phone, MapPin, Calendar, FileText, Truck } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

// Status color mapping
const statusColors: Record<string, string> = {
  'New': 'bg-blue-100 text-blue-800',
  'Contacted': 'bg-yellow-100 text-yellow-800',
  'Qualified': 'bg-green-100 text-green-800',
  'Unqualified': 'bg-red-100 text-red-800',
  'Nurturing': 'bg-purple-100 text-purple-800',
  'Converted': 'bg-emerald-100 text-emerald-800',
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  const adminClient = createAdminClient()

  // Fetch lead with shipment details
  const { data: lead, error } = await (adminClient as any)
    .from('leads')
    .select(`
      *,
      shipment_details:lead_shipment_details(*)
    `)
    .eq('lead_id', id)
    .single()

  if (error || !lead) {
    notFound()
  }

  // Get all shipments (not just the first one)
  const shipments = lead.shipment_details || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/leads">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali ke Leads
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{lead.company_name}</h1>
          <p className="text-muted-foreground">Lead ID: {lead.lead_id}</p>
        </div>
        <Badge className={statusColors[lead.triage_status] || 'bg-gray-100 text-gray-800'}>
          {lead.triage_status}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informasi Kontak
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Perusahaan</p>
                  <p className="font-medium">{lead.company_name}</p>
                </div>
              </div>
              {lead.contact_name && (
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Nama PIC</p>
                    <p className="font-medium">{lead.contact_name}</p>
                  </div>
                </div>
              )}
              {lead.contact_email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <a href={`mailto:${lead.contact_email}`} className="font-medium text-primary hover:underline">
                      {lead.contact_email}
                    </a>
                  </div>
                </div>
              )}
              {lead.contact_phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Telepon</p>
                    <a href={`tel:${lead.contact_phone}`} className="font-medium text-primary hover:underline">
                      {lead.contact_phone}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Lead Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detail Lead
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Source</p>
                <p className="font-medium">{lead.source || '-'}</p>
              </div>
              {lead.source_detail && (
                <div>
                  <p className="text-sm text-muted-foreground">Source Detail</p>
                  <p className="font-medium">{lead.source_detail}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Tanggal Dibuat</p>
                <p className="font-medium">
                  {new Date(lead.created_at).toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
              {lead.quotation_status && (
                <div>
                  <p className="text-sm text-muted-foreground">Status Quotation</p>
                  <Badge variant="outline">{lead.quotation_status}</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Shipment Details - Multi-shipment support */}
        {shipments.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Detail Shipment
                {shipments.length > 1 && (
                  <Badge variant="secondary" className="ml-2">
                    {shipments.length} shipments
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {shipments.map((shipment: any, index: number) => (
                <div key={shipment.shipment_detail_id || index} className={shipments.length > 1 ? 'pb-6 border-b last:border-0 last:pb-0' : ''}>
                  {/* Shipment header for multi-shipment */}
                  {shipments.length > 1 && (
                    <div className="flex items-center gap-2 mb-4">
                      <Badge variant="outline" className="font-mono">
                        #{shipment.shipment_order || index + 1}
                      </Badge>
                      <span className="font-medium text-sm">
                        {shipment.shipment_label || `Shipment ${shipment.shipment_order || index + 1}`}
                      </span>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-3">
                    {shipment.service_type_code && (
                      <div>
                        <p className="text-sm text-muted-foreground">Jenis Layanan</p>
                        <p className="font-medium">{shipment.service_type_code}</p>
                      </div>
                    )}
                    {(shipment.origin_city || shipment.destination_city) && (
                      <div>
                        <p className="text-sm text-muted-foreground">Rute</p>
                        <p className="font-medium">
                          {shipment.origin_city || '-'} → {shipment.destination_city || '-'}
                        </p>
                      </div>
                    )}
                    {shipment.incoterm && (
                      <div>
                        <p className="text-sm text-muted-foreground">Incoterm</p>
                        <p className="font-medium">{shipment.incoterm}</p>
                      </div>
                    )}
                    {shipment.fleet_type && (
                      <div>
                        <p className="text-sm text-muted-foreground">Fleet Type</p>
                        <p className="font-medium">{shipment.fleet_type}</p>
                      </div>
                    )}
                    {shipment.cargo_category && (
                      <div>
                        <p className="text-sm text-muted-foreground">Kategori Cargo</p>
                        <p className="font-medium">{shipment.cargo_category}</p>
                      </div>
                    )}
                    {shipment.weight_total_kg && (
                      <div>
                        <p className="text-sm text-muted-foreground">Berat Total</p>
                        <p className="font-medium">{shipment.weight_total_kg} kg</p>
                      </div>
                    )}
                    {shipment.volume_total_cbm && (
                      <div>
                        <p className="text-sm text-muted-foreground">Volume Total</p>
                        <p className="font-medium">{shipment.volume_total_cbm} CBM</p>
                      </div>
                    )}
                  </div>
                  {shipment.cargo_description && (
                    <div className="mt-4">
                      <p className="text-sm text-muted-foreground">Deskripsi Cargo</p>
                      <p className="font-medium">{shipment.cargo_description}</p>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {lead.notes && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Catatan</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{lead.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
