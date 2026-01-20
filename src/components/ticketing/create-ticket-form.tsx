'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { useForm } from 'react-hook-form'
import {
  FileText,
  Ticket,
  Building2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { getUserTicketingDepartment } from '@/lib/permissions'
import type { Database } from '@/types/database'
import type { TicketType, TicketPriority, TicketingDepartment } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']
type Account = Database['public']['Tables']['accounts']['Row']

interface CreateTicketFormProps {
  profile: Profile
}

interface FormData {
  ticket_type: TicketType
  subject: string
  description: string
  department: TicketingDepartment
  priority: TicketPriority
  account_id?: string
  // RFQ specific fields
  rfq_service_type?: string
  rfq_cargo_category?: string
  rfq_cargo_description?: string
  rfq_origin_city?: string
  rfq_origin_country?: string
  rfq_destination_city?: string
  rfq_destination_country?: string
  rfq_quantity?: number
  rfq_unit_of_measure?: string
  rfq_weight_per_unit?: number
  rfq_length?: number
  rfq_width?: number
  rfq_height?: number
}

// Department options
const departments: { value: TicketingDepartment; label: string }[] = [
  { value: 'MKT', label: 'Marketing' },
  { value: 'SAL', label: 'Sales' },
  { value: 'DOM', label: 'Domestics Operations' },
  { value: 'EXI', label: 'EXIM Operations' },
  { value: 'DTD', label: 'Import DTD Operations' },
  { value: 'TRF', label: 'Traffic & Warehouse' },
]

// Service types for RFQ
const serviceTypes = [
  'LTL', 'FTL', 'AF', 'LCL', 'FCL', 'WAREHOUSING', 'FULFILLMENT',
  'LCL Export', 'FCL Export', 'Airfreight Export',
  'LCL Import', 'FCL Import', 'Airfreight Import',
  'Customs Clearance', 'LCL DTD', 'FCL DTD', 'Airfreight DTD',
]

// Cargo categories
const cargoCategories = ['Genco', 'DG']

// Units of measure
const unitsOfMeasure = [
  'Boxes', 'Drum', 'Wood Package', 'Pallet', 'Carton', 'Bag',
  'Bundle', 'Roll', 'Piece', 'Crate', 'Container', 'Sack',
]

export function CreateTicketForm({ profile }: CreateTicketFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [ticketType, setTicketType] = useState<TicketType>('GEN')

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      ticket_type: 'GEN',
      priority: 'medium',
      department: (getUserTicketingDepartment(profile.role) as TicketingDepartment) || 'SAL',
    },
  })

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Fetch accounts for dropdown
  useEffect(() => {
    const fetchAccounts = async () => {
      const { data } = await supabase
        .from('accounts')
        .select('account_id, company_name')
        .order('company_name')
        .limit(100)

      setAccounts(data || [])
    }
    fetchAccounts()
  }, [])

  // Calculate volume
  const watchLength = watch('rfq_length')
  const watchWidth = watch('rfq_width')
  const watchHeight = watch('rfq_height')
  const watchQuantity = watch('rfq_quantity')

  const calculateVolume = () => {
    if (watchLength && watchWidth && watchHeight) {
      const volumePerUnit = (watchLength / 100) * (watchWidth / 100) * (watchHeight / 100)
      const totalVolume = volumePerUnit * (watchQuantity || 1)
      return { volumePerUnit: volumePerUnit.toFixed(4), totalVolume: totalVolume.toFixed(4) }
    }
    return { volumePerUnit: '0', totalVolume: '0' }
  }

  const volume = calculateVolume()

  // Submit form
  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      // Build RFQ data if ticket type is RFQ
      let rfq_data = null
      if (data.ticket_type === 'RFQ') {
        rfq_data = {
          service_type: data.rfq_service_type,
          cargo_category: data.rfq_cargo_category,
          cargo_description: data.rfq_cargo_description,
          origin_city: data.rfq_origin_city,
          origin_country: data.rfq_origin_country || 'Indonesia',
          destination_city: data.rfq_destination_city,
          destination_country: data.rfq_destination_country || 'Indonesia',
          quantity: data.rfq_quantity,
          unit_of_measure: data.rfq_unit_of_measure,
          weight_per_unit: data.rfq_weight_per_unit,
          length: data.rfq_length,
          width: data.rfq_width,
          height: data.rfq_height,
          volume_per_unit: parseFloat(volume.volumePerUnit),
          total_volume: parseFloat(volume.totalVolume),
        }
      }

      const response = await fetch('/api/ticketing/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_type: data.ticket_type,
          subject: data.subject,
          description: data.description,
          department: data.department,
          priority: data.priority,
          account_id: data.account_id || null,
          rfq_data,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create ticket')
      }

      toast({
        title: 'Ticket created',
        description: `Ticket ${result.ticket_code} has been created successfully`,
      })

      router.push(`/tickets/${result.ticket_id}`)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create ticket',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Ticket Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Ticket Type</CardTitle>
          <CardDescription>
            Choose the type of ticket you want to create
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => {
                setTicketType('GEN')
                setValue('ticket_type', 'GEN')
              }}
              className={`p-4 rounded-lg border-2 transition-colors ${
                ticketType === 'GEN'
                  ? 'border-brand bg-brand/5'
                  : 'border-border hover:border-muted-foreground/50'
              }`}
            >
              <Ticket className={`h-8 w-8 mx-auto mb-2 ${ticketType === 'GEN' ? 'text-brand' : 'text-muted-foreground'}`} />
              <p className="font-medium">General Inquiry</p>
              <p className="text-sm text-muted-foreground">Support questions, issues, requests</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setTicketType('RFQ')
                setValue('ticket_type', 'RFQ')
              }}
              className={`p-4 rounded-lg border-2 transition-colors ${
                ticketType === 'RFQ'
                  ? 'border-brand bg-brand/5'
                  : 'border-border hover:border-muted-foreground/50'
              }`}
            >
              <FileText className={`h-8 w-8 mx-auto mb-2 ${ticketType === 'RFQ' ? 'text-brand' : 'text-muted-foreground'}`} />
              <p className="font-medium">Request for Quote</p>
              <p className="text-sm text-muted-foreground">Rate quote for shipping services</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="department">Department *</Label>
              <Select
                defaultValue={watch('department')}
                onValueChange={(value) => setValue('department', value as TicketingDepartment)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.value} value={dept.value}>
                      {dept.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority *</Label>
              <Select
                defaultValue="medium"
                onValueChange={(value) => setValue('priority', value as TicketPriority)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account_id">Link to Account (Optional)</Label>
            <Select
              onValueChange={(value) => setValue('account_id', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.account_id} value={account.account_id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {account.company_name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              placeholder="Brief description of the request"
              {...register('subject', { required: 'Subject is required' })}
            />
            {errors.subject && (
              <p className="text-sm text-destructive">{errors.subject.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Provide more details about your request..."
              rows={4}
              {...register('description')}
            />
          </div>
        </CardContent>
      </Card>

      {/* RFQ Specific Fields */}
      {ticketType === 'RFQ' && (
        <Card>
          <CardHeader>
            <CardTitle>Shipment Details</CardTitle>
            <CardDescription>
              Provide details about the shipment for accurate quoting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rfq_service_type">Service Type *</Label>
                <Select
                  onValueChange={(value) => setValue('rfq_service_type', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rfq_cargo_category">Cargo Category *</Label>
                <Select
                  onValueChange={(value) => setValue('rfq_cargo_category', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {cargoCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat === 'DG' ? 'Dangerous Goods (DG)' : 'General Cargo (Genco)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rfq_cargo_description">Cargo Description</Label>
              <Input
                id="rfq_cargo_description"
                placeholder="e.g., Electronics, Garments, Machinery"
                {...register('rfq_cargo_description')}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rfq_origin_city">Origin City *</Label>
                <Input
                  id="rfq_origin_city"
                  placeholder="e.g., Jakarta"
                  {...register('rfq_origin_city')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rfq_destination_city">Destination City *</Label>
                <Input
                  id="rfq_destination_city"
                  placeholder="e.g., Surabaya"
                  {...register('rfq_destination_city')}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="rfq_quantity">Quantity *</Label>
                <Input
                  id="rfq_quantity"
                  type="number"
                  min="1"
                  placeholder="1"
                  {...register('rfq_quantity', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rfq_unit_of_measure">Unit *</Label>
                <Select
                  onValueChange={(value) => setValue('rfq_unit_of_measure', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {unitsOfMeasure.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rfq_weight_per_unit">Weight per Unit (kg)</Label>
                <Input
                  id="rfq_weight_per_unit"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...register('rfq_weight_per_unit', { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="rfq_length">Length (cm)</Label>
                <Input
                  id="rfq_length"
                  type="number"
                  step="0.1"
                  placeholder="0"
                  {...register('rfq_length', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rfq_width">Width (cm)</Label>
                <Input
                  id="rfq_width"
                  type="number"
                  step="0.1"
                  placeholder="0"
                  {...register('rfq_width', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rfq_height">Height (cm)</Label>
                <Input
                  id="rfq_height"
                  type="number"
                  step="0.1"
                  placeholder="0"
                  {...register('rfq_height', { valueAsNumber: true })}
                />
              </div>
            </div>

            {/* Volume Calculation */}
            {(watchLength || watchWidth || watchHeight) && (
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm font-medium mb-2">Calculated Volume</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Volume per Unit</p>
                    <p className="font-mono">{volume.volumePerUnit} CBM</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Volume</p>
                    <p className="font-mono">{volume.totalVolume} CBM</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          Create Ticket
        </Button>
      </div>
    </form>
  )
}
