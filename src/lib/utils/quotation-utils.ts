/**
 * Quotation Utility Functions
 *
 * Utility functions for working with customer quotations,
 * including sequence labels and status helpers.
 */

/**
 * English sequence labels for quotation numbers
 */
const SEQUENCE_LABELS_EN: string[] = [
  'First',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
  'Sixth',
  'Seventh',
  'Eighth',
  'Ninth',
  'Tenth',
]

/**
 * Indonesian sequence labels for quotation numbers
 */
const SEQUENCE_LABELS_ID: string[] = [
  'Pertama',
  'Kedua',
  'Ketiga',
  'Keempat',
  'Kelima',
  'Keenam',
  'Ketujuh',
  'Kedelapan',
  'Kesembilan',
  'Kesepuluh',
]

/**
 * Get the human-readable sequence label for a quotation
 * @param sequenceNumber - The sequence number (1-based)
 * @param locale - 'en' for English, 'id' for Indonesian
 * @returns Human-readable label (e.g., "First", "Second", "Pertama", "Kedua")
 */
export function getQuotationSequenceLabel(
  sequenceNumber: number | null | undefined,
  locale: 'en' | 'id' = 'en'
): string {
  const labels = locale === 'id' ? SEQUENCE_LABELS_ID : SEQUENCE_LABELS_EN

  if (sequenceNumber == null || sequenceNumber < 1) {
    return labels[0]
  }

  if (sequenceNumber <= 10) {
    return labels[sequenceNumber - 1]
  }

  // For numbers > 10, use numeric suffix
  if (locale === 'id') {
    return `Ke-${sequenceNumber}`
  }

  // English ordinal suffix
  const suffix = getOrdinalSuffix(sequenceNumber)
  return `${sequenceNumber}${suffix}`
}

/**
 * Get the ordinal suffix for a number (st, nd, rd, th)
 */
function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

/**
 * Get a short label for sequence (e.g., "#1", "#2")
 */
export function getQuotationSequenceShort(sequenceNumber: number | null | undefined): string {
  if (sequenceNumber == null || sequenceNumber < 1) {
    return '#1'
  }
  return `#${sequenceNumber}`
}

/**
 * Get a display string for a quotation (number + sequence label)
 * @param quotationNumber - The quotation number (e.g., "QT-20240123-001")
 * @param sequenceNumber - The sequence number (1-based)
 * @param locale - 'en' for English, 'id' for Indonesian
 * @returns Formatted string (e.g., "QT-20240123-001 (First Quotation)")
 */
export function formatQuotationDisplay(
  quotationNumber: string,
  sequenceNumber: number | null | undefined,
  locale: 'en' | 'id' = 'en'
): string {
  const label = getQuotationSequenceLabel(sequenceNumber, locale)
  const quotationWord = locale === 'id' ? 'Quotation' : 'Quotation'
  return `${quotationNumber} (${label} ${quotationWord})`
}

/**
 * Quotation status configuration for UI display
 */
export const QUOTATION_STATUS_CONFIG = {
  draft: {
    label: 'Draft',
    labelId: 'Draft',
    variant: 'outline' as const,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  sent: {
    label: 'Sent',
    labelId: 'Terkirim',
    variant: 'secondary' as const,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  accepted: {
    label: 'Accepted',
    labelId: 'Diterima',
    variant: 'default' as const,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  rejected: {
    label: 'Rejected',
    labelId: 'Ditolak',
    variant: 'destructive' as const,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  expired: {
    label: 'Expired',
    labelId: 'Kedaluwarsa',
    variant: 'outline' as const,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  revoked: {
    label: 'Revoked',
    labelId: 'Dibatalkan',
    variant: 'outline' as const,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
}

/**
 * Get status configuration for a quotation status
 */
export function getQuotationStatusConfig(status: string) {
  return (
    QUOTATION_STATUS_CONFIG[status as keyof typeof QUOTATION_STATUS_CONFIG] ||
    QUOTATION_STATUS_CONFIG.draft
  )
}

/**
 * Source type labels for quotations
 */
export const SOURCE_TYPE_LABELS = {
  lead: {
    label: 'From Lead',
    labelId: 'Dari Lead',
    icon: 'user',
  },
  opportunity: {
    label: 'From Pipeline',
    labelId: 'Dari Pipeline',
    icon: 'trending-up',
  },
  ticket: {
    label: 'From Ticket',
    labelId: 'Dari Ticket',
    icon: 'ticket',
  },
  standalone: {
    label: 'Standalone',
    labelId: 'Mandiri',
    icon: 'file-text',
  },
}

/**
 * Get source type label for a quotation
 */
export function getSourceTypeLabel(
  sourceType: string | null | undefined,
  locale: 'en' | 'id' = 'en'
): string {
  if (!sourceType) return locale === 'id' ? 'Mandiri' : 'Standalone'

  const config = SOURCE_TYPE_LABELS[sourceType as keyof typeof SOURCE_TYPE_LABELS]
  if (!config) return sourceType

  return locale === 'id' ? config.labelId : config.label
}
