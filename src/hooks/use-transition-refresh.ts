'use client'

/**
 * Centralized refresh hook for workflow transitions
 *
 * This hook provides a unified way to refresh related data after
 * quotation/ticket/opportunity transitions occur, ensuring UI consistency
 * across all surfaces (detail pages, dialogs, tables).
 *
 * Usage:
 * const { refreshAfterTransition, isRefreshing } = useTransitionRefresh()
 *
 * // After successful transition:
 * await refreshAfterTransition({
 *   opportunityId: 'xxx',
 *   ticketId: 'yyy',
 *   quotationId: 'zzz'
 * })
 */

import { useState, useCallback } from 'react'

interface RefreshOptions {
  /** Opportunity ID to refresh */
  opportunityId?: string | null
  /** Ticket ID to refresh */
  ticketId?: string | null
  /** Quotation ID to refresh */
  quotationId?: string | null
  /** Force cache bust for all requests */
  forceCacheBust?: boolean
  /** Custom fetch options */
  fetchOptions?: RequestInit
}

interface RefreshResult {
  opportunity?: any
  ticket?: any
  quotation?: any
  errors: string[]
}

// Event types for cross-component communication
export const TRANSITION_EVENTS = {
  QUOTATION_SENT: 'quotation:sent',
  QUOTATION_ACCEPTED: 'quotation:accepted',
  QUOTATION_REJECTED: 'quotation:rejected',
  TICKET_ADJUSTMENT_REQUESTED: 'ticket:adjustment_requested',
} as const

/**
 * Emit a transition event for cross-component communication
 */
export function emitTransitionEvent(
  eventType: keyof typeof TRANSITION_EVENTS,
  data: { opportunityId?: string; ticketId?: string; quotationId?: string }
) {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent(TRANSITION_EVENTS[eventType], {
      detail: data,
      bubbles: true,
    })
    window.dispatchEvent(event)
  }
}

/**
 * Hook for listening to transition events
 */
export function useTransitionListener(
  eventType: keyof typeof TRANSITION_EVENTS,
  callback: (data: { opportunityId?: string; ticketId?: string; quotationId?: string }) => void
) {
  const eventName = TRANSITION_EVENTS[eventType]

  // Effect to add/remove listener
  if (typeof window !== 'undefined') {
    const handler = (e: CustomEvent) => callback(e.detail)
    window.addEventListener(eventName, handler as EventListener)
    return () => window.removeEventListener(eventName, handler as EventListener)
  }
}

export function useTransitionRefresh() {
  const [isRefreshing, setIsRefreshing] = useState(false)

  /**
   * Refresh all related data after a transition
   * Uses cache-busting to ensure fresh data
   */
  const refreshAfterTransition = useCallback(async (options: RefreshOptions): Promise<RefreshResult> => {
    const { opportunityId, ticketId, quotationId, forceCacheBust = true, fetchOptions = {} } = options

    setIsRefreshing(true)
    const errors: string[] = []
    const result: RefreshResult = { errors }

    const timestamp = forceCacheBust ? `?_t=${Date.now()}` : ''
    const headers: HeadersInit = {
      'Cache-Control': 'no-cache',
      ...fetchOptions.headers,
    }

    try {
      // Run all fetches in parallel for efficiency
      const fetchPromises: Promise<void>[] = []

      // Fetch opportunity/pipeline data
      if (opportunityId) {
        fetchPromises.push(
          fetch(`/api/crm/pipeline/${opportunityId}${timestamp}`, {
            cache: 'no-store',
            headers,
            ...fetchOptions,
          })
            .then(async (res) => {
              if (res.ok) {
                const data = await res.json()
                result.opportunity = data.data
              } else {
                errors.push(`Failed to refresh opportunity: ${res.status}`)
              }
            })
            .catch((err) => {
              errors.push(`Opportunity refresh error: ${err.message}`)
            })
        )
      }

      // Fetch ticket data
      if (ticketId) {
        fetchPromises.push(
          fetch(`/api/ticketing/tickets/${ticketId}${timestamp}`, {
            cache: 'no-store',
            headers,
            ...fetchOptions,
          })
            .then(async (res) => {
              if (res.ok) {
                const data = await res.json()
                result.ticket = data.data
              } else {
                errors.push(`Failed to refresh ticket: ${res.status}`)
              }
            })
            .catch((err) => {
              errors.push(`Ticket refresh error: ${err.message}`)
            })
        )
      }

      // Fetch quotation data
      if (quotationId) {
        fetchPromises.push(
          fetch(`/api/ticketing/customer-quotations/${quotationId}${timestamp}`, {
            cache: 'no-store',
            headers,
            ...fetchOptions,
          })
            .then(async (res) => {
              if (res.ok) {
                const data = await res.json()
                result.quotation = data.data
              } else {
                errors.push(`Failed to refresh quotation: ${res.status}`)
              }
            })
            .catch((err) => {
              errors.push(`Quotation refresh error: ${err.message}`)
            })
        )
      }

      await Promise.all(fetchPromises)
    } finally {
      setIsRefreshing(false)
    }

    return result
  }, [])

  /**
   * Trigger a browser-level refresh event
   * Useful for notifying other components to refresh their data
   */
  const broadcastRefresh = useCallback((
    eventType: keyof typeof TRANSITION_EVENTS,
    ids: { opportunityId?: string; ticketId?: string; quotationId?: string }
  ) => {
    emitTransitionEvent(eventType, ids)
  }, [])

  return {
    refreshAfterTransition,
    broadcastRefresh,
    isRefreshing,
    TRANSITION_EVENTS,
  }
}

export default useTransitionRefresh
