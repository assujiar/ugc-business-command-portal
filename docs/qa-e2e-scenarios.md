# QA E2E Test Scenarios

## Overview

This document outlines manual E2E test scenarios for validating workflow transitions, role-based access, and error handling in the UGC Business Command Portal ticketing system.

---

## Test Environment Setup

### Prerequisites
- Access to staging environment
- Test accounts for each role:
  - Director
  - Sales Manager
  - Salesperson
  - EXIM Ops
  - Domestics Ops

### Test Data Requirements
- At least 1 RFQ ticket with quotation in 'draft' status
- At least 1 RFQ ticket with quotation in 'sent' status
- At least 1 ticket without quotation

---

## Scenario 1: Quotation Send Flow

### 1.1 Happy Path - Salesperson Sends Quotation

**Preconditions:**
- Login as Salesperson
- Have a ticket with quotation in 'draft' status

**Steps:**
1. Navigate to Ticketing > Customer Quotations
2. Open a quotation in 'draft' status
3. Click "Send Quotation" button
4. Confirm the action

**Expected Results:**
- [ ] Success toast appears with message
- [ ] Toast contains correlation_id
- [ ] Quotation status changes to 'sent'
- [ ] Ticket status changes to 'waiting_customer'
- [ ] Pipeline stage changes to 'Quote Sent'
- [ ] ticket_events shows audit entry with correlation_id
- [ ] Send button becomes disabled after successful send

### 1.2 Double-Click Protection

**Steps:**
1. Click "Send Quotation" rapidly twice

**Expected Results:**
- [ ] Only one request is sent (button disabled during loading)
- [ ] No duplicate events in audit trail
- [ ] No error messages

### 1.3 Already Sent - Idempotency

**Steps:**
1. Attempt to send an already-sent quotation (via direct API)

**Expected Results:**
- [ ] Returns success (idempotent)
- [ ] No duplicate audit entries
- [ ] Status remains 'sent'

---

## Scenario 2: Quotation Rejection Flow

### 2.1 Happy Path - Reject with Reason

**Preconditions:**
- Quotation in 'sent' status

**Steps:**
1. Open sent quotation
2. Click "Reject Quotation"
3. Select reason: "kompetitor_lebih_murah"
4. Enter competitor amount: 5000000
5. Add notes: "Test rejection"
6. Submit

**Expected Results:**
- [ ] Success toast with correlation_id
- [ ] Quotation status → 'rejected'
- [ ] Ticket status → 'need_adjustment'
- [ ] Pipeline stage → 'Negotiation'
- [ ] Rejection reason recorded
- [ ] ticket_events logged with correlation_id

### 2.2 Validation Error - Missing Required Field

**Steps:**
1. Select reason: "budget_customer_tidak_cukup"
2. Leave customer_budget empty
3. Submit

**Expected Results:**
- [ ] 422 response with field_errors
- [ ] Error message shows next to customer_budget field
- [ ] correlation_id in response
- [ ] Modal stays open (no auto-close)

### 2.3 Conflict - Wrong Status

**Steps:**
1. Try to reject a 'draft' quotation (via API)

**Expected Results:**
- [ ] 409 status code
- [ ] Error: "Invalid status transition"
- [ ] correlation_id in response

---

## Scenario 3: Quotation Accept Flow

### 3.1 Happy Path - Accept Quotation

**Preconditions:**
- Quotation in 'sent' status

**Steps:**
1. Open sent quotation
2. Click "Accept Quotation"
3. Confirm

**Expected Results:**
- [ ] Success toast with correlation_id
- [ ] Quotation status → 'accepted'
- [ ] Ticket status → 'closed' (close_outcome: 'won')
- [ ] Pipeline stage → 'Closed Won'
- [ ] Account status updated (if new account)
- [ ] SLA tracking resolution_at set

---

## Scenario 4: Request Adjustment Flow

### 4.1 Happy Path - Request Rate Adjustment

**Preconditions:**
- Ticket with operational cost in 'sent' status

**Steps:**
1. Open ticket detail
2. Click "Request Adjustment"
3. Select reason: "harga_terlalu_tinggi"
4. Enter suggested amount
5. Submit

**Expected Results:**
- [ ] Success toast with correlation_id
- [ ] Ticket status → 'need_adjustment'
- [ ] Operational cost status → 'revise_requested'
- [ ] ticket_events logged

### 4.2 Validation - Financial Reason Requires Amount

**Steps:**
1. Select reason: "tarif_tidak_masuk"
2. Leave amounts empty
3. Submit

**Expected Results:**
- [ ] 422 with field_errors
- [ ] Error message for competitor_amount field

---

## Scenario 5: Operational Cost Rejection Flow

### 5.1 Happy Path - Reject Operational Cost

**Preconditions:**
- Operational cost in 'sent' status

**Steps:**
1. Navigate to ticket with operational cost
2. Click "Reject" on operational cost
3. Select reason: "margin_tidak_mencukupi"
4. Enter suggested amount
5. Submit

**Expected Results:**
- [ ] Success response with correlation_id
- [ ] Operational cost status → 'revise_requested'
- [ ] ticket_events logged with correlation_id in notes

### 5.2 Error - Wrong Status

**Steps:**
1. Try to reject operational cost in 'draft' status

**Expected Results:**
- [ ] 409 status code
- [ ] error_code: "INVALID_STATUS_TRANSITION"
- [ ] correlation_id in response

