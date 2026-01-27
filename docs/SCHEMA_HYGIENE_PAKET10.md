# Schema Hygiene Audit — Paket 10

**Generated**: 2026-01-27
**Purpose**: Audit schema for orphan tables, type mismatches, redundant objects, and missing indexes
**Approach**: Build dependency map, identify issues, propose safe cleanup with no breaking changes

---

## 1. EXECUTIVE SUMMARY

| Category | Findings |
|----------|----------|
| **Orphan Tables** | 5 tables with no code references |
| **Stub Tables** | 2 tables defined but never used |
| **Type Mismatches** | 8 function/variable type mismatches (2 HIGH severity) |
| **Missing Indexes** | 4 recommended indexes for heavy queries |
| **Duplicate Intent** | 1 potential redundancy identified |
| **Deprecated Functions** | 1 superseded function |

---

## 2. SCHEMA INVENTORY

### 2.1 Tables (45+ total)

#### Active Tables (Referenced in Code)
| Table | API Routes | Purpose |
|-------|------------|---------|
| `profiles` | All authenticated routes | User accounts & roles |
| `accounts` | `/api/crm/accounts/*` | Customer/company records |
| `contacts` | `/api/crm/accounts/*` | Person contacts |
| `leads` | `/api/crm/leads/*` | Marketing leads |
| `lead_handover_pool` | `/api/crm/leads/claim` | Lead queue for sales |
| `opportunities` | `/api/crm/opportunities/*`, `/api/crm/pipeline/*` | Sales deals |
| `opportunity_stage_history` | `/api/crm/pipeline/*` | Stage audit trail |
| `activities` | `/api/crm/activities/*` | Tasks, calls, meetings |
| `pipeline_updates` | `/api/crm/pipeline/*` | Activity records |
| `tickets` | `/api/ticketing/tickets/*` | Support tickets |
| `ticket_events` | `/api/ticketing/*` | Ticket audit trail |
| `ticket_comments` | `/api/ticketing/tickets/[id]/comments` | Communications |
| `ticket_rate_quotes` | `/api/ticketing/operational-costs/*` | Ops cost quotes |
| `ticket_rate_quote_items` | `/api/ticketing/operational-costs/*` | Cost breakdown |
| `customer_quotations` | `/api/ticketing/customer-quotations/*` | Customer quotes |
| `customer_quotation_items` | `/api/ticketing/customer-quotations/*` | Quote breakdown |
| `ticket_sla_tracking` | `/api/ticketing/*` | SLA performance |
| `ticket_responses` | Triggers | Response tracking |
| `ticket_response_exchanges` | Triggers | Exchange analytics |
| `ticket_response_metrics` | Triggers | Aggregated metrics |
| `quotation_rejection_reasons` | `/api/ticketing/*` | Rejection tracking |
| `operational_cost_rejection_reasons` | `/api/ticketing/*` | Cost rejection |
| `shipment_details` | `/api/crm/leads/*` | Shipment specs |
| `import_batches` | `/api/crm/imports/*` | Bulk import jobs |
| `sales_plans` | `/api/crm/sales-plans/*` | Sales planning |
| `insights_growth` | `/api/crm/insights/*` | AI insights |
| `quotation_term_templates` | `/api/ticketing/customer-quotations/terms` | Default terms |

#### ⚠️ Orphan Tables (No Code References)
| Table | Migration | Evidence | Recommendation |
|-------|-----------|----------|----------------|
| `cadences` | 006 | Type defs only, no API/RPC usage | DEPRECATE |
| `cadence_steps` | 006 | No implementation | DEPRECATE |
| `cadence_enrollments` | 006 | FK exists but never populated | DEPRECATE |
| `prospecting_targets` | 007 | Zero code references in src/ | DEPRECATE |
| `target_status_transitions` | 007 | Config table, no usage | DEPRECATE |

#### ⚠️ Stub Tables (Defined but Unused)
| Table | Migration | Evidence | Recommendation |
|-------|-----------|----------|----------------|
| `audit_logs` | 008 | Helper functions exist, never called | IMPLEMENT or REMOVE |
| `crm_idempotency` | 008 | `check_idempotency`/`store_idempotency` defined but unused | IMPLEMENT or REMOVE |

---

### 2.2 Views (15 total)

