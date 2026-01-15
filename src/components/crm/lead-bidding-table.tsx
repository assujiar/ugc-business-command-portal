'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { formatDateTimeFull, formatCurrency } from '@/lib/utils'
import { UserPlus, MoreVertical, Eye } from 'lucide-react'
import { LeadDetailDialog } from '@/components/crm/lead-detail-dialog'
import type { UserRole } from '@/types/database'

interface Lead {
  lead_id: string
  company_name: string
  pic_name: string | null
  pic_email: string | null
  pic_phone: string | null
  source: string | null
  priority: number
  potential_revenue: number | null
  qualified_at: string | null
  created_at: string
  pool_id: number | null
  handed_over_at: string | null
  handover_notes: string | null
  handed_over_by_name: string | null
}

interface LeadBiddingTableProps {
  leads: Lead[]
  currentUserId: string
  userRole?: UserRole | null
}

export function LeadBiddingTable({ leads, currentUserId, userRole }: LeadBiddingTableProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [claimDialog, setClaimDialog] = useState<{
    open: boolean
    lead: Lead | null
  }>({ open: false, lead: null })

  // State for lead detail dialog
  const [detailDialog, setDetailDialog] = useState<{
    open: boolean
    lead: any | null
    loading: boolean
  }>({ open: false, lead: null, loading: false })

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

  const handleClaimLead = async () => {
    if (!claimDialog.lead) return

    setIsLoading(claimDialog.lead.lead_id)

    try {
      const response = await fetch('/api/crm/leads/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: claimDialog.lead.lead_id,
          pool_id: claimDialog.lead.pool_id || null,
          create_account: true,
          create_opportunity: true,
        }),
      })

      if (response.ok) {
        router.push('/my-leads')
        router.refresh()
      } else {
        const error = await response.json()
        alert(error.error || 'Gagal claim lead')
      }
    } catch (error) {
      console.error('Error claiming lead:', error)
      alert('Terjadi kesalahan')
    } finally {
      setIsLoading(null)
      setClaimDialog({ open: false, lead: null })
    }
  }

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 1:
        return { label: 'Low', variant: 'secondary' as const }
      case 2:
        return { label: 'Medium', variant: 'outline' as const }
      case 3:
        return { label: 'High', variant: 'default' as const }
      case 4:
        return { label: 'Critical', variant: 'destructive' as const }
      default:
        return { label: 'Unknown', variant: 'secondary' as const }
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3 lg:pb-6">
          <CardTitle className="text-base lg:text-lg">
            Available Leads ({leads.length})
          </CardTitle>
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
                      <TableHead>Priority</TableHead>
                      <TableHead>Potential Revenue</TableHead>
                      <TableHead>Assigned By</TableHead>
                      <TableHead>Assigned At</TableHead>
                      <TableHead className="w-[120px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => {
                      const priority = getPriorityLabel(lead.priority)

                      return (
                        <TableRow key={lead.lead_id}>
                          <TableCell className="font-medium">{lead.company_name}</TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm">{lead.pic_name || '-'}</p>
                              <p className="text-xs text-muted-foreground">{lead.pic_email || '-'}</p>
                              {lead.pic_phone && (
                                <p className="text-xs text-muted-foreground">{lead.pic_phone}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{lead.source || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={priority.variant}>{priority.label}</Badge>
                          </TableCell>
                          <TableCell>
                            {lead.potential_revenue
                              ? formatCurrency(lead.potential_revenue)
                              : '-'}
                          </TableCell>
                          <TableCell>{lead.handed_over_by_name || '-'}</TableCell>
                          <TableCell>{formatDateTimeFull(lead.handed_over_at)}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={isLoading === lead.lead_id}
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
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setClaimDialog({ open: true, lead })}
                                >
                                  <UserPlus className="h-4 w-4 mr-2" />
                                  Claim Lead
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3 px-4">
                {leads.map((lead) => {
                  const priority = getPriorityLabel(lead.priority)

                  return (
                    <Card key={lead.lead_id} className="bg-muted/30">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-medium text-sm truncate">{lead.company_name}</h4>
                            <p className="text-xs text-muted-foreground truncate">
                              {lead.pic_name || 'No contact'}
                            </p>
                          </div>
                          <Badge variant={priority.variant} className="text-xs flex-shrink-0">
                            {priority.label}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          {lead.source && (
                            <Badge variant="outline" className="text-xs">
                              {lead.source}
                            </Badge>
                          )}
                          {lead.potential_revenue && (
                            <span className="text-xs font-medium text-brand">
                              {formatCurrency(lead.potential_revenue)}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 text-xs text-muted-foreground space-y-1">
                          <div>Assigned By: {lead.handed_over_by_name || '-'}</div>
                          <div>Assigned At: {formatDateTimeFull(lead.handed_over_at)}</div>
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
                          <Button
                            size="sm"
                            onClick={() => setClaimDialog({ open: true, lead })}
                            disabled={isLoading === lead.lead_id}
                            className="flex-1"
                          >
                            <UserPlus className="h-4 w-4 mr-1" />
                            {isLoading === lead.lead_id ? 'Claiming...' : 'Claim'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-12 px-4">
              <p className="text-muted-foreground">No leads available for claiming</p>
              <p className="text-sm text-muted-foreground mt-2">
                New leads will appear here when marketing hands them over
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Claim Confirmation Dialog */}
      <Dialog
        open={claimDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setClaimDialog({ open: false, lead: null })
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base lg:text-lg">Claim Lead</DialogTitle>
            <DialogDescription className="text-xs lg:text-sm">
              Are you sure you want to claim this lead? Once claimed, you will be responsible for following up.
            </DialogDescription>
          </DialogHeader>

          {claimDialog.lead && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3 lg:gap-4">
                <div>
                  <p className="text-xs lg:text-sm text-muted-foreground">Company</p>
                  <p className="font-medium text-sm lg:text-base">{claimDialog.lead.company_name}</p>
                </div>
                <div>
                  <p className="text-xs lg:text-sm text-muted-foreground">Contact</p>
                  <p className="font-medium text-sm lg:text-base">{claimDialog.lead.pic_name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs lg:text-sm text-muted-foreground">Potential Revenue</p>
                  <p className="font-medium text-sm lg:text-base">
                    {formatCurrency(claimDialog.lead.potential_revenue)}
                  </p>
                </div>
                <div>
                  <p className="text-xs lg:text-sm text-muted-foreground">Priority</p>
                  <Badge variant={getPriorityLabel(claimDialog.lead.priority).variant}>
                    {getPriorityLabel(claimDialog.lead.priority).label}
                  </Badge>
                </div>
              </div>

              {claimDialog.lead.handover_notes && (
                <div>
                  <p className="text-xs lg:text-sm text-muted-foreground">Assignment Notes</p>
                  <p className="text-xs lg:text-sm mt-1 p-2 bg-muted rounded">
                    {claimDialog.lead.handover_notes}
                  </p>
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                <p className="text-xs lg:text-sm text-blue-800 dark:text-blue-200">
                  When you claim this lead:
                </p>
                <ul className="text-xs lg:text-sm text-blue-700 dark:text-blue-300 mt-2 list-disc list-inside space-y-1">
                  <li>An Account will be created automatically</li>
                  <li>A Pipeline (Opportunity) with status Prospecting will be created</li>
                  <li>The lead will appear in your My Leads page</li>
                </ul>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setClaimDialog({ open: false, lead: null })}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleClaimLead}
              disabled={isLoading === claimDialog.lead?.lead_id}
              className="w-full sm:w-auto"
            >
              {isLoading === claimDialog.lead?.lead_id ? 'Claiming...' : 'Claim Lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </>
  )
}
