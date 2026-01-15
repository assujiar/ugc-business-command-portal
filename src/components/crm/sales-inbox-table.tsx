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

  const handleClaim = async (poolId: number, createAccount: boolean = true) => {
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
        router.push('/my-leads')
        router.refresh()
      } else {
        alert(result.data?.error || 'Failed to claim lead')
      }
    } catch (error) {
      console.error('Error claiming lead:', error)
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

  return (
  <>
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Available Leads ({leads.length})</CardTitle>
      </CardHeader>
      <CardContent>
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
                <TableCell>
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
                      <DropdownMenuItem
                        onClick={() => fetchLeadDetails(lead.lead_id)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Detail
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleClaim(lead.pool_id)}
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Claim Lead
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
