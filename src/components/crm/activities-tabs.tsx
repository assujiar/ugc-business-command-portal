'use client'

// =====================================================
// Activities Tabs Component
// Shows Planned and Completed activities in tabs
// Data from sales_plans and pipeline_updates
// =====================================================

import { useState, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate, formatDateTime } from '@/lib/utils'
import { APPROACH_METHODS } from '@/lib/constants'
import type { UserRole, ApproachMethod } from '@/types/database'
import {
  Clock,
  CheckCircle,
  Calendar,
  MapPin,
  FileText,
  Image,
  ExternalLink,
  Eye,
  Building2,
  User,
} from 'lucide-react'

interface Activity {
  activity_id: string
  source_type: 'sales_plan' | 'pipeline_update'
  activity_type: ApproachMethod
  activity_detail: string
  notes: string | null
  status: 'planned' | 'completed' | 'cancelled'
  scheduled_on: string
  scheduled_time: string | null
  completed_on: string | null
  evidence_url: string | null
  evidence_file_name: string | null
  location_lat: number | null
  location_lng: number | null
  location_address: string | null
  owner_user_id: string
  account_id: string | null
  opportunity_id: string | null
  created_at: string
  sales_name: string | null
  account_name: string | null
}

interface ActivitiesTabsProps {
  activities: Activity[]
  currentUserId: string
  userRole: UserRole
}

// Helper to check if URL is an image
function isImageUrl(url: string | null): boolean {
  if (!url) return false
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
  const lowerUrl = url.toLowerCase()
  return imageExtensions.some(ext => lowerUrl.includes(ext))
}

export function ActivitiesTabs({ activities, currentUserId, userRole }: ActivitiesTabsProps) {
  const [activeTab, setActiveTab] = useState<'planned' | 'completed'>('planned')
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Split activities by status
  const plannedActivities = useMemo(() =>
    activities
      .filter(a => a.status === 'planned')
      .sort((a, b) => new Date(a.scheduled_on).getTime() - new Date(b.scheduled_on).getTime()),
    [activities]
  )

  const completedActivities = useMemo(() =>
    activities
      .filter(a => a.status === 'completed')
      .sort((a, b) => new Date(b.completed_on || b.scheduled_on).getTime() - new Date(a.completed_on || a.scheduled_on).getTime()),
    [activities]
  )

  const getActivityTypeLabel = (type: ApproachMethod) => {
    return APPROACH_METHODS.find(m => m.value === type)?.label || type
  }

  const handleViewDetail = (activity: Activity) => {
    setSelectedActivity(activity)
    setDetailOpen(true)
  }

  const renderActivityTable = (activityList: Activity[], showCompleted: boolean) => (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sales Name</TableHead>
                <TableHead>Activity Type</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead>Activity Detail</TableHead>
                <TableHead>Scheduled On</TableHead>
                {showCompleted && <TableHead>Completed On</TableHead>}
                <TableHead>Evidence</TableHead>
                <TableHead>Geo Location</TableHead>
                <TableHead className="text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activityList.length > 0 ? (
                activityList.map((activity) => (
                  <TableRow key={activity.activity_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {activity.sales_name || '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getActivityTypeLabel(activity.activity_type)}
                      </Badge>
                      {activity.source_type === 'pipeline_update' && (
                        <Badge variant="secondary" className="ml-1 text-xs">Pipeline</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        {activity.account_name || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="truncate" title={activity.activity_detail}>
                        {activity.activity_detail}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3" />
                        {formatDate(activity.scheduled_on)}
                        {activity.scheduled_time && (
                          <span className="text-muted-foreground">
                            {activity.scheduled_time}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {showCompleted && (
                      <TableCell>
                        {activity.completed_on ? (
                          <div className="flex items-center gap-1 text-sm text-green-600">
                            <CheckCircle className="h-3 w-3" />
                            {formatDateTime(activity.completed_on)}
                          </div>
                        ) : '-'}
                      </TableCell>
                    )}
                    <TableCell>
                      {activity.evidence_url ? (
                        <a
                          href={activity.evidence_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-brand hover:underline text-sm"
                        >
                          {isImageUrl(activity.evidence_url) ? (
                            <Image className="h-4 w-4" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                          View
                        </a>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {activity.location_address ? (
                        <div className="flex items-center gap-1 text-sm max-w-[150px]">
                          <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="truncate" title={activity.location_address}>
                            {activity.location_address.split(',')[0]}
                          </span>
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetail(activity)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={showCompleted ? 9 : 8} className="text-center py-8 text-muted-foreground">
                    No activities found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'planned' | 'completed')}>
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="planned" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Planned ({plannedActivities.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Completed ({completedActivities.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="planned">
          {renderActivityTable(plannedActivities, false)}
        </TabsContent>

        <TabsContent value="completed">
          {renderActivityTable(completedActivities, true)}
        </TabsContent>
      </Tabs>

      {/* Activity Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Activity Detail</DialogTitle>
          </DialogHeader>
          {selectedActivity && (
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Sales Name</p>
                  <p className="font-medium">{selectedActivity.sales_name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Activity Type</p>
                  <Badge variant="outline">
                    {getActivityTypeLabel(selectedActivity.activity_type)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Account</p>
                  <p className="font-medium">{selectedActivity.account_name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge className={selectedActivity.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}>
                    {selectedActivity.status === 'completed' ? (
                      <><CheckCircle className="h-3 w-3 mr-1" />Completed</>
                    ) : (
                      <><Clock className="h-3 w-3 mr-1" />Planned</>
                    )}
                  </Badge>
                </div>
              </div>

              {/* Activity Detail */}
              <div>
                <p className="text-xs text-muted-foreground">Activity Detail</p>
                <p className="font-medium">{selectedActivity.activity_detail}</p>
              </div>

              {/* Notes */}
              {selectedActivity.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{selectedActivity.notes}</p>
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Scheduled On</p>
                  <p className="font-medium flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(selectedActivity.scheduled_on)}
                    {selectedActivity.scheduled_time && ` ${selectedActivity.scheduled_time}`}
                  </p>
                </div>
                {selectedActivity.completed_on && (
                  <div>
                    <p className="text-xs text-muted-foreground">Completed On</p>
                    <p className="font-medium text-green-600 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      {formatDateTime(selectedActivity.completed_on)}
                    </p>
                  </div>
                )}
              </div>

              {/* Evidence */}
              {selectedActivity.evidence_url && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Evidence</p>
                  {isImageUrl(selectedActivity.evidence_url) ? (
                    <a
                      href={selectedActivity.evidence_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        src={selectedActivity.evidence_url}
                        alt="Evidence"
                        className="rounded-lg max-h-48 object-cover border"
                      />
                    </a>
                  ) : (
                    <a
                      href={selectedActivity.evidence_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-brand hover:underline"
                    >
                      <FileText className="h-4 w-4" />
                      {selectedActivity.evidence_file_name || 'Download Evidence'}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}

              {/* Location */}
              {selectedActivity.location_address && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Geo Location</p>
                  <p className="text-sm flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    {selectedActivity.location_address}
                  </p>
                  {selectedActivity.location_lat && selectedActivity.location_lng && (
                    <a
                      href={`https://www.google.com/maps?q=${selectedActivity.location_lat},${selectedActivity.location_lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-brand hover:underline mt-2"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View in Google Maps
                    </a>
                  )}
                </div>
              )}

              {/* Source */}
              <div>
                <p className="text-xs text-muted-foreground">Source</p>
                <Badge variant="secondary">
                  {selectedActivity.source_type === 'pipeline_update' ? 'Pipeline Update' : 'Sales Plan'}
                </Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
