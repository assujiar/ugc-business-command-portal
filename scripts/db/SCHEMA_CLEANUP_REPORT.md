# Schema Cleanup Report

**Project:** ugc-business-command-portal
**Generated:** 2026-01-27
**Issue:** BUG #10 - Safe Schema Cleanup

## Overview

This document describes the automated safe schema cleanup system for the Supabase Postgres database. The system uses multiple safety gates to ensure no breaking changes occur.

## Safety Gates

### Gate A: Dependency Gate (Database)

Checks for database-level dependencies using:
- `pg_depend` - Object dependencies
- `pg_rewrite` - View definitions
- `pg_proc` - Function definitions
- `information_schema.table_constraints` - Foreign key references
- `pg_trigger` - Trigger dependencies

**Objects with dependencies are NEVER dropped.**

### Gate B: Code Usage Gate (Repository)

Checks for code-level references using:
- Grep searches in `src/` directory
- Grep searches in `supabase/migrations/`
- Pattern matching for `.from('table_name')` calls
- Pattern matching for `.rpc('function_name')` calls

**Objects referenced in code are NEVER dropped.**

### Gate C: Data Gate

For tables only:
- Checks row count via `pg_stat_user_tables`
- Only considers tables with 0 rows as candidates

**Tables with data are NEVER dropped.**

### Gate D: Protected List Gate

Explicitly protects known-used objects:
- All core CRM tables (accounts, contacts, leads, opportunities, etc.)
- All ticketing tables (tickets, comments, events, etc.)
- All quotation tables (customer_quotations, items, terms, etc.)
- `sales_plans` and `sales_plan_items` (used by sales target feature)
- All RPC functions called by API routes
- All sync/helper functions

**Protected objects are NEVER dropped.**

## Files

| File | Purpose |
|------|---------|
| `scripts/db/cleanup_candidates.sql` | **Non-destructive** analysis script. Lists all objects with their dependencies and identifies potential candidates. |
| `scripts/db/drop_safe.sql` | **Destructive** cleanup script. Only drops objects that pass ALL safety gates. Runs in transaction with ROLLBACK by default. |
| `scripts/db/scan_code_references.sh` | Shell script to scan codebase for table/function references. |
| `scripts/db/SCHEMA_CLEANUP_REPORT.md` | This documentation file. |

## Protected Objects (Will NEVER Be Dropped)

### Core CRM Tables
| Table | Reason |
|-------|--------|
| `profiles` | User profiles - core auth |
| `accounts` | CRM accounts |
| `contacts` | CRM contacts |
| `leads` | CRM leads |
| `opportunities` | CRM opportunities/pipeline |
| `opportunity_stage_history` | Pipeline audit trail |
| `activities` | CRM activities |
| `pipeline_updates` | Pipeline updates log |
| `sales_plans` | Sales target feature |
| `sales_plan_items` | Sales plan items |

### Ticketing Tables
| Table | Reason |
|-------|--------|
| `tickets` | Core ticketing |
| `ticket_comments` | Ticket discussions |
| `ticket_events` | Ticket audit log |
| `ticket_attachments` | File attachments |
| `ticket_rate_quotes` | Operational costs |
| `ticket_rate_quote_items` | Cost breakdown items |
| `ticket_sla_tracking` | SLA tracking |
| `ticket_response_exchanges` | Response time tracking |
| `ticket_response_metrics` | Aggregated SLA metrics |

### Customer Quotations
| Table | Reason |
|-------|--------|
| `customer_quotations` | Customer-facing quotes |
| `customer_quotation_items` | Quote line items |
| `customer_quotation_terms` | Quote terms templates |

### Lead Management
| Table | Reason |
|-------|--------|
| `lead_handover_pool` | Lead assignment pool |
| `lead_bids` | Lead bidding |

### Configuration Tables
| Table | Reason |
|-------|--------|
| `sla_business_hours` | SLA business hours config |
| `sla_holidays` | SLA holidays config |
| `departments` | Department config |
| `ticket_categories` | Ticket categories |

