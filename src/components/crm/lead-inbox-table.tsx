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
import { MoreHorizontal, CheckCircle, XCircle, Leaf, Send } from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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

  const handleTriage = async (leadId: string, newStatus: string) => {
    setIsLoading(leadId)
    try {
      const response = await fetch(`/api/crm/leads/${leadId}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_status: newStatus }),
      })

      if (response.ok) {
        router.refresh()
      }
    } catch (error) {
      console.error('Error triaging lead:', error)
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Leads Awaiting Triage ({leads.length})</CardTitle>
      </CardHeader>
      <CardContent>
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
                <TableCell>
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
                        <DropdownMenuItem onClick={() => handleTriage(lead.lead_id, 'In Review')}>
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Mark In Review
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleTriage(lead.lead_id, 'Qualified')}>
                        <Send className="mr-2 h-4 w-4 text-green-500" />
                        Mark Qualified
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleTriage(lead.lead_id, 'Nurture')}>
                        <Leaf className="mr-2 h-4 w-4 text-purple-500" />
                        Move to Nurture
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleTriage(lead.lead_id, 'Disqualified')}>
                        <XCircle className="mr-2 h-4 w-4 text-red-500" />
                        Disqualify
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
  )
}
