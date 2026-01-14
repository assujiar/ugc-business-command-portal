# QA Playbook - UGC Business Command Portal CRM

## Overview

This document provides a comprehensive QA testing guide for the CRM module. All test cases are derived from the SSOT PDF specification.

---

## 1. Prerequisites

### Environment Setup

1. **Supabase Project**: Create a Supabase project and note the URL and keys
2. **Environment Variables**: Copy `.env.example` to `.env.local` and fill in values
3. **Database Setup**: Run all migrations in order (001-011)
4. **Seed Data**: Run `supabase/seed.sql` to populate test data
5. **Auth Users**: Create test users in Supabase Auth matching seed data

### Test User Accounts

| Email | Role | Department |
|-------|------|------------|
| director@ugc.com | Director | Executive |
| admin@ugc.com | super admin | IT |
| marketing.mgr@ugc.com | Marketing Manager | Marketing |
| marcomm@ugc.com | Marcomm | Marketing |
| sales.mgr@ugc.com | sales manager | Sales |
| salesperson1@ugc.com | salesperson | Sales |
| salesperson2@ugc.com | salesperson | Sales |

**Default Password**: `Test123!`

---

## 2. Test Cases

### 2.1 Authentication & Authorization

#### TC-AUTH-001: Login Flow
**SOURCE: PDF Section 2**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/login` | Login page displays |
| 2 | Enter valid credentials | Redirect to `/dashboard` |
| 3 | Verify session | User profile shown in header |

#### TC-AUTH-002: Role-Based Navigation
**SOURCE: PDF Section 6**

| Role | Should See | Should NOT See |
|------|------------|----------------|
| Marketing Manager | Lead Inbox, Nurture, Disqualified | - |
| salesperson | Sales Inbox, My Leads, Pipeline | Lead Inbox (for marketing only leads) |
| Director | All pages | - |

#### TC-AUTH-003: Protected Routes
**SOURCE: PDF Section 2**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Access `/dashboard` without login | Redirect to `/login` |
| 2 | Access any CRM page without login | Redirect to `/login` |

---

### 2.2 Lead Inbox (Marketing)

#### TC-LEAD-001: View Lead Inbox
**SOURCE: PDF Page 16**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as marketing.mgr@ugc.com | Dashboard displays |
| 2 | Navigate to Lead Inbox | Shows leads with status New/In Review |
| 3 | Verify columns | Company, Contact, Status, Source, Priority visible |

#### TC-LEAD-002: Triage Lead - Mark In Review
**SOURCE: PDF Page 16**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find lead with status "New" | Lead row visible |
| 2 | Click Actions > Mark In Review | Status changes to "In Review" |
| 3 | Refresh page | Status persists |

#### TC-LEAD-003: Triage Lead - Qualify & Auto-Handover
**SOURCE: PDF Page 28-29**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select lead in "In Review" status | Lead selected |
| 2 | Click Actions > Qualify & Handover | Status changes to "Handed Over" |
| 3 | Check Sales Inbox | Lead appears in handover pool |
| 4 | Verify audit log | Action logged with timestamp |

#### TC-LEAD-004: Move to Nurture
**SOURCE: PDF Page 17**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select lead | Lead selected |
| 2 | Click Actions > Move to Nurture | Lead disappears from inbox |
| 3 | Navigate to Nurture Leads | Lead appears with correct data |

#### TC-LEAD-005: Disqualify Lead
**SOURCE: PDF Page 17**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select lead | Lead selected |
| 2 | Click Actions > Disqualify | Lead disappears from inbox |
| 3 | Navigate to Disqualified | Lead appears with timestamp |

---

### 2.3 Sales Inbox (Handover Pool)

#### TC-SALES-001: View Sales Inbox
**SOURCE: PDF Page 16**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as salesperson1@ugc.com | Dashboard displays |
| 2 | Navigate to Sales Inbox | Shows unclaimed leads |
| 3 | Verify priority ordering | Higher priority leads first |

#### TC-SALES-002: Claim Lead (Race-Safe)
**SOURCE: PDF Page 30**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find unclaimed lead | Claim button visible |
| 2 | Click Claim | Redirect to My Leads |
| 3 | Check Sales Inbox | Lead no longer visible |
| 4 | Verify in My Leads | Lead appears with your ownership |

#### TC-SALES-003: Claim Creates Account
**SOURCE: PDF Page 30**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Claim a lead | Claim succeeds |
| 2 | Navigate to Accounts | New account created with lead's company info |

#### TC-SALES-004: Race Condition Test
**SOURCE: PDF Page 30**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Sales Inbox in 2 browsers (different users) | Same leads visible |
| 2 | Both users click Claim on same lead | One succeeds, one fails |
| 3 | Failed user sees error | "Lead already claimed" message |

---

### 2.4 Pipeline Management

#### TC-PIPE-001: View Pipeline Board
**SOURCE: PDF Page 17**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Pipeline | Kanban board displays |
| 2 | Verify stages | Prospecting, Discovery, Quote Sent, Negotiation, On Hold |
| 3 | Verify card content | Name, Account, Value, Due Date visible |

#### TC-PIPE-002: Move Opportunity Stage
**SOURCE: PDF Page 31**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find opportunity in Prospecting | Card visible |
| 2 | Click menu > Move to Discovery | Card moves to Discovery column |
| 3 | Verify stage history | New entry in opportunity_stage_history |

#### TC-PIPE-003: Overdue Indicator
**SOURCE: PDF Page 17**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find opportunity with past due date | - |
| 2 | Verify indicator | Red overdue indicator shown |

---

### 2.5 Activities

#### TC-ACT-001: View Activities Planner
**SOURCE: PDF Page 24**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Activities | Activity list displays |
| 2 | Verify tabs | Planned and Completed tabs |
| 3 | Check planned activities | Sorted by due date ascending |

#### TC-ACT-002: Complete Activity
**SOURCE: PDF Page 32**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find planned activity | Done button visible |
| 2 | Click Done | Activity moves to Completed tab |
| 3 | Verify completed_at | Timestamp set |

#### TC-ACT-003: Overdue Activities
**SOURCE: PDF Page 24**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find activity with past due date | - |
| 2 | Verify styling | Red overdue indicator shown |

---

### 2.6 Prospecting Targets

#### TC-TGT-001: View Targets
**SOURCE: PDF Page 24**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Targets | Target list displays |
| 2 | Verify status badges | Different colors per status |

#### TC-TGT-002: Convert Target
**SOURCE: PDF Page 32**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find target with "meeting_scheduled" status | Convert button visible |
| 2 | Click Convert | Redirect to Pipeline |
| 3 | Verify Account | New account created |
| 4 | Verify Opportunity | New opportunity in Prospecting |

---

### 2.7 RLS Policy Tests

#### TC-RLS-001: Marketing Cannot See Claimed Leads
**SOURCE: PDF Page 25-27**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as marketing.mgr@ugc.com | - |
| 2 | Navigate to Sales Inbox | Access denied or empty |
| 3 | Try direct API call to /api/crm/views/sales-inbox | Returns only authorized data |

#### TC-RLS-002: Salesperson Only Sees Own Leads
**SOURCE: PDF Page 25-27**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as salesperson1@ugc.com | - |
| 2 | Navigate to My Leads | Only own claimed leads visible |
| 3 | Try to access other user's lead via API | Denied by RLS |

#### TC-RLS-003: Admin Sees All
**SOURCE: PDF Page 25-27**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as director@ugc.com | - |
| 2 | Navigate to any page | All data visible |

---

### 2.8 Atomic Operations (Idempotency)

#### TC-ATOM-001: Idempotent Triage
**SOURCE: PDF Page 28**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call triage API with idempotency_key | Success |
| 2 | Call same API with same key | Returns cached result |
| 3 | Verify database | Only one state change |

#### TC-ATOM-002: Idempotent Claim
**SOURCE: PDF Page 30**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call claim API with idempotency_key | Success |
| 2 | Call same API with same key | Returns cached result |
| 3 | Verify database | Lead only claimed once |

---

## 3. Integration Tests

### 3.1 Full Lead Lifecycle

**SOURCE: PDF Pages 25-32**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create new lead (Marketing) | Lead in "New" status |
| 2 | Mark as In Review | Status changes |
| 3 | Qualify & Handover | Appears in Sales Inbox |
| 4 | Claim Lead (Sales) | Account created, lead claimed |
| 5 | Convert to Opportunity | Opportunity in Pipeline |
| 6 | Progress through stages | Stage history recorded |
| 7 | Close Won | Opportunity completed |

---

## 4. API Endpoint Tests

### 4.1 Lead Endpoints

| Endpoint | Method | Auth Required | Test Cases |
|----------|--------|---------------|------------|
| `/api/crm/leads` | GET | Yes | List with filters |
| `/api/crm/leads` | POST | Yes | Create new lead |
| `/api/crm/leads/[id]` | GET | Yes | Single lead |
| `/api/crm/leads/[id]` | PATCH | Yes | Update lead |
| `/api/crm/leads/[id]/triage` | POST | Yes | Triage action |
| `/api/crm/leads/[id]/handover` | POST | Yes | Handover to sales |
| `/api/crm/leads/[id]/convert` | POST | Yes | Convert to opp |
| `/api/crm/leads/claim` | POST | Yes | Claim from pool |

### 4.2 Opportunity Endpoints

| Endpoint | Method | Auth Required | Test Cases |
|----------|--------|---------------|------------|
| `/api/crm/opportunities` | GET | Yes | List with filters |
| `/api/crm/opportunities` | POST | Yes | Create new opp |
| `/api/crm/opportunities/[id]` | GET | Yes | Single opp |
| `/api/crm/opportunities/[id]` | PATCH | Yes | Update opp |
| `/api/crm/opportunities/[id]/stage` | POST | Yes | Change stage |

---

## 5. Theme & UI Tests

### TC-THEME-001: Dark/Light Mode Toggle

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click theme toggle | Theme changes |
| 2 | Verify brand color | #FF4600 accent visible |
| 3 | Refresh page | Theme preference persisted |

### TC-THEME-002: Responsive Layout

| Breakpoint | Test |
|------------|------|
| Desktop (1280px+) | Full sidebar visible |
| Tablet (768px) | Sidebar collapsed |
| Mobile (375px) | Mobile navigation |

---

## 6. Error Handling Tests

### TC-ERR-001: API Error Responses

| Scenario | Expected |
|----------|----------|
| Unauthorized access | 401 with error message |
| Resource not found | 404 with error message |
| Validation error | 400 with field errors |
| Server error | 500 with generic message |

### TC-ERR-002: Form Validation

| Field | Validation | Error Message |
|-------|------------|---------------|
| Email | Format | "Invalid email format" |
| Required fields | Not empty | "This field is required" |
| Phone | Format | "Invalid phone format" |

---

## 7. Performance Benchmarks

| Metric | Target |
|--------|--------|
| Page load | < 2 seconds |
| API response | < 500ms |
| Database query | < 100ms |

---

## 8. Checklist Summary

### Pre-Release Checklist

- [ ] All migrations applied successfully
- [ ] Seed data loads without errors
- [ ] All test users can login
- [ ] Lead lifecycle flow works end-to-end
- [ ] RLS policies correctly restrict data
- [ ] Theme toggle works
- [ ] All API endpoints return correct data
- [ ] Idempotency prevents duplicates
- [ ] Race-safe claiming works
- [ ] Audit logs capture all actions

---

*Document Version: 1.0*
*SOURCE: UGC BCP CRM Target-State Architecture and Flow Specification PDF*
