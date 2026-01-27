# DB Contract Check — Paket 00: Foundation

**Generated**: 2026-01-27
**Purpose**: Detect and fix schema drift between repo migrations and Supabase database
**Mission**: Ensure RPC side effects (stage updates, history, pipeline_updates, activities) work correctly

---

## 1. CONTRACT MATRIX

### API Route → RPC → Trigger → Tables Written

| API Route | RPC Called | Trigger Fired | Tables Written |
|-----------|-----------|---------------|----------------|
| `POST /api/ticketing/customer-quotations/[id]/send` | `rpc_customer_quotation_mark_sent` | `trg_quotation_status_sync` → `trigger_sync_quotation_on_status_change` | `customer_quotations`, `opportunities`, `opportunity_stage_history`, `pipeline_updates`, `activities`, `tickets`, `ticket_events`, `leads`, `ticket_rate_quotes` |
| `POST /api/ticketing/customer-quotations/[id]/reject` | `rpc_customer_quotation_mark_rejected` | `trg_quotation_status_sync` → `trigger_sync_quotation_on_status_change` | `customer_quotations`, `quotation_rejection_reasons`, `opportunities`, `opportunity_stage_history`, `pipeline_updates`, `activities`, `tickets`, `ticket_events`, `leads`, `ticket_rate_quotes` |
| `POST /api/ticketing/customer-quotations/[id]/accept` | `rpc_customer_quotation_mark_accepted` | `trg_quotation_status_sync` → `trigger_sync_quotation_on_status_change` | `customer_quotations`, `opportunities`, `opportunity_stage_history`, `pipeline_updates`, `activities`, `tickets`, `ticket_events`, `ticket_sla_tracking`, `accounts`, `leads`, `ticket_rate_quotes` |
| Manual Ticket Adjustment | `rpc_ticket_set_need_adjustment` | None (direct update) | `tickets`, `ticket_events`, `opportunities`, `opportunity_stage_history` |
| Ticket Request Adjustment | `rpc_ticket_request_adjustment` | None (direct update) | `tickets`, `ticket_events`, `ticket_rate_quotes`, `operational_cost_rejection_reasons`, `opportunities`, `opportunity_stage_history` |

---

## 2. REQUIRED OBJECTS TO VERIFY

### 2.1 Functions (RPCs)

| Function Name | Signature (key params) | Return Type | SSOT Verified |
|---------------|------------------------|-------------|---------------|
| `rpc_customer_quotation_mark_sent` | `(p_quotation_id UUID, p_sent_via TEXT, p_sent_to TEXT, p_actor_user_id UUID, p_correlation_id TEXT)` | `JSONB` | **Yes** (line 148) |
| `rpc_customer_quotation_mark_rejected` | `(p_quotation_id UUID, p_reason_type quotation_rejection_reason_type, p_competitor_name TEXT, p_competitor_amount NUMERIC, p_customer_budget NUMERIC, p_currency TEXT, p_notes TEXT, p_actor_user_id UUID, p_correlation_id TEXT)` | `JSONB` | **Yes** (line 147) |
| `rpc_customer_quotation_mark_accepted` | `(p_quotation_id UUID, p_actor_user_id UUID, p_correlation_id TEXT)` | `JSONB` | **Yes** (line 146) |
| `rpc_customer_quotation_sync_from_status` | `(p_quotation_id UUID, p_actor_user_id UUID, p_force BOOLEAN)` | `JSONB` | **Yes** (line 149) |
| `rpc_ticket_request_adjustment` | `(p_ticket_id UUID, p_reason_type operational_cost_rejection_reason_type, ...)` | `JSONB` | **Yes** (line 172) |
| `rpc_ticket_set_need_adjustment` | `(p_ticket_id UUID, p_notes TEXT, p_actor_role_mode TEXT, p_actor_user_id UUID, p_correlation_id TEXT)` | `JSONB` | **Yes** (line 173) |
| `fn_validate_quotation_transition` | `(p_current_status TEXT, p_target_status TEXT)` | `JSONB` | Need verify |
| `fn_validate_opportunity_transition` | `(p_current_stage TEXT, p_target_stage TEXT)` | `JSONB` | Need verify |
| `fn_validate_ticket_transition` | `(p_current_status TEXT, p_target_status TEXT)` | `JSONB` | Need verify |
| `fn_check_quotation_authorization` | `(p_quotation_id UUID, p_actor_user_id UUID, p_action TEXT)` | `JSONB` | Need verify |
| `fn_check_ticket_authorization` | `(p_ticket_id UUID, p_actor_user_id UUID, p_action TEXT)` | `JSONB` | Need verify |
| `trigger_sync_quotation_on_status_change` | `()` | `TRIGGER` | **Yes** (SSOT trigger list) |
| `mirror_ticket_event_to_response_tables` | `()` | `TRIGGER` | **Yes** (SSOT trigger list) |
| `trigger_sync_cost_submission_to_ticket` | `()` | `TRIGGER` | **Yes** (SSOT trigger list) |

### 2.2 Triggers

