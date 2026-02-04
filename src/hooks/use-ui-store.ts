// =====================================================
// UI Store Hook for managing UI state and browser capabilities
// Detects: WebGL support, desktop viewport, reduced motion preference
// =====================================================

'use client'

import { useState, useEffect, useCallback } from 'react'

interface UIState {
  supportsWebGL: boolean
  isDesktop: boolean
  prefersReducedMotion: boolean
  scrollY: number
  windowWidth: number
  windowHeight: number
  isMounted: boolean
}

const DESKTOP_BREAKPOINT = 1024 // px

// Check WebGL support
function checkWebGLSupport(): boolean {
  if (typeof window === 'undefined') return false

  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    return gl !== null
  } catch {
    return false
  }
}

// Check if device is desktop (viewport + no touch)
function checkIsDesktop(): boolean {
  if (typeof window === 'undefined') return false

  const isWideEnough = window.innerWidth >= DESKTOP_BREAKPOINT
  const hasNoTouch = !('ontouchstart' in window) &&
                     !navigator.maxTouchPoints

  // Consider desktop if wide enough, regardless of touch capability
  // This handles desktop devices with touch screens
  return isWideEnough
}

// Check reduced motion preference
function checkReducedMotion(): boolean {
  if (typeof window === 'undefined') return false

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Initial state for SSR
const initialState: UIState = {
  supportsWebGL: false,
  isDesktop: true, // Assume desktop for SSR
  prefersReducedMotion: false,
  scrollY: 0,
  windowWidth: 0,
  windowHeight: 0,
  isMounted: false,
}

// Memory state for sharing across components
let memoryState: UIState = { ...initialState }
const listeners: Array<(state: UIState) => void> = []

function notifyListeners() {
  listeners.forEach((listener) => listener(memoryState))
}

function updateState(updates: Partial<UIState>) {
  memoryState = { ...memoryState, ...updates }
  notifyListeners()
}

// Initialize browser-side state
let initialized = false

function initializeState() {
  if (initialized || typeof window === 'undefined') return

  initialized = true

  // Initial detection
  updateState({
    supportsWebGL: checkWebGLSupport(),
    isDesktop: checkIsDesktop(),
    prefersReducedMotion: checkReducedMotion(),
    scrollY: window.scrollY,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    isMounted: true,
  })

  // Throttled scroll handler
  let scrollTicking = false
  const handleScroll = () => {
    if (!scrollTicking) {
      requestAnimationFrame(() => {
        updateState({ scrollY: window.scrollY })
        scrollTicking = false
      })
      scrollTicking = true
    }
  }

  // Debounced resize handler
  let resizeTimeout: NodeJS.Timeout
  const handleResize = () => {
    clearTimeout(resizeTimeout)
    resizeTimeout = setTimeout(() => {
      updateState({
        isDesktop: checkIsDesktop(),
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
      })
    }, 150)
  }

  // Motion preference change handler
  const motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  const handleMotionChange = (e: MediaQueryListEvent) => {
    updateState({ prefersReducedMotion: e.matches })
  }

  // Add event listeners
  window.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('resize', handleResize, { passive: true })
  motionMediaQuery.addEventListener('change', handleMotionChange)

  // Return cleanup function (called by hook)
  return () => {
    window.removeEventListener('scroll', handleScroll)
    window.removeEventListener('resize', handleResize)
    motionMediaQuery.removeEventListener('change', handleMotionChange)
    clearTimeout(resizeTimeout)
  }
}

/**
 * Hook to access UI state and browser capabilities
 *
 * @example
 * ```tsx
 * const { supportsWebGL, isDesktop, prefersReducedMotion } = useUIStore()
 *
 * if (!supportsWebGL || !isDesktop) {
 *   return <FallbackComponent />
 * }
 * ```
 */
export function useUIStore(): UIState {
  const [state, setState] = useState<UIState>(memoryState)

  useEffect(() => {
    // Initialize state on first mount
    const cleanup = initializeState()

    // Subscribe to state changes
    listeners.push(setState)

    // Sync with current memory state after initialization
    setState(memoryState)

    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
      // Only cleanup if no more listeners
      if (listeners.length === 0 && cleanup) {
        cleanup()
        initialized = false
      }
    }
  }, [])

  return state
}

/**
 * Selector hook for specific UI state properties
 * Use this for better performance when you only need specific properties
 *
 * @example
 * ```tsx
 * const isDesktop = useUISelector(state => state.isDesktop)
 * ```
 */
export function useUISelector<T>(selector: (state: UIState) => T): T {
  const state = useUIStore()
  return selector(state)
}

/**
 * Check if 3D rendering should be enabled
 * Returns true only if: WebGL supported, desktop viewport, no reduced motion
 */
export function useCanRender3D(): boolean {
  const { supportsWebGL, isDesktop, prefersReducedMotion, isMounted } = useUIStore()

  // During SSR or before hydration, assume we can render
  // This prevents flash of fallback content
  if (!isMounted) return true

  return supportsWebGL && isDesktop && !prefersReducedMotion
}

/**
 * Check if animations should be enabled
 * Returns false if user prefers reduced motion
 */
export function useCanAnimate(): boolean {
  const { prefersReducedMotion, isMounted } = useUIStore()

  if (!isMounted) return true

  return !prefersReducedMotion
}

export type { UIState }
