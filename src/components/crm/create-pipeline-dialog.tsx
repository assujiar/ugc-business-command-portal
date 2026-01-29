// =====================================================
// Create Pipeline Dialog
// Create new opportunity/pipeline from existing account
// =====================================================

'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, ChevronDown, ChevronUp, Building2, User, Mail, Phone, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  SERVICE_TYPES,
  ACCOUNT_STATUSES,
} from '@/lib/constants'
import { toast } from '@/hooks/use-toast'
import type { AccountStatus } from '@/types/database'
import { MultiShipmentForm } from '@/components/shared/multi-shipment-form'
import { ShipmentDetail, createEmptyShipment } from '@/types/shipment'
import { FormSection } from '@/components/ui/form-section'

interface Account {
  account_id: string
  company_name: string
  pic_name: string | null
  pic_email: string | null
  pic_phone: string | null
  industry: string | null
  account_status: AccountStatus | null
  owner_user_id: string | null
}

interface CreatePipelineDialogProps {
  trigger?: React.ReactNode
}

export function CreatePipelineDialog({ trigger }: CreatePipelineDialogProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [loadingAccounts, setLoadingAccounts] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [showShipmentDetails, setShowShipmentDetails] = React.useState(false)
  const [accounts, setAccounts] = React.useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = React.useState<Account | null>(null)

  const [formData, setFormData] = React.useState({
    account_id: '',
    name: '',
    estimated_value: '',
    notes: '',
  })

  // Multi-shipment support
  const [shipments, setShipments] = React.useState<ShipmentDetail[]>([])

  // Fetch accounts when dialog opens
  React.useEffect(() => {
    if (open) {
      fetchAccounts()
    }
  }, [open])

  const fetchAccounts = async () => {
    setLoadingAccounts(true)
    try {
      const response = await fetch('/api/crm/accounts/my-accounts')
      const result = await response.json()
      if (result.data) {
        setAccounts(result.data)
      }
    } catch (error) {
      console.error('Error fetching accounts:', error)
    } finally {
      setLoadingAccounts(false)
    }
  }

  const handleAccountSelect = (accountId: string) => {
    const account = accounts.find((a) => a.account_id === accountId)
    setSelectedAccount(account || null)
    setFormData((prev) => ({
      ...prev,
      account_id: accountId,
      name: account ? `Pipeline - ${account.company_name}` : '',
    }))
  }

  const getAccountStatusBadge = (status: AccountStatus | null) => {
    const statusConfig = ACCOUNT_STATUSES.find((s) => s.value === status)
    if (!statusConfig) return null

    const colorMap: Record<AccountStatus, string> = {
      calon_account: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      new_account: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      failed_account: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      active_account: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
      passive_account: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      lost_account: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    }

    return (
      <Badge className={colorMap[status!] || ''}>
        {statusConfig.label}
      </Badge>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Prepare shipments with department info
      const shipmentsWithDept = showShipmentDetails && shipments.length > 0
        ? shipments.map(s => {
            const service = SERVICE_TYPES.find(st => st.code === s.service_type_code)
            return {
              ...s,
              department: service?.department || null,
            }
          })
        : null

      const submitData = {
        account_id: formData.account_id,
        name: formData.name,
        estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : 0,
        notes: formData.notes || null,
        shipment_details: shipmentsWithDept, // Array of shipments
      }

      const response = await fetch('/api/crm/opportunities/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create pipeline')
      }

      toast.success(
        'Pipeline berhasil dibuat',
        `${formData.name} telah ditambahkan ke Pipeline`
      )

      // Reset form
      setFormData({
        account_id: '',
        name: '',
        estimated_value: '',
        notes: '',
      })
      setShipments([])
      setSelectedAccount(null)
      setShowShipmentDetails(false)
      setOpen(false)
      router.refresh()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      toast.error('Gagal membuat pipeline', errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Pipeline
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[800px] max-h-[90vh] overflow-y-auto p-4 lg:p-6">
        <DialogHeader>
          <DialogTitle className="text-base lg:text-lg">Create New Pipeline</DialogTitle>
          <DialogDescription className="text-xs lg:text-sm">
            Create a new pipeline/opportunity from an existing account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account Selection */}
          <FormSection variant="company" title="Select Account" glass>
            <div className="space-y-2">
              <Label htmlFor="account">
                Account <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.account_id}
                onValueChange={handleAccountSelect}
                disabled={loadingAccounts}
              >
                <SelectTrigger id="account">
                  <SelectValue placeholder={loadingAccounts ? 'Loading accounts...' : 'Select account'} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.length === 0 ? (
                    <SelectItem value="no-accounts" disabled>
                      No accounts found
                    </SelectItem>
                  ) : (
                    accounts.map((account) => (
                      <SelectItem key={account.account_id} value={account.account_id}>
                        <div className="flex items-center gap-2">
                          <span>{account.company_name}</span>
                          {account.account_status && (
                            <span className="text-xs text-muted-foreground">
                              ({ACCOUNT_STATUSES.find(s => s.value === account.account_status)?.label})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Account Details */}
            {selectedAccount && (
              <div className="p-4 border rounded-lg bg-indigo-500/5 space-y-3 animate-fade-in border-indigo-500/20">
                <div className="flex items-center justify-between">
                  <h5 className="font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-indigo-500" />
                    {selectedAccount.company_name}
                  </h5>
                  {getAccountStatusBadge(selectedAccount.account_status)}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  {selectedAccount.pic_name && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span>{selectedAccount.pic_name}</span>
                    </div>
                  )}
                  {selectedAccount.pic_email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span>{selectedAccount.pic_email}</span>
                    </div>
                  )}
                  {selectedAccount.pic_phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span>{selectedAccount.pic_phone}</span>
                    </div>
                  )}
                  {selectedAccount.industry && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Briefcase className="h-4 w-4" />
                      <span>{selectedAccount.industry}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </FormSection>

          {/* Pipeline Details */}
          <FormSection variant="lead" title="Pipeline Details" glass>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Pipeline Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Pipeline - Company Name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="estimated_value">Estimated Value (IDR)</Label>
                <Input
                  id="estimated_value"
                  type="number"
                  min="0"
                  value={formData.estimated_value}
                  onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={2}
                />
              </div>
            </div>
          </FormSection>

          {/* Shipment Details Toggle */}
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!showShipmentDetails && shipments.length === 0) {
                  // Add first empty shipment when opening
                  setShipments([createEmptyShipment(1)])
                }
                setShowShipmentDetails(!showShipmentDetails)
              }}
              className="w-full justify-between"
            >
              <span className="flex items-center">
                <Plus className="h-4 w-4 mr-2" />
                Shipment Details {shipments.length > 0 && `(${shipments.length})`}
              </span>
              {showShipmentDetails ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Multi-Shipment Form Section */}
          {showShipmentDetails && (
            <div className="animate-slide-in-up">
              <MultiShipmentForm
                shipments={shipments}
                onChange={setShipments}
                maxShipments={10}
              />
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.account_id || !formData.name}
              className="w-full sm:w-auto"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Pipeline
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