| View | Source Migration | Status |
|------|------------------|--------|
| `v_lead_inbox` | 009, updated 020-021 | ✓ Active |
| `v_sales_inbox` | 009 | ✓ Active |
| `v_my_leads` | 009 | ✓ Active |
| `v_nurture_leads` | 009 | ✓ Active |
| `v_disqualified_leads` | 009 | ✓ Active |
| `v_accounts_enriched` | 009 | ✓ Active |
| `v_accounts_with_status` | 009 | ✓ Active |
| `v_pipeline_active` | 009, updated 025-030 | ✓ Active |
| `v_pipeline_with_updates` | 009 | ✓ Active |
| `v_activities_planner` | 009 | ✓ Active |
| `v_activities_unified` | 009 | ✓ Active |
| `v_targets_active` | 009 | ⚠️ Orphan (prospecting_targets unused) |
| `v_lead_management` | 009 | ✓ Active |
| `v_lead_bidding` | 009 | ✓ Active |
| `v_latest_operational_costs` | 092 | ✓ Active |

---

### 2.3 Functions & RPCs (70+ total)

#### Active Functions by Category

**CRM Core** (11 rpc_functions.sql):
- `rpc_lead_triage`, `rpc_lead_handover_to_sales_pool`, `rpc_sales_claim_lead`
- `rpc_lead_convert`, `rpc_opportunity_change_stage`, `rpc_target_convert`
- `rpc_activity_complete_and_next`, `rpc_cadence_advance`

**Ticketing** (037, 054):
- `rpc_ticket_create`, `rpc_ticket_assign`, `rpc_ticket_transition`
- `rpc_ticket_add_comment`, `rpc_ticket_create_quote`, `generate_ticket_code`

**Customer Quotations** (050, 078, 087):
- `rpc_create_customer_quotation`, `rpc_update_quotation_status`
- `rpc_customer_quotation_mark_sent/rejected/accepted`
- `rpc_customer_quotation_sync_from_status`, `rpc_force_sync_quotation`

**Operational Costs** (052, 076, 091, 092):
- `rpc_ticket_submit_quote`, `rpc_ticket_quote_sent_to_customer`
- `rpc_reject_operational_cost_with_reason`
- `rpc_ticket_request_adjustment`, `rpc_ticket_set_need_adjustment`
- `fn_resolve_latest_operational_cost`

**Analytics** (077, 093):
- `rpc_get_sla_metrics`, `rpc_get_sla_compliance_tickets`
- `rpc_ticketing_overview_v2` (latest dashboard)

#### ⚠️ Deprecated/Superseded Functions
| Function | Superseded By | Migration |
|----------|---------------|-----------|
| `rpc_ticketing_dashboard_summary` | `rpc_ticketing_overview_v2` | 037 → 093 |

---

### 2.4 Triggers (20+ total)

| Trigger | Table | Status |
|---------|-------|--------|
| `trg_account_id` | accounts | ✓ Active |
| `trg_contact_id` | contacts | ✓ Active |
| `trg_lead_id` | leads | ✓ Active |
| `trg_activity_id` | activities | ✓ Active |
| `trg_opportunity_id` | opportunities | ✓ Active |
| `trg_target_id` | prospecting_targets | ⚠️ Orphan (table unused) |
| `trg_log_stage_change` | opportunities | ✓ Active |
| `trg_quotation_status_sync` | customer_quotations | ✓ Active |
| `trg_mirror_ticket_event_to_responses` | ticket_events | ✓ Active |
| `trg_sync_cost_submission_to_ticket` | ticket_rate_quotes | ✓ Active |

---

### 2.5 Enums

All enums are actively used. Key types:
- `lead_triage_status`, `opportunity_stage`, `ticket_status`
- `customer_quotation_status`, `quote_status`
- `ticket_event_type` (extended across multiple migrations)
- `quotation_rejection_reason_type`, `operational_cost_rejection_reason_type`

---

## 3. TYPE MISMATCH ANALYSIS

### 3.1 Critical Type Mismatches (HIGH Severity)

#### Issue 1: `get_account_pipeline_summary` - account_id UUID vs TEXT
**File**: `supabase/migrations/065_fix_pipeline_auto_close_and_deal_value.sql`
**Line**: 344

```sql
-- WRONG: account_id is TEXT in schema, not UUID
CREATE OR REPLACE FUNCTION public.get_account_pipeline_summary(p_account_id UUID)
```

**Impact**: Function will fail at runtime when called with TEXT account_id values.
**Fix Required**: Change parameter type from UUID to TEXT.

