'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  Truck,
  Ship,
  Plane,
  MapPin,
  Package,
  Ruler,
  FileText,
  Settings2,
  Building2,
  User,
  Phone,
  Mail,
  Briefcase,
  Target,
  DollarSign,
  Calendar,
  Tag,
  Info,
  type LucideIcon,
} from 'lucide-react'

// =====================================================
// Form Section Component - Consistent Section Styling
// =====================================================
// Use this component to wrap form sections with consistent
// color coding and visual distinction across all forms.
// =====================================================

export type FormSectionVariant =
  | 'service'      // Orange (#ff4600) - Service type, logistics
  | 'cargo'        // Blue - Cargo, product information
  | 'route'        // Emerald - Origin/destination, routes
  | 'dimensions'   // Purple - Measurements, quantities
  | 'scope'        // Amber - Scope of work, requirements
  | 'additional'   // Slate - Additional services, extras
  | 'company'      // Indigo - Company information
  | 'contact'      // Cyan - Contact person, PIC
  | 'lead'         // Rose - Lead details, source
  | 'financial'    // Green - Financial, pricing, costs
  | 'schedule'     // Orange - Schedule, dates
  | 'notes'        // Gray - Notes, comments
  | 'default'      // Neutral

// Section color configurations
export const SECTION_STYLES: Record<FormSectionVariant, {
  border: string
  bg: string
  icon: string
  title: string
  glassBg: string
}> = {
  service: {
    border: 'border-l-4 border-l-[#ff4600]',
    bg: 'bg-gradient-to-r from-[#ff4600]/5 to-transparent',
    glassBg: 'bg-[#ff4600]/5 backdrop-blur-sm',
    icon: 'text-[#ff4600]',
    title: 'text-[#ff4600]',
  },
  cargo: {
    border: 'border-l-4 border-l-blue-500',
    bg: 'bg-gradient-to-r from-blue-500/5 to-transparent',
    glassBg: 'bg-blue-500/5 backdrop-blur-sm',
    icon: 'text-blue-500',
    title: 'text-blue-600 dark:text-blue-400',
  },
  route: {
    border: 'border-l-4 border-l-emerald-500',
    bg: 'bg-gradient-to-r from-emerald-500/5 to-transparent',
    glassBg: 'bg-emerald-500/5 backdrop-blur-sm',
    icon: 'text-emerald-500',
    title: 'text-emerald-600 dark:text-emerald-400',
  },
  dimensions: {
    border: 'border-l-4 border-l-purple-500',
    bg: 'bg-gradient-to-r from-purple-500/5 to-transparent',
    glassBg: 'bg-purple-500/5 backdrop-blur-sm',
    icon: 'text-purple-500',
    title: 'text-purple-600 dark:text-purple-400',
  },
  scope: {
    border: 'border-l-4 border-l-amber-500',
    bg: 'bg-gradient-to-r from-amber-500/5 to-transparent',
    glassBg: 'bg-amber-500/5 backdrop-blur-sm',
    icon: 'text-amber-500',
    title: 'text-amber-600 dark:text-amber-400',
  },
  additional: {
    border: 'border-l-4 border-l-slate-500',
    bg: 'bg-gradient-to-r from-slate-500/5 to-transparent',
    glassBg: 'bg-slate-500/5 backdrop-blur-sm',
    icon: 'text-slate-500',
    title: 'text-slate-600 dark:text-slate-400',
  },
  company: {
    border: 'border-l-4 border-l-indigo-500',
    bg: 'bg-gradient-to-r from-indigo-500/5 to-transparent',
    glassBg: 'bg-indigo-500/5 backdrop-blur-sm',
    icon: 'text-indigo-500',
    title: 'text-indigo-600 dark:text-indigo-400',
  },
  contact: {
    border: 'border-l-4 border-l-cyan-500',
    bg: 'bg-gradient-to-r from-cyan-500/5 to-transparent',
    glassBg: 'bg-cyan-500/5 backdrop-blur-sm',
    icon: 'text-cyan-500',
    title: 'text-cyan-600 dark:text-cyan-400',
  },
  lead: {
    border: 'border-l-4 border-l-rose-500',
    bg: 'bg-gradient-to-r from-rose-500/5 to-transparent',
    glassBg: 'bg-rose-500/5 backdrop-blur-sm',
    icon: 'text-rose-500',
    title: 'text-rose-600 dark:text-rose-400',
  },
  financial: {
    border: 'border-l-4 border-l-green-500',
    bg: 'bg-gradient-to-r from-green-500/5 to-transparent',
    glassBg: 'bg-green-500/5 backdrop-blur-sm',
    icon: 'text-green-500',
    title: 'text-green-600 dark:text-green-400',
  },
  schedule: {
    border: 'border-l-4 border-l-orange-500',
    bg: 'bg-gradient-to-r from-orange-500/5 to-transparent',
    glassBg: 'bg-orange-500/5 backdrop-blur-sm',
    icon: 'text-orange-500',
    title: 'text-orange-600 dark:text-orange-400',
  },
  notes: {
    border: 'border-l-4 border-l-gray-400',
    bg: 'bg-gradient-to-r from-gray-400/5 to-transparent',
    glassBg: 'bg-gray-400/5 backdrop-blur-sm',
    icon: 'text-gray-400',
    title: 'text-gray-600 dark:text-gray-400',
  },
  default: {
    border: 'border-l-4 border-l-muted-foreground/30',
    bg: 'bg-muted/30',
    glassBg: 'bg-muted/30 backdrop-blur-sm',
    icon: 'text-muted-foreground',
    title: 'text-muted-foreground',
  },
}

