// =====================================================
// Utility Functions
// =====================================================

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Generate idempotency key
export function generateIdempotencyKey(prefix: string = 'idem'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// Format currency
export function formatCurrency(value: number | null | undefined, currency: string = 'IDR'): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Format date
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

// Format datetime
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

// Check if date is overdue
export function isOverdue(date: string | Date | null | undefined): boolean {
  if (!date) return false
  return new Date(date) < new Date()
}

// Truncate text
export function truncate(text: string | null | undefined, length: number = 50): string {
  if (!text) return ''
  if (text.length <= length) return text
  return text.substring(0, length) + '...'
}
