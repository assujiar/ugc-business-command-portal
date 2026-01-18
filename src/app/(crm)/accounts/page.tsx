// =====================================================
// Accounts Page
// SOURCE: PDF Section 5, Page 18
// Mobile-responsive design
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
import { Building2, TrendingUp, User, Calendar, DollarSign, Activity } from 'lucide-react'

interface AccountEnriched {
  account_id: string
  company_name: string
  owner_name: string | null
  pic_name: string | null
  pic_email: string | null
  pic_phone: string | null
  activity_status: string | null
  account_status: string | null
  open_opportunities: number
  planned_activities: number
  overdue_activities: number
  revenue_total: number
}

export default async function AccountsPage() {
  const supabase = await createClient()

  const { data: accounts } = await supabase
    .from('v_accounts_enriched')
    .select('*')
    .order('company_name', { ascending: true }) as { data: AccountEnriched[] | null }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Manage customer accounts and relationships
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3 lg:pb-6">
          <CardTitle className="text-base lg:text-lg">All Accounts ({accounts?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent className="px-0 lg:px-6">
          {accounts && accounts.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company Name</TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          PIC
                        </div>
                      </TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Activity className="h-4 w-4" />
                          Activity Status
                        </div>
                      </TableHead>
                      <TableHead>Account Status</TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-4 w-4" />
                          Open Opps
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />
                          Revenue Total
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
                        <TableCell>
                          {account.pic_name ? (
                            <div className="text-sm">
                              <div className="font-medium">{account.pic_name}</div>
                              {account.pic_email && (
                                <div className="text-xs text-muted-foreground">{account.pic_email}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{account.owner_name || '-'}</TableCell>
                        <TableCell>
                          {account.activity_status ? (
                            <Badge variant={account.activity_status === 'Active' ? 'default' : 'secondary'}>
                              {account.activity_status}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {account.account_status ? (
                            <Badge variant={
                              account.account_status === 'active_account' ? 'default' :
                              account.account_status === 'calon_account' ? 'outline' :
                              account.account_status === 'new_account' ? 'secondary' :
                              'destructive'
                            }>
                              {account.account_status.replace('_', ' ')}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={account.open_opportunities > 0 ? 'default' : 'secondary'}>
                            {account.open_opportunities}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {account.revenue_total > 0 ? (
                            <span className="text-green-600">
                              Rp {(account.revenue_total / 1000000).toFixed(1)}M
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
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
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3 px-4">
                {accounts.map((account) => (
                  <Card key={account.account_id} className="bg-muted/30">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <h4 className="font-medium text-sm truncate">{account.company_name}</h4>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Owner: {account.owner_name || '-'}
                          </p>
                          {account.pic_name && (
                            <p className="text-xs text-muted-foreground">
                              PIC: {account.pic_name}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          {account.account_status && (
                            <Badge variant="outline" className="text-xs">
                              {account.account_status.replace('_', ' ')}
                            </Badge>
                          )}
                          {account.overdue_activities > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {account.overdue_activities} Overdue
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mt-3">
                        <div className="text-center p-2 bg-background rounded">
                          <div className="flex items-center justify-center gap-1">
                            <Activity className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Status</span>
                          </div>
                          <p className="font-semibold text-xs">{account.activity_status || '-'}</p>
                        </div>
                        <div className="text-center p-2 bg-background rounded">
                          <div className="flex items-center justify-center gap-1">
                            <TrendingUp className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Opps</span>
                          </div>
                          <p className="font-semibold text-sm">{account.open_opportunities}</p>
                        </div>
                        <div className="text-center p-2 bg-background rounded">
                          <div className="flex items-center justify-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Planned</span>
                          </div>
                          <p className="font-semibold text-sm">{account.planned_activities}</p>
                        </div>
                      </div>

                      {account.revenue_total > 0 && (
                        <div className="mt-3 pt-3 border-t text-center">
                          <span className="text-xs text-muted-foreground">Revenue Total: </span>
                          <span className="text-sm font-medium text-green-600">
                            Rp {(account.revenue_total / 1000000).toFixed(1)}M
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 px-4">
              <p className="text-muted-foreground">No accounts found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
