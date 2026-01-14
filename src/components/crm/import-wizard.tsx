// =====================================================
// Import Wizard - CSV Import with Drag-Drop
// SOURCE: PDF Section 7 - UI Components (ImportTargetsWizard)
// =====================================================

'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload,
  FileSpreadsheet,
  Check,
  X,
  Loader2,
  AlertCircle,
  ChevronRight,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type EntityType = 'leads' | 'accounts' | 'contacts'

interface ImportWizardProps {
  entityType?: EntityType
  onComplete?: () => void
}

interface ParsedData {
  headers: string[]
  rows: string[][]
}

interface ColumnMapping {
  csvColumn: string
  dbField: string | null
}

// Field definitions for each entity type
const ENTITY_FIELDS: Record<EntityType, { field: string; label: string; required: boolean }[]> = {
  leads: [
    { field: 'company_name', label: 'Company Name', required: true },
    { field: 'pic_name', label: 'PIC Name', required: false },
    { field: 'pic_email', label: 'PIC Email', required: false },
    { field: 'pic_phone', label: 'PIC Phone', required: false },
    { field: 'industry', label: 'Industry', required: false },
    { field: 'source', label: 'Source', required: false },
    { field: 'source_detail', label: 'Source Detail', required: false },
    { field: 'priority', label: 'Priority (1-4)', required: false },
    { field: 'inquiry_text', label: 'Inquiry / Notes', required: false },
  ],
  accounts: [
    { field: 'company_name', label: 'Company Name', required: true },
    { field: 'pic_name', label: 'PIC Name', required: false },
    { field: 'pic_email', label: 'PIC Email', required: false },
    { field: 'pic_phone', label: 'PIC Phone', required: false },
    { field: 'industry', label: 'Industry', required: false },
    { field: 'address', label: 'Address', required: false },
    { field: 'city', label: 'City', required: false },
    { field: 'province', label: 'Province', required: false },
    { field: 'website', label: 'Website', required: false },
  ],
  contacts: [
    { field: 'first_name', label: 'First Name', required: true },
    { field: 'last_name', label: 'Last Name', required: false },
    { field: 'email', label: 'Email', required: false },
    { field: 'phone', label: 'Phone', required: false },
    { field: 'job_title', label: 'Job Title', required: false },
    { field: 'department', label: 'Department', required: false },
  ],
}

const STEPS = [
  { id: 1, name: 'Upload', description: 'Upload CSV file' },
  { id: 2, name: 'Map', description: 'Map columns' },
  { id: 3, name: 'Preview', description: 'Review data' },
  { id: 4, name: 'Import', description: 'Import progress' },
]