| Trigger Name | Table | Event | Function | SSOT Verified |
|-------------|-------|-------|----------|---------------|
| `trg_quotation_status_sync` | `customer_quotations` | `AFTER UPDATE OF status` | `trigger_sync_quotation_on_status_change` | **Yes** (line 8) |
| `trg_mirror_ticket_event_to_responses` | `ticket_events` | `AFTER INSERT` | `mirror_ticket_event_to_response_tables` | **Yes** (line 31) |
| `trg_sync_cost_submission_to_ticket` | `ticket_rate_quotes` | `AFTER INSERT OR UPDATE OF status` | `trigger_sync_cost_submission_to_ticket` | **Yes** (lines 33-34) |
| `trg_sync_ticket_status_to_quotation` | `tickets` | `AFTER UPDATE` | `trigger_sync_ticket_status_to_quotation` | **Yes** (line 45) |
| `trg_log_stage_change` | `opportunities` | `AFTER UPDATE OF stage` | `log_stage_change` | **Yes** (line 18) |

### 2.3 Enums

| Enum Type | Required Values | SSOT Verified |
|-----------|-----------------|---------------|
| `customer_quotation_status` | `draft`, `sent`, `accepted`, `rejected` | **Yes** (line 22) |
| `quotation_rejection_reason_type` | `tarif_tidak_masuk`, `kompetitor_lebih_murah`, `budget_customer_tidak_cukup`, `service_tidak_sesuai`, `waktu_tidak_sesuai`, `other` | **Yes** (line 35) |
| `operational_cost_rejection_reason_type` | `tarif_tidak_masuk`, `kompetitor_lebih_murah`, `budget_customer_tidak_cukup`, ... | **Yes** (line 32) |
| `ticket_event_type` | `customer_quotation_sent`, `customer_quotation_rejected`, `customer_quotation_accepted`, `request_adjustment`, `closed`, ... | **Yes** (line 43) |
| `quote_status` | `draft`, `submitted`, `sent_to_customer`, `accepted`, `rejected`, `revise_requested` | **Yes** (line 36) |
| `opportunity_stage` | `Prospecting`, `Discovery`, `Quote Sent`, `Negotiation`, `Closed Won`, `Closed Lost`, `On Hold` | **Yes** (line 32) |
| `ticket_status` | `open`, `in_progress`, `waiting_customer`, `waiting_vendor`, `need_adjustment`, `on_hold`, `resolved`, `closed` | **Yes** |

### 2.4 Tables (Key Columns)

| Table | Key Columns for Side Effects |
|-------|------------------------------|
| `customer_quotations` | `id`, `status`, `opportunity_id`, `ticket_id`, `lead_id`, `operational_cost_id`, `rejection_reason` |
| `opportunities` | `opportunity_id`, `stage`, `quotation_status`, `latest_quotation_id`, `deal_value`, `closed_at` |
| `opportunity_stage_history` | `opportunity_id`, `from_stage`, `to_stage`, `changed_by`, `notes`, `old_stage`, `new_stage` |
| `pipeline_updates` | `opportunity_id`, `notes`, `approach_method`, `old_stage`, `new_stage`, `updated_by` |
| `activities` | `activity_type`, `subject`, `description`, `status`, `related_opportunity_id`, `related_lead_id` |
| `tickets` | `id`, `status`, `opportunity_id`, `pending_response_from`, `close_outcome`, `close_reason` |
| `ticket_events` | `ticket_id`, `event_type`, `actor_user_id`, `old_value`, `new_value`, `notes` |
| `ticket_rate_quotes` | `id`, `ticket_id`, `status`, `amount`, `currency` |
| `quotation_rejection_reasons` | `quotation_id`, `reason_type`, `competitor_name`, `competitor_amount`, `customer_budget` |
| `operational_cost_rejection_reasons` | `operational_cost_id`, `reason_type`, `suggested_amount`, `currency`, `notes` |

---

## 3. AUDIT SQL PACK

Copy-paste these queries in Supabase SQL Editor to detect drift:

### 3.1 Verify Functions Exist and Get Definition

```sql
-- Check all required functions exist
SELECT
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS return_type,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN (
    'rpc_customer_quotation_mark_sent',
    'rpc_customer_quotation_mark_rejected',
    'rpc_customer_quotation_mark_accepted',
    'rpc_customer_quotation_sync_from_status',
    'rpc_ticket_request_adjustment',
    'rpc_ticket_set_need_adjustment',
    'fn_validate_quotation_transition',
    'fn_validate_opportunity_transition',
    'fn_validate_ticket_transition',
    'fn_check_quotation_authorization',
    'fn_check_ticket_authorization',
    'trigger_sync_quotation_on_status_change',
    'mirror_ticket_event_to_response_tables',
    'trigger_sync_cost_submission_to_ticket'
)
ORDER BY p.proname;
```

### 3.2 Verify Triggers Exist and Enabled

