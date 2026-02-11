'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { Users, Globe, MapPin, Languages, UserPlus, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TableHeaderInfo, METRIC_DESCRIPTIONS } from '../shared/metric-info-dialog'

// =====================================================
// Types
// =====================================================

interface DemographicRow {
  dimension_type: string
  dimension_value: string
  sessions: number
  users: number
  new_users: number
  engaged_sessions: number
  engagement_rate: number
  bounce_rate: number
  conversions: number
  page_views: number
}

interface AudienceSectionProps {
  data: {
    age: DemographicRow[]
    gender: DemographicRow[]
    country: DemographicRow[]
    city: DemographicRow[]
    new_returning: DemographicRow[]
    language: DemographicRow[]
  } | null
  loading: boolean
}

// =====================================================
// Helpers
// =====================================================

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toLocaleString('id-ID')
}

function formatPercent(num: number): string {
  return `${(num * 100).toFixed(1)}%`
}

const AGE_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899']
const GENDER_COLORS: Record<string, string> = {
  male: '#3b82f6',
  female: '#ec4899',
  unknown: '#94a3b8',
}
const PIE_COLORS = ['#3b82f6', '#ec4899', '#94a3b8', '#22c55e', '#eab308']
const NR_COLORS: Record<string, string> = {
  new: '#22c55e',
  returning: '#6366f1',
}

function genderLabel(value: string): string {
  switch (value.toLowerCase()) {
    case 'male': return 'Laki-laki'
    case 'female': return 'Perempuan'
    default: return 'Tidak Diketahui'
  }
}

function newRetLabel(value: string): string {
  switch (value.toLowerCase()) {
    case 'new': return 'Pengunjung Baru'
    case 'returning': return 'Pengunjung Kembali'
    default: return value
  }
}

// =====================================================
// Loading skeleton
// =====================================================

function AudienceSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent><Skeleton className="h-[250px] w-full" /></CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// =====================================================
// Main component
// =====================================================