#### Issue 2: `is_marketing_creator` - opportunity_id UUID vs TEXT
**File**: `supabase/migrations/075_comprehensive_crm_ticketing_enhancements.sql`
**Lines**: 331-333

```sql
-- WRONG: opportunity_id is TEXT in schema, not UUID
CREATE OR REPLACE FUNCTION public.is_marketing_creator(
    p_user_id UUID,
    p_opportunity_id UUID  -- Should be TEXT
)
```

**Impact**: Marketing visibility checks will fail.
**Fix Required**: Change parameter type from UUID to TEXT.

---

### 3.2 Medium Severity Type Mismatches

| Migration | Function/Variable | Declared Type | Column Type | Issue |
|-----------|-------------------|---------------|-------------|-------|
| 082 | `sync_ticket_to_quotation.p_ticket_id` | TEXT | UUID | Requires casting |
| 081 | `v_derived_opportunity_id` | UUID | TEXT | Variable type wrong |
| 083 | `v_derived_opportunity_id` | UUID | TEXT | Variable type wrong |
| 087 | `v_derived_opportunity_id` | UUID | TEXT | Variable type wrong |
| 088 | `v_derived_opportunity_id` | UUID | TEXT | Variable type wrong |
| 089 | `v_derived_opportunity_id` | UUID | TEXT | Variable type wrong |

---

### 3.3 Root Cause

The CRM module uses **TEXT primary keys** for business entities:
- `lead_id`: TEXT (e.g., "LD-0001")
- `opportunity_id`: TEXT (e.g., "OPP-0001")
- `account_id`: TEXT (e.g., "ACC-0001")

The Ticketing module uses **UUID primary keys**:
- `ticket_id`: UUID
- `quotation_id`: UUID

When functions cross module boundaries, type mismatches occur.

---

## 4. INDEX ANALYSIS

### 4.1 Existing Indexes (100+)

Key index patterns identified:
- Lookup indexes on `status`, `owner`, `created_at`
- Composite indexes on `(owner, status)`, `(ticket_id, created_at)`
- Partial indexes for common filters (e.g., `WHERE status = 'Planned'`)

### 4.2 Recommended Missing Indexes

Based on heavy query patterns in API routes:

| Table | Recommended Index | Reason |
|-------|-------------------|--------|
| `tickets` | `(assigned_to, status)` | Frequent filter in dashboard queries |
| `ticket_events` | `(ticket_id, event_type)` | Common lookup pattern |
| `customer_quotations` | `(created_by, status)` | User's quotations query |
| `pipeline_updates` | `(updated_by, created_at DESC)` | User activity feed |

### 4.3 Index Creation SQL

```sql
-- Recommended indexes for heavy queries
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_status
ON public.tickets(assigned_to, status);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_type
ON public.ticket_events(ticket_id, event_type);

CREATE INDEX IF NOT EXISTS idx_customer_quotations_created_by_status
ON public.customer_quotations(created_by, status);

CREATE INDEX IF NOT EXISTS idx_pipeline_updates_user_date
ON public.pipeline_updates(updated_by, created_at DESC);
```

---

## 5. DUPLICATE INTENT ANALYSIS

### 5.1 Potential Redundancy: audit_logs vs ticket_events

| Table | Purpose | Status |
|-------|---------|--------|
| `audit_logs` | Generic audit trail | UNUSED |
| `ticket_events` | Ticket-specific audit trail | ACTIVE |

**Analysis**: `ticket_events` provides comprehensive audit for ticketing. `audit_logs` was intended for broader CRM audit but never implemented.

**Recommendation**: Either implement `audit_logs` for CRM operations OR remove it entirely. Do not maintain duplicate audit strategies.

---

## 6. CLEANUP PACKAGES

### Package A: Orphan Table Deprecation (Low Risk)

**Tables to deprecate**:
1. `cadences`
2. `cadence_steps`
3. `cadence_enrollments`
4. `prospecting_targets`
5. `target_status_transitions`