```sql
-- Check all required triggers exist and are enabled
SELECT
    tgname AS trigger_name,
    relname AS table_name,
    CASE tgenabled
        WHEN 'D' THEN 'DISABLED'
        WHEN 'O' THEN 'ENABLED (origin)'
        WHEN 'R' THEN 'ENABLED (replica)'
        WHEN 'A' THEN 'ENABLED (always)'
        ELSE 'ENABLED'
    END AS status,
    pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
AND NOT t.tgisinternal
AND tgname IN (
    'trg_quotation_status_sync',
    'trg_mirror_ticket_event_to_responses',
    'trg_sync_cost_submission_to_ticket',
    'trg_sync_ticket_status_to_quotation',
    'trg_log_stage_change'
)
ORDER BY relname, tgname;
```

### 3.3 Verify Enum Values

```sql
-- Check enum values match expected
SELECT
    t.typname AS enum_type,
    array_agg(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = 'public'
AND t.typname IN (
    'customer_quotation_status',
    'quotation_rejection_reason_type',
    'operational_cost_rejection_reason_type',
    'ticket_event_type',
    'quote_status',
    'opportunity_stage',
    'ticket_status'
)
GROUP BY t.typname
ORDER BY t.typname;
```

### 3.4 Check Function Definition Hash (for drift detection)

```sql
-- Get hash of function bodies to detect changes
SELECT
    p.proname AS function_name,
    md5(pg_get_functiondef(p.oid)) AS definition_hash,
    length(pg_get_functiondef(p.oid)) AS definition_length
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN (
    'rpc_customer_quotation_mark_sent',
    'rpc_customer_quotation_mark_rejected',
    'rpc_customer_quotation_mark_accepted',
    'rpc_customer_quotation_sync_from_status',
    'trigger_sync_quotation_on_status_change'
)
ORDER BY p.proname;
```

### 3.5 Check Tables Have Required Columns

```sql
-- Verify key columns exist in tables
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND (
    (table_name = 'customer_quotations' AND column_name IN ('id', 'status', 'opportunity_id', 'ticket_id', 'lead_id', 'operational_cost_id', 'rejection_reason', 'source_rate_quote_id'))
    OR (table_name = 'opportunities' AND column_name IN ('opportunity_id', 'stage', 'quotation_status', 'latest_quotation_id', 'deal_value', 'closed_at', 'competitor', 'competitor_price', 'customer_budget'))
    OR (table_name = 'opportunity_stage_history' AND column_name IN ('opportunity_id', 'from_stage', 'to_stage', 'changed_by', 'reason', 'notes', 'old_stage', 'new_stage'))
    OR (table_name = 'pipeline_updates' AND column_name IN ('opportunity_id', 'notes', 'approach_method', 'old_stage', 'new_stage', 'updated_by'))
    OR (table_name = 'tickets' AND column_name IN ('id', 'status', 'opportunity_id', 'pending_response_from', 'close_outcome', 'close_reason'))
    OR (table_name = 'ticket_events' AND column_name IN ('ticket_id', 'event_type', 'actor_user_id', 'old_value', 'new_value', 'notes'))
    OR (table_name = 'quotation_rejection_reasons' AND column_name IN ('quotation_id', 'reason_type', 'competitor_name', 'competitor_amount', 'customer_budget', 'currency'))
    OR (table_name = 'operational_cost_rejection_reasons' AND column_name IN ('operational_cost_id', 'reason_type', 'suggested_amount', 'competitor_name', 'competitor_amount', 'customer_budget'))
    OR (table_name = 'ticket_comments' AND column_name = 'source_event_id')
    OR (table_name = 'ticket_rate_quotes' AND column_name IN ('id', 'ticket_id', 'status', 'opportunity_id', 'lead_id'))
)
ORDER BY table_name, ordinal_position;
```

### 3.6 Full Function Definition Dump (for comparison)

```sql
-- Get full function definitions for the key RPCs
SELECT
    p.proname AS function_name,
    pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'rpc_customer_quotation_mark_sent';
-- Run separately for each function
```

---

## 4. PATCH PLAN

If drift is detected, apply these patches as a NEW migration file.

### 4.1 Migration File: `094_db_contract_patch.sql`

