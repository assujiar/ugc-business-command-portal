// =====================================================
// Targets Table Component
// SOURCE: PDF Section 5 - Targets View
// Mobile-responsive design
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { ArrowRight, Building2 } from 'lucide-react'

interface Target {
  target_id: string
  company_name: string
  pic_name: string | null
  pic_email: string | null
  pic_phone: string | null
  industry: string | null
  source: string | null
  status: string
  owner_name: string | null
  created_at: string
}

interface TargetsTableProps {
  targets: Target[]
}

export function TargetsTable({ targets }: TargetsTableProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const handleConvert = async (targetId: string) => {
    setIsLoading(targetId)
    try {
      const response = await fetch(`/api/crm/targets/${targetId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          create_opportunity: true,
        }),
      })

      if (response.ok) {
        router.push('/pipeline')
        router.refresh()
      }
    } catch (error) {
      console.error('Error converting target:', error)
    } finally {
      setIsLoading(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return <Badge variant="info">New</Badge>
      case 'researching':
        return <Badge variant="secondary">Researching</Badge>
      case 'outreach_planned':
        return <Badge variant="warning">Outreach Planned</Badge>
      case 'contacted':
        return <Badge className="bg-purple-500 text-white">Contacted</Badge>
      case 'meeting_scheduled':
        return <Badge variant="success">Meeting Scheduled</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  if (targets.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">No active targets</p>
          <p className="text-sm text-muted-foreground">Create targets to track prospecting research</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3 lg:pb-6">
        <CardTitle className="text-base lg:text-lg">Active Targets ({targets.length})</CardTitle>
      </CardHeader>
      <CardContent className="px-0 lg:px-6">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[100px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targets.map((target) => (
                <TableRow key={target.target_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{target.company_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p>{target.pic_name || '-'}</p>
                      <p className="text-xs text-muted-foreground">{target.pic_email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{target.industry || '-'}</TableCell>
                  <TableCell>{getStatusBadge(target.status)}</TableCell>
                  <TableCell>{target.source || '-'}</TableCell>
                  <TableCell>{target.owner_name || '-'}</TableCell>
                  <TableCell>{formatDate(target.created_at)}</TableCell>
                  <TableCell>
                    {target.status === 'meeting_scheduled' && (
                      <Button
                        size="sm"
                        onClick={() => handleConvert(target.target_id)}
                        disabled={isLoading === target.target_id}
                      >
                        Convert
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3 px-4">
          {targets.map((target) => (
            <Card key={target.target_id} className="bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <h4 className="font-medium text-sm truncate">{target.company_name}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {target.pic_name || 'No contact'}
                    </p>
                  </div>
                  {getStatusBadge(target.status)}
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {target.industry && (
                    <Badge variant="outline" className="text-xs">
                      {target.industry}
                    </Badge>
                  )}
                  {target.source && (
                    <Badge variant="secondary" className="text-xs">
                      {target.source}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                  <span>Owner: {target.owner_name || '-'}</span>
                  <span>{formatDate(target.created_at)}</span>
                </div>

                {target.status === 'meeting_scheduled' && (
                  <div className="mt-3 pt-3 border-t">
                    <Button
                      size="sm"
                      onClick={() => handleConvert(target.target_id)}
                      disabled={isLoading === target.target_id}
                      className="w-full"
                    >
                      Convert to Opportunity
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