**Deprecation Plan**:
```sql
-- Step 1: Add deprecation comments (non-breaking)
COMMENT ON TABLE public.cadences IS 'DEPRECATED: Feature not implemented. Do not use.';
COMMENT ON TABLE public.cadence_steps IS 'DEPRECATED: Feature not implemented. Do not use.';
COMMENT ON TABLE public.cadence_enrollments IS 'DEPRECATED: Feature not implemented. Do not use.';
COMMENT ON TABLE public.prospecting_targets IS 'DEPRECATED: Feature not implemented. Do not use.';
COMMENT ON TABLE public.target_status_transitions IS 'DEPRECATED: Feature not implemented. Do not use.';

-- Step 2: Remove related triggers (non-breaking since tables unused)
DROP TRIGGER IF EXISTS trg_target_id ON public.prospecting_targets;

-- Step 3: Remove related views
DROP VIEW IF EXISTS public.v_targets_active;

-- Step 4: Remove related functions (after verifying no calls)
-- rpc_target_convert, rpc_cadence_advance - verify no API routes use these
```

**Verification**:
```bash
# Confirm no code references
grep -r "cadences" src/ --include="*.ts" --include="*.tsx"
grep -r "prospecting_targets" src/ --include="*.ts" --include="*.tsx"
grep -r "rpc_target_convert" src/ --include="*.ts" --include="*.tsx"
grep -r "rpc_cadence_advance" src/ --include="*.ts" --include="*.tsx"
```

**Rollback Plan**:
```sql
-- Remove deprecation comments
COMMENT ON TABLE public.cadences IS NULL;
-- etc.
```

---

### Package B: Type Mismatch Fixes (Medium Risk)

**Migration**: `097_fix_type_mismatches.sql`

```sql
-- ============================================
-- Migration: 097_fix_type_mismatches.sql
-- PURPOSE: Fix function parameter type mismatches
-- ============================================

-- FIX 1: get_account_pipeline_summary - change UUID to TEXT
CREATE OR REPLACE FUNCTION public.get_account_pipeline_summary(p_account_id TEXT)
RETURNS JSONB AS $$
-- ... copy existing function body ...
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FIX 2: is_marketing_creator - change UUID to TEXT
CREATE OR REPLACE FUNCTION public.is_marketing_creator(
    p_user_id UUID,
    p_opportunity_id TEXT  -- Changed from UUID
) RETURNS BOOLEAN AS $$
-- ... copy existing function body ...
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

**Testing Required**:
1. Run existing API tests
2. Verify dashboard loads correctly
3. Test marketing visibility checks

**Rollback Plan**:
```sql
-- Restore original function signatures if issues arise
CREATE OR REPLACE FUNCTION public.get_account_pipeline_summary(p_account_id UUID)
-- ... original body ...
```

---

### Package C: Stub Table Decision (Requires Product Decision)

**Option 1: Implement**
- Complete `audit_logs` integration for CRM operations
- Implement `crm_idempotency` for duplicate request prevention

**Option 2: Remove**
```sql
-- Remove unused stub tables
DROP TABLE IF EXISTS public.crm_idempotency;
DROP TABLE IF EXISTS public.audit_logs;

-- Remove related functions
DROP FUNCTION IF EXISTS public.check_idempotency;
DROP FUNCTION IF EXISTS public.store_idempotency;
```

**Recommendation**: Remove unless there's a concrete plan to implement within 3 months.

---

### Package D: Performance Indexes (Low Risk)

**Migration**: `098_add_performance_indexes.sql`

```sql
-- ============================================
-- Migration: 098_add_performance_indexes.sql
-- PURPOSE: Add indexes for heavy query patterns
-- ============================================

CREATE INDEX IF NOT EXISTS idx_tickets_assigned_status
ON public.tickets(assigned_to, status);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_type
ON public.ticket_events(ticket_id, event_type);

CREATE INDEX IF NOT EXISTS idx_customer_quotations_created_by_status
ON public.customer_quotations(created_by, status);

CREATE INDEX IF NOT EXISTS idx_pipeline_updates_user_date
ON public.pipeline_updates(updated_by, created_at DESC);

-- Analyze tables to update statistics
ANALYZE public.tickets;
ANALYZE public.ticket_events;
ANALYZE public.customer_quotations;
ANALYZE public.pipeline_updates;
```

**Rollback Plan**:
```sql
DROP INDEX IF EXISTS idx_tickets_assigned_status;
DROP INDEX IF EXISTS idx_ticket_events_ticket_type;
DROP INDEX IF EXISTS idx_customer_quotations_created_by_status;
DROP INDEX IF EXISTS idx_pipeline_updates_user_date;
```

---

## 7. QUALITY GATES

### Gate 1: No API Route Breakage
**Test**: All API routes must return 2xx status codes

```bash
# Run API integration tests
npm run test:api