---

## Scenario 6: Overview Dashboard - Role Scoping

### 6.1 Director - Full Access

**Steps:**
1. Login as Director
2. Navigate to Overview dashboard
3. View metrics

**Expected Results:**
- [ ] Can see all tickets across departments
- [ ] Department filter available
- [ ] All status distribution values shown

### 6.2 Salesperson - User Scope

**Steps:**
1. Login as Salesperson
2. View Overview dashboard

**Expected Results:**
- [ ] Only sees own tickets (created_by or assigned_to)
- [ ] No department filter override option
- [ ] Drilldown respects scoping

### 6.3 Ops Manager - Department Scope

**Steps:**
1. Login as EXIM Ops
2. View Overview dashboard

**Expected Results:**
- [ ] Sees only EXI department tickets
- [ ] Metrics scoped to department
- [ ] Cannot bypass scoping via query params

---

## Scenario 7: Drilldown with Pagination

### 7.1 Status Drilldown

**Steps:**
1. Click on "Open" status count in metrics
2. View drilldown list

**Expected Results:**
- [ ] Shows only tickets in 'open' status
- [ ] Pagination controls visible if > 100 tickets
- [ ] Minimal metadata returned (no N+1)

### 7.2 SLA Drilldown

**Steps:**
1. Click on "First Response Breached" metric

**Expected Results:**
- [ ] Shows only breached tickets
- [ ] first_response_met = false
- [ ] Pagination works correctly

---

## Scenario 8: Error Handling UI

### 8.1 403 Forbidden Display

**Steps:**
1. Attempt action without permission

**Expected Results:**
- [ ] Toast shows "Access Denied"
- [ ] correlation_id visible
- [ ] Clear message about permission

### 8.2 409 Conflict Display

**Steps:**
1. Attempt invalid state transition

**Expected Results:**
- [ ] Banner shows conflict error
- [ ] Suggestion to refresh
- [ ] correlation_id visible
- [ ] Modal stays open

### 8.3 422 Field Errors Display

**Steps:**
1. Submit form with validation errors

**Expected Results:**
- [ ] Errors display next to fields
- [ ] Modal stays open
- [ ] correlation_id in response

---

## Scenario 9: Refresh After Transition

### 9.1 UI Sync After Send

**Steps:**
1. Send quotation from detail page
2. Check all UI surfaces

**Expected Results:**
- [ ] Detail page shows new status immediately
- [ ] List view refreshes (if open)
- [ ] Pipeline view shows updated stage
- [ ] No stale data visible

### 9.2 Cross-Tab Refresh

**Steps:**
1. Open same quotation in 2 tabs
2. Send quotation in Tab 1
3. Check Tab 2

**Expected Results:**
- [ ] Tab 2 shows stale warning on next action
- [ ] Or implements real-time refresh via events

---

## Regression Test Checklist

### Build & Type Safety
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` completes
- [ ] `npx next lint` has no errors (warnings OK)

### API Consistency
- [ ] All transition endpoints return correlation_id
- [ ] All errors have error_code
- [ ] 422 for validation, 409 for conflicts, 403 for auth
- [ ] No PATCH status allowed (405)

### Constants Usage
- [ ] No hardcoded status strings in API routes
- [ ] UI uses constants for status comparison
- [ ] Reason types from constants SSOT

### Atomicity
- [ ] All transitions update all related entities
- [ ] No partial updates on failure
- [ ] Audit trail complete

### Idempotency
- [ ] Double-click doesn't create duplicates
- [ ] Re-sending sent quotation is safe
- [ ] Re-accepting accepted quotation is safe

---

## Test Results Template

| Scenario | Tester | Date | Pass/Fail | Notes |
|----------|--------|------|-----------|-------|
| 1.1 | | | | |
| 1.2 | | | | |
| 1.3 | | | | |
| 2.1 | | | | |
| 2.2 | | | | |
| 2.3 | | | | |
| 3.1 | | | | |
| 4.1 | | | | |
| 4.2 | | | | |
| 5.1 | | | | |
| 5.2 | | | | |
| 6.1 | | | | |
| 6.2 | | | | |
| 6.3 | | | | |
| 7.1 | | | | |
| 7.2 | | | | |
| 8.1 | | | | |
| 8.2 | | | | |
| 8.3 | | | | |
| 9.1 | | | | |
| 9.2 | | | | |

---

## Appendix: API Test Commands

### Test Quotation Send
```bash
curl -X POST /api/ticketing/customer-quotations/{id}/send \
  -H "Authorization: Bearer $TOKEN"
```

### Test Quotation Reject
```bash
curl -X POST /api/ticketing/customer-quotations/{id}/reject \
  -H "Content-Type: application/json" \
  -d '{
    "reason_type": "kompetitor_lebih_murah",
    "competitor_amount": 5000000,
    "notes": "Test"
  }'
```

### Test Invalid Transition (expect 409)
```bash
curl -X POST /api/ticketing/customer-quotations/{draft_id}/reject \
  -d '{"reason_type": "other"}'
```

### Test Overview Metrics
```bash
curl /api/ticketing/overview/metrics?ticket_type=RFQ&period=30
```

### Test Drilldown
```bash
curl /api/ticketing/overview/drilldown?metric=status_open&limit=50&offset=0
```
