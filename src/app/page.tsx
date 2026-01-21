// =====================================================
// Root Page - Redirect to CRM Overview
// =====================================================

import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/overview-crm')
}
