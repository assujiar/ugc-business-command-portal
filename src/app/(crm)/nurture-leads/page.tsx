// =====================================================
// Nurture Leads Page
// SOURCE: PDF Section 5, Page 17
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import { Leaf } from 'lucide-react'

interface NurtureLead {
  lead_id: string
  company_name: string
  pic_name: string | null
  pic_email: string | null
  source: string
  marketing_owner_name: string | null
  updated_at: string
}

export default async function NurtureLeadsPage() {
  const supabase = await createClient()

  const { data: leads } = await supabase
    .from('v_nurture_leads')
    .select('*')
    .order('updated_at', { ascending: false }) as { data: NurtureLead[] | null }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nurture Leads</h1>
        <p className="text-muted-foreground">
          Leads in nurture status for long-term follow-up
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Leaf className="h-5 w-5 text-purple-500" />
            Nurture Queue ({leads?.length || 0})
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
                  <TableHead>Owner</TableHead>
                  <TableHead>Last Updated</TableHead>
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
                    <TableCell>{lead.marketing_owner_name || '-'}</TableCell>
                    <TableCell>{formatDate(lead.updated_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No leads in nurture status</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
