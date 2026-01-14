// =====================================================
// Imports Page
// SOURCE: PDF - Import Functionality
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateTime } from '@/lib/utils'
import { Upload, CheckCircle, XCircle, Clock, History, AlertTriangle } from 'lucide-react'
import { ImportWizard } from '@/components/crm/import-wizard'

interface ImportBatch {
  batch_id: number
  entity_type: string
  file_name: string | null
  total_rows: number
  success_count: number
  error_count: number
  status: string
  started_at: string
  completed_at: string | null
}

export default async function ImportsPage() {
  const supabase = await createClient()

  const { data: batches } = await supabase
    .from('import_batches')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50) as { data: ImportBatch[] | null }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="success" className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            Completed
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        )
      case 'partial':
        return (
          <Badge variant="warning" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Partial
          </Badge>
        )
      case 'processing':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Processing
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getEntityBadge = (entityType: string) => {
    switch (entityType) {
      case 'leads':
        return <Badge variant="default">Leads</Badge>
      case 'accounts':
        return <Badge variant="outline">Accounts</Badge>
      case 'contacts':
        return <Badge variant="secondary">Contacts</Badge>
      default:
        return <Badge variant="outline">{entityType}</Badge>
    }
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Data Imports</h1>
        <p className="text-sm text-muted-foreground">
          Import leads, accounts, and contacts from CSV files
        </p>
      </div>

      <Tabs defaultValue="import" className="space-y-4">
        <TabsList>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            New Import
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Import History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="import">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Import Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ImportWizard />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5" />
                Import History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {batches && batches.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>File Name</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Success</TableHead>
                      <TableHead className="text-center">Errors</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((batch) => (
                      <TableRow key={batch.batch_id}>
                        <TableCell className="font-mono text-sm">
                          #{batch.batch_id}
                        </TableCell>
                        <TableCell>{getEntityBadge(batch.entity_type)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {batch.file_name || '-'}
                        </TableCell>
                        <TableCell className="text-center">{batch.total_rows}</TableCell>
                        <TableCell className="text-center text-green-600 dark:text-green-400">
                          {batch.success_count}
                        </TableCell>
                        <TableCell className="text-center text-red-600 dark:text-red-400">
                          {batch.error_count}
                        </TableCell>
                        <TableCell>{getStatusBadge(batch.status)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(batch.started_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12">
                  <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No import history</p>
                  <p className="text-sm text-muted-foreground">
                    Your import history will appear here after you upload files
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
