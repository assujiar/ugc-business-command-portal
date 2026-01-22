// =====================================================
// Opportunity Detail Page
// Shows opportunity information with navigation back to pipeline
// =====================================================

import { getSessionAndProfile } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Building2, User, Mail, Phone, Calendar, FileText, DollarSign, Target } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

// Stage color mapping
const stageColors: Record<string, string> = {
  'Prospecting': 'bg-slate-100 text-slate-800',
  'Qualification': 'bg-blue-100 text-blue-800',
  'Proposal': 'bg-yellow-100 text-yellow-800',
  'Quote Sent': 'bg-orange-100 text-orange-800',
  'Negotiation': 'bg-purple-100 text-purple-800',
  'Closed Won': 'bg-green-100 text-green-800',
  'Closed Lost': 'bg-red-100 text-red-800',
}

// Format currency
const formatCurrency = (amount: number, currency: string = 'IDR'): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default async function OpportunityDetailPage({ params }: PageProps) {
  const { id } = await params
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  const adminClient = createAdminClient()

  // Fetch opportunity with related data
  const { data: opportunity, error } = await (adminClient as any)
    .from('opportunities')
    .select(`
      *,
      account:accounts(account_id, company_name, address, city, country),
      owner:profiles!opportunities_owner_user_id_fkey(user_id, name, email)
    `)
    .eq('opportunity_id', id)
    .single()

  if (error || !opportunity) {
    notFound()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/pipeline">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali ke Pipeline
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{opportunity.name}</h1>
          <p className="text-muted-foreground">Opportunity ID: {opportunity.opportunity_id}</p>
        </div>
        <Badge className={stageColors[opportunity.stage] || 'bg-gray-100 text-gray-800'}>
          {opportunity.stage}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Informasi Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Nama Perusahaan</p>
                <p className="font-medium">{opportunity.account?.company_name || '-'}</p>
              </div>
              {opportunity.account?.address && (
                <div>
                  <p className="text-sm text-muted-foreground">Alamat</p>
                  <p className="font-medium">
                    {[opportunity.account.address, opportunity.account.city, opportunity.account.country]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
              )}
              {opportunity.owner && (
                <div>
                  <p className="text-sm text-muted-foreground">Owner</p>
                  <p className="font-medium">{opportunity.owner.name}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Opportunity Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Detail Opportunity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {opportunity.estimated_value && (
                <div>
                  <p className="text-sm text-muted-foreground">Estimated Value</p>
                  <p className="font-medium text-lg text-green-600">
                    {formatCurrency(opportunity.estimated_value, opportunity.currency)}
                  </p>
                </div>
              )}
              {opportunity.probability !== null && (
                <div>
                  <p className="text-sm text-muted-foreground">Probability</p>
                  <p className="font-medium">{opportunity.probability}%</p>
                </div>
              )}
              {opportunity.expected_close_date && (
                <div>
                  <p className="text-sm text-muted-foreground">Expected Close Date</p>
                  <p className="font-medium">
                    {new Date(opportunity.expected_close_date).toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              )}
              {opportunity.quotation_status && (
                <div>
                  <p className="text-sm text-muted-foreground">Status Quotation</p>
                  <Badge variant="outline">{opportunity.quotation_status}</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Next Step */}
        {opportunity.next_step && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Next Step
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="font-medium">{opportunity.next_step}</p>
                {opportunity.next_step_due_date && (
                  <p className="text-sm text-muted-foreground">
                    Due: {new Date(opportunity.next_step_due_date).toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Route/Service Info */}
        {(opportunity.route || opportunity.origin || opportunity.destination) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Service Info
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {opportunity.route && (
                  <div>
                    <p className="text-sm text-muted-foreground">Route</p>
                    <p className="font-medium">{opportunity.route}</p>
                  </div>
                )}
                {(opportunity.origin || opportunity.destination) && (
                  <div>
                    <p className="text-sm text-muted-foreground">Origin → Destination</p>
                    <p className="font-medium">
                      {opportunity.origin || '-'} → {opportunity.destination || '-'}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {opportunity.notes && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Catatan</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{opportunity.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Closure Info (for Closed Won/Lost) */}
        {opportunity.closed_at && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Informasi Penutupan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Tanggal Closed</p>
                  <p className="font-medium">
                    {new Date(opportunity.closed_at).toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                {opportunity.close_reason && (
                  <div>
                    <p className="text-sm text-muted-foreground">Alasan</p>
                    <p className="font-medium">{opportunity.close_reason}</p>
                  </div>
                )}
                {opportunity.lost_reason && (
                  <div>
                    <p className="text-sm text-muted-foreground">Lost Reason</p>
                    <p className="font-medium">{opportunity.lost_reason}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
