'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { useForm } from 'react-hook-form'
import {
  FileText,
  Ticket,
  Building2,
  RefreshCw,
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
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { getUserTicketingDepartment, isOps } from '@/lib/permissions'
import {
  SERVICE_TYPES,
} from '@/lib/constants'
import type { Database } from '@/types/database'
import type { TicketType, TicketPriority, TicketingDepartment } from '@/types/database'
import { MultiShipmentForm } from '@/components/shared/multi-shipment-form'
import { ShipmentDetail, createEmptyShipment } from '@/types/shipment'

type Profile = Database['public']['Tables']['profiles']['Row']
type Account = Database['public']['Tables']['accounts']['Row']

interface CreateTicketFormProps {
  profile: Profile
}

// Debounce helper for search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

// ShipmentData interface removed - using ShipmentDetail from @/types/shipment

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
  'Domestics Ops Dept': 'DOM',
  'Exim Ops Dept': 'EXI',
  'Import DTD Ops Dept': 'DTD',
}

export function CreateTicketForm({ profile }: CreateTicketFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [ticketType, setTicketType] = useState<TicketType>('GEN')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null) // Track selected account separately
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [showSenderToOps, setShowSenderToOps] = useState(true)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [accountSearchQuery, setAccountSearchQuery] = useState('')
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [accountOffset, setAccountOffset] = useState(0)
  const [hasMoreAccounts, setHasMoreAccounts] = useState(false)
  const [loadingMoreAccounts, setLoadingMoreAccounts] = useState(false)
  const debouncedAccountSearch = useDebounce(accountSearchQuery, 300)
  const ACCOUNTS_PAGE_SIZE = 50

  // Source references from URL params (for linking ticket to lead/opportunity)
  const [opportunityId, setOpportunityId] = useState<string | null>(null)
  const [leadId, setLeadId] = useState<string | null>(null)

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

  // Shipments state (multi-shipment support)
  const [shipments, setShipments] = useState<ShipmentDetail[]>([createEmptyShipment(1)])

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Store URL params for later use (after accounts are loaded)
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null)

  // Read URL params for lead/opportunity/account linking
  useEffect(() => {
    const oppId = searchParams.get('opportunity_id')
    const lId = searchParams.get('lead_id')
    const accId = searchParams.get('account_id')
    const contactName = searchParams.get('contact_name')
    const contactEmail = searchParams.get('contact_email')
    const contactPhone = searchParams.get('contact_phone')

    if (oppId) setOpportunityId(oppId)
    if (lId) setLeadId(lId)

    // Store account_id for later - will be applied after accounts are loaded
    if (accId) {
      setPendingAccountId(accId)
    }

    // Pre-fill sender info from URL params
    if (contactName) setSenderName(contactName)
    if (contactEmail) setSenderEmail(contactEmail)
    if (contactPhone) setSenderPhone(contactPhone)
  }, [searchParams])

  // Reset pagination when search query changes
  useEffect(() => {
    setAccountOffset(0)
    setHasMoreAccounts(false)
  }, [debouncedAccountSearch])

  // Fetch accounts for dropdown with server-side search and pagination
  useEffect(() => {
    const fetchAccounts = async () => {
      setLoadingAccounts(true)
      try {
        let query = (supabase as any)
          .from('accounts')
          .select('account_id, company_name', { count: 'exact' })
          .order('company_name')

        // If search query provided, filter by company_name
        if (debouncedAccountSearch.trim()) {
          query = query.ilike('company_name', `%${debouncedAccountSearch.trim()}%`)
        }

        // Fetch one extra to determine if there are more
        query = query.range(0, ACCOUNTS_PAGE_SIZE - 1)

        const { data, count } = await query
        setAccounts(data || [])
        setHasMoreAccounts(count ? count > ACCOUNTS_PAGE_SIZE : false)
        setAccountOffset(ACCOUNTS_PAGE_SIZE)
      } finally {
        setLoadingAccounts(false)
      }
    }
    fetchAccounts()
  }, [debouncedAccountSearch])

  // Load more accounts (pagination)
  const loadMoreAccounts = async () => {
    if (loadingMoreAccounts || !hasMoreAccounts) return

    setLoadingMoreAccounts(true)
    try {
      let query = (supabase as any)
        .from('accounts')
        .select('account_id, company_name', { count: 'exact' })
        .order('company_name')

      // If search query provided, filter by company_name
      if (debouncedAccountSearch.trim()) {
        query = query.ilike('company_name', `%${debouncedAccountSearch.trim()}%`)
      }

      // Fetch next page
      query = query.range(accountOffset, accountOffset + ACCOUNTS_PAGE_SIZE - 1)

      const { data, count } = await query
      if (data && data.length > 0) {
        // Append to existing accounts, avoiding duplicates
        setAccounts(prev => {
          const existingIds = new Set(prev.map(a => a.account_id))
          const newAccounts = data.filter((a: Account) => !existingIds.has(a.account_id))
          return [...prev, ...newAccounts]
        })
        const newOffset = accountOffset + data.length
        setAccountOffset(newOffset)
        setHasMoreAccounts(count ? count > newOffset : false)
      } else {
        setHasMoreAccounts(false)
      }
    } finally {
      setLoadingMoreAccounts(false)
    }
  }

  // Apply pending account_id - fetch account by ID if not in list (prefill fix)
  useEffect(() => {
    const applyPendingAccount = async () => {
      if (!pendingAccountId) return

      // First check if account is already in the list
      const existingAccount = accounts.find(acc => acc.account_id === pendingAccountId)
      if (existingAccount) {
        setSelectedAccountId(pendingAccountId)
        setSelectedAccount(existingAccount)
        setValue('account_id', pendingAccountId)
        handleAccountSelect(pendingAccountId)
        setPendingAccountId(null)
        return
      }

      // If not in list, fetch the specific account by ID (critical for prefill)
      try {
        const { data: account } = await (supabase as any)
          .from('accounts')
          .select('account_id, company_name')
          .eq('account_id', pendingAccountId)
          .single()

        if (account) {
          // Store the selected account separately so it always displays
          setSelectedAccount(account)
          setSelectedAccountId(pendingAccountId)
          setValue('account_id', pendingAccountId)
          handleAccountSelect(pendingAccountId)
        }
      } catch (err) {
        console.error('Error fetching pending account:', err)
      }
      setPendingAccountId(null)
    }

    applyPendingAccount()
  }, [pendingAccountId, accounts, setValue])

  // Resolve account_id from opportunity_id if not directly provided
  useEffect(() => {
    const resolveAccountFromOpportunity = async () => {
      // Only run if we have opportunity_id but no pending account_id
      const accId = searchParams.get('account_id')
      const oppId = searchParams.get('opportunity_id')

      if (oppId && !accId && !selectedAccountId) {
        try {
          const { data: opportunity } = await (supabase as any)
            .from('opportunities')
            .select('account_id')
            .eq('opportunity_id', oppId)
            .single()

          if (opportunity?.account_id) {
            setPendingAccountId(opportunity.account_id)
          }
        } catch (err) {
          console.error('Error resolving account from opportunity:', err)
        }
      }
    }

    resolveAccountFromOpportunity()
  }, [searchParams, selectedAccountId])

  // Check sessionStorage for prefilled shipment data from lead/pipeline
  // Supports both single shipment (prefill_ticket_shipment) and multi-shipment (prefill_ticket_shipments)
  useEffect(() => {
    // First try multi-shipment data
    const multiShipmentData = sessionStorage.getItem('prefill_ticket_shipments')
    const singleShipmentData = sessionStorage.getItem('prefill_ticket_shipment')

    let loadedShipments: ShipmentDetail[] = []

    if (multiShipmentData) {
      try {
        const parsed = JSON.parse(multiShipmentData)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Map to ShipmentDetail format with proper order
          loadedShipments = parsed.map((s: any, i: number) => ({
            shipment_detail_id: s.shipment_detail_id,
            shipment_order: s.shipment_order || i + 1,
            shipment_label: s.shipment_label || `Shipment ${i + 1}`,
            service_type_code: s.service_type_code || '',
            department: s.department || null,
            fleet_type: s.fleet_type || null,
            fleet_quantity: s.fleet_quantity || 1,
            incoterm: s.incoterm || null,
            cargo_category: s.cargo_category || 'General Cargo',
            cargo_description: s.cargo_description || '',
            origin_address: s.origin_address || '',
            origin_city: s.origin_city || '',
            origin_country: s.origin_country || 'Indonesia',
            destination_address: s.destination_address || '',
            destination_city: s.destination_city || '',
            destination_country: s.destination_country || 'Indonesia',
            quantity: s.quantity || 1,
            unit_of_measure: s.unit_of_measure || 'Boxes',
            weight_per_unit_kg: s.weight_per_unit_kg || null,
            weight_total_kg: s.weight_total_kg || null,
            length_cm: s.length_cm || null,
            width_cm: s.width_cm || null,
            height_cm: s.height_cm || null,
            volume_total_cbm: s.volume_total_cbm || null,
            scope_of_work: s.scope_of_work || '',
            additional_services: s.additional_services || [],
          }))
          console.log('[CreateTicket] Loaded', loadedShipments.length, 'shipments from sessionStorage')
        }
        sessionStorage.removeItem('prefill_ticket_shipments')
      } catch (err) {
        console.error('Error parsing multi-shipment data:', err)
      }
    }

    if (loadedShipments.length === 0 && singleShipmentData) {
      try {
        const s = JSON.parse(singleShipmentData)
        loadedShipments = [{
          shipment_detail_id: s.shipment_detail_id,
          shipment_order: 1,
          shipment_label: s.shipment_label || 'Shipment 1',
          service_type_code: s.service_type_code || '',
          department: s.department || null,
          fleet_type: s.fleet_type || null,
          fleet_quantity: s.fleet_quantity || 1,
          incoterm: s.incoterm || null,
          cargo_category: s.cargo_category || 'General Cargo',
          cargo_description: s.cargo_description || '',
          origin_address: s.origin_address || '',
          origin_city: s.origin_city || '',
          origin_country: s.origin_country || 'Indonesia',
          destination_address: s.destination_address || '',
          destination_city: s.destination_city || '',
          destination_country: s.destination_country || 'Indonesia',
          quantity: s.quantity || 1,
          unit_of_measure: s.unit_of_measure || 'Boxes',
          weight_per_unit_kg: s.weight_per_unit_kg || null,
          weight_total_kg: s.weight_total_kg || null,
          length_cm: s.length_cm || null,
          width_cm: s.width_cm || null,
          height_cm: s.height_cm || null,
          volume_total_cbm: s.volume_total_cbm || null,
          scope_of_work: s.scope_of_work || '',
          additional_services: s.additional_services || [],
        }]
        sessionStorage.removeItem('prefill_ticket_shipment')
      } catch (err) {
        console.error('Error parsing single shipment data:', err)
      }
    }

    if (loadedShipments.length > 0) {
      setShipments(loadedShipments)
      // Auto-switch to RFQ type if shipment data is present with service_type_code
      if (loadedShipments[0].service_type_code) {
        setTicketType('RFQ')
        setValue('ticket_type', 'RFQ')
      }
    }
  }, [])

  // Get first shipment for service type checks and department auto-mapping
  const firstShipment = shipments[0]

  // Get department for selected service (using first shipment)
  const selectedService = firstShipment?.service_type_code
    ? SERVICE_TYPES.find((s) => s.code === firstShipment.service_type_code)
    : null

  // Auto-map department based on service type for RFQ tickets
  useEffect(() => {
    if (ticketType === 'RFQ' && selectedService?.department) {
      const mappedDept = serviceDepartmentToTicketingDept[selectedService.department]
      if (mappedDept) {
        setValue('department', mappedDept)
      }
    }
  }, [ticketType, selectedService, setValue])

  // Note: Auto-calculation for weight/volume is now handled by MultiShipmentForm component

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

  // Submit form
  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      // Build RFQ data if ticket type is RFQ
      let rfq_data = null
      let shipments_data: ShipmentDetail[] | null = null
      let finalDepartment = data.department

      if (ticketType === 'RFQ') {
        // Validate at least one shipment has service type selected
        const validShipments = shipments.filter(s => s.service_type_code)
        if (validShipments.length === 0) {
          toast({
            title: 'Error',
            description: 'Pilih Service Type untuk minimal satu shipment',
            variant: 'destructive',
          })
          setLoading(false)
          return
        }

        // Auto-determine department from first shipment's service type
        if (selectedService?.department) {
          const mappedDept = serviceDepartmentToTicketingDept[selectedService.department]
          if (mappedDept) {
            finalDepartment = mappedDept
          }
        }

        // Use first shipment for legacy rfq_data format (backward compatibility)
        const firstShip = shipments[0]
        const firstService = SERVICE_TYPES.find(s => s.code === firstShip.service_type_code)

        rfq_data = {
          service_type_code: firstShip.service_type_code || '',
          service_type: firstService ? `${firstService.scope} | ${firstService.name}` : null,
          service_scope: firstService?.scope || null,
          service_name: firstService?.name || null,
          department: firstService?.department || null,
          fleet_type: firstShip.fleet_type || null,
          fleet_quantity: firstShip.fleet_quantity || null,
          incoterm: firstShip.incoterm || null,
          cargo_category: firstShip.cargo_category || 'General Cargo',
          cargo_description: firstShip.cargo_description || '',
          origin_address: firstShip.origin_address || '',
          origin_city: firstShip.origin_city || '',
          origin_country: firstShip.origin_country || 'Indonesia',
          destination_address: firstShip.destination_address || '',
          destination_city: firstShip.destination_city || '',
          destination_country: firstShip.destination_country || 'Indonesia',
          quantity: firstShip.quantity || 1,
          unit_of_measure: firstShip.unit_of_measure || 'Boxes',
          weight_per_unit_kg: firstShip.weight_per_unit_kg || null,
          weight_total_kg: firstShip.weight_total_kg || null,
          length_cm: firstShip.length_cm || null,
          width_cm: firstShip.width_cm || null,
          height_cm: firstShip.height_cm || null,
          volume_total_cbm: firstShip.volume_total_cbm || null,
          total_volume: firstShip.volume_total_cbm || null,
          scope_of_work: firstShip.scope_of_work || '',
          additional_services: firstShip.additional_services || [],
        }

        // Include all shipments data for multi-shipment support
        shipments_data = shipments
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
          shipments: shipments_data, // All shipments for multi-shipment support
          sender_name: senderName || null,
          sender_email: senderEmail || null,
          sender_phone: senderPhone || null,
          show_sender_to_ops: showSenderToOps,
          // Link to lead/opportunity if created from CRM
          lead_id: leadId || null,
          opportunity_id: opportunityId || null,
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
                  value={selectedAccountId || undefined}
                  onValueChange={(value) => {
                    const account = accounts.find(a => a.account_id === value)
                    if (account) {
                      setSelectedAccount(account)
                    }
                    handleAccountSelect(value)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account">
                      {selectedAccount ? (
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {selectedAccount.company_name}
                        </div>
                      ) : (
                        'Select account'
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Search input inside dropdown */}
                    <div className="p-2 border-b">
                      <Input
                        placeholder="Search accounts..."
                        value={accountSearchQuery}
                        onChange={(e) => setAccountSearchQuery(e.target.value)}
                        className="h-8"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    {loadingAccounts ? (
                      <div className="py-4 text-center text-sm text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin inline mr-2" />
                        Loading...
                      </div>
                    ) : accounts.length === 0 ? (
                      <div className="py-4 text-center text-sm text-muted-foreground">
                        {accountSearchQuery ? 'No accounts found' : 'Type to search accounts'}
                      </div>
                    ) : (
                      <>
                        {accounts.map((account) => (
                          <SelectItem key={account.account_id} value={account.account_id}>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              {account.company_name}
                            </div>
                          </SelectItem>
                        ))}
                        {hasMoreAccounts && (
                          <div className="p-2 border-t">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="w-full"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                loadMoreAccounts()
                              }}
                              disabled={loadingMoreAccounts}
                            >
                              {loadingMoreAccounts ? (
                                <>
                                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                                  Loading...
                                </>
                              ) : (
                                'Load more accounts'
                              )}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Type to search all accessible accounts
                </p>
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

      {/* RFQ Shipment Details - Using MultiShipmentForm for full editing of all shipments */}
      {ticketType === 'RFQ' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Shipment Details
              {shipments.length > 1 && (
                <Badge variant="secondary" className="ml-auto">
                  {shipments.length} shipments
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Provide details about the shipment(s) for accurate quoting. You can add multiple shipments.
              {selectedService && (
                <span className="block mt-1 text-xs">
                  Department: <strong>{selectedService.department}</strong> (auto-determined from first shipment)
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MultiShipmentForm
              shipments={shipments}
              onChange={setShipments}
              maxShipments={10}
            />
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