export function ImportWizard({ entityType: initialEntityType, onComplete }: ImportWizardProps) {
  const router = useRouter()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const [step, setStep] = React.useState(1)
  const [entityType, setEntityType] = React.useState<EntityType>(initialEntityType || 'leads')
  const [file, setFile] = React.useState<File | null>(null)
  const [parsedData, setParsedData] = React.useState<ParsedData | null>(null)
  const [columnMappings, setColumnMappings] = React.useState<ColumnMapping[]>([])
  const [isDragging, setIsDragging] = React.useState(false)
  const [parseError, setParseError] = React.useState<string | null>(null)
  const [importing, setImporting] = React.useState(false)
  const [importResult, setImportResult] = React.useState<{
    success: number
    errors: number
    total: number
    errorDetails?: string[]
  } | null>(null)

  // Parse CSV file
  const parseCSV = (text: string): ParsedData => {
    const lines = text.split(/\r?\n/).filter(line => line.trim())
    if (lines.length === 0) {
      throw new Error('File is empty')
    }

    // Simple CSV parser (handles quoted values)
    const parseLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]

        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())

      return result
    }

    const headers = parseLine(lines[0])
    const rows = lines.slice(1).map(parseLine)

    return { headers, rows }
  }

  // Handle file selection
  const handleFile = async (selectedFile: File) => {
    setFile(selectedFile)
    setParseError(null)

    try {
      const text = await selectedFile.text()
      const data = parseCSV(text)
      setParsedData(data)

      // Auto-map columns based on header names
      const fields = ENTITY_FIELDS[entityType]
      const mappings: ColumnMapping[] = data.headers.map((header) => {
        const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const matchedField = fields.find((f) => {
          const normalizedField = f.field.toLowerCase()
          const normalizedLabel = f.label.toLowerCase().replace(/[^a-z0-9]/g, '_')
          return (
            normalizedField === normalizedHeader ||
            normalizedLabel === normalizedHeader ||
            normalizedHeader.includes(normalizedField) ||
            normalizedField.includes(normalizedHeader)
          )
        })
        return {
          csvColumn: header,
          dbField: matchedField?.field || null,
        }
      })
      setColumnMappings(mappings)
      setStep(2)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file')
    }
  }

  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && droppedFile.type === 'text/csv') {
      handleFile(droppedFile)
    } else {
      setParseError('Please upload a CSV file')
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFile(selectedFile)
    }
  }

  // Update column mapping
  const updateMapping = (csvColumn: string, dbField: string | null) => {
    setColumnMappings((prev) =>
      prev.map((m) =>
        m.csvColumn === csvColumn ? { ...m, dbField } : m
      )
    )
  }

  // Check if required fields are mapped
  const requiredFields = ENTITY_FIELDS[entityType].filter((f) => f.required)
  const mappedRequiredFields = requiredFields.filter((rf) =>
    columnMappings.some((m) => m.dbField === rf.field)
  )
  const canProceedToPreview = mappedRequiredFields.length === requiredFields.length

  // Transform data based on mappings
  const transformedData = React.useMemo(() => {
    if (!parsedData) return []

    return parsedData.rows.map((row) => {
      const obj: Record<string, string> = {}
      columnMappings.forEach((mapping, index) => {
        if (mapping.dbField) {
          obj[mapping.dbField] = row[index] || ''
        }
      })
      return obj
    })
  }, [parsedData, columnMappings])

  // Handle import
  const handleImport = async () => {
    setImporting(true)
    setImportResult(null)

    try {
      const response = await fetch('/api/crm/imports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entityType,
          data: transformedData,
          fileName: file?.name,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Import failed')
      }

      setImportResult(result)
      setStep(4)
      router.refresh()
    } catch (err) {
      setImportResult({
        success: 0,
        errors: transformedData.length,
        total: transformedData.length,
        errorDetails: [err instanceof Error ? err.message : 'Unknown error'],
      })
      setStep(4)
    } finally {
      setImporting(false)
    }
  }

  // Download template
  const downloadTemplate = () => {
    const fields = ENTITY_FIELDS[entityType]
    const headers = fields.map((f) => f.label).join(',')
    const exampleRow = fields.map((f) => {
      if (f.field === 'company_name') return 'PT Example'
      if (f.field === 'first_name') return 'John'
      if (f.field === 'pic_name') return 'Jane Doe'
      if (f.field === 'pic_email' || f.field === 'email') return 'example@email.com'
      if (f.field === 'pic_phone' || f.field === 'phone') return '+62 812 3456 7890'
      if (f.field === 'priority') return '2'
      return ''
    }).join(',')

    const csv = `${headers}\n${exampleRow}`
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${entityType}_import_template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Reset wizard
  const resetWizard = () => {
    setStep(1)
    setFile(null)
    setParsedData(null)
    setColumnMappings([])
    setParseError(null)
    setImporting(false)
    setImportResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      {/* Steps indicator */}
      <nav aria-label="Progress">
        <ol className="flex items-center">
          {STEPS.map((s, index) => (
            <li key={s.id} className={cn('relative', index !== STEPS.length - 1 && 'pr-8 sm:pr-20 flex-1')}>
              <div className="flex items-center">
                <div
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium',
                    step > s.id
                      ? 'bg-primary text-primary-foreground'
                      : step === s.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {step > s.id ? <Check className="h-4 w-4" /> : s.id}
                </div>
                <span className="ml-2 text-sm font-medium hidden sm:block">{s.name}</span>
                {index !== STEPS.length - 1 && (
                  <ChevronRight className="ml-2 h-4 w-4 text-muted-foreground hidden sm:block" />
                )}
              </div>
            </li>
          ))}
        </ol>
      </nav>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Entity type selector */}
          {!initialEntityType && (
            <div className="space-y-2">
              <Label>What do you want to import?</Label>
              <Select value={entityType} onValueChange={(v) => setEntityType(v as EntityType)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leads">Leads</SelectItem>
                  <SelectItem value="accounts">Accounts</SelectItem>
                  <SelectItem value="contacts">Contacts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Download template */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
            <span className="text-sm text-muted-foreground">
              Use this template as a starting point
            </span>
          </div>

          {/* Drop zone */}
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors',
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileInput}
            />
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-1">
              Drag and drop your CSV file here
            </p>
            <p className="text-sm text-muted-foreground">
              or click to browse
            </p>
          </div>

          {parseError && (
            <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{parseError}</span>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Map columns */}
      {step === 2 && parsedData && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">Map Columns</h3>
              <p className="text-sm text-muted-foreground">
                Match your CSV columns to the database fields
              </p>
            </div>
            <Badge variant={canProceedToPreview ? 'success' : 'secondary'}>
              {mappedRequiredFields.length}/{requiredFields.length} required fields mapped
            </Badge>
          </div>

          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CSV Column</TableHead>
                    <TableHead>Sample Value</TableHead>
                    <TableHead>Maps To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columnMappings.map((mapping, index) => (
                    <TableRow key={mapping.csvColumn}>
                      <TableCell className="font-medium">{mapping.csvColumn}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {parsedData.rows[0]?.[index]?.substring(0, 50) || '-'}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={mapping.dbField || 'skip'}
                          onValueChange={(v) => updateMapping(mapping.csvColumn, v === 'skip' ? null : v)}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Skip this column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">
                              <span className="text-muted-foreground">Skip this column</span>
                            </SelectItem>
                            {ENTITY_FIELDS[entityType].map((field) => (
                              <SelectItem key={field.field} value={field.field}>
                                {field.label}
                                {field.required && ' *'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)} disabled={!canProceedToPreview}>
              Preview Data
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">Preview Import</h3>
              <p className="text-sm text-muted-foreground">
                Review the first 5 rows before importing
              </p>
            </div>
            <Badge variant="outline">
              {transformedData.length} rows to import
            </Badge>
          </div>

          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    {columnMappings
                      .filter((m) => m.dbField)
                      .map((m) => (
                        <TableHead key={m.dbField}>
                          {ENTITY_FIELDS[entityType].find((f) => f.field === m.dbField)?.label}
                        </TableHead>
                      ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transformedData.slice(0, 5).map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      {columnMappings
                        .filter((m) => m.dbField)
                        .map((m) => (
                          <TableCell key={m.dbField}>
                            {row[m.dbField!] || '-'}
                          </TableCell>
                        ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {transformedData.length > 5 && (
            <p className="text-sm text-muted-foreground text-center">
              ... and {transformedData.length - 5} more rows
            </p>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import {transformedData.length} Rows
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {step === 4 && importResult && (
        <div className="space-y-4">
          <div className="text-center py-8">
            {importResult.errors === 0 ? (
              <>
                <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 mx-auto flex items-center justify-center mb-4">
                  <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-medium mb-2">Import Complete!</h3>
                <p className="text-muted-foreground">
                  Successfully imported {importResult.success} of {importResult.total} records
                </p>
              </>
            ) : importResult.success > 0 ? (
              <>
                <div className="h-16 w-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 mx-auto flex items-center justify-center mb-4">
                  <AlertCircle className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
                </div>
                <h3 className="text-xl font-medium mb-2">Partial Import</h3>
                <p className="text-muted-foreground">
                  Imported {importResult.success} of {importResult.total} records.{' '}
                  {importResult.errors} records failed.
                </p>
              </>
            ) : (
              <>
                <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 mx-auto flex items-center justify-center mb-4">
                  <X className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-xl font-medium mb-2">Import Failed</h3>
                <p className="text-muted-foreground">
                  No records were imported
                </p>
              </>
            )}
          </div>

          {importResult.errorDetails && importResult.errorDetails.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="text-sm font-medium mb-2">Error Details</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {importResult.errorDetails.slice(0, 10).map((error, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <X className="h-4 w-4 text-destructive mt-0.5" />
                      {error}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={resetWizard}>
              Import More
            </Button>
            <Button onClick={() => {
              onComplete?.()
              router.refresh()
            }}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
