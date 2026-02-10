// =====================================================
// Social Media Token Refresh Utility
// Automatic OAuth token refresh for each platform
// =====================================================

import { createAdminClient } from '@/lib/supabase/admin'

interface TokenConfig {
  id: string
  platform: string
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  api_base_url: string | null
  account_id: string | null
}

interface RefreshResult {
  access_token: string
  refresh_token?: string
  expires_in: number // seconds
}

// Buffer time: refresh 15 minutes before actual expiry
const REFRESH_BUFFER_MS = 15 * 60 * 1000

/**
 * Check if a token needs refreshing.
 * Returns true if:
 * - token_expires_at is set AND is within REFRESH_BUFFER_MS of now
 * - token_expires_at is already past
 */
export function isTokenExpiringSoon(config: TokenConfig): boolean {
  if (!config.token_expires_at) return false // no expiry info, assume valid
  const expiresAt = new Date(config.token_expires_at).getTime()
  const now = Date.now()
  return expiresAt - now <= REFRESH_BUFFER_MS
}

/**
 * Check if token is already expired
 */
export function isTokenExpired(config: TokenConfig): boolean {
  if (!config.token_expires_at) return false
  return new Date(config.token_expires_at).getTime() <= Date.now()
}

// =====================================================
// Platform-specific refresh implementations
// =====================================================

/**
 * Meta (Instagram / Facebook) token refresh
 * Long-lived tokens: exchange before expiry
 * Docs: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/
 */
async function refreshMetaToken(config: TokenConfig): Promise<RefreshResult | null> {
  if (!config.access_token) return null

  try {
    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET

    if (!appId || !appSecret) {
      console.error(`[token-refresh] META_APP_ID or META_APP_SECRET not set for ${config.platform}`)
      return null
    }

    // Exchange current token for a new long-lived token
    const url = new URL('https://graph.facebook.com/v21.0/oauth/access_token')
    url.searchParams.set('grant_type', 'fb_exchange_token')
    url.searchParams.set('client_id', appId)
    url.searchParams.set('client_secret', appSecret)
    url.searchParams.set('fb_exchange_token', config.access_token)

    const response = await fetch(url.toString())
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error(`[token-refresh] Meta refresh failed for ${config.platform}:`, errorData)
      return null
    }

    const data = await response.json()
    return {
      access_token: data.access_token,
      expires_in: data.expires_in || 5184000, // default 60 days
    }
  } catch (error) {
    console.error(`[token-refresh] Meta refresh error for ${config.platform}:`, error)
    return null
  }
}

/**
 * TikTok token refresh
 * Docs: https://developers.tiktok.com/doc/oauth-user-access-token-management/
 */
async function refreshTikTokToken(config: TokenConfig): Promise<RefreshResult | null> {
  if (!config.refresh_token) return null

  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET

    if (!clientKey || !clientSecret) {
      console.error('[token-refresh] TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET not set')
      return null
    }

    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: config.refresh_token,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[token-refresh] TikTok refresh failed:', errorData)
      return null
    }

    const data = await response.json()
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token, // TikTok issues new refresh_token
      expires_in: data.expires_in || 86400, // default 24h
    }
  } catch (error) {
    console.error('[token-refresh] TikTok refresh error:', error)
    return null
  }
}

/**
 * YouTube / Google OAuth token refresh
 * Docs: https://developers.google.com/identity/protocols/oauth2/web-server#offline
 */
async function refreshGoogleToken(config: TokenConfig): Promise<RefreshResult | null> {
  if (!config.refresh_token) return null

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error('[token-refresh] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set')
      return null
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: config.refresh_token,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[token-refresh] Google refresh failed:', errorData)
      return null
    }

    const data = await response.json()
    return {
      access_token: data.access_token,
      // Google does NOT return a new refresh_token on refresh
      expires_in: data.expires_in || 3600, // default 1h
    }
  } catch (error) {
    console.error('[token-refresh] Google refresh error:', error)
    return null
  }
}

/**
 * LinkedIn token refresh
 * Docs: https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens
 */
async function refreshLinkedInToken(config: TokenConfig): Promise<RefreshResult | null> {
  if (!config.refresh_token) return null

  try {
    const clientId = process.env.LINKEDIN_CLIENT_ID
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error('[token-refresh] LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET not set')
      return null
    }

    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: config.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[token-refresh] LinkedIn refresh failed:', errorData)
      return null
    }

    const data = await response.json()
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token, // LinkedIn may issue new refresh_token
      expires_in: data.expires_in || 5184000, // default 60 days
    }
  } catch (error) {
    console.error('[token-refresh] LinkedIn refresh error:', error)
    return null
  }
}