### Protected Functions (RPC Endpoints)
| Function | Reason |
|----------|--------|
| `rpc_customer_quotation_mark_sent` | Quotation workflow |
| `rpc_customer_quotation_mark_accepted` | Quotation workflow |
| `rpc_customer_quotation_mark_rejected` | Quotation workflow |
| `rpc_ticket_request_adjustment` | Ticket adjustment |
| `rpc_ticket_set_need_adjustment` | Manual adjustment |
| `rpc_ticket_add_comment` | Add ticket comment |
| `rpc_get_ticket_sla_details` | SLA details |
| `record_response_exchange` | SLA tracking |
| `record_ticket_interaction` | SLA tracking |
| `fn_resolve_latest_operational_cost` | Cost resolution |
| `generate_customer_quotation_number` | Quote numbering |
| `get_next_quotation_sequence` | Quote sequencing |
| `sync_quotation_to_*` | Entity sync functions |
| `fn_check_*_authorization` | Auth check functions |
| `fn_validate_*_transition` | State machine functions |

### Protected Views
| View | Reason |
|------|--------|
| `v_latest_operational_costs` | Cost resolution |
| `v_ticket_sla_audit` | SLA audit |
| `v_schema_audit_unused_objects` | Schema audit |

## How to Use

### Step 1: Run Analysis (Non-Destructive)

```bash
psql -d your_database -f scripts/db/cleanup_candidates.sql
```

This will output:
- All tables with row counts and dependencies
- All functions with trigger/caller dependencies
- All views and their dependencies
- All enums and their column usage
- Potential cleanup candidates (objects that might be safe to drop)
- Blocked objects with reasons why they're blocked

### Step 2: Review Code References

```bash
chmod +x scripts/db/scan_code_references.sh
./scripts/db/scan_code_references.sh > code_references.txt
```

Review `code_references.txt` to verify objects are/aren't used in code.

### Step 3: Update Protected List (If Needed)

If you find objects in code that aren't in the protected list:

1. Edit `scripts/db/drop_safe.sql`
2. Add entries to `_code_referenced_objects` table
3. Re-run analysis

### Step 4: Run Safe Drop (Dry Run)

```bash
psql -d your_database -f scripts/db/drop_safe.sql
```

By default, this runs in a transaction and ROLLBACKs at the end. Review the output to see what WOULD be dropped.

### Step 5: Execute Actual Drops (Careful!)

1. Edit `scripts/db/drop_safe.sql`
2. Comment out `ROLLBACK;`
3. Uncomment `COMMIT;`
4. Run the script again

```bash
psql -d your_database -f scripts/db/drop_safe.sql
```

## Known Issues and Recommendations

### Issue 1: Dual History Columns
The `opportunity_stage_history` table has both:
- `from_stage` / `to_stage`
- `old_stage` / `new_stage`

**Recommendation:** Keep both for now. All migrations populate both. Consider consolidating in future when all consumers are updated.

### Issue 2: Multiple Sync Mechanisms
There are both:
- Triggers that insert history records
- RPC functions that insert history records

**Recommendation:** The RPC functions now handle all inserts directly with `NOT EXISTS` guards to prevent duplicates. Triggers serve as backup.

### Issue 3: Old Function Overloads
Migration `085_safe_schema_cleanup.sql` already cleaned up old function overloads:
- `rpc_ticket_request_adjustment` (2-param version)
- `rpc_ticket_create_quote` (5-param version)
- `request_quotation_adjustment` (1-param and 2-param versions)

These were replaced by newer signatures with more parameters.

## Verification Queries

After running cleanup, verify app functionality:

```sql
-- Check all API-used tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
    'profiles', 'accounts', 'contacts', 'leads', 'opportunities',
    'tickets', 'ticket_comments', 'ticket_events',
    'customer_quotations', 'sales_plans'
);

-- Check all RPC functions exist
SELECT proname
FROM pg_proc
JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
WHERE nspname = 'public'
AND proname LIKE 'rpc_%';

-- Verify no broken foreign keys
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

## Acceptance Criteria

- ✓ `cleanup_candidates.sql` is completely non-destructive
- ✓ `drop_safe.sql` only drops objects that pass ALL safety gates
- ✓ Protected list includes all known-used objects (including `sales_plans`)
- ✓ Transaction-based with ROLLBACK by default
- ✓ Detailed logging of skip reasons
- ✓ No app routes break after cleanup
