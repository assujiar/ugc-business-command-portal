// =====================================================
// Auth Callback Route
// Handles OAuth and email confirmation callbacks
// Exchanges auth code for session
// =====================================================

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/overview-crm'

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // If next param is explicitly set, use it
      if (requestUrl.searchParams.get('next')) {
        return NextResponse.redirect(new URL(next, request.url))
      }

      // Otherwise determine redirect based on user role
      let redirectPath = '/overview-crm'
      if (sessionData?.user) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('user_id', sessionData.user.id)
            .single()
          if (profile?.role) {
            const role = profile.role as string
            if (['EXIM Ops', 'domestics Ops', 'Import DTD Ops', 'traffic & warehous'].includes(role)) {
              redirectPath = '/overview-ticket'
            } else if (['Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO'].includes(role)) {
              redirectPath = '/marketing/overview'
            } else if (role === 'finance') {
              redirectPath = '/overview-crm'
            }
          }
        } catch {
          // If profile fetch fails, use default redirect
        }
      }
      return NextResponse.redirect(new URL(redirectPath, request.url))
    }
  }

  // Return to login with error
  return NextResponse.redirect(new URL('/login?error=auth_callback_error', request.url))
}
