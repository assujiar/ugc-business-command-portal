'use client'

import { cn } from '@/lib/utils'

// =====================================================
// SVG Social Media Icons
// Brand colors from awesome-social-button
// https://github.com/logicspark/awesome-social-button
// =====================================================

export const SOCIAL_BRAND_COLORS: Record<string, string> = {
  tiktok: '#ee1d52',
  instagram: '#c13584',
  youtube: '#ff0000',
  facebook: '#1877f2',
  linkedin: '#0077b5',
}

// Chart colors (slightly adjusted for chart visibility)
export const SOCIAL_CHART_COLORS: Record<string, string> = {
  tiktok: '#ee1d52',
  instagram: '#c13584',
  youtube: '#ff0000',
  facebook: '#1877f2',
  linkedin: '#0077b5',
}

interface IconProps {
  className?: string
  size?: number
}

export function TikTokIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
    >
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.98a8.22 8.22 0 004.78 1.53V7.06a4.84 4.84 0 01-1.02-.37z" />
    </svg>
  )
}

export function InstagramIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  )
}

export function YouTubeIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
    >
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  )
}

export function FacebookIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

export function LinkedInIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

// Map of platform → icon component
export const SOCIAL_ICON_MAP: Record<string, React.FC<IconProps>> = {
  tiktok: TikTokIcon,
  instagram: InstagramIcon,
  youtube: YouTubeIcon,
  facebook: FacebookIcon,
  linkedin: LinkedInIcon,
}

// =====================================================
// Styled Social Media Icon Badge
// Inspired by awesome-social-button circle style
// =====================================================

interface SocialIconBadgeProps {
  platform: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  variant?: 'filled' | 'outline' | 'ghost'
  className?: string
}

const SIZE_MAP = {
  xs: { container: 'h-5 w-5', icon: 10 },
  sm: { container: 'h-7 w-7', icon: 14 },
  md: { container: 'h-9 w-9', icon: 18 },
  lg: { container: 'h-11 w-11', icon: 22 },
}

export function SocialIconBadge({
  platform,
  size = 'sm',
  variant = 'filled',
  className,
}: SocialIconBadgeProps) {
  const IconComponent = SOCIAL_ICON_MAP[platform]
  const color = SOCIAL_BRAND_COLORS[platform] || '#666'
  const sizeConfig = SIZE_MAP[size]

  if (!IconComponent) return null

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-all duration-200 shrink-0',
        variant === 'filled' && 'text-white shadow-sm hover:shadow-md hover:scale-105',
        variant === 'outline' && 'border-2 bg-transparent hover:scale-105',
        variant === 'ghost' && 'bg-transparent hover:opacity-80',
        sizeConfig.container,
        className,
      )}
      style={{
        ...(variant === 'filled' ? { backgroundColor: color } : {}),
        ...(variant === 'outline' ? { borderColor: color, color } : {}),
        ...(variant === 'ghost' ? { color } : {}),
      }}
    >
      <IconComponent size={sizeConfig.icon} />
    </div>
  )
}

// =====================================================
// Inline Social Icon (no badge, just colored icon)
// For use in tables and compact layouts
// =====================================================

interface SocialIconInlineProps {
  platform: string
  size?: number
  colored?: boolean
  className?: string
}

export function SocialIconInline({
  platform,
  size = 16,
  colored = true,
  className,
}: SocialIconInlineProps) {
  const IconComponent = SOCIAL_ICON_MAP[platform]
  const color = SOCIAL_BRAND_COLORS[platform] || '#666'

  if (!IconComponent) return null

  return (
    <IconComponent
      size={size}
      className={className}
      {...(colored ? {} : {})}
    />
  )
}

// =====================================================
// Platform config with icons (shared across components)
// =====================================================

export interface PlatformConfig {
  id: string
  label: string
  color: string
  chartColor: string
  IconComponent: React.FC<IconProps>
}

export const PLATFORM_CONFIGS: PlatformConfig[] = [
  { id: 'tiktok', label: 'TikTok', color: '#ee1d52', chartColor: '#ee1d52', IconComponent: TikTokIcon },
  { id: 'instagram', label: 'Instagram', color: '#c13584', chartColor: '#c13584', IconComponent: InstagramIcon },
  { id: 'youtube', label: 'YouTube', color: '#ff0000', chartColor: '#ff0000', IconComponent: YouTubeIcon },
  { id: 'facebook', label: 'Facebook', color: '#1877f2', chartColor: '#1877f2', IconComponent: FacebookIcon },
  { id: 'linkedin', label: 'LinkedIn', color: '#0077b5', chartColor: '#0077b5', IconComponent: LinkedInIcon },
]

export const PLATFORM_CONFIG_MAP: Record<string, PlatformConfig> = Object.fromEntries(
  PLATFORM_CONFIGS.map(p => [p.id, p])
)
