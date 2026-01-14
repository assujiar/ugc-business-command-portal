// =====================================================
// Activities Table Component
// SOURCE: PDF Section 5 - Activities View
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDate, isOverdue } from '@/lib/utils'
import { CheckCircle, Phone, Mail, Users, MapPin, MessageCircle, FileText, AlertCircle } from 'lucide-react'

interface Activity {
  activity_id: string
  activity_type: string
  subject: string
  description: string | null
  status: string
  due_date: string
  account_name: string | null
  opportunity_name: string | null
  lead_company: string | null
}

interface ActivitiesTableProps {
  activities: Activity[]
}

const activityIcons: Record<string, any> = {
  Call: Phone,
  Email: Mail,
  Meeting: Users,
  'Site Visit': MapPin,
  WhatsApp: MessageCircle,
  Task: FileText,
  Proposal: FileText,
  'Contract Review': FileText,
}

export function ActivitiesTable({ activities }: ActivitiesTableProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const plannedActivities = activities.filter((a) => a.status === 'Planned')
  const completedActivities = activities.filter((a) => a.status === 'Done')

  const handleComplete = async (activityId: string) => {
    setIsLoading(activityId)
    try {
      const response = await fetch(`/api/crm/activities/${activityId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: 'Completed' }),
      })

      if (response.ok) {
        router.refresh()
      }
    } catch (error) {
      console.error('Error completing activity:', error)
    } finally {
      setIsLoading(null)
    }
  }

  const getActivityIcon = (type: string) => {
    const Icon = activityIcons[type] || FileText
    return <Icon className="h-4 w-4" />
  }

  const getRelatedEntity = (activity: Activity) => {
    if (activity.account_name) return activity.account_name
    if (activity.opportunity_name) return activity.opportunity_name
    if (activity.lead_company) return activity.lead_company
    return '-'
  }

  const renderTable = (items: Activity[], showComplete: boolean = true) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]">Type</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Related To</TableHead>
          <TableHead>Due Date</TableHead>
          {showComplete && <TableHead className="w-[100px]">Action</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((activity) => (
          <TableRow key={activity.activity_id}>
            <TableCell>
              <div className="flex items-center gap-2" title={activity.activity_type}>
                {getActivityIcon(activity.activity_type)}
              </div>
            </TableCell>
            <TableCell>
              <div>
                <p className="font-medium">{activity.subject}</p>
                {activity.description && (
                  <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                    {activity.description}
                  </p>
                )}
              </div>
            </TableCell>
            <TableCell>{getRelatedEntity(activity)}</TableCell>
            <TableCell>
              <span className={isOverdue(activity.due_date) && activity.status === 'Planned' ? 'overdue flex items-center gap-1' : ''}>
                {isOverdue(activity.due_date) && activity.status === 'Planned' && (
                  <AlertCircle className="h-3 w-3" />
                )}
                {formatDate(activity.due_date)}
              </span>
            </TableCell>
            {showComplete && (
              <TableCell>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleComplete(activity.activity_id)}
                  disabled={isLoading === activity.activity_id}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Done
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )

  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs defaultValue="planned">
          <TabsList>
            <TabsTrigger value="planned">
              Planned ({plannedActivities.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({completedActivities.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="planned" className="mt-4">
            {plannedActivities.length > 0 ? (
              renderTable(plannedActivities)
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No planned activities</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-4">
            {completedActivities.length > 0 ? (
              renderTable(completedActivities, false)
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No completed activities</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
