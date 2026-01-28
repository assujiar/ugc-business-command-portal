/**
 * Regression tests for orphan opportunity preflight behavior
 * Tests the send route's handling of fn_preflight_quotation_send results
 *
 * Test scenarios:
 * 1. AMBIGUOUS_OPPORTUNITY -> HTTP 409
 * 2. repair_failed non-ambiguous -> HTTP 404
 * 3. can_proceed=false (no repair attempted) -> HTTP 409
 * 4. can_proceed=true -> proceeds past preflight
 */

// Mock resend BEFORE any imports that might load it
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn().mockResolvedValue({ data: { id: 'mock-email-id' }, error: null }),
    },
  })),
}), { virtual: true })

import { NextRequest } from 'next/server'

// Mock dependencies before importing route
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/permissions', () => ({
  canAccessTicketing: jest.fn().mockReturnValue(true),
}))

describe('Send Route Preflight Behavior', () => {
  let mockSupabaseClient: any
  let mockAdminClient: any
  let createClient: jest.Mock
  let createAdminClient: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup mock Supabase client
    mockSupabaseClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: { id: 'test-user-id', email: 'test@example.com' },
          },
          error: null,
        }),
      },
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    }

    // Setup mock Admin client
    mockAdminClient = {
      rpc: jest.fn(),
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      update: jest.fn().mockReturnThis(),
    }

    createClient = require('@/lib/supabase/server').createClient
    createAdminClient = require('@/lib/supabase/admin').createAdminClient

    createClient.mockReturnValue(mockSupabaseClient)
    createAdminClient.mockReturnValue(mockAdminClient)
  })

  // Helper to create mock quotation
  const mockQuotation = (overrides = {}) => ({
    id: 'test-quotation-id',
    quotation_number: 'QT-2024-001',
    opportunity_id: 'test-opportunity-id',
    customer_email: 'customer@example.com',
    customer_phone: '+1234567890',
    customer_name: 'Test Customer',
    status: 'draft',
    validation_code: 'abc123',
    total_selling_rate: 1000,
    currency: 'USD',
    creator: { email: 'creator@example.com' },
    ...overrides,
  })

  // Helper to create mock profile
  const mockProfile = () => ({
    user_id: 'test-user-id',
    email: 'test@example.com',
    role: 'sales',
    full_name: 'Test User',
  })

  describe('Preflight Error Handling', () => {
    test('should return 409 when error_code is AMBIGUOUS_OPPORTUNITY', async () => {
      // Setup: quotation with opportunity_id
      const quotation = mockQuotation()
      const profile = mockProfile()

      // Mock profile fetch
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      })

      // Mock quotation fetch
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: quotation,
        error: null,
      })

      // Mock preflight RPC returning AMBIGUOUS_OPPORTUNITY
      mockAdminClient.rpc.mockResolvedValueOnce({
        data: {
          can_proceed: false,
          repair_failed: true,
          error_code: 'AMBIGUOUS_OPPORTUNITY',
          error: 'Multiple possible opportunities found',
          orphan_opportunity_id: 'test-opportunity-id',
        },
        error: null,
      })

      // Import route handler dynamically to use mocked dependencies
      const { POST } = await import('../route')

      const request = new NextRequest('http://localhost/api/ticketing/customer-quotations/test-quotation-id/send', {
        method: 'POST',
        body: JSON.stringify({ method: 'email' }),
      })

      const response = await POST(request, { params: Promise.resolve({ id: 'test-quotation-id' }) })
      const json = await response.json()

      expect(response.status).toBe(409)
      expect(json.error_code).toBe('AMBIGUOUS_OPPORTUNITY')
      expect(json.message).toContain('Multiple possible opportunities')
    })

    test('should return 404 when repair_failed with non-ambiguous error', async () => {
      const quotation = mockQuotation()
      const profile = mockProfile()

      mockSupabaseClient.single.mockResolvedValueOnce({ data: profile, error: null })
      mockSupabaseClient.single.mockResolvedValueOnce({ data: quotation, error: null })

      // Mock preflight RPC returning repair_failed with different error
      mockAdminClient.rpc.mockResolvedValueOnce({
        data: {
          can_proceed: false,
          repair_failed: true,
          error_code: 'NO_REPAIR_CANDIDATE',
          error: 'No valid opportunity found for repair',
          orphan_opportunity_id: 'test-opportunity-id',
        },
        error: null,
      })

      const { POST } = await import('../route')

      const request = new NextRequest('http://localhost/api/ticketing/customer-quotations/test-quotation-id/send', {
        method: 'POST',
        body: JSON.stringify({ method: 'email' }),
      })

      const response = await POST(request, { params: Promise.resolve({ id: 'test-quotation-id' }) })
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.error_code).toBe('NO_REPAIR_CANDIDATE')
    })

    test('should return 409 when can_proceed=false without repair_failed', async () => {
      const quotation = mockQuotation()
      const profile = mockProfile()

      mockSupabaseClient.single.mockResolvedValueOnce({ data: profile, error: null })
      mockSupabaseClient.single.mockResolvedValueOnce({ data: quotation, error: null })

      // Mock preflight RPC returning can_proceed=false (simple orphan)
      mockAdminClient.rpc.mockResolvedValueOnce({
        data: {
          can_proceed: false,
          error_code: 'OPPORTUNITY_NOT_FOUND',
          error: 'Opportunity does not exist',
          orphan_opportunity_id: 'test-opportunity-id',
        },
        error: null,
      })

      const { POST } = await import('../route')

      const request = new NextRequest('http://localhost/api/ticketing/customer-quotations/test-quotation-id/send', {
        method: 'POST',
        body: JSON.stringify({ method: 'email' }),
      })

      const response = await POST(request, { params: Promise.resolve({ id: 'test-quotation-id' }) })
      const json = await response.json()

      expect(response.status).toBe(409)
      expect(json.error_code).toBe('OPPORTUNITY_NOT_FOUND')
    })

    test('should proceed when can_proceed=true', async () => {
      const quotation = mockQuotation()
      const profile = mockProfile()

      mockSupabaseClient.single.mockResolvedValueOnce({ data: profile, error: null })
      mockSupabaseClient.single.mockResolvedValueOnce({ data: quotation, error: null })

      // Mock preflight RPC returning success
      mockAdminClient.rpc.mockResolvedValueOnce({
        data: {
          can_proceed: true,
          opportunity_id: 'test-opportunity-id',
          opportunity_stage: 'Quoting',
        },
        error: null,
      })

      // Mock subsequent RPC call for mark_sent
      mockAdminClient.rpc.mockResolvedValueOnce({
        data: {
          success: true,
          quotation_id: 'test-quotation-id',
          opportunity_id: 'test-opportunity-id',
        },
        error: null,
      })

      const { POST } = await import('../route')

      const request = new NextRequest('http://localhost/api/ticketing/customer-quotations/test-quotation-id/send', {
        method: 'POST',
        body: JSON.stringify({ method: 'email' }),
      })

      const response = await POST(request, { params: Promise.resolve({ id: 'test-quotation-id' }) })
      const json = await response.json()

      // Should proceed past preflight (either success or further error, but NOT preflight error)
      expect(json.error_code).not.toBe('AMBIGUOUS_OPPORTUNITY')
      expect(json.error_code).not.toBe('OPPORTUNITY_NOT_FOUND')
    })

    test('should skip preflight when quotation has no opportunity_id', async () => {
      const quotation = mockQuotation({ opportunity_id: null })
      const profile = mockProfile()

      mockSupabaseClient.single.mockResolvedValueOnce({ data: profile, error: null })
      mockSupabaseClient.single.mockResolvedValueOnce({ data: quotation, error: null })

      // Mock mark_sent RPC (preflight should be skipped)
      mockAdminClient.rpc.mockResolvedValueOnce({
        data: {
          success: true,
          quotation_id: 'test-quotation-id',
          opportunity_auto_created: true,
        },
        error: null,
      })

      const { POST } = await import('../route')

      const request = new NextRequest('http://localhost/api/ticketing/customer-quotations/test-quotation-id/send', {
        method: 'POST',
        body: JSON.stringify({ method: 'email' }),
      })

      const response = await POST(request, { params: Promise.resolve({ id: 'test-quotation-id' }) })

      // Verify preflight RPC was NOT called (only mark_sent should be called)
      const rpcCalls = mockAdminClient.rpc.mock.calls
      const preflightCall = rpcCalls.find((call: any[]) => call[0] === 'fn_preflight_quotation_send')
      expect(preflightCall).toBeUndefined()
    })
  })
})
