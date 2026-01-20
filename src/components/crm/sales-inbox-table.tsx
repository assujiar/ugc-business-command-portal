// =====================================================
// Sales Inbox Table Component
// SOURCE: PDF Section 5 - Sales Inbox View
// Race-safe claiming with atomic RPC
// =====================================================

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserPlus, Clock, AlertTriangle, MoreVertical, Eye } from 'lucide-react'
import { formatDate, formatDateTime, isOverdue } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LeadDetailDialog } from '@/components/crm/lead-detail-dialog'
import { toast } from '@/hooks/use-toast'
import type { UserRole } from '@/types/database'

interface PoolLead {
  lead_id: string
  company_name: string
  pic_name: string | null
  pool_id: number
  handed_over_at: string
  handover_notes: string | null
  priority: number
  expires_at: string | null
  handed_over_by_name: string | null
}

interface SalesInboxTableProps {
  leads: PoolLead[]
  currentUserId?: string
  userRole?: UserRole | null
}

export function SalesInboxTable({ leads, currentUserId = '', userRole }: SalesInboxTableProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<number | null>(null)

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

  const handleClaim = async (poolId: number, companyName: string, createAccount: boolean = true) => {
    setIsLoading(poolId)
    try {
      const response = await fetch('/api/crm/leads/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool_id: poolId,
          create_account: createAccount,
          create_opportunity: false,
        }),
      })

      const result = await response.json()

      if (result.data?.success) {
        toast.success('Lead berhasil di-claim', `${companyName} sekarang ada di My Leads`)
        router.push('/my-leads')
        router.refresh()
      } else {
        toast.error('Gagal claim lead', result.data?.error || 'Terjadi kesalahan')
      }
    } catch (error) {
      console.error('Error claiming lead:', error)
      toast.error('Gagal claim lead', 'Terjadi kesalahan saat mengklaim lead')
    } finally {
      setIsLoading(null)
    }
  }

  const getPriorityBadge = (priority: number) => {
    switch (priority) {
      case 4:
        return <Badge variant="destructive">Critical</Badge>
      case 3:
        return <Badge className="bg-orange-500">High</Badge>
      case 2:
        return <Badge variant="warning">Medium</Badge>
      default:
        return <Badge variant="secondary">Low</Badge>
    }
  }

  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">No leads available</p>
          <p className="text-sm text-muted-foreground">Leads will appear here after marketing assigns them to sales</p>
        </CardContent>
      </Card>
    )
  }

  // Render action menu (reusable for both desktop and mobile)
  const renderActionMenu = (lead: PoolLead) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={isLoading === lead.pool_id}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => fetchLeadDetails(lead.lead_id)}>
          <Eye className="h-4 w-4 mr-2" />
          View Detail
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleClaim(lead.pool_id, lead.company_name)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Claim Lead
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
  <>
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base lg:text-lg">Available Leads ({leads.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0 lg:p-6 lg:pt-0">
        {/* Desktop Table View */}
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assigned By</TableHead>
                <TableHead>Assigned At</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-[100px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.pool_id}>
                  <TableCell className="font-medium">{lead.company_name}</TableCell>
                  <TableCell>{lead.pic_name || '-'}</TableCell>
                  <TableCell>{getPriorityBadge(lead.priority)}</TableCell>
                  <TableCell>{lead.handed_over_by_name || '-'}</TableCell>
                  <TableCell>{formatDateTime(lead.handed_over_at)}</TableCell>
                  <TableCell>
                    {lead.expires_at ? (
                      <span className={isOverdue(lead.expires_at) ? 'overdue' : ''}>
                        {isOverdue(lead.expires_at) && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                        {formatDate(lead.expires_at)}
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {lead.handover_notes || '-'}
                  </TableCell>
                  <TableCell>{renderActionMenu(lead)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden divide-y">
          {leads.map((lead) => (
            <div key={lead.pool_id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-sm truncate">{lead.company_name}</h4>
                  <p className="text-xs text-muted-foreground">{lead.pic_name || 'No contact'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {getPriorityBadge(lead.priority)}
                  {renderActionMenu(lead)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Assigned by:</span>
                  <p className="font-medium">{lead.handed_over_by_name || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Assigned:</span>
                  <p className="font-medium">{formatDate(lead.handed_over_at)}</p>
                </div>
              </div>

              {lead.expires_at && (
                <div className="flex items-center gap-1 text-xs">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className={isOverdue(lead.expires_at) ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
                    {isOverdue(lead.expires_at) && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                    Expires: {formatDate(lead.expires_at)}
                  </span>
                </div>
              )}

              {lead.handover_notes && (
                <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/50 p-2 rounded">
                  {lead.handover_notes}
                </p>
              )}

              {/* Quick Claim Button for Mobile */}
              <Button
                variant="default"
                size="sm"
                className="w-full"
                onClick={() => handleClaim(lead.pool_id, lead.company_name)}
                disabled={isLoading === lead.pool_id}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Claim Lead
              </Button>
            </div>
          ))}
        </div>
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
  </>
  )
}
