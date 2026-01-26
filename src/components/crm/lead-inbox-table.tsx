// =====================================================
// Lead Inbox Table Component
// SOURCE: PDF Section 5 - Lead Inbox View
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, CheckCircle, XCircle, Leaf, Send, ArrowRightCircle } from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'

interface Lead {
  lead_id: string
  company_name: string
  pic_name: string | null
  pic_email: string | null
  triage_status: string
  source: string
  priority: number
  marketing_owner_name: string | null
  created_at: string
}

interface LeadInboxTableProps {
  leads: Lead[]
}

export function LeadInboxTable({ leads }: LeadInboxTableProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const handleTriage = async (leadId: string, newStatus: string, companyName: string) => {
    setIsLoading(leadId)
    try {
      const response = await fetch(`/api/crm/leads/${leadId}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_status: newStatus }),
      })

      if (response.ok) {
        const statusMessages: Record<string, string> = {
          'In Review': 'sedang ditinjau',
          'Qualified': 'berhasil dikualifikasi',
          'Nurture': 'dipindahkan ke Nurture',
          'Disqualified': 'didiskualifikasi',
          'Assign to Sales': 'berhasil di-assign ke Sales',
        }
        toast.success(
          `Lead ${newStatus}`,
          `${companyName} ${statusMessages[newStatus] || 'berhasil diupdate'}`
        )
        router.refresh()
      } else {
        throw new Error('Failed to update lead status')
      }
    } catch (error) {
      console.error('Error triaging lead:', error)
      toast.error('Gagal update status', 'Terjadi kesalahan saat mengubah status lead')
    } finally {
      setIsLoading(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'New':
        return <Badge variant="info">New</Badge>
      case 'In Review':
        return <Badge variant="warning">In Review</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getPriorityBadge = (priority: number) => {
    switch (priority) {
      case 4:
        return <span className="priority-critical">Critical</span>
      case 3:
        return <span className="priority-high">High</span>
      case 2:
        return <span className="priority-medium">Medium</span>
      default:
        return <span className="priority-low">Low</span>
    }
  }

  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">No leads in inbox</p>
          <p className="text-sm text-muted-foreground">New leads will appear here for triage</p>
        </CardContent>
      </Card>
    )
  }

  // Render action menu (reusable for both desktop and mobile)
  const renderActionMenu = (lead: Lead) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 w-8 p-0"
          disabled={isLoading === lead.lead_id}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Triage Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {lead.triage_status === 'New' && (
          <DropdownMenuItem onClick={() => handleTriage(lead.lead_id, 'In Review', lead.company_name)}>
            <CheckCircle className="mr-2 h-4 w-4" />
            Mark In Review
          </DropdownMenuItem>
        )}
        {lead.triage_status !== 'Qualified' && (
          <DropdownMenuItem onClick={() => handleTriage(lead.lead_id, 'Qualified', lead.company_name)}>
            <Send className="mr-2 h-4 w-4 text-green-500" />
            Mark Qualified
          </DropdownMenuItem>
        )}
        {lead.triage_status === 'Qualified' && (
          <DropdownMenuItem onClick={() => handleTriage(lead.lead_id, 'Assign to Sales', lead.company_name)}>
            <ArrowRightCircle className="mr-2 h-4 w-4 text-blue-500" />
            Assign to Sales
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => handleTriage(lead.lead_id, 'Nurture', lead.company_name)}>
          <Leaf className="mr-2 h-4 w-4 text-purple-500" />
          Move to Nurture
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleTriage(lead.lead_id, 'Disqualified', lead.company_name)}>
          <XCircle className="mr-2 h-4 w-4 text-red-500" />
          Disqualify
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base lg:text-lg">Leads Awaiting Triage ({leads.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0 lg:p-6 lg:pt-0">
        {/* Desktop Table View */}
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[70px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.lead_id}>
                  <TableCell className="font-medium">{lead.company_name}</TableCell>
                  <TableCell>
                    <div>
                      <p>{lead.pic_name || '-'}</p>
                      <p className="text-xs text-muted-foreground">{lead.pic_email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(lead.triage_status)}</TableCell>
                  <TableCell>{lead.source}</TableCell>
                  <TableCell>{getPriorityBadge(lead.priority)}</TableCell>
                  <TableCell>{lead.marketing_owner_name || '-'}</TableCell>
                  <TableCell>{formatDate(lead.created_at)}</TableCell>
                  <TableCell>{renderActionMenu(lead)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden divide-y">
          {leads.map((lead) => (
            <div key={lead.lead_id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-sm truncate">{lead.company_name}</h4>
                  <p className="text-xs text-muted-foreground truncate">{lead.pic_name || '-'}</p>
                  {lead.pic_email && (
                    <p className="text-xs text-muted-foreground truncate">{lead.pic_email}</p>
                  )}
                </div>
                {renderActionMenu(lead)}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {getStatusBadge(lead.triage_status)}
                {getPriorityBadge(lead.priority)}
                <Badge variant="outline" className="text-xs">{lead.source}</Badge>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{lead.marketing_owner_name || 'No owner'}</span>
                <span>{formatDate(lead.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