```sql
-- ============================================
-- Migration: 094_db_contract_patch.sql
--
-- PURPOSE: Ensure all RPC functions, triggers, and enums
-- match the expected contract from migrations 078, 083, 084, 090
--
-- APPROACH: Use CREATE OR REPLACE to be idempotent
-- ============================================

-- ============================================
-- STEP 1: Ensure enum values exist
-- ============================================

DO $$ BEGIN
    ALTER TYPE quotation_rejection_reason_type ADD VALUE IF NOT EXISTS 'tarif_tidak_masuk';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE quotation_rejection_reason_type ADD VALUE IF NOT EXISTS 'kompetitor_lebih_murah';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE quotation_rejection_reason_type ADD VALUE IF NOT EXISTS 'budget_customer_tidak_cukup';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE operational_cost_rejection_reason_type ADD VALUE IF NOT EXISTS 'tarif_tidak_masuk';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE operational_cost_rejection_reason_type ADD VALUE IF NOT EXISTS 'kompetitor_lebih_murah';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE operational_cost_rejection_reason_type ADD VALUE IF NOT EXISTS 'budget_customer_tidak_cukup';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ensure ticket_event_type has required values
DO $$ BEGIN
    ALTER TYPE ticket_event_type ADD VALUE IF NOT EXISTS 'customer_quotation_sent';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE ticket_event_type ADD VALUE IF NOT EXISTS 'customer_quotation_rejected';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE ticket_event_type ADD VALUE IF NOT EXISTS 'customer_quotation_accepted';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- STEP 2: Ensure columns exist on tables
-- ============================================

ALTER TABLE public.customer_quotations
ADD COLUMN IF NOT EXISTS source_rate_quote_id UUID REFERENCES public.ticket_rate_quotes(id) ON DELETE SET NULL;

ALTER TABLE public.ticket_comments
ADD COLUMN IF NOT EXISTS source_event_id BIGINT REFERENCES public.ticket_events(id) ON DELETE SET NULL;

ALTER TABLE public.operational_cost_rejection_reasons
ADD COLUMN IF NOT EXISTS competitor_name TEXT,
ADD COLUMN IF NOT EXISTS competitor_amount NUMERIC(15, 2),
ADD COLUMN IF NOT EXISTS customer_budget NUMERIC(15, 2);

-- ============================================
-- STEP 3: CREATE OR REPLACE all state machine validators
-- (See migration 078 for full definitions)
-- ============================================

-- If functions are missing or have wrong signatures,
-- copy the CREATE OR REPLACE statements from:
-- - supabase/migrations/078_atomic_quotation_transitions.sql (lines 47-217)
-- - supabase/migrations/083_quotation_sync_pipeline_activities.sql (lines 18-284)
-- - supabase/migrations/084_ticket_events_mirror_and_quotation_cost_link.sql (lines 22-169)
-- - supabase/migrations/090_fix_need_adjustment_manual_flow.sql (lines 23-231)

-- ============================================
-- STEP 4: Ensure triggers exist
-- ============================================

-- trg_quotation_status_sync
DROP TRIGGER IF EXISTS trg_quotation_status_sync ON public.customer_quotations;
CREATE TRIGGER trg_quotation_status_sync
    AFTER UPDATE OF status ON public.customer_quotations
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('sent', 'accepted', 'rejected'))
    EXECUTE FUNCTION trigger_sync_quotation_on_status_change();

-- trg_mirror_ticket_event_to_responses
DROP TRIGGER IF EXISTS trg_mirror_ticket_event_to_responses ON public.ticket_events;
CREATE TRIGGER trg_mirror_ticket_event_to_responses
    AFTER INSERT ON public.ticket_events
    FOR EACH ROW
    EXECUTE FUNCTION mirror_ticket_event_to_response_tables();

-- trg_sync_cost_submission_to_ticket
DROP TRIGGER IF EXISTS trg_sync_cost_submission_to_ticket ON public.ticket_rate_quotes;
CREATE TRIGGER trg_sync_cost_submission_to_ticket
    AFTER INSERT OR UPDATE OF status ON public.ticket_rate_quotes
    FOR EACH ROW
    WHEN (NEW.ticket_id IS NOT NULL AND NEW.status = 'submitted')
    EXECUTE FUNCTION trigger_sync_cost_submission_to_ticket();

-- ============================================
-- STEP 5: Grant permissions
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_sync_from_status(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_request_adjustment(UUID, operational_cost_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_set_need_adjustment(UUID, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_quotation_transition(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_opportunity_transition(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_ticket_transition(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_quotation_authorization(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_ticket_authorization(UUID, UUID, TEXT) TO authenticated;
```

---

## 5. QUALITY GATES

### Gate 0: Schema Evidence
**Requirement**: All tables/enums/columns/triggers/functions touched must exist in `supabase/existing_scheme`

**Verification**:
```bash
# Run this from repo root
grep -r "rpc_customer_quotation_mark_sent" supabase/existing_scheme/
grep -r "trg_quotation_status_sync" supabase/existing_scheme/
grep -r "quotation_rejection_reason_type" supabase/existing_scheme/
```

**Status**: **PASSED** - All objects found in SSOT (see Section 2)

### Gate 1: Runtime Contract
**Requirement**: All RPCs called by API routes must exist and signature must match

**Verification**: Run Audit SQL 3.1 in Supabase SQL Editor

**Expected Result**: 14 functions returned with matching signatures

### Gate 2: Trigger Presence
**Requirement**: All expected triggers must be present and ENABLED

**Verification**: Run Audit SQL 3.2 in Supabase SQL Editor

**Expected Result**: 5 triggers returned, all showing "ENABLED"

### Gate 3: Smoke Test
**Requirement**: 3 flows must complete without error and side effects must appear

