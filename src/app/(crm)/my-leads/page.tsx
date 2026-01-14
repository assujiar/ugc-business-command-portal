// =====================================================
// My Leads Page - Claimed Leads by User
// SOURCE: PDF Section 5, Page 17
// =====================================================

import { createClient } from '@/lib/supabase/server'
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
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { AddLeadDialog } from '@/components/crm/add-lead-dialog'

interface MyLead {
  lead_id: string
  company_name: string
  sales_owner_user_id: string
  account_name: string | null
  linked_opportunity_id: string | null
  opportunity_stage: string | null
  claimed_at: string | null
}

export default async function MyLeadsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: leads } = user
    ? await supabase
        .from('v_my_leads')
        .select('*')
        .eq('sales_owner_user_id', user.id)
        .order('claimed_at', { ascending: false }) as { data: MyLead[] | null }
    : { data: null }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Leads</h1>
          <p className="text-muted-foreground">
            Leads you have claimed and are working on
          </p>
        </div>
        <AddLeadDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Claimed Leads ({leads?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {leads && leads.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Opportunity</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Claimed At</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.lead_id}>
                    <TableCell className="font-medium">{lead.company_name}</TableCell>
                    <TableCell>{lead.account_name || '-'}</TableCell>
                    <TableCell>
                      {lead.linked_opportunity_id ? (
                        <Link
                          href={`/pipeline?opp=${lead.linked_opportunity_id}`}
                          className="text-brand hover:underline"
                        >
                          View Opportunity
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Not converted</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.opportunity_stage ? (
                        <Badge variant="outline">{lead.opportunity_stage}</Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{formatDate(lead.claimed_at)}</TableCell>
                    <TableCell>
                      {!lead.linked_opportunity_id && (
                        <Button size="sm" variant="outline">
                          Convert
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No claimed leads yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                Create a new lead using the button above, or go to{' '}
                <Link href="/sales-inbox" className="text-brand hover:underline">
                  Sales Inbox
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
