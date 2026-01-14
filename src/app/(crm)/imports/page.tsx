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
import { formatDateTime } from '@/lib/utils'
import { Upload, CheckCircle, XCircle, Clock } from 'lucide-react'

interface ImportBatch {
  batch_id: number
  entity_type: string
  file_name: string | null
  total_rows: number
  success_count: number
  error_count: number
  status: string
  started_at: string
}

export default async function ImportsPage() {
  const supabase = await createClient()

  const { data: batches } = await supabase
    .from('import_batches')
    .select('*')
    .order('started_at', { ascending: false }) as { data: ImportBatch[] | null }

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
      case 'processing':
        return (
          <Badge variant="warning" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Processing
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Data Imports</h1>
          <p className="text-muted-foreground">
            Import leads, accounts, and contacts from CSV files
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {batches && batches.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>Entity Type</TableHead>
                  <TableHead>File Name</TableHead>
                  <TableHead>Total Rows</TableHead>
                  <TableHead>Success</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.batch_id}>
                    <TableCell className="font-mono text-sm">
                      #{batch.batch_id}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{batch.entity_type}</Badge>
                    </TableCell>
                    <TableCell>{batch.file_name || '-'}</TableCell>
                    <TableCell>{batch.total_rows}</TableCell>
                    <TableCell className="text-green-600">
                      {batch.success_count}
                    </TableCell>
                    <TableCell className="text-red-600">
                      {batch.error_count}
                    </TableCell>
                    <TableCell>{getStatusBadge(batch.status)}</TableCell>
                    <TableCell>{formatDateTime(batch.started_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No import history</p>
              <p className="text-sm text-muted-foreground">
                Upload a CSV file to import data
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
