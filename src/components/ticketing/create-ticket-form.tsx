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
  MapPin,
  Truck,
  Package,
  Upload,
  X,
  File,
  Paperclip,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { getUserTicketingDepartment, isOps } from '@/lib/permissions'
import {
  SERVICE_TYPES,
  DOMESTICS_SERVICE_CODES,
  EXIM_SERVICE_CODES,
  FLEET_TYPES,
  INCOTERMS,
  CARGO_CATEGORIES,
  UNITS_OF_MEASURE,
  ADDITIONAL_SERVICES,
  COUNTRIES,
} from '@/lib/constants'
import type { Database } from '@/types/database'
import type { TicketType, TicketPriority, TicketingDepartment } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']
type Account = Database['public']['Tables']['accounts']['Row']

interface CreateTicketFormProps {
  profile: Profile
}

interface ShipmentData {
  service_type_code: string
  fleet_type: string
  fleet_quantity: number
  incoterm: string
  cargo_category: string
  cargo_description: string
  origin_address: string
  origin_city: string
  origin_country: string
  destination_address: string
  destination_city: string
  destination_country: string
  quantity: number
  unit_of_measure: string
  weight_per_unit_kg: number | null
  weight_total_kg: number | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  volume_total_cbm: number | null
  scope_of_work: string
  additional_services: string[]
  estimated_leadtime: string
  estimated_cargo_value: number | null
  cargo_value_currency: string
}

interface FormData {
  ticket_type: TicketType
  subject: string
  description: string
  department: TicketingDepartment
  priority: TicketPriority
  account_id?: string
  sender_name?: string
  sender_email?: string
  sender_phone?: string
  show_sender_to_ops: boolean
}

interface Contact {
  contact_id: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  is_primary: boolean
}

// Department options for General Request
const departments: { value: TicketingDepartment; label: string }[] = [
  { value: 'MKT', label: 'Marketing' },
  { value: 'SAL', label: 'Sales' },
  { value: 'DOM', label: 'Domestics Operations' },
  { value: 'EXI', label: 'EXIM Operations' },
  { value: 'DTD', label: 'Import DTD Operations' },
  { value: 'TRF', label: 'Traffic & Warehouse' },
]

// Service Department to Ticketing Department mapping (for RFQ auto-mapping)
const serviceDepartmentToTicketingDept: Record<string, TicketingDepartment> = {
  'Domestics Operations': 'DOM',
  'Exim Operations': 'EXI',
  'Import DTD Operations': 'DTD',
}