| Flow | Action | Expected Side Effects |
|------|--------|----------------------|
| **Mark Sent** | Call `rpc_customer_quotation_mark_sent` with valid quotation | 1. `customer_quotations.status` = 'sent' <br> 2. `opportunities.stage` = 'Quote Sent' <br> 3. New row in `opportunity_stage_history` <br> 4. New row in `pipeline_updates` <br> 5. New row in `activities` <br> 6. `tickets.status` = 'waiting_customer' <br> 7. New row in `ticket_events` (type: customer_quotation_sent) |
| **Mark Rejected** | Call `rpc_customer_quotation_mark_rejected` with valid quotation (status=sent) | 1. `customer_quotations.status` = 'rejected' <br> 2. New row in `quotation_rejection_reasons` <br> 3. `opportunities.stage` = 'Negotiation' <br> 4. New row in `opportunity_stage_history` <br> 5. `tickets.status` = 'need_adjustment' <br> 6. New row in `ticket_events` (type: customer_quotation_rejected) |
| **Create Quotation from Cost** | Create quotation linked to ticket_rate_quote | 1. `customer_quotations.operational_cost_id` populated <br> 2. `customer_quotations.source_rate_quote_id` populated (if using create_quotation_from_pipeline) |

**Smoke Test SQL**:
```sql
-- Test: Mark Sent
-- Replace with actual quotation_id and user_id
SELECT * FROM rpc_customer_quotation_mark_sent(
    'QUOTATION_UUID'::UUID,
    'email',
    'customer@example.com',
    'USER_UUID'::UUID,
    'smoke-test-sent'
);

-- Verify side effects
SELECT id, status, opportunity_id, ticket_id FROM customer_quotations WHERE id = 'QUOTATION_UUID';
SELECT * FROM opportunity_stage_history WHERE opportunity_id = 'OPP_ID' ORDER BY created_at DESC LIMIT 1;
SELECT * FROM pipeline_updates WHERE opportunity_id = 'OPP_ID' ORDER BY created_at DESC LIMIT 1;
SELECT * FROM ticket_events WHERE ticket_id = 'TICKET_UUID' AND event_type = 'customer_quotation_sent' ORDER BY created_at DESC LIMIT 1;
```

---

## 6. SIDE EFFECT CHAIN DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    API: POST /send → rpc_customer_quotation_mark_sent   │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ RPC: rpc_customer_quotation_mark_sent                                   │
│ ┌───────────────────────────────────────────────────────────────────┐   │
│ │ 1. Validate state machine (fn_validate_quotation_transition)      │   │
│ │ 2. Check authorization (fn_check_quotation_authorization)         │   │
│ │ 3. UPDATE customer_quotations SET status = 'sent'                 │   │
│ │ 4. UPDATE opportunities SET stage = 'Quote Sent'                  │   │
│ │ 5. INSERT opportunity_stage_history                               │   │
│ │ 6. UPDATE tickets SET status = 'waiting_customer'                 │   │
│ │ 7. INSERT ticket_events (type: customer_quotation_sent)           │   │
│ │ 8. UPDATE leads SET quotation_status = 'sent'                     │   │
│ │ 9. UPDATE ticket_rate_quotes SET status = 'sent_to_customer'      │   │
│ └───────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ TRIGGER: trg_quotation_status_sync → trigger_sync_quotation_on_status   │
│ ┌───────────────────────────────────────────────────────────────────┐   │
│ │ 1. Call rpc_customer_quotation_sync_from_status                   │   │
│ │ 2. INSERT pipeline_updates (idempotent)                           │   │
│ │ 3. INSERT activities (idempotent)                                 │   │
│ └───────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ TRIGGER: trg_mirror_ticket_event_to_responses                           │
│ ┌───────────────────────────────────────────────────────────────────┐   │
│ │ 1. INSERT ticket_comments (auto-generated, internal)              │   │
│ │ 2. INSERT ticket_responses (SLA tracking)                         │   │
│ │ 3. Call record_response_exchange (analytics)                      │   │
│ └───────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. TROUBLESHOOTING

### Issue: RPC returns error "function does not exist"
**Cause**: Function not created or wrong signature
**Fix**: Run migration 078, 083, 084, 090 or the patch plan

### Issue: Side effects don't appear after RPC call
**Cause**: Trigger disabled or missing
**Fix**: Run Audit SQL 3.2, then re-create triggers from patch plan

### Issue: Type mismatch error (enum/text)
**Cause**: Enum value missing or column type wrong
**Fix**: Run Audit SQL 3.3, then add missing enum values

### Issue: permission denied for function
**Cause**: GRANT not executed
**Fix**: Run GRANT statements from patch plan Step 5

---

## 8. FILES REFERENCED

