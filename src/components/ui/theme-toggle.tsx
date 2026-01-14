// =====================================================
// Theme Toggle Component
// SOURCE: PDF - Dark + Light theme support
// =====================================================

'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

// Flat vector Sun icon
function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="5" />
      <rect x="11" y="1" width="2" height="4" rx="1" />
      <rect x="11" y="19" width="2" height="4" rx="1" />
      <rect x="19" y="11" width="4" height="2" rx="1" />
      <rect x="1" y="11" width="4" height="2" rx="1" />
      <rect x="17.5" y="4.4" width="2" height="4" rx="1" transform="rotate(45 17.5 4.4)" />
      <rect x="4.5" y="17.4" width="2" height="4" rx="1" transform="rotate(45 4.5 17.4)" />
      <rect x="19.6" y="17.5" width="2" height="4" rx="1" transform="rotate(135 19.6 17.5)" />
      <rect x="6.6" y="4.5" width="2" height="4" rx="1" transform="rotate(135 6.6 4.5)" />
    </svg>
  )
}

// Flat vector Moon icon
function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" disabled>
        <SunIcon className="h-5 w-5" />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? (
        <SunIcon className="h-5 w-5" />
      ) : (
        <MoonIcon className="h-5 w-5" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
