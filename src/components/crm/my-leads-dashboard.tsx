'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate, formatCurrency } from '@/lib/utils'
import { ACCOUNT_STATUSES } from '@/lib/constants'
import {
  Users,
  Building2,
  TrendingUp,
  ArrowRight,
  UserPlus,
  PlusCircle,
} from 'lucide-react'

interface Lead {
  lead_id: string
  company_name: string
  pic_name: string | null
  pic_email: string | null
  pic_phone: string | null
  triage_status: string
  source: string | null
  priority: number
  potential_revenue: number | null
  claim_status: string | null
  claimed_by_name: string | null
  claimed_at: string | null
  created_at: string
  is_own_lead: boolean
  account_id: string | null
  account_name: string | null
  account_status: string | null
  opportunity_id: string | null
  opportunity_name: string | null
  opportunity_stage: string | null
  opportunity_value: number | null
}

interface MyLeadsDashboardProps {
  leads: Lead[]
  currentUserId: string
}

export function MyLeadsDashboard({ leads, currentUserId }: MyLeadsDashboardProps) {
  const router = useRouter()

  // Stats
  const totalLeads = leads.length
  const claimedLeads = leads.filter(l => l.claim_status === 'claimed').length
  const ownLeads = leads.filter(l => l.is_own_lead).length
  const withPipeline = leads.filter(l => l.opportunity_id).length

  const getStatusBadgeVariant = (status: string | null) => {
    switch (status) {
      case 'Qualified':
      case 'Handed Over':
        return 'default'
      case 'Prospecting':
        return 'outline'
      default:
        return 'secondary'
    }
  }

  const getAccountStatusLabel = (status: string | null) => {
    const found = ACCOUNT_STATUSES.find(s => s.value === status)
    return found?.label || status || '-'
  }

  const getAccountStatusBadgeVariant = (status: string | null) => {
    switch (status) {
      case 'new_account':
        return 'default'
      case 'active_account':
        return 'default'
      case 'calon_account':
        return 'secondary'
      case 'passive_account':
        return 'outline'
      case 'lost_account':
      case 'failed_account':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 1:
        return 'Low'
      case 2:
        return 'Medium'
      case 3:
        return 'High'
      case 4:
        return 'Critical'
      default:
        return 'Unknown'
    }
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
        <Card>
          <CardContent className="p-3 lg:p-4">
            <div className="flex items-center justify-between">
              <div className="p-1.5 lg:p-2 rounded-lg bg-blue-500">
                <Users className="h-3 w-3 lg:h-4 lg:w-4 text-white" />
              </div>
              <span className="text-xl lg:text-2xl font-bold">{totalLeads}</span>
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-2">Total Leads</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 lg:p-4">
            <div className="flex items-center justify-between">
              <div className="p-1.5 lg:p-2 rounded-lg bg-green-500">
                <UserPlus className="h-3 w-3 lg:h-4 lg:w-4 text-white" />
              </div>
              <span className="text-xl lg:text-2xl font-bold">{claimedLeads}</span>
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-2">Claimed Leads</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 lg:p-4">
            <div className="flex items-center justify-between">
              <div className="p-1.5 lg:p-2 rounded-lg bg-purple-500">
                <PlusCircle className="h-3 w-3 lg:h-4 lg:w-4 text-white" />
              </div>
              <span className="text-xl lg:text-2xl font-bold">{ownLeads}</span>
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-2">Self-Created</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 lg:p-4">
            <div className="flex items-center justify-between">
              <div className="p-1.5 lg:p-2 rounded-lg bg-orange-500">
                <TrendingUp className="h-3 w-3 lg:h-4 lg:w-4 text-white" />
              </div>
              <span className="text-xl lg:text-2xl font-bold">{withPipeline}</span>
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-2">With Pipeline</p>
          </CardContent>
        </Card>
      </div>

      {/* Leads Table */}
      <Card>
        <CardHeader className="pb-3 lg:pb-6">
          <CardTitle className="text-base lg:text-lg">My Leads ({leads.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-0 lg:px-6">
          {leads.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Pipeline</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-[100px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.lead_id}>
                        <TableCell className="font-medium">{lead.company_name}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{lead.pic_name || '-'}</p>
                            <p className="text-xs text-muted-foreground">{lead.pic_email || '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell>{lead.source || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={lead.is_own_lead ? 'default' : 'secondary'}>
                            {lead.is_own_lead ? 'Created' : 'Claimed'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {lead.account_id ? (
                            <div>
                              <Link
                                href={`/accounts?id=${lead.account_id}`}
                                className="text-brand hover:underline text-sm"
                              >
                                {lead.account_name || 'View Account'}
                              </Link>
                              <Badge
                                variant={getAccountStatusBadgeVariant(lead.account_status)}
                                className="ml-2 text-xs"
                              >
                                {getAccountStatusLabel(lead.account_status)}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {lead.opportunity_id ? (
                            <div>
                              <Link
                                href={`/pipeline?opp=${lead.opportunity_id}`}
                                className="text-brand hover:underline text-sm"
                              >
                                {lead.opportunity_name || 'View Pipeline'}
                              </Link>
                              <Badge
                                variant="outline"
                                className="ml-2 text-xs"
                              >
                                {lead.opportunity_stage}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {lead.opportunity_value
                            ? formatCurrency(lead.opportunity_value)
                            : lead.potential_revenue
                            ? formatCurrency(lead.potential_revenue)
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-xs">{formatDate(lead.created_at)}</p>
                            {lead.claimed_at && (
                              <p className="text-xs text-muted-foreground">
                                Claimed: {formatDate(lead.claimed_at)}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {lead.opportunity_id ? (
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/pipeline?opp=${lead.opportunity_id}`}>
                                Pipeline
                                <ArrowRight className="h-4 w-4 ml-1" />
                              </Link>
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled>
                              No Pipeline
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3 px-4">
                {leads.map((lead) => (
                  <Card key={lead.lead_id} className="bg-muted/30">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-medium text-sm truncate">{lead.company_name}</h4>
                          <p className="text-xs text-muted-foreground truncate">
                            {lead.pic_name || 'No contact'}
                          </p>
                        </div>
                        <Badge variant={lead.is_own_lead ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                          {lead.is_own_lead ? 'Created' : 'Claimed'}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {lead.source && (
                          <Badge variant="outline" className="text-xs">
                            {lead.source}
                          </Badge>
                        )}
                        {lead.opportunity_stage && (
                          <Badge variant="secondary" className="text-xs">
                            {lead.opportunity_stage}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <div className="text-xs text-muted-foreground">
                          <p>{formatDate(lead.created_at)}</p>
                        </div>
                        <div className="text-right">
                          {(lead.opportunity_value || lead.potential_revenue) && (
                            <p className="text-sm font-medium">
                              {formatCurrency(lead.opportunity_value || lead.potential_revenue)}
                            </p>
                          )}
                        </div>
                      </div>

                      {lead.opportunity_id && (
                        <div className="mt-3 pt-3 border-t">
                          <Button size="sm" variant="outline" asChild className="w-full">
                            <Link href={`/pipeline?opp=${lead.opportunity_id}`}>
                              View Pipeline
                              <ArrowRight className="h-4 w-4 ml-1" />
                            </Link>
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 px-4">
              <p className="text-muted-foreground">No leads yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                Create a new lead using the button above, or go to{' '}
                <Link href="/lead-bidding" className="text-brand hover:underline">
                  Lead Bidding
                </Link>{' '}
                to claim leads from marketing
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