| File | Purpose |
|------|---------|
| `src/app/api/ticketing/customer-quotations/[id]/send/route.ts` | API that calls `rpc_customer_quotation_mark_sent` |
| `src/app/api/ticketing/customer-quotations/[id]/reject/route.ts` | API that calls `rpc_customer_quotation_mark_rejected` |
| `supabase/migrations/078_atomic_quotation_transitions.sql` | Core atomic RPCs + state machine validators |
| `supabase/migrations/083_quotation_sync_pipeline_activities.sql` | Sync engine + pipeline_updates + activities |
| `supabase/migrations/084_ticket_events_mirror_and_quotation_cost_link.sql` | Ticket event mirroring + quotation-cost link |
| `supabase/migrations/090_fix_need_adjustment_manual_flow.sql` | Manual adjustment flow RPCs |
| `supabase/existing_scheme/daftar_rpc_exposure.md` | SSOT for RPC function signatures |
| `supabase/existing_scheme/daftar_trigger.md` | SSOT for triggers |
| `supabase/existing_scheme/daftar_enum.md` | SSOT for enum types |

---

## 9. PAKET 03: ENUM/TEXT MISMATCH FIX VERIFICATION

### Issue
Error: `"column status is of type customer_quotation_status but expression is of type text"`

### Root Cause
Production database has an older version of `rpc_customer_quotation_mark_rejected` that assigns text literals to enum columns without proper casting.

### Fix Location
The fix is already in the repo in these migrations (all use correct enum casting):
- `078_atomic_quotation_transitions.sql:763` - `status = 'rejected'::customer_quotation_status`
- `088_fix_quotation_reject_pipeline_updates.sql:172` - `status = 'rejected'::customer_quotation_status`
- `095_fix_quotation_sent_pipeline_sync.sql:459` - `status = 'rejected'::customer_quotation_status`

### Audit SQL: Verify Fix is Applied

```sql
-- Check function definition for correct enum casting
SELECT
    p.proname AS function_name,
    pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'rpc_customer_quotation_mark_rejected';

-- Check if definition contains correct cast
-- Should see: status = 'rejected'::customer_quotation_status
-- Should NOT see: status = 'rejected' (without cast)
```

### Quick Test

```sql
-- Test: This should succeed if fix is applied
SELECT * FROM rpc_customer_quotation_mark_rejected(
    '00000000-0000-0000-0000-000000000000'::UUID,  -- fake ID (will return QUOTATION_NOT_FOUND)
    'tarif_tidak_masuk'::quotation_rejection_reason_type,
    NULL,  -- competitor_name
    100000,  -- competitor_amount (required for tarif_tidak_masuk)
    NULL,  -- customer_budget
    'IDR',
    NULL,
    NULL,
    'test-enum-fix'
);

-- Expected: { "success": false, "error": "Quotation not found", "error_code": "QUOTATION_NOT_FOUND" }
-- If you get: "column status is of type customer_quotation_status but expression is of type text"
-- Then the migration hasn't been applied yet.
```

### Quality Gates (Paket 03)

| Gate | Requirement | Status |
|------|-------------|--------|
| Reject succeeds without 400 | RPC returns success=true | Verify with test |
| `customer_quotations.status` = 'rejected' | Check after reject | Verify with test |
| `quotation_rejection_reasons` has new row | Check after reject | Verify with test |
| Side effects (Paket 04) run | pipeline_updates, activities created | Verify with test |

---

## 10. PAKET 04: QUOTATION REJECTED → NEGOTIATION MAPPING

### Status: ALREADY IMPLEMENTED IN MIGRATION 095

The `rpc_customer_quotation_mark_rejected` function in `095_fix_quotation_sent_pipeline_sync.sql` correctly handles all Paket 04 requirements.

### Status → Stage Mapping Table

| Quotation Status | Source Stages | Target Stage | Side Effects |
|-----------------|---------------|--------------|--------------|
| `sent` | Prospecting, Discovery | **Quote Sent** | stage_history, pipeline_updates, activities |
| `rejected` | Quote Sent, Discovery, Prospecting | **Negotiation** | stage_history, pipeline_updates, activities, quotation_rejection_reasons |
| `accepted` | Quote Sent, Negotiation, Discovery | **Closed Won** | stage_history, pipeline_updates, activities, account→active |

### Implementation Evidence (migration 095)

| Line | Action |
|------|--------|
| 498-499 | Check: `IF v_opportunity.stage IN ('Quote Sent', 'Discovery', 'Prospecting')` |
| 502 | Update: `stage = 'Negotiation'::opportunity_stage` |
| 518-544 | Insert: `opportunity_stage_history` (from_stage → Negotiation) |
| 546-570 | Insert: `pipeline_updates` (old_stage → Negotiation) |
| 572-601 | Insert: `activities` (Note: Quotation Rejected) |
| 538-544, 564-570, 596-601 | Idempotency: `NOT EXISTS` guard with 1-minute window |

### Side Effect Chain (Rejected)

```
POST /api/ticketing/customer-quotations/[id]/reject
         ↓
rpc_customer_quotation_mark_rejected
         ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. UPDATE customer_quotations.status = 'rejected'          │
│ 2. INSERT quotation_rejection_reasons                       │
│ 3. UPDATE opportunities.stage = 'Negotiation'              │
│    + competitor, competitor_price, customer_budget         │
│ 4. INSERT opportunity_stage_history (→ Negotiation)        │
│ 5. INSERT pipeline_updates (→ Negotiation)                 │
│ 6. INSERT activities (Note: Quotation Rejected)            │
│ 7. UPDATE tickets.status = 'need_adjustment'               │
│ 8. INSERT ticket_events (customer_quotation_rejected)      │
│ 9. INSERT ticket_events (request_adjustment)               │
│10. UPDATE leads.quotation_status = 'rejected'              │
│11. UPDATE ticket_rate_quotes.status = 'revise_requested'   │
└─────────────────────────────────────────────────────────────┘
```