# Manual smoke test critical endpoints
curl -X GET /api/crm/leads
curl -X GET /api/crm/opportunities
curl -X GET /api/ticketing/tickets
curl -X GET /api/ticketing/customer-quotations
```

### Gate 2: FK Integrity Valid
**Test**: No orphaned foreign keys after changes

```sql
-- Check for orphaned FKs
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public';
```

### Gate 3: RLS Policies Intact
**Test**: All RLS policies still apply correctly

```sql
-- Verify RLS is enabled on key tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'accounts', 'leads', 'opportunities', 'tickets');
```

### Gate 4: Type Safety
**Test**: No runtime type errors in function calls

```sql
-- Test fixed functions
SELECT get_account_pipeline_summary('ACC-0001');  -- Should work with TEXT
SELECT is_marketing_creator('uuid-here'::UUID, 'OPP-0001');  -- Should work with TEXT
```

### Gate 5: Performance Regression
**Test**: Dashboard queries must complete within 2 seconds

```sql
-- Benchmark overview query
EXPLAIN ANALYZE SELECT * FROM rpc_ticketing_overview_v2('user-uuid'::UUID);
```

---

## 8. DEPENDENCY MAP

### API Route → Database Dependencies

```
/api/crm/leads
├── READS: profiles, leads, accounts, shipment_details
├── WRITES: leads, accounts, opportunities, shipment_details
└── RPC: rpc_lead_triage, rpc_lead_convert

/api/crm/opportunities
├── READS: profiles, opportunities, accounts
├── WRITES: opportunities, opportunity_stage_history, pipeline_updates
└── RPC: rpc_opportunity_change_stage

/api/ticketing/tickets
├── READS: profiles, tickets, accounts, contacts, ticket_sla_tracking
├── WRITES: tickets, ticket_events
└── RPC: rpc_ticket_create, rpc_ticket_assign, rpc_ticket_transition

/api/ticketing/customer-quotations
├── READS: profiles, customer_quotations, tickets, leads, opportunities
├── WRITES: customer_quotations, customer_quotation_items, ticket_events
├── RPC: fn_resolve_latest_operational_cost, generate_customer_quotation_number
└── TRIGGERS: trg_quotation_status_sync

/api/ticketing/operational-costs
├── READS: profiles, ticket_rate_quotes, ticket_rate_quote_items
├── WRITES: ticket_rate_quotes, ticket_rate_quote_items
├── RPC: rpc_ticket_create_quote, rpc_ticket_submit_quote
└── TRIGGERS: trg_sync_cost_submission_to_ticket
```

---

## 9. IMPLEMENTATION PRIORITY

| Priority | Package | Risk | Effort | Benefit |
|----------|---------|------|--------|---------|
| 1 | **D: Performance Indexes** | Low | Low | Immediate query improvement |
| 2 | **B: Type Mismatch Fixes** | Medium | Medium | Prevent runtime errors |
| 3 | **A: Orphan Deprecation** | Low | Low | Reduce maintenance burden |
| 4 | **C: Stub Table Decision** | Low | Medium | Clean schema |

---

## 10. NEXT STEPS

1. **Immediate**: Apply Package D (performance indexes) - no breaking changes
2. **This Sprint**: Apply Package B (type fixes) with testing
3. **Next Sprint**: Apply Package A (deprecation comments)
4. **Backlog**: Product decision on Package C (audit_logs/idempotency)

---

## 11. FILES REFERENCED

| File | Purpose |
|------|---------|
| `supabase/existing_scheme/daftar_tabel.md` | Table schema SSOT |
| `supabase/existing_scheme/daftar_function.md` | Function signatures SSOT |
| `supabase/existing_scheme/daftar_trigger.md` | Trigger definitions SSOT |
| `supabase/existing_scheme/daftar_index.md` | Index inventory SSOT |
| `supabase/existing_scheme/daftar_enum.md` | Enum types SSOT |
| `supabase/migrations/065_*.sql` | Type mismatch source (get_account_pipeline_summary) |
| `supabase/migrations/075_*.sql` | Type mismatch source (is_marketing_creator) |
| `supabase/migrations/006_*.sql` | Orphan tables (cadences) |
| `supabase/migrations/007_*.sql` | Orphan tables (targets) |
| `supabase/migrations/008_*.sql` | Stub tables (audit_logs, crm_idempotency) |

---

**END OF SCHEMA HYGIENE AUDIT**