export function CreateTicketForm({ profile }: CreateTicketFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [ticketType, setTicketType] = useState<TicketType>('GEN')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [showSenderToOps, setShowSenderToOps] = useState(true)
  const [loadingContacts, setLoadingContacts] = useState(false)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      ticket_type: 'GEN',
      priority: 'medium',
      department: (getUserTicketingDepartment(profile.role) as TicketingDepartment) || 'SAL',
      show_sender_to_ops: true,
    },
  })

  // Check if user is ops (hide account linking for ops users)
  const isOpsUser = isOps(profile.role)

  // Fetch contacts when account is selected
  const handleAccountSelect = async (accountId: string) => {
    setSelectedAccountId(accountId)
    setValue('account_id', accountId)

    if (!accountId) {
      setSenderName('')
      setSenderEmail('')
      setSenderPhone('')
      return
    }

    setLoadingContacts(true)
    try {
      // First try to fetch primary contact for the account
      const { data: contacts } = await (supabase as any)
        .from('contacts')
        .select('first_name, last_name, email, phone, mobile, is_primary')
        .eq('account_id', accountId)
        .order('is_primary', { ascending: false })
        .limit(1) as { data: Contact[] | null }

      if (contacts && contacts.length > 0) {
        const contact = contacts[0]
        const fullName = contact.last_name
          ? `${contact.first_name} ${contact.last_name}`
          : contact.first_name
        setSenderName(fullName)
        setSenderEmail(contact.email || '')
        setSenderPhone(contact.phone || contact.mobile || '')
      } else {
        // No contacts in contacts table, try to get PIC info from account directly
        const { data: account } = await (supabase as any)
          .from('accounts')
          .select('pic_name, pic_email, pic_phone')
          .eq('account_id', accountId)
          .single()

        if (account && (account.pic_name || account.pic_email || account.pic_phone)) {
          setSenderName(account.pic_name || '')
          setSenderEmail(account.pic_email || '')
          setSenderPhone(account.pic_phone || '')
        } else {
          // No contact info found at all
          setSenderName('')
          setSenderEmail('')
          setSenderPhone('')
          toast({
            title: 'No contact found',
            description: 'Account ini tidak punya contact tersimpan. Silakan isi manual.',
            variant: 'default',
          })
        }
      }
    } catch (err) {
      console.error('Error fetching contact:', err)
    } finally {
      setLoadingContacts(false)
    }
  }

  // Shipment data state (same as create lead)
  const [shipmentData, setShipmentData] = useState<ShipmentData>({
    service_type_code: '',
    fleet_type: '',
    fleet_quantity: 1,
    incoterm: '',
    cargo_category: 'General Cargo',
    cargo_description: '',
    origin_address: '',
    origin_city: '',
    origin_country: 'Indonesia',
    destination_address: '',
    destination_city: '',
    destination_country: 'Indonesia',
    quantity: 1,
    unit_of_measure: 'Boxes',
    weight_per_unit_kg: null,
    weight_total_kg: null,
    length_cm: null,
    width_cm: null,
    height_cm: null,
    volume_total_cbm: null,
    scope_of_work: '',
    additional_services: [],
    estimated_leadtime: '',
    estimated_cargo_value: null,
    cargo_value_currency: 'IDR',
  })

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Fetch accounts for dropdown
  useEffect(() => {
    const fetchAccounts = async () => {
      const { data } = await (supabase as any)
        .from('accounts')
        .select('account_id, company_name')
        .order('company_name')
        .limit(100)

      setAccounts(data || [])
    }
    fetchAccounts()
  }, [])

  // Check if selected service is domestics (shows fleet)
  const isDomesticsService = DOMESTICS_SERVICE_CODES.includes(
    shipmentData.service_type_code as any
  )

  // Check if selected service is export/import (shows incoterms)
  const isEximService = EXIM_SERVICE_CODES.includes(
    shipmentData.service_type_code as any
  )

  // Get department for selected service
  const selectedService = SERVICE_TYPES.find(
    (s) => s.code === shipmentData.service_type_code
  )

  // Auto-map department based on service type for RFQ tickets
  useEffect(() => {
    if (ticketType === 'RFQ' && selectedService?.department) {
      const mappedDept = serviceDepartmentToTicketingDept[selectedService.department]
      if (mappedDept) {
        setValue('department', mappedDept)
      }
    }
  }, [ticketType, selectedService, setValue])

  // Auto-calculate weight total
  useEffect(() => {
    if (shipmentData.quantity && shipmentData.weight_per_unit_kg) {
      const total = shipmentData.quantity * shipmentData.weight_per_unit_kg
      setShipmentData((prev) => ({ ...prev, weight_total_kg: total }))
    } else {
      setShipmentData((prev) => ({ ...prev, weight_total_kg: null }))
    }
  }, [shipmentData.quantity, shipmentData.weight_per_unit_kg])

  // Auto-calculate volume in CBM
  useEffect(() => {
    if (
      shipmentData.length_cm &&
      shipmentData.width_cm &&
      shipmentData.height_cm &&
      shipmentData.quantity
    ) {
      const volumeCbm =
        (shipmentData.length_cm *
          shipmentData.width_cm *
          shipmentData.height_cm *
          shipmentData.quantity) /
        1000000
      setShipmentData((prev) => ({
        ...prev,
        volume_total_cbm: Math.round(volumeCbm * 10000) / 10000,
      }))
    } else {
      setShipmentData((prev) => ({ ...prev, volume_total_cbm: null }))
    }
  }, [
    shipmentData.length_cm,
    shipmentData.width_cm,
    shipmentData.height_cm,
    shipmentData.quantity,
  ])

  // Handle additional service toggle
  const handleAdditionalServiceToggle = (serviceCode: string) => {
    setShipmentData((prev) => ({
      ...prev,
      additional_services: prev.additional_services.includes(serviceCode)
        ? prev.additional_services.filter((s) => s !== serviceCode)
        : [...prev.additional_services, serviceCode],
    }))
  }

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newFiles: File[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      // Max 10MB per file
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File terlalu besar',
          description: `${file.name} melebihi batas 10MB`,
          variant: 'destructive',
        })
        continue
      }
      newFiles.push(file)
    }

    setPendingFiles((prev) => [...prev, ...newFiles])
    e.target.value = '' // Reset input
  }

  // Remove pending file
  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Group services by department for the dropdown
  const domesticsServices = SERVICE_TYPES.filter(
    (s) => s.department === 'Domestics Operations'
  )
  const eximServices = SERVICE_TYPES.filter(
    (s) => s.department === 'Exim Operations'
  )
  const dtdServices = SERVICE_TYPES.filter(
    (s) => s.department === 'Import DTD Operations'
  )

  // Submit form
  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      // Build RFQ data if ticket type is RFQ
      let rfq_data = null
      let finalDepartment = data.department

      if (ticketType === 'RFQ') {
        // Validate service type is selected
        if (!shipmentData.service_type_code || !selectedService) {
          toast({
            title: 'Error',
            description: 'Pilih Service Type terlebih dahulu',
            variant: 'destructive',
          })
          setLoading(false)
          return
        }

        // Auto-determine department from service type
        const mappedDept = serviceDepartmentToTicketingDept[selectedService.department]
        if (mappedDept) {
          finalDepartment = mappedDept
        }

        rfq_data = {
          service_type_code: shipmentData.service_type_code,
          service_type: selectedService?.name || null,
          department: selectedService?.department || null,
          fleet_type: shipmentData.fleet_type || null,
          fleet_quantity: shipmentData.fleet_quantity || null,
          incoterm: shipmentData.incoterm || null,
          cargo_category: shipmentData.cargo_category,
          cargo_description: shipmentData.cargo_description,
          origin_address: shipmentData.origin_address,
          origin_city: shipmentData.origin_city,
          origin_country: shipmentData.origin_country,
          destination_address: shipmentData.destination_address,
          destination_city: shipmentData.destination_city,
          destination_country: shipmentData.destination_country,
          quantity: shipmentData.quantity,
          unit_of_measure: shipmentData.unit_of_measure,
          weight_per_unit_kg: shipmentData.weight_per_unit_kg,
          weight_total_kg: shipmentData.weight_total_kg,
          length_cm: shipmentData.length_cm,
          width_cm: shipmentData.width_cm,
          height_cm: shipmentData.height_cm,
          volume_total_cbm: shipmentData.volume_total_cbm,
          total_volume: shipmentData.volume_total_cbm,
          scope_of_work: shipmentData.scope_of_work,
          additional_services: shipmentData.additional_services,
          estimated_leadtime: shipmentData.estimated_leadtime || null,
          estimated_cargo_value: shipmentData.estimated_cargo_value,
          cargo_value_currency: shipmentData.cargo_value_currency,
        }
      }

      const response = await fetch('/api/ticketing/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_type: ticketType,
          subject: data.subject,
          description: data.description,
          department: finalDepartment,
          priority: data.priority,
          account_id: data.account_id || null,
          rfq_data,
          sender_name: senderName || null,
          sender_email: senderEmail || null,
          sender_phone: senderPhone || null,
          show_sender_to_ops: showSenderToOps,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create ticket')
      }

      // Upload pending files if any
      if (pendingFiles.length > 0 && result.ticket_id) {
        for (const file of pendingFiles) {
          const formData = new FormData()
          formData.append('file', file)

          await fetch(`/api/ticketing/tickets/${result.ticket_id}/attachments`, {
            method: 'POST',
            body: formData,
          })
        }
      }

      toast({
        title: 'Ticket created',
        description: `Ticket ${result.ticket_code} has been created successfully${pendingFiles.length > 0 ? ` with ${pendingFiles.length} attachment(s)` : ''}`,
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
            {/* Department - only show for General Request */}
            {ticketType === 'GEN' ? (
              <div className="space-y-2">
                <Label htmlFor="department">Department Tujuan *</Label>
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
            ) : (
              <div className="space-y-2">
                <Label>Department Tujuan</Label>
                <Input
                  value={selectedService?.department || 'Pilih Service Type di bawah'}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Auto dari Service Type yang dipilih
                </p>
              </div>
            )}
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

          {/* Account linking - hidden for Ops users */}
          {!isOpsUser && (
            <>
              <div className="space-y-2">
                <Label htmlFor="account_id">Link to Account (Optional)</Label>
                <Select
                  onValueChange={handleAccountSelect}
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

              {/* Sender Info - shows when account is selected */}
              {selectedAccountId && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Sender Information</h4>
                    {loadingContacts && (
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="sender_name">Name</Label>
                      <Input
                        id="sender_name"
                        name="sender_name"
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        placeholder="Contact name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sender_email">Email</Label>
                      <Input
                        id="sender_email"
                        name="sender_email"
                        type="email"
                        value={senderEmail}
                        onChange={(e) => setSenderEmail(e.target.value)}
                        placeholder="contact@company.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sender_phone">Phone</Label>
                      <Input
                        id="sender_phone"
                        name="sender_phone"
                        value={senderPhone}
                        onChange={(e) => setSenderPhone(e.target.value)}
                        placeholder="+62..."
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="space-y-0.5">
                      <Label htmlFor="show_sender_to_ops" className="text-sm font-medium">
                        Show Sender Info to Operations
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Jika dimatikan, Ops tidak bisa melihat nama, email, phone, dan account
                      </p>
                    </div>
                    <Switch
                      id="show_sender_to_ops"
                      checked={showSenderToOps}
                      onCheckedChange={setShowSenderToOps}
                    />
                  </div>
                </div>
              )}
            </>
          )}

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

          {/* Attachments */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Attachments (Optional)
            </Label>
            <div className="border-2 border-dashed rounded-lg p-4">
              <input
                type="file"
                id="file-upload"
                className="hidden"
                multiple
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.zip,.rar"
              />
              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center cursor-pointer py-4"
              >
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, DOC, XLS, Images (Max 10MB per file)
                </p>
              </label>
            </div>
            {pendingFiles.length > 0 && (
              <div className="space-y-2 mt-3">
                {pendingFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 border rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        ({formatFileSize(file.size)})
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePendingFile(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* RFQ Specific Fields - Same as Create Lead Shipment Details */}
      {ticketType === 'RFQ' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Shipment Details
            </CardTitle>
            <CardDescription>
              Provide details about the shipment for accurate quoting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Service Information */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Service Information</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="service_type">Service Type</Label>
                  <Select
                    value={shipmentData.service_type_code}
                    onValueChange={(value) =>
                      setShipmentData((prev) => ({
                        ...prev,
                        service_type_code: value,
                        fleet_type: '',
                        incoterm: '',
                      }))
                    }
                  >
                    <SelectTrigger id="service_type">
                      <SelectValue placeholder="Select service type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Domestics Operations</SelectLabel>
                        {domesticsServices.map((service) => (
                          <SelectItem key={service.code} value={service.code}>
                            {service.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Exim Operations</SelectLabel>
                        {eximServices.map((service) => (
                          <SelectItem key={service.code} value={service.code}>
                            {service.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Import DTD Operations</SelectLabel>
                        {dtdServices.map((service) => (
                          <SelectItem key={service.code} value={service.code}>
                            {service.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {selectedService && (
                    <p className="text-xs text-muted-foreground">
                      Department: {selectedService.department}
                    </p>
                  )}
                </div>

                {/* Fleet Type (only for Domestics) */}
                {isDomesticsService && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="fleet_type">Fleet Requirement</Label>
                      <Select
                        value={shipmentData.fleet_type}
                        onValueChange={(value) =>
                          setShipmentData((prev) => ({ ...prev, fleet_type: value }))
                        }
                      >
                        <SelectTrigger id="fleet_type">
                          <SelectValue placeholder="Select fleet type" />
                        </SelectTrigger>
                        <SelectContent>
                          {FLEET_TYPES.map((fleet) => (
                            <SelectItem key={fleet} value={fleet}>
                              {fleet}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fleet_quantity">Fleet Quantity</Label>
                      <Input
                        id="fleet_quantity"
                        type="number"
                        min="1"
                        value={shipmentData.fleet_quantity}
                        onChange={(e) =>
                          setShipmentData((prev) => ({
                            ...prev,
                            fleet_quantity: parseInt(e.target.value) || 1,
                          }))
                        }
                        placeholder="Enter quantity"
                      />
                    </div>
                  </>
                )}

                {/* Incoterms (only for Export/Import) */}
                {isEximService && (
                  <div className="space-y-2">
                    <Label htmlFor="incoterm">Incoterms</Label>
                    <Select
                      value={shipmentData.incoterm}
                      onValueChange={(value) =>
                        setShipmentData((prev) => ({ ...prev, incoterm: value }))
                      }
                    >
                      <SelectTrigger id="incoterm">
                        <SelectValue placeholder="Select incoterm" />
                      </SelectTrigger>
                      <SelectContent>
                        {INCOTERMS.map((term) => (
                          <SelectItem key={term.code} value={term.code}>
                            {term.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Cargo Information */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Cargo Information
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cargo_category">Cargo Category</Label>
                  <Select
                    value={shipmentData.cargo_category}
                    onValueChange={(value) =>
                      setShipmentData((prev) => ({
                        ...prev,
                        cargo_category: value,
                      }))
                    }
                  >
                    <SelectTrigger id="cargo_category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARGO_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cargo_description">Cargo Description</Label>
                  <Textarea
                    id="cargo_description"
                    value={shipmentData.cargo_description}
                    onChange={(e) =>
                      setShipmentData((prev) => ({
                        ...prev,
                        cargo_description: e.target.value,
                      }))
                    }
                    placeholder="Describe the cargo..."
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {/* Origin & Destination */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Origin & Destination
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Origin */}
                <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Origin
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="origin_address">Address</Label>
                    <Input
                      id="origin_address"
                      value={shipmentData.origin_address}
                      onChange={(e) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          origin_address: e.target.value,
                        }))
                      }
                      placeholder="Street address"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="origin_city">City</Label>
                    <Input
                      id="origin_city"
                      value={shipmentData.origin_city}
                      onChange={(e) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          origin_city: e.target.value,
                        }))
                      }
                      placeholder="City"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="origin_country">Country</Label>
                    <Select
                      value={shipmentData.origin_country}
                      onValueChange={(value) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          origin_country: value,
                        }))
                      }
                    >
                      <SelectTrigger id="origin_country">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((country) => (
                          <SelectItem key={country} value={country}>
                            {country}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Destination */}
                <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Destination
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="destination_address">Address</Label>
                    <Input
                      id="destination_address"
                      value={shipmentData.destination_address}
                      onChange={(e) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          destination_address: e.target.value,
                        }))
                      }
                      placeholder="Street address"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="destination_city">City</Label>
                    <Input
                      id="destination_city"
                      value={shipmentData.destination_city}
                      onChange={(e) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          destination_city: e.target.value,
                        }))
                      }
                      placeholder="City"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="destination_country">Country</Label>
                    <Select
                      value={shipmentData.destination_country}
                      onValueChange={(value) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          destination_country: value,
                        }))
                      }
                    >
                      <SelectTrigger id="destination_country">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((country) => (
                          <SelectItem key={country} value={country}>
                            {country}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* Quantity & Dimensions */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Quantity & Dimensions</h4>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity (Koli)</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={shipmentData.quantity}
                    onChange={(e) =>
                      setShipmentData((prev) => ({
                        ...prev,
                        quantity: parseInt(e.target.value) || 1,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit_of_measure">Unit of Measure</Label>
                  <Select
                    value={shipmentData.unit_of_measure}
                    onValueChange={(value) =>
                      setShipmentData((prev) => ({
                        ...prev,
                        unit_of_measure: value,
                      }))
                    }
                  >
                    <SelectTrigger id="unit_of_measure">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS_OF_MEASURE.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight_per_unit">Weight/Unit (Kg)</Label>
                  <Input
                    id="weight_per_unit"
                    type="number"
                    step="0.01"
                    min="0"
                    value={shipmentData.weight_per_unit_kg ?? ''}
                    onChange={(e) =>
                      setShipmentData((prev) => ({
                        ...prev,
                        weight_per_unit_kg: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      }))
                    }
                    placeholder="Gross weight"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="length_cm">Length (cm)</Label>
                  <Input
                    id="length_cm"
                    type="number"
                    step="0.01"
                    min="0"
                    value={shipmentData.length_cm ?? ''}
                    onChange={(e) =>
                      setShipmentData((prev) => ({
                        ...prev,
                        length_cm: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="width_cm">Width (cm)</Label>
                  <Input
                    id="width_cm"
                    type="number"
                    step="0.01"
                    min="0"
                    value={shipmentData.width_cm ?? ''}
                    onChange={(e) =>
                      setShipmentData((prev) => ({
                        ...prev,
                        width_cm: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height_cm">Height (cm)</Label>
                  <Input
                    id="height_cm"
                    type="number"
                    step="0.01"
                    min="0"
                    value={shipmentData.height_cm ?? ''}
                    onChange={(e) =>
                      setShipmentData((prev) => ({
                        ...prev,
                        height_cm: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Total Volume (CBM)</Label>
                  <Input
                    value={
                      shipmentData.volume_total_cbm !== null
                        ? shipmentData.volume_total_cbm.toFixed(4)
                        : '-'
                    }
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Total Weight (Kg)</Label>
                  <Input
                    value={
                      shipmentData.weight_total_kg !== null
                        ? shipmentData.weight_total_kg.toFixed(2)
                        : '-'
                    }
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-calculated: Quantity x Weight/Unit
                  </p>
                </div>
              </div>
            </div>

            {/* Estimated Leadtime & Cargo Value */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Leadtime & Cargo Value</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="estimated_leadtime">Estimated Leadtime</Label>
                  <Input
                    id="estimated_leadtime"
                    value={shipmentData.estimated_leadtime}
                    onChange={(e) =>
                      setShipmentData((prev) => ({
                        ...prev,
                        estimated_leadtime: e.target.value,
                      }))
                    }
                    placeholder="e.g., 3-5 hari, 1 minggu"
                  />
                  <p className="text-xs text-muted-foreground">
                    Estimasi waktu pengiriman
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estimated_cargo_value">Estimated Cargo Value</Label>
                  <div className="flex gap-2">
                    <Select
                      value={shipmentData.cargo_value_currency}
                      onValueChange={(value) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          cargo_value_currency: value,
                        }))
                      }
                    >
                      <SelectTrigger className="w-[100px]">
                        <SelectValue placeholder="Currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IDR">IDR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="SGD">SGD</SelectItem>
                        <SelectItem value="CNY">CNY</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      id="estimated_cargo_value"
                      type="number"
                      min="0"
                      step="1000"
                      className="flex-1"
                      value={shipmentData.estimated_cargo_value ?? ''}
                      onChange={(e) =>
                        setShipmentData((prev) => ({
                          ...prev,
                          estimated_cargo_value: e.target.value
                            ? parseFloat(e.target.value)
                            : null,
                        }))
                      }
                      placeholder="Estimated value"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Perkiraan nilai barang yang dikirim
                  </p>
                </div>
              </div>
            </div>

            {/* Scope of Work */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Scope of Work</h4>
              <Textarea
                id="scope_of_work"
                value={shipmentData.scope_of_work}
                onChange={(e) =>
                  setShipmentData((prev) => ({
                    ...prev,
                    scope_of_work: e.target.value,
                  }))
                }
                placeholder="Detail pekerjaan dan kebutuhan..."
                rows={3}
              />
            </div>

            {/* Additional Services */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Additional Services</h4>
              <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4">
                {ADDITIONAL_SERVICES.map((service) => (
                  <div
                    key={service.code}
                    className="flex items-center space-x-2"
                  >
                    <Checkbox
                      id={`service-${service.code}`}
                      checked={shipmentData.additional_services.includes(
                        service.code
                      )}
                      onCheckedChange={() =>
                        handleAdditionalServiceToggle(service.code)
                      }
                    />
                    <Label
                      htmlFor={`service-${service.code}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {service.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
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
