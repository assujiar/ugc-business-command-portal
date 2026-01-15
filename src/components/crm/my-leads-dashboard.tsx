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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { formatDate, formatCurrency } from '@/lib/utils'
import {
  Users,
  Building2,
  TrendingUp,
  ArrowRight,
  UserPlus,
  PlusCircle,
  MoreVertical,
  Eye,
  FileText,
} from 'lucide-react'
import { LeadDetailDialog } from '@/components/crm/lead-detail-dialog'
import { PipelineDetailDialog } from '@/components/crm/pipeline-detail-dialog'
import type { UserRole } from '@/types/database'

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
  opportunity_id: string | null
}

interface MyLeadsDashboardProps {
  leads: Lead[]
  currentUserId: string
  userRole?: UserRole | null
}

export function MyLeadsDashboard({ leads, currentUserId, userRole }: MyLeadsDashboardProps) {
  const router = useRouter()

  // State for lead detail dialog
  const [detailDialog, setDetailDialog] = useState<{
    open: boolean
    lead: any | null
    loading: boolean
  }>({ open: false, lead: null, loading: false })

  // State for pipeline detail dialog
  const [pipelineDialog, setPipelineDialog] = useState<{
    open: boolean
    opportunityId: string | null
  }>({ open: false, opportunityId: null })

  // State for creating opportunity
  const [creatingOpportunity, setCreatingOpportunity] = useState<string | null>(null)

  // Function to fetch full lead details including shipment
  const fetchLeadDetails = async (leadId: string) => {
    setDetailDialog({ open: true, lead: null, loading: true })
    try {
      const response = await fetch(`/api/crm/leads/${leadId}`)
      if (response.ok) {
        const { data } = await response.json()
        setDetailDialog({ open: true, lead: data, loading: false })
      } else {
        setDetailDialog({ open: false, lead: null, loading: false })
      }
    } catch (error) {
      console.error('Error fetching lead:', error)
      setDetailDialog({ open: false, lead: null, loading: false })
    }
  }

  // Function to create opportunity for lead without pipeline
  const createOpportunity = async (leadId: string) => {
    setCreatingOpportunity(leadId)
    try {
      const response = await fetch(`/api/crm/leads/${leadId}/create-opportunity`, {
        method: 'POST',
      })
      if (response.ok) {
        const { data } = await response.json()
        // Refresh the page to show updated data
        router.refresh()
        alert(`Pipeline berhasil dibuat: ${data.opportunity_id}`)
      } else {
        const { error } = await response.json()
        alert(`Gagal membuat pipeline: ${error}`)
      }
    } catch (error) {
      console.error('Error creating opportunity:', error)
      alert('Gagal membuat pipeline')
    } finally {
      setCreatingOpportunity(null)
    }
  }

  // Stats
  const totalLeads = leads.length
  const claimedLeads = leads.filter(l => l.claim_status === 'claimed').length
  const ownLeads = leads.filter(l => l.is_own_lead).length
  const withPipeline = leads.filter(l => l.opportunity_id).length

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
                            <Link
                              href={`/accounts?id=${lead.account_id}`}
                              className="text-brand hover:underline text-sm"
                            >
                              View Account
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {lead.opportunity_id ? (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-brand"
                              onClick={() => setPipelineDialog({ open: true, opportunityId: lead.opportunity_id! })}
                            >
                              <TrendingUp className="h-3 w-3 mr-1" />
                              View Pipeline
                            </Button>
                          ) : lead.account_id && lead.claim_status === 'claimed' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => createOpportunity(lead.lead_id)}
                              disabled={creatingOpportunity === lead.lead_id}
                            >
                              {creatingOpportunity === lead.lead_id ? (
                                'Creating...'
                              ) : (
                                <>
                                  <PlusCircle className="h-3 w-3 mr-1" />
                                  Create Pipeline
                                </>
                              )}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {lead.potential_revenue
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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => fetchLeadDetails(lead.lead_id)}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Detail
                              </DropdownMenuItem>
                              {lead.opportunity_id ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setPipelineDialog({ open: true, opportunityId: lead.opportunity_id! })}
                                  >
                                    <TrendingUp className="h-4 w-4 mr-2" />
                                    View Pipeline
                                  </DropdownMenuItem>
                                </>
                              ) : lead.account_id && lead.claim_status === 'claimed' ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => createOpportunity(lead.lead_id)}
                                    disabled={creatingOpportunity === lead.lead_id}
                                  >
                                    <PlusCircle className="h-4 w-4 mr-2" />
                                    {creatingOpportunity === lead.lead_id ? 'Creating...' : 'Create Pipeline'}
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                              {lead.account_id && (
                                <DropdownMenuItem asChild>
                                  <Link href={`/accounts?id=${lead.account_id}`}>
                                    <Building2 className="h-4 w-4 mr-2" />
                                    View Account
                                  </Link>
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
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
                        {lead.opportunity_id && (
                          <Badge variant="secondary" className="text-xs">
                            Has Pipeline
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <div className="text-xs text-muted-foreground">
                          <p>{formatDate(lead.created_at)}</p>
                        </div>
                        <div className="text-right">
                          {lead.potential_revenue && (
                            <p className="text-sm font-medium">
                              {formatCurrency(lead.potential_revenue)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fetchLeadDetails(lead.lead_id)}
                          className="flex-1"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Detail
                        </Button>
                        {lead.opportunity_id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => setPipelineDialog({ open: true, opportunityId: lead.opportunity_id! })}
                          >
                            <TrendingUp className="h-4 w-4 mr-1" />
                            Pipeline
                          </Button>
                        ) : lead.account_id && lead.claim_status === 'claimed' ? (
                          <Button
                            size="sm"
                            variant="default"
                            className="flex-1"
                            onClick={() => createOpportunity(lead.lead_id)}
                            disabled={creatingOpportunity === lead.lead_id}
                          >
                            {creatingOpportunity === lead.lead_id ? (
                              'Creating...'
                            ) : (
                              <>
                                <PlusCircle className="h-4 w-4 mr-1" />
                                Create Pipeline
                              </>
                            )}
                          </Button>
                        ) : null}
                      </div>
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

      {/* Lead Detail Dialog */}
      <LeadDetailDialog
        lead={detailDialog.lead}
        open={detailDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setDetailDialog({ open: false, lead: null, loading: false })
          }
        }}
        currentUserId={currentUserId}
        userRole={userRole || null}
      />

      {/* Pipeline Detail Dialog */}
      <PipelineDetailDialog
        opportunityId={pipelineDialog.opportunityId}
        open={pipelineDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setPipelineDialog({ open: false, opportunityId: null })
          }
        }}
      />
    </div>
  )
}
