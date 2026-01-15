// =====================================================
// Root Layout
// SOURCE: PDF - App Structure
// =====================================================

import type { Metadata } from 'next'
import { lufga } from '@/fonts/font'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

export const metadata: Metadata = {
  title: 'UGC Business Command Portal - CRM',
  description: 'Customer Relationship Management Module for UGC Business Command Portal',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={lufga.variable}>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
