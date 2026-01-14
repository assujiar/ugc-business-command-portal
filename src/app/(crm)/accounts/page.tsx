// =====================================================
// Accounts Page
// SOURCE: PDF Section 5, Page 18
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
import { Building2, TrendingUp, Users, Calendar } from 'lucide-react'

interface AccountEnriched {
  account_id: string
  company_name: string
  owner_name: string | null
  open_opportunities: number
  pipeline_value: number
  contact_count: number
  planned_activities: number
  overdue_activities: number
}

export default async function AccountsPage() {
  const supabase = await createClient()

  const { data: accounts } = await supabase
    .from('v_accounts_enriched')
    .select('*')
    .order('company_name', { ascending: true }) as { data: AccountEnriched[] | null }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Accounts</h1>
        <p className="text-muted-foreground">
          Manage customer accounts and relationships
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Accounts ({accounts?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts && accounts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-4 w-4" />
                      Open Opps
                    </div>
                  </TableHead>
                  <TableHead>Pipeline Value</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      Contacts
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Planned
                    </div>
                  </TableHead>
                  <TableHead>Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.account_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{account.company_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{account.owner_name || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={account.open_opportunities > 0 ? 'default' : 'secondary'}>
                        {account.open_opportunities}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {account.pipeline_value > 0 ? (
                        <span className="text-green-600">
                          Rp {(account.pipeline_value / 1000000).toFixed(1)}M
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{account.contact_count}</TableCell>
                    <TableCell>{account.planned_activities}</TableCell>
                    <TableCell>
                      {account.overdue_activities > 0 ? (
                        <Badge variant="destructive">{account.overdue_activities}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No accounts found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
