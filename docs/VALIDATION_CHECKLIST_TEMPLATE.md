# Validation Checklist Template — QA Internal

**Purpose**: Standardized checklist for validating mapping integrity across UI → API → RPC → DB
**Usage**: Apply this checklist to every Paket before marking as complete

---

## A. UI → API MAPPING

### A1. Button/Action → Endpoint Mapping

| # | Check | Pass | Notes |
|---|-------|------|-------|
| A1.1 | Every UI button/action has exactly 1 API endpoint | ☐ | No "silent updates" or hidden calls |
| A1.2 | No orphan API calls (fetch without UI trigger) | ☐ | All API calls traceable to user action |
| A1.3 | Loading states shown during API calls | ☐ | User knows something is happening |
| A1.4 | Success/error feedback shown after API response | ☐ | Toast, alert, or UI update |

**Validation Query**:
```typescript
// In browser DevTools Network tab:
// 1. Perform UI action
// 2. Verify exactly 1 API call made
// 3. Check request payload matches expected
// 4. Check response handled in UI
```

### A2. Payload & Error Handling

| # | Check | Pass | Notes |
|---|-------|------|-------|
| A2.1 | Request payload contains only necessary fields | ☐ | Minimal payload principle |
| A2.2 | No sensitive data in URL params (use POST body) | ☐ | Security |
| A2.3 | API returns `error_code` on failure | ☐ | Not just generic "error" |
| A2.4 | UI displays user-friendly error message | ☐ | Mapped from error_code |
| A2.5 | Network timeout handled gracefully | ☐ | Retry or inform user |

**Error Code Template**:
```typescript
// API Response should follow:
interface APIResponse<T> {
  success: boolean
  data?: T
  error?: string
  error_code?: string  // e.g., "VALIDATION_ERROR", "NOT_FOUND", "DUPLICATE"
  details?: any
}
```

### A3. Form Validation

| # | Check | Pass | Notes |
|---|-------|------|-------|
| A3.1 | Client-side validation before API call | ☐ | Reduce unnecessary requests |
| A3.2 | Server-side validation in API route | ☐ | Never trust client |
| A3.3 | Validation errors show per-field feedback | ☐ | Not just "form invalid" |
| A3.4 | Required fields enforced on both ends | ☐ | Client + Server |

---

## B. API → RPC/DB CONTRACT

### B1. RPC Signature Matching

| # | Check | Pass | Notes |
|---|-------|------|-------|
| B1.1 | API parameter types match RPC parameter types | ☐ | No UUID vs TEXT mismatch |
| B1.2 | API passes all required RPC parameters | ☐ | No null for non-nullable |
| B1.3 | RPC return type matches API expectation | ☐ | Parse response correctly |
| B1.4 | RPC error handling in API (try/catch or check) | ☐ | Don't swallow RPC errors |

**Validation Query**:
```sql
-- Check RPC signature in database
SELECT
    proname as function_name,
    pg_get_function_arguments(oid) as arguments,
    pg_get_function_result(oid) as return_type
FROM pg_proc
WHERE proname = 'rpc_function_name';
```

```typescript
// In API route, verify call matches:
const { data, error } = await supabase.rpc('rpc_function_name', {
  p_param1: value1,  // Type must match
  p_param2: value2,  // Optional params use DEFAULT in RPC
})
```

### B2. Direct Table Updates (When No RPC)

| # | Check | Pass | Notes |
|---|-------|------|-------|
| B2.1 | Table name is correct (check typos) | ☐ | Supabase won't error on wrong table |
| B2.2 | Column names match schema | ☐ | No silent null inserts |
| B2.3 | Required triggers exist and are ENABLED | ☐ | Automation depends on triggers |
| B2.4 | RLS policies allow the operation | ☐ | Check user role access |