// Map platform → refresh function
const REFRESH_FUNCTIONS: Record<string, (config: TokenConfig) => Promise<RefreshResult | null>> = {
  tiktok: refreshTikTokToken,
  instagram: refreshMetaToken,
  youtube: refreshGoogleToken,
  facebook: refreshMetaToken,
  linkedin: refreshLinkedInToken,
}

// =====================================================
// Core: Ensure token is valid, refresh if needed
// =====================================================

/**
 * Ensures the access_token for a platform config is valid.
 * If the token is expiring soon or expired, attempts to refresh it.
 * Updates the database with the new token on success.
 *
 * Returns the config with a valid access_token, or null if refresh failed.
 */
export async function ensureValidToken(config: TokenConfig): Promise<TokenConfig> {
  // If no expiry set or token is not expiring soon, return as-is
  if (!isTokenExpiringSoon(config)) {
    return config
  }

  console.log(`[token-refresh] Token expiring soon for ${config.platform}, attempting refresh...`)

  // If no refresh_token and no way to refresh, return as-is (will likely fail on API call)
  if (!config.refresh_token && !['instagram', 'facebook'].includes(config.platform)) {
    console.warn(`[token-refresh] No refresh_token for ${config.platform}, cannot auto-refresh`)
    return config
  }

  const refreshFn = REFRESH_FUNCTIONS[config.platform]
  if (!refreshFn) {
    console.warn(`[token-refresh] No refresh function for ${config.platform}`)
    return config
  }

  const result = await refreshFn(config)
  if (!result) {
    console.error(`[token-refresh] Failed to refresh token for ${config.platform}`)
    return config
  }

  // Calculate new expiry
  const newExpiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString()

  // Update database with new tokens
  const adminClient = createAdminClient() as any
  const updateData: Record<string, any> = {
    access_token: result.access_token,
    token_expires_at: newExpiresAt,
    updated_at: new Date().toISOString(),
  }

  // Only update refresh_token if a new one was provided
  if (result.refresh_token) {
    updateData.refresh_token = result.refresh_token
  }

  const { error: updateError } = await adminClient
    .from('marketing_social_media_config')
    .update(updateData)
    .eq('id', config.id)

  if (updateError) {
    console.error(`[token-refresh] Failed to update token in DB for ${config.platform}:`, updateError)
    // Still return the new token even if DB update fails
  } else {
    console.log(`[token-refresh] Successfully refreshed token for ${config.platform}, expires at ${newExpiresAt}`)
  }

  return {
    ...config,
    access_token: result.access_token,
    refresh_token: result.refresh_token || config.refresh_token,
    token_expires_at: newExpiresAt,
  }
}

// =====================================================
// Batch: Refresh all expiring tokens
// Called by the dedicated token refresh API endpoint
// =====================================================

export interface TokenRefreshReport {
  platform: string
  status: 'valid' | 'refreshed' | 'failed' | 'no_token' | 'no_expiry'
  expires_at?: string
  error?: string
}

/**
 * Check and refresh all platform tokens that are expiring soon.
 * Returns a report for each platform.
 */
export async function refreshAllExpiringTokens(): Promise<TokenRefreshReport[]> {
  const adminClient = createAdminClient() as any
  const reports: TokenRefreshReport[] = []

  const { data: configs, error } = await adminClient
    .from('marketing_social_media_config')
    .select('*')
    .eq('is_active', true)

  if (error || !configs) {
    console.error('[token-refresh] Failed to fetch configs:', error)
    return [{ platform: 'all', status: 'failed', error: 'Failed to fetch configs' }]
  }

  for (const config of configs) {
    if (!config.access_token) {
      reports.push({ platform: config.platform, status: 'no_token' })
      continue
    }

    if (!config.token_expires_at) {
      reports.push({ platform: config.platform, status: 'no_expiry' })
      continue
    }

    if (!isTokenExpiringSoon(config)) {
      reports.push({
        platform: config.platform,
        status: 'valid',
        expires_at: config.token_expires_at,
      })
      continue
    }

    try {
      const updated = await ensureValidToken(config)
      if (updated.access_token !== config.access_token) {
        reports.push({
          platform: config.platform,
          status: 'refreshed',
          expires_at: updated.token_expires_at || undefined,
        })
      } else {
        reports.push({
          platform: config.platform,
          status: 'failed',
          error: 'Refresh returned same token or failed',
        })
      }
    } catch (err) {
      reports.push({
        platform: config.platform,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return reports
}