export function AudienceSection({ data, loading }: AudienceSectionProps) {
  if (loading && !data) return <AudienceSkeleton />

  if (!data || (data.age.length === 0 && data.gender.length === 0 && data.country.length === 0)) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Belum ada data demografi audiens. Klik &quot;Refresh Data&quot; untuk mengambil data dari GA4.
          </p>
        </CardContent>
      </Card>
    )
  }

  const totalSessions = data.age.reduce((s, r) => s + r.sessions, 0) || 1

  // Prepare chart data
  const ageData = data.age.map((r) => ({
    name: r.dimension_value,
    sessions: r.sessions,
    users: r.users,
    pct: ((r.sessions / totalSessions) * 100).toFixed(1),
  }))

  const genderData = data.gender.map((r) => ({
    name: genderLabel(r.dimension_value),
    value: r.sessions,
    key: r.dimension_value.toLowerCase(),
  }))

  const genderTotal = genderData.reduce((s, r) => s + r.value, 0) || 1

  const nrData = data.new_returning.map((r) => ({
    name: newRetLabel(r.dimension_value),
    value: r.sessions,
    key: r.dimension_value.toLowerCase(),
  }))

  const nrTotal = nrData.reduce((s, r) => s + r.value, 0) || 1

  return (
    <div className="space-y-6">
      {/* Row 1: Age + Gender */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Age Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Distribusi Usia
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ageData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={ageData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatNumber(value),
                      name === 'sessions' ? 'Sesi' : 'Users',
                    ]}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--popover))',
                      color: 'hsl(var(--popover-foreground))',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="sessions" name="sessions" radius={[4, 4, 0, 0]} barSize={32}>
                    {ageData.map((_, idx) => (
                      <Cell key={idx} fill={AGE_COLORS[idx % AGE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada data usia.</p>
            )}

            {/* Age table */}
            {ageData.length > 0 && (
              <div className="mt-3 space-y-1">
                {ageData.map((a, idx) => (
                  <div key={a.name} className="flex items-center justify-between text-xs py-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: AGE_COLORS[idx % AGE_COLORS.length] }} />
                      <span className="font-medium">{a.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{formatNumber(a.sessions)} sesi</span>
                      <Badge variant="outline" className="text-[10px]">{a.pct}%</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gender Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Distribusi Gender
            </CardTitle>
          </CardHeader>
          <CardContent>
            {genderData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={genderData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {genderData.map((entry) => (
                        <Cell key={entry.key} fill={GENDER_COLORS[entry.key] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [formatNumber(value), 'Sesi']}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--border))',
                        background: 'hsl(var(--popover))',
                        color: 'hsl(var(--popover-foreground))',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="mt-2 space-y-1.5">
                  {genderData.map((g) => (
                    <div key={g.key} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GENDER_COLORS[g.key] || '#94a3b8' }} />
                        <span className="font-medium">{g.name}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {formatNumber(g.value)} ({((g.value / genderTotal) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada data gender.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: New vs Returning + Language */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* New vs Returning */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              Pengunjung Baru vs Kembali
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nrData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={nrData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {nrData.map((entry) => (
                        <Cell key={entry.key} fill={NR_COLORS[entry.key] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [formatNumber(value), 'Sesi']}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--border))',
                        background: 'hsl(var(--popover))',
                        color: 'hsl(var(--popover-foreground))',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="mt-2 grid grid-cols-2 gap-3">
                  {nrData.map((item) => (
                    <div key={item.key} className="rounded-lg border p-3 text-center">
                      {item.key === 'new' ? (
                        <UserPlus className="h-5 w-5 mx-auto mb-1 text-green-500" />
                      ) : (
                        <UserCheck className="h-5 w-5 mx-auto mb-1 text-indigo-500" />
                      )}
                      <p className="text-lg font-bold">{formatNumber(item.value)}</p>
                      <p className="text-[10px] text-muted-foreground">{item.name}</p>
                      <Badge variant="outline" className="text-[10px] mt-1">
                        {((item.value / nrTotal) * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada data.</p>
            )}
          </CardContent>
        </Card>

        {/* Top Languages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Languages className="h-4 w-4 text-muted-foreground" />
              Top Bahasa
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.language.length > 0 ? (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Bahasa</TableHead>
                      <TableHead className="text-xs text-right">Sesi</TableHead>
                      <TableHead className="text-xs text-right">Users</TableHead>
                      <TableHead className="text-xs text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.language.slice(0, 10).map((lang, idx) => (
                      <TableRow key={`lang-${idx}`}>
                        <TableCell className="text-xs font-medium py-1.5">{lang.dimension_value}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(lang.sessions)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(lang.users)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-1.5">
                          {((lang.sessions / totalSessions) * 100).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada data bahasa.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Top Countries + Top Cities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Countries */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              Top Negara
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.country.length > 0 ? (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Negara</TableHead>
                      <TableHead className="text-xs text-right">Sesi</TableHead>
                      <TableHead className="text-xs text-right">Users</TableHead>
                      <TableHead className="text-xs text-right">Konversi</TableHead>
                      <TableHead className="text-xs text-right">Eng. Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.country.slice(0, 15).map((row, idx) => (
                      <TableRow key={`country-${idx}`}>
                        <TableCell className="text-xs text-muted-foreground py-1.5">{idx + 1}</TableCell>
                        <TableCell className="text-xs font-medium py-1.5">{row.dimension_value}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(row.sessions)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(row.users)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(row.conversions)}</TableCell>
                        <TableCell className="text-xs text-right py-1.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              row.engagement_rate >= 0.6
                                ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300'
                                : row.engagement_rate >= 0.4
                                  ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300'
                                  : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300'
                            )}
                          >
                            {formatPercent(row.engagement_rate)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada data negara.</p>
            )}
          </CardContent>
        </Card>

        {/* Top Cities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Top Kota
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.city.length > 0 ? (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Kota</TableHead>
                      <TableHead className="text-xs text-right">Sesi</TableHead>
                      <TableHead className="text-xs text-right">Users</TableHead>
                      <TableHead className="text-xs text-right">Konversi</TableHead>
                      <TableHead className="text-xs text-right">Eng. Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.city.slice(0, 15).map((row, idx) => (
                      <TableRow key={`city-${idx}`}>
                        <TableCell className="text-xs text-muted-foreground py-1.5">{idx + 1}</TableCell>
                        <TableCell className="text-xs font-medium py-1.5">{row.dimension_value}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(row.sessions)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(row.users)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums py-1.5">{formatNumber(row.conversions)}</TableCell>
                        <TableCell className="text-xs text-right py-1.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              row.engagement_rate >= 0.6
                                ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300'
                                : row.engagement_rate >= 0.4
                                  ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300'
                                  : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300'
                            )}
                          >
                            {formatPercent(row.engagement_rate)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada data kota.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