**Trigger Verification Query**:
```sql
-- Verify trigger exists and is enabled
SELECT
    tgname as trigger_name,
    tgenabled as enabled,
    pg_get_triggerdef(oid) as definition
FROM pg_trigger
WHERE tgrelid = 'public.table_name'::regclass
AND NOT tgisinternal;

-- enabled values: 'O' = always, 'D' = disabled, 'R' = replica, 'A' = always (for internal)
```

### B3. Transaction Integrity

| # | Check | Pass | Notes |
|---|-------|------|-------|
| B3.1 | Multi-table operations wrapped in RPC (atomic) | ☐ | No partial updates |
| B3.2 | If API does multiple calls, failure handling exists | ☐ | Rollback or compensate |
| B3.3 | Concurrent requests don't create race conditions | ☐ | Use DB-level guards |

---

## C. DB SIDE EFFECTS

### C1. Audit Trail

| # | Check | Pass | Notes |
|---|-------|------|-------|
| C1.1 | Stage changes logged to history table | ☐ | `opportunity_stage_history`, etc. |
| C1.2 | Ticket events logged to `ticket_events` | ☐ | All significant actions |
| C1.3 | Pipeline updates logged to `pipeline_updates` | ☐ | With evidence if required |
| C1.4 | Activities created for completed actions | ☐ | Audit + notification |
| C1.5 | `ticket_events` mirrored to response tables | ☐ | SLA tracking complete |

**Audit Trail Verification**:
```sql
-- After action, verify trail exists
-- Example: After quotation status change
SELECT * FROM ticket_events
WHERE ticket_id = 'UUID'
ORDER BY created_at DESC
LIMIT 5;

-- Example: After opportunity stage change
SELECT * FROM opportunity_stage_history
WHERE opportunity_id = 'OPP-XXX'
ORDER BY changed_at DESC;
```

### C2. Idempotency

| # | Check | Pass | Notes |
|---|-------|------|-------|
| C2.1 | Retry same request doesn't create duplicates | ☐ | Critical for payments, quotes |
| C2.2 | Idempotency key used for critical operations | ☐ | `crm_idempotency` table or similar |
| C2.3 | Time-window guards for rapid repeats | ☐ | `NOT EXISTS (... AND created_at > NOW() - INTERVAL '1 minute')` |
| C2.4 | Unique constraints prevent data duplication | ☐ | DB-level enforcement |

**Idempotency Check**:
```sql
-- Example: Check for idempotency guard in RPC
-- Should have pattern like:
IF EXISTS (
    SELECT 1 FROM activities
    WHERE related_opportunity_id = p_opportunity_id
    AND activity_type = p_type
    AND created_at > NOW() - INTERVAL '1 minute'
) THEN
    RETURN; -- Skip duplicate
END IF;
```

### C3. Cascade Effects

| # | Check | Pass | Notes |
|---|-------|------|-------|
| C3.1 | Status sync propagates correctly | ☐ | Ticket → Quotation → Opportunity |
| C3.2 | No infinite trigger loops | ☐ | Trigger A doesn't trigger B which triggers A |
| C3.3 | Dependent data updated (not stale) | ☐ | Metrics, counters, aggregates |
| C3.4 | Notifications triggered where needed | ☐ | Email, in-app alerts |

---

## D. OBSERVABILITY

### D1. Correlation ID

| # | Check | Pass | Notes |
|---|-------|------|-------|
| D1.1 | API response includes `correlation_id` | ☐ | For debugging |
| D1.2 | Logs include correlation_id | ☐ | Console.log with context |
| D1.3 | DB operations can be traced | ☐ | Via `notes` field or similar |
| D1.4 | Cross-service calls pass correlation_id | ☐ | If calling external services |