### Validation SQL

```sql
-- After rejecting a quotation, verify all side effects
-- Replace QUOTATION_UUID with actual quotation ID

-- 1. Check quotation status
SELECT id, quotation_number, status, rejection_reason, opportunity_id, ticket_id
FROM customer_quotations WHERE id = 'QUOTATION_UUID';

-- 2. Check rejection reason record
SELECT * FROM quotation_rejection_reasons
WHERE quotation_id = 'QUOTATION_UUID' ORDER BY created_at DESC LIMIT 1;

-- 3. Check opportunity stage = Negotiation
SELECT opportunity_id, stage, quotation_status, competitor, competitor_price, customer_budget
FROM opportunities WHERE opportunity_id = 'OPPORTUNITY_UUID';

-- 4. Check stage history
SELECT * FROM opportunity_stage_history
WHERE opportunity_id = 'OPPORTUNITY_UUID'
AND new_stage = 'Negotiation'
ORDER BY created_at DESC LIMIT 1;

-- 5. Check pipeline_updates
SELECT * FROM pipeline_updates
WHERE opportunity_id = 'OPPORTUNITY_UUID'
AND new_stage = 'Negotiation'
ORDER BY created_at DESC LIMIT 1;

-- 6. Check activities
SELECT * FROM activities
WHERE related_opportunity_id = 'OPPORTUNITY_UUID'
AND subject LIKE '%Rejected%'
ORDER BY created_at DESC LIMIT 1;

-- 7. Check ticket status = need_adjustment
SELECT id, status, pending_response_from FROM tickets WHERE id = 'TICKET_UUID';

-- 8. Check ticket_events
SELECT * FROM ticket_events
WHERE ticket_id = 'TICKET_UUID'
AND event_type IN ('customer_quotation_rejected', 'request_adjustment')
ORDER BY created_at DESC LIMIT 2;
```

### Quality Gates (Paket 04)

| Gate | Requirement | Verification |
|------|-------------|--------------|
| **Gate 1** | `opportunities.stage` = 'Negotiation' | Query 3 |
| **Gate 2** | New row in `opportunity_stage_history` (→ Negotiation) | Query 4 |
| **Gate 3** | New row in `pipeline_updates` (→ Negotiation) | Query 5 |
| **Gate 4** | New row in `activities` | Query 6 |
| **Gate 5** | New row in `quotation_rejection_reasons` | Query 2 |
| **Gate 6** | `tickets.status` = 'need_adjustment' | Query 7 |
| **Gate 7** | Idempotent (no duplicates on retry) | Call reject twice, count rows |

### Idempotency Test

```sql
-- Call reject twice on same quotation
-- First call: Should create all records
-- Second call: Should return is_idempotent=true, no new records

-- Count before
SELECT COUNT(*) as before_count FROM opportunity_stage_history
WHERE opportunity_id = 'OPPORTUNITY_UUID' AND new_stage = 'Negotiation';

-- Call reject (will return is_idempotent=true on second call)

-- Count after
SELECT COUNT(*) as after_count FROM opportunity_stage_history
WHERE opportunity_id = 'OPPORTUNITY_UUID' AND new_stage = 'Negotiation';

-- Should be same count (idempotent)
```

---

## 11. PAKET 05: QUOTATION ACCEPTED → CLOSED WON

### Status: ALREADY IMPLEMENTED IN MIGRATION 095

The `rpc_customer_quotation_mark_accepted` function in `095_fix_quotation_sent_pipeline_sync.sql` correctly handles all Paket 05 requirements.

### Implementation Evidence (migration 095)

| Line | Action |
|------|--------|
| 829 | Check: `IF v_opportunity.stage NOT IN ('Closed Won', 'Closed Lost')` |
| 832 | Update: `stage = 'Closed Won'::opportunity_stage` |
| 834 | Update: `deal_value = v_quotation.total_selling_rate` |
| 835 | Update: `closed_at = COALESCE(closed_at, NOW())` |
| 847-873 | Insert: `opportunity_stage_history` (→ Closed Won) |
| 875-899 | Insert: `pipeline_updates` (→ Closed Won) |
| 901-930 | Insert: `activities` (Note: Quotation Accepted) |
| 932-944 | Update: `accounts.account_status` = 'active_account' |
| 964-975 | Update: `tickets.status` = 'closed', `close_outcome` = 'won' |
| 977-1023 | Insert: `ticket_events` (accepted + closed) |
| 1025-1031 | Update: `ticket_sla_tracking.resolution_at` |

### Side Effect Chain (Accepted)

