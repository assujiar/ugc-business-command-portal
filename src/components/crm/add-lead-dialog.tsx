// =====================================================
// Add Lead Dialog - Quick Add Lead Form
// SOURCE: PDF Section 7 - UI Components (AddLeadForm)
// =====================================================

'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LEAD_SOURCES, INDUSTRIES, PRIORITY_LEVELS } from '@/lib/constants'

interface AddLeadDialogProps {
  trigger?: React.ReactNode
}

export function AddLeadDialog({ trigger }: AddLeadDialogProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [formData, setFormData] = React.useState({
    company_name: '',
    pic_name: '',
    pic_email: '',
    pic_phone: '',
    industry: '',
    source: 'Manual' as string,
    source_detail: '',
    priority: 2,
    inquiry_text: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/crm/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          industry: formData.industry || null,
          source_detail: formData.source_detail || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create lead')
      }

      // Reset form and close dialog
      setFormData({
        company_name: '',
        pic_name: '',
        pic_email: '',
        pic_phone: '',
        industry: '',
        source: 'Manual',
        source_detail: '',
        priority: 2,
        inquiry_text: '',
      })
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
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
            Add Lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Lead</DialogTitle>
          <DialogDescription>
            Create a new lead for marketing triage. The lead will appear in the Lead Inbox.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company Information */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Company Information</h4>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company_name">
                  Company Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="company_name"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  placeholder="PT. Example Indonesia"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Select
                  value={formData.industry}
                  onValueChange={(value) => setFormData({ ...formData, industry: value })}
                >
                  <SelectTrigger id="industry">
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((industry) => (
                      <SelectItem key={industry} value={industry}>
                        {industry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Contact Person */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Contact Person (PIC)</h4>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pic_name">Name</Label>
                <Input
                  id="pic_name"
                  value={formData.pic_name}
                  onChange={(e) => setFormData({ ...formData, pic_name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pic_phone">Phone</Label>
                <Input
                  id="pic_phone"
                  type="tel"
                  value={formData.pic_phone}
                  onChange={(e) => setFormData({ ...formData, pic_phone: e.target.value })}
                  placeholder="+62 812 3456 7890"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pic_email">Email</Label>
                <Input
                  id="pic_email"
                  type="email"
                  value={formData.pic_email}
                  onChange={(e) => setFormData({ ...formData, pic_email: e.target.value })}
                  placeholder="john.doe@example.com"
                />
              </div>
            </div>
          </div>

          {/* Lead Details */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Lead Details</h4>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="source">
                  Source <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.source}
                  onValueChange={(value) => setFormData({ ...formData, source: value })}
                >
                  <SelectTrigger id="source">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="source_detail">Source Detail</Label>
                <Input
                  id="source_detail"
                  value={formData.source_detail}
                  onChange={(e) => setFormData({ ...formData, source_detail: e.target.value })}
                  placeholder="e.g., Trade Show 2024"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority.toString()}
                  onValueChange={(value) => setFormData({ ...formData, priority: parseInt(value) })}
                >
                  <SelectTrigger id="priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value.toString()}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inquiry_text">Inquiry / Notes</Label>
              <Textarea
                id="inquiry_text"
                value={formData.inquiry_text}
                onChange={(e) => setFormData({ ...formData, inquiry_text: e.target.value })}
                placeholder="Describe the lead's inquiry or any relevant notes..."
                rows={3}
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
