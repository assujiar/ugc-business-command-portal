// =====================================================
// Supabase Auth Middleware
// Refreshes session on each request to sync cookies
// between client and server
// =====================================================

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Timeout wrapper to prevent middleware from hanging
const AUTH_TIMEOUT_MS = 5000 // 5 seconds max for auth operations

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) =>
      setTimeout(() => resolve(fallback), timeoutMs)
    ),
  ])
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Check if Supabase environment variables are configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Middleware] Supabase environment variables not configured')
    // Allow public routes, redirect others to login
    const isPublicRoute =
      request.nextUrl.pathname.startsWith('/login') ||
      request.nextUrl.pathname.startsWith('/auth') ||
      request.nextUrl.pathname.startsWith('/quotation-verify') ||
      request.nextUrl.pathname.startsWith('/terms') ||
      request.nextUrl.pathname.startsWith('/privacy') ||
      request.nextUrl.pathname.startsWith('/api/public') ||
      request.nextUrl.pathname.startsWith('/api/ticketing/customer-quotations/validate') ||
      request.nextUrl.pathname.startsWith('/api/crm/notifications/cron')

    if (!isPublicRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // Try getUser first (validates token with Supabase server)
  // Fall back to getSession if getUser fails (reads from cookie only)
  // Wrapped with timeout to prevent middleware hanging when Supabase is slow/unreachable
  let user = null

  try {
    const { data: userData, error: userError } = await withTimeout(
      supabase.auth.getUser(),
      AUTH_TIMEOUT_MS,
      { data: { user: null }, error: { message: 'Auth timeout' } as any }
    )

    if (userData?.user) {
      user = userData.user
    } else if (userError) {
      // If getUser fails, try getSession as fallback
      // This can happen if there's a network issue or token refresh is needed
      const { data: sessionData } = await withTimeout(
        supabase.auth.getSession(),
        AUTH_TIMEOUT_MS,
        { data: { session: null }, error: null }
      )
      if (sessionData?.session?.user) {
        user = sessionData.session.user
      }
    }
  } catch (error) {
    // Log but don't crash - treat as unauthenticated
    console.error('[Middleware] Auth error:', error instanceof Error ? error.message : 'Unknown error')
  }

  // Public routes that don't require authentication
  const isPublicRoute =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/auth') ||
    request.nextUrl.pathname.startsWith('/quotation-verify') ||
    request.nextUrl.pathname.startsWith('/terms') ||
    request.nextUrl.pathname.startsWith('/privacy') ||
    request.nextUrl.pathname.startsWith('/api/public') ||
    request.nextUrl.pathname.startsWith('/api/ticketing/customer-quotations/validate') ||
    request.nextUrl.pathname.startsWith('/api/crm/notifications/cron')

  // Redirect unauthenticated users trying to access protected routes
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from login page
  // Role-based redirect is handled by the login page itself after profile fetch
  // Middleware uses a simple default since it doesn't have access to the profile table
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/overview-crm'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Static assets (images, fonts, stylesheets, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot|otf)$).*)',
  ],
}