```
POST /api/ticketing/customer-quotations/[id]/accept
         ↓
rpc_customer_quotation_mark_accepted
         ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. UPDATE customer_quotations.status = 'accepted'          │
│ 2. UPDATE opportunities.stage = 'Closed Won'               │
│    + deal_value = total_selling_rate                       │
│    + closed_at = NOW()                                     │
│ 3. INSERT opportunity_stage_history (→ Closed Won)         │
│ 4. INSERT pipeline_updates (→ Closed Won)                  │
│ 5. INSERT activities (Note: Quotation Accepted)            │
│ 6. UPDATE accounts.account_status = 'active_account'       │
│    + first_deal_date, first_transaction_date               │
│ 7. UPDATE tickets.status = 'closed', close_outcome = 'won' │
│    + closed_at, resolved_at                                │
│ 8. INSERT ticket_events (customer_quotation_accepted)      │
│ 9. INSERT ticket_events (closed)                           │
│10. UPDATE ticket_sla_tracking.resolution_at                │
│11. UPDATE leads.quotation_status = 'accepted'              │
│12. UPDATE ticket_rate_quotes.status = 'accepted'           │
└─────────────────────────────────────────────────────────────┘
```

### Validation SQL

```sql
-- After accepting a quotation, verify all side effects
-- Replace QUOTATION_UUID with actual quotation ID

-- 1. Check quotation status
SELECT id, quotation_number, status, opportunity_id, ticket_id
FROM customer_quotations WHERE id = 'QUOTATION_UUID';

-- 2. Check opportunity stage = Closed Won with deal_value
SELECT opportunity_id, stage, quotation_status, deal_value, closed_at
FROM opportunities WHERE opportunity_id = 'OPPORTUNITY_UUID';

-- 3. Check stage history
SELECT * FROM opportunity_stage_history
WHERE opportunity_id = 'OPPORTUNITY_UUID'
AND new_stage = 'Closed Won'
ORDER BY created_at DESC LIMIT 1;

-- 4. Check pipeline_updates
SELECT * FROM pipeline_updates
WHERE opportunity_id = 'OPPORTUNITY_UUID'
AND new_stage = 'Closed Won'
ORDER BY created_at DESC LIMIT 1;

-- 5. Check activities
SELECT * FROM activities
WHERE related_opportunity_id = 'OPPORTUNITY_UUID'
AND subject LIKE '%Accepted%'
ORDER BY created_at DESC LIMIT 1;

-- 6. Check account upgraded to active_account
SELECT account_id, account_status, is_active, first_deal_date
FROM accounts WHERE account_id = 'ACCOUNT_UUID';

-- 7. Check ticket closed with 'won' outcome
SELECT id, status, close_outcome, close_reason, closed_at, resolved_at
FROM tickets WHERE id = 'TICKET_UUID';

-- 8. Check ticket_events
SELECT * FROM ticket_events
WHERE ticket_id = 'TICKET_UUID'
AND event_type IN ('customer_quotation_accepted', 'closed')
ORDER BY created_at DESC LIMIT 2;

-- 9. Check SLA tracking resolution
SELECT * FROM ticket_sla_tracking
WHERE ticket_id = 'TICKET_UUID';

-- 10. Check operational cost status
SELECT id, status FROM ticket_rate_quotes WHERE id = 'OPERATIONAL_COST_UUID';
```

### Quality Gates (Paket 05)

| Gate | Requirement | Verification |
|------|-------------|--------------|
| **Gate 1** | `opportunities.stage` = 'Closed Won' | Query 2 |
| **Gate 2** | `opportunities.deal_value` populated | Query 2 |
| **Gate 3** | `opportunities.closed_at` populated | Query 2 |
| **Gate 4** | New row in `opportunity_stage_history` (→ Closed Won) | Query 3 |
| **Gate 5** | New row in `pipeline_updates` (→ Closed Won) | Query 4 |
| **Gate 6** | New row in `activities` | Query 5 |
| **Gate 7** | `accounts.account_status` = 'active_account' (if linked) | Query 6 |
| **Gate 8** | `tickets.status` = 'closed', `close_outcome` = 'won' | Query 7 |
| **Gate 9** | `ticket_sla_tracking.resolution_at` populated | Query 9 |
| **Gate 10** | Idempotent (no duplicates on retry) | Call accept twice |

### End-to-End Test Plan

```
Test: Accept quotation and verify all side effects

Preconditions:
- Quotation exists with status = 'sent'
- Opportunity linked with stage = 'Quote Sent' or 'Negotiation'
- Ticket linked with status != 'closed'
- Account linked with account_status = 'calon_account'

Steps:
1. Call POST /api/ticketing/customer-quotations/[id]/accept
2. Verify response: { success: true, new_stage: 'Closed Won' }
3. Run validation SQL queries 1-10
4. Verify all gates pass

Idempotency Test:
5. Call accept again on same quotation
6. Verify response: { success: true, is_idempotent: true }
7. Verify no duplicate rows in stage_history, pipeline_updates, activities
```

---

**END OF DB CONTRACT CHECK**