**Implementation Pattern**:
```typescript
// API Route
export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID()

  console.log(`[${correlationId}] Starting operation...`)

  try {
    const result = await doOperation()
    console.log(`[${correlationId}] Success`)

    return NextResponse.json({
      success: true,
      data: result,
      correlation_id: correlationId,  // Include in response
    })
  } catch (err) {
    console.error(`[${correlationId}] Error:`, err)
    return NextResponse.json({
      success: false,
      error: err.message,
      correlation_id: correlationId,
    })
  }
}
```

### D2. Logging Standards

| # | Check | Pass | Notes |
|---|-------|------|-------|
| D2.1 | Start of operation logged | ☐ | `[Module] Starting X...` |
| D2.2 | Key parameters logged (no secrets) | ☐ | IDs, types, not passwords |
| D2.3 | Success/failure outcome logged | ☐ | With result summary |
| D2.4 | Errors include stack trace | ☐ | `console.error(err)` |
| D2.5 | Performance metrics logged for heavy ops | ☐ | `Completed in Xms` |

**Logging Format**:
```typescript
// Standard format
console.log(`[ModuleName] Action: ${action}, Entity: ${entityId}`)
console.log(`[ModuleName] Result:`, { ...safeFields })
console.error(`[ModuleName] Error:`, error)
```

### D3. Metrics & Monitoring

| # | Check | Pass | Notes |
|---|-------|------|-------|
| D3.1 | API response times measurable | ☐ | Via logging or APM |
| D3.2 | Error rates trackable | ☐ | Count errors by type |
| D3.3 | Business metrics derivable from data | ☐ | SLA compliance, etc. |

---

## QUICK REFERENCE: COMMON ISSUES

### Issue 1: Type Mismatch
```
Symptom: RPC returns null or unexpected results
Check: Parameter types in API vs RPC signature
Fix: Cast types explicitly or fix signature
```

### Issue 2: Missing Trigger
```
Symptom: Audit trail not created
Check: SELECT * FROM pg_trigger WHERE tgrelid = 'table'::regclass
Fix: Ensure trigger exists and is enabled
```

### Issue 3: Duplicate Records
```
Symptom: Same action creates multiple records
Check: Idempotency guards in RPC
Fix: Add time-window or unique constraint
```

### Issue 4: Stale Data
```
Symptom: Dashboard shows old numbers
Check: Trigger updates metrics table
Fix: Ensure cascade updates propagate
```

### Issue 5: Silent Failure
```
Symptom: UI shows success but data not saved
Check: API error handling, response parsing
Fix: Always check RPC error, return proper status
```

---

## VALIDATION WORKFLOW

### Per-Feature Validation

```
1. [ ] Map UI action to API endpoint
2. [ ] Verify API calls correct RPC/table
3. [ ] Check RPC/trigger exists and works
4. [ ] Verify audit trail created
5. [ ] Test idempotency (retry same action)
6. [ ] Check cascade effects complete
7. [ ] Verify correlation_id in logs
8. [ ] Test error scenarios
```

### Per-Paket Sign-off

```
Paket: _______________
Date: _______________
Validator: _______________

Section A (UI → API):     ☐ All checks pass
Section B (API → DB):     ☐ All checks pass
Section C (Side Effects): ☐ All checks pass
Section D (Observability): ☐ All checks pass

Notes:
_________________________________
_________________________________

Signed: _______________
```

---

## APPLIED VALIDATION BY PAKET

| Paket | A. UI→API | B. API→DB | C. Side Effects | D. Observability |
|-------|-----------|-----------|-----------------|------------------|
| 00 | ✓ | ✓ | ✓ | ✓ |
| 06 | ✓ | ✓ | ✓ Activities | - |
| 07 | ✓ | ✓ | ✓ Trigger fix | - |
| 08 | ✓ | ✓ | ✓ Mirror trigger | - |
| 09 | ✓ API fix | ✓ | - | - |
| 10 | Audit only | Schema audit | Orphan check | - |
| 11 | ✓ New UI | ✓ Uses V2 RPC | - | - |

---

**END OF VALIDATION CHECKLIST TEMPLATE**