// Default icons for each variant
const DEFAULT_ICONS: Record<FormSectionVariant, LucideIcon> = {
  service: Truck,
  cargo: Package,
  route: MapPin,
  dimensions: Ruler,
  scope: FileText,
  additional: Settings2,
  company: Building2,
  contact: User,
  lead: Target,
  financial: DollarSign,
  schedule: Calendar,
  notes: Info,
  default: Tag,
}

// Service type category colors for dropdown styling
export const SERVICE_CATEGORY_STYLES = {
  'Domestics': {
    label: 'text-[#ff4600] font-semibold',
    bg: 'bg-[#ff4600]/10',
    icon: Truck,
  },
  'Export': {
    label: 'text-blue-600 font-semibold',
    bg: 'bg-blue-500/10',
    icon: Ship,
  },
  'Import': {
    label: 'text-emerald-600 font-semibold',
    bg: 'bg-emerald-500/10',
    icon: Ship,
  },
  'Import DTD': {
    label: 'text-purple-600 font-semibold',
    bg: 'bg-purple-500/10',
    icon: Plane,
  },
}

interface FormSectionProps {
  variant?: FormSectionVariant
  title: string
  icon?: LucideIcon
  children: React.ReactNode
  className?: string
  /** Use glassmorphism effect (backdrop blur) */
  glass?: boolean
  /** Compact mode - less padding */
  compact?: boolean
  /** Show border on all sides instead of just left */
  bordered?: boolean
}

export function FormSection({
  variant = 'default',
  title,
  icon,
  children,
  className,
  glass = false,
  compact = false,
  bordered = false,
}: FormSectionProps) {
  const styles = SECTION_STYLES[variant]
  const IconComponent = icon || DEFAULT_ICONS[variant]

  return (
    <div
      className={cn(
        'rounded-lg transition-all duration-200',
        compact ? 'p-3 space-y-3' : 'p-4 space-y-4',
        glass ? styles.glassBg : styles.bg,
        bordered ? 'border' : styles.border,
        className
      )}
    >
      <div className="flex items-center gap-2">
        <IconComponent className={cn('h-4 w-4', styles.icon)} />
        <h4 className={cn(
          'font-semibold text-sm uppercase tracking-wide',
          styles.title
        )}>
          {title}
        </h4>
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}

// Helper component for subsection dividers within a section
interface FormSubsectionProps {
  title: string
  variant?: FormSectionVariant
  className?: string
  children: React.ReactNode
}

export function FormSubsection({
  title,
  variant = 'default',
  className,
  children,
}: FormSubsectionProps) {
  const styles = SECTION_STYLES[variant]

  return (
    <div className={cn('space-y-3', className)}>
      <div className={cn(
        'flex items-center gap-2 pb-2 border-b',
        `border-${variant === 'default' ? 'border' : styles.border.split('border-l-')[1]}/20`
      )}>
        <span className={cn('text-xs font-medium uppercase', styles.title)}>
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}

// Export icons for external use
export const FormSectionIcons = {
  Truck,
  Ship,
  Plane,
  MapPin,
  Package,
  Ruler,
  FileText,
  Settings2,
  Building2,
  User,
  Phone,
  Mail,
  Briefcase,
  Target,
  DollarSign,
  Calendar,
  Tag,
  Info,
}
