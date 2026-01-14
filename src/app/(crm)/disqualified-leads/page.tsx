// =====================================================
// Disqualified Leads Page
// SOURCE: PDF Section 5, Page 17
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import { XCircle } from 'lucide-react'

interface DisqualifiedLead {
  lead_id: string
  company_name: string
  pic_name: string | null
  pic_email: string | null
  source: string
  disqualification_reason: string | null
  disqualified_by_name: string | null
  disqualified_at: string | null
}

export default async function DisqualifiedLeadsPage() {
  const supabase = await createClient()

  const { data: leads } = await supabase
    .from('v_disqualified_leads')
    .select('*')
    .order('disqualified_at', { ascending: false }) as { data: DisqualifiedLead[] | null }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Disqualified Leads</h1>
        <p className="text-muted-foreground">
          Archive of disqualified leads
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Disqualified Archive ({leads?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leads && leads.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Disqualified By</TableHead>
                  <TableHead>Disqualified At</TableHead>
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
                    <TableCell>{lead.source}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {lead.disqualification_reason || '-'}
                    </TableCell>
                    <TableCell>{lead.disqualified_by_name || '-'}</TableCell>
                    <TableCell>{formatDate(lead.disqualified_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No disqualified leads</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
