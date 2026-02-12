# UGC Business Command Portal - Key Learnings

## Architecture
- Next.js 14 App Router + Supabase PostgreSQL with RLS
- API routes use BFF pattern; atomic operations via PostgreSQL RPC functions
- `adminClient` (service_role) bypasses RLS; user client respects RLS
- Migrations run sequentially in Supabase; each statement may run independently (failures on one statement don't necessarily block others)

## Critical Patterns
- **RPC functions are SECURITY DEFINER**: They bypass RLS for INSERT/UPDATE. But client-side SELECT queries still respect RLS.
- **Mirror trigger** (`trg_mirror_ticket_event_to_responses`): Fires on ticket_events INSERT, creates auto-comments + ticket_responses. Has EXCEPTION handler that silently swallows errors.
- **RLS visibility**: `ticket_events` and `ticket_comments` have separate RLS policies. Internal comments (`is_internal=TRUE`) are hidden from non-ops/non-admin users.
- **Function overrides**: RPC functions are overwritten across many migrations. Always check the LATEST migration that defines a function (search by function name across all migrations).

## Common Pitfalls
- **RLS circular dependency (42P17)**: NEVER use EXISTS subquery on table B in table A's RLS if table B's RLS queries table A. E.g., tickets_select_policy → customer_quotations → customer_quotations_select → tickets = INFINITE RECURSION. Fix: use SECURITY DEFINER helper function (`is_quotation_creator_for_ticket`) to bypass RLS on the subquery.
- **Column type mismatches in FKs**: Migration 084 defined `source_event_id BIGINT` referencing `ticket_events.id UUID` - caused silent trigger failures
- **is_internal comments**: Using `is_internal=TRUE` hides comments from sales users via RLS. Use `FALSE` for user-facing status changes.
- **Role casing inconsistency**: Authorization helpers use lowercase ('director', 'sales'), RLS helpers use mixed case ('Director', 'super admin', 'EXIM Ops'). Be careful when checking roles.
- **RPC signatures**: Must match exactly in GRANT statements. Format: `(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT)`
- **Mirror trigger duplicate ticket_responses**: If an RPC creates a direct comment AND the mirror trigger also runs, both create ticket_responses entries. Fix: skip trigger entirely for events with direct RPC comments.
- **v_previous_rejected_count by opportunity_id only**: If quotations resolve to different opportunity_ids (via fn_resolve), the count is 0. Fix: also check by ticket_id and lead_id.
- **RLS on joined tables**: Supabase FK joins respect RLS on BOTH tables. If user can see customer_quotations but not tickets, the ticket join returns null. Fix: use SECURITY DEFINER helper in tickets RLS.
- **ENUM type mismatches**: When inserting into columns with custom ENUM types (e.g., `opportunity_stage`), declare variables as the ENUM type, not TEXT. PostgreSQL does NOT auto-cast TEXT → ENUM. Always use explicit `::enum_type` casts for literals.
- **IMMUTABLE vs STABLE in PL/pgSQL**: Functions that use NOW() must be STABLE, not IMMUTABLE. IMMUTABLE allows PostgreSQL to cache results across transactions.
- **opportunity_stage_history has 4 stage columns**: from_stage/to_stage (original NOT NULL) + old_stage/new_stage (migration 023). Migration 149 added `trg_autofill_stage_history` BEFORE INSERT trigger to auto-fill missing columns. Still, always include all 4 columns for explicitness.
- **adminClient + log_stage_change() trigger**: The trigger SKIPS when `auth.uid()` is NULL (all adminClient/service_role calls). RPCs called via adminClient must handle stage history manually. The BEFORE INSERT auto-fill trigger (migration 149) prevents NOT NULL failures for these manual INSERTs.
- **EXCEPTION WHEN OTHERS rolls back EVERYTHING**: In PL/pgSQL, when an exception is caught, ALL operations within the BEGIN block are rolled back (implicit savepoint). A single failing INSERT can undo ALL prior INSERTs/UPDATEs in the same function.
- **Duplicate triggers**: Check for existing triggers before adding new ones. Migration 110 had trg_sync_account_on_opportunity_create doing same thing as our new trigger.
- **Pipeline update API double-updates**: If trigger already handles account_status sync, don't also do it directly in API route (causes double-update conflicts).
- **AFTER UPDATE trigger interference with RPCs**: `trg_quotation_status_sync` (migration 071) fires AFTER UPDATE on `customer_quotations` when status changes to 'rejected'/'sent'/'accepted'. It calls `sync_quotation_to_all` → `sync_quotation_to_ticket` which duplicates ALL the work the RPC does (update ticket, create events, update opportunity). The trigger's EXCEPTION handler can roll back its own operations, leaving RPC in corrupted state. Fix: use GUC flag `set_config('app.in_quotation_rpc', 'true', true)` in RPCs + check in trigger to skip. Also check `service_role` JWT. Migration 151.
- **GUC flags for trigger control**: Use `set_config('app.key', 'value', true)` (transaction-local) before UPDATE to signal AFTER triggers to skip. Read with `current_setting('app.key', true)`. The `true` param in current_setting makes it return NULL instead of error if not set.

- **accounts column name**: The column is `account_status` (NOT `status`). Migration 159 regressed from correct `account_status` (migration 136) to wrong `status`. This caused mark_accepted to fail silently, rolling back the entire transaction. Fix: use `sync_opportunity_to_account(opp_id, 'won')` instead of direct UPDATE. Migration 172.
- **Nested BEGIN..EXCEPTION for non-critical operations**: Wrap account sync, SLA updates, and similar non-critical operations in nested `BEGIN..EXCEPTION` blocks within RPCs. This prevents failures in peripheral operations from rolling back the entire quotation lifecycle transaction.

## Key Files
- **mark_sent vs mark_rejected opportunity derivation**: mark_rejected starts with `v_effective_opportunity_id := v_quotation.opportunity_id` (correct). mark_sent relied ONLY on fn_resolve_or_create_opportunity result (broken). Migration 150 adds fallback to quotation.opportunity_id.
- Latest RPC definitions: Check highest-numbered migration (currently 147 for mark_won/mark_lost, 148 for sync_opportunity_to_account, 173 for mark_sent/mark_rejected/mark_accepted, also fn_stage_config)
- Stage history auto-fill: migration 149 (trg_autofill_stage_history on opportunity_stage_history)
- Account status lifecycle: migration 148 (sync_opportunity_to_account, trigger, aging function, view)
- RLS policies: `036_ticketing_rls_policies.sql` (base) + 145 (tickets/events/comments - LATEST)
- Mirror trigger: Last defined in migration 144 (was 143, 096 before that)
- Trigger interference fix: migration 151 (trigger_sync_quotation_on_status_change + mark_rejected RPC)
- Ticket detail UI: `src/components/ticketing/ticket-detail.tsx` (very large file)
- fn_resolve_or_create_opportunity: migration 106 (6-step: quotation → lead → account → ticket → check → auto-create)
- RLS helper: `is_quotation_creator_for_ticket(UUID, UUID)` - migration 145
