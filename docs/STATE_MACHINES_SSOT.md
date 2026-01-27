# State Machines — Single Source of Truth (SSOT)

**Purpose**: Define locked state machines for ticket_status, quote_status, and customer_quotation_status with clear invariants.

**Goals**:
- Eliminate stuck statuses and pointer drift
- Enforce snapshot vs versioned vs terminal rules
- All transitions are systematic, non-ambiguous, and auditable

---

## 1. TICKET STATUS (`ticket_status` enum)

### Valid States
| Status | Description | `pending_response_from` |
|--------|-------------|------------------------|
| `open` | Newly created ticket | - |
| `need_response` | Waiting for response | `creator` |
| `in_progress` | Being worked on | - |
| `waiting_customer` | Waiting for customer input | `creator` |
| `need_adjustment` | Price/terms adjustment requested | `assignee` |
| `pending` | On hold, pending external action | - |
| `resolved` | Issue resolved, awaiting closure | - |
| `closed` | **TERMINAL** - Ticket closed | - |

### State Transitions
```
┌─────────────────────────────────────────────────────────────────────┐
│                        TICKET STATE MACHINE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────┐                                                           │
│  │ open │──────────────────┬─────────────────────────────────┐      │
│  └──────┘                  │                                 │      │
│      │                     ▼                                 ▼      │
│      │              ┌─────────────┐                   ┌──────────┐  │
│      └─────────────►│need_response│◄─────────────────►│ pending  │  │
│                     └─────────────┘                   └──────────┘  │
│                           │                                 │       │
│                           ▼                                 │       │
│                     ┌─────────────┐                         │       │
│   ┌────────────────►│ in_progress │◄────────────────────────┤       │
│   │                 └─────────────┘                         │       │
│   │                       │                                 │       │
│   │                       ▼                                 │       │
│   │              ┌──────────────────┐                       │       │
│   │◄─────────────│ waiting_customer │◄──────────────────────┤       │
│   │              └──────────────────┘                       │       │
│   │                       │                                 │       │
│   │                       ▼                                 │       │
│   │              ┌──────────────────┐                       │       │
│   │◄─────────────│ need_adjustment  │◄──────────────────────┤       │
│   │              └──────────────────┘                       │       │
│   │                       │                                 │       │
│   │                       ▼                                 ▼       │
│   │              ┌──────────────────┐              ┌──────────────┐ │
│   └──────────────│     resolved     │─────────────►│    CLOSED    │ │
│                  └──────────────────┘              │  (TERMINAL)  │ │
│                                                    └──────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Invariants
1. **Terminal State**: `closed` has no outbound transitions (unless admin reopen RPC)
2. **Response Tracking**:
   - `need_response` → `pending_response_from = 'creator'`
   - `need_adjustment` → `pending_response_from = 'assignee'`
   - `waiting_customer` → `pending_response_from = 'creator'`
3. **No Legacy States**: `on_hold`, `waiting_vendor`, `waiting_approval` are removed

---

## 2. QUOTE STATUS (`quote_status` enum for `ticket_rate_quotes`)

### Valid States
| Status | Description | Type |
|--------|-------------|------|
| `draft` | Initial state | Editable |
| `submitted` | Ops submitted cost | Active |
| `accepted` | Sales accepted cost | Active |
| `sent_to_customer` | Quotation sent to customer | Active |
| `revise_requested` | Adjustment requested | **SNAPSHOT** |
| `won` | Customer accepted | **TERMINAL** |
| `rejected` | Customer/sales rejected | **TERMINAL** |
| `sent` | Legacy status | Active (backward compat) |

### State Transitions
```
┌─────────────────────────────────────────────────────────────────────┐
│                    QUOTE STATUS STATE MACHINE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────┐        ┌───────────┐                                     │
│  │ draft │───────►│ submitted │────────────┬───────────────────┐    │
│  └───────┘        └───────────┘            │                   │    │
│                         │                  │                   │    │
│                         ▼                  ▼                   ▼    │
│                   ┌──────────┐     ┌─────────────────┐  ┌──────────┐│
│                   │ accepted │────►│ sent_to_customer│  │ rejected ││
│                   └──────────┘     └─────────────────┘  │(TERMINAL)││
│                         │                  │            └──────────┘│
│                         │                  │                        │
│                         ▼                  ▼                        │
│                   ┌──────────────────────────────┐                  │
│                   │            WON               │                  │
│                   │         (TERMINAL)           │                  │
│                   └──────────────────────────────┘                  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    SNAPSHOT STATE                             │   │
│  │  ┌───────────────────┐                                        │   │
│  │  │ revise_requested  │ ← No transitions out. Create NEW quote │   │
│  │  └───────────────────┘                                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Versioning System

**New Columns**:
```sql
is_current BOOLEAN NOT NULL DEFAULT TRUE
superseded_by_id UUID REFERENCES ticket_rate_quotes(id)
superseded_at TIMESTAMPTZ
```

**Invariants**:
1. **One Current Per Ticket**: `UNIQUE (ticket_id) WHERE is_current = TRUE`
2. **Auto-Supersede on Insert**: When new quote inserted, old `is_current=TRUE` becomes `FALSE`
3. **Non-Current Immutable**: Cannot edit `amount`, `terms` on non-current quotes
4. **Terminal Immutable**: Cannot edit quotes in `won` or `rejected` status
5. **Snapshot State**: `revise_requested` cannot transition — must create new quote

### Transition Rules
1. `submitted` → `accepted` (sales accepts cost)
2. `submitted` → `revise_requested` (sales requests adjustment)
3. `accepted` → `sent_to_customer` (quotation sent)
4. `sent_to_customer` → `won` (customer accepts)
5. `sent_to_customer` → `rejected` (customer rejects)
6. `revise_requested` → **NO TRANSITIONS** (create new quote)

---

## 3. CUSTOMER QUOTATION STATUS (`customer_quotation_status` enum)

### Valid States
| Status | Description | Type |
|--------|-------------|------|
| `draft` | Being edited | Editable |
| `sent` | Sent to customer | **SNAPSHOT** |
| `accepted` | Customer accepted | **TERMINAL** |
| `rejected` | Customer rejected | **TERMINAL** |
| `expired` | Validity period ended | **TERMINAL** |
| `revoked` | Manually revoked | **TERMINAL** |

### State Transitions
```
┌─────────────────────────────────────────────────────────────────────┐
│               CUSTOMER QUOTATION STATE MACHINE                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────┐                     ┌─────────┐                          │
│  │ draft │────────────────────►│  sent   │                          │
│  └───────┘                     └─────────┘                          │
│      │                              │                               │
│      │                    ┌─────────┼─────────┬──────────┐          │
│      │                    ▼         ▼         ▼          ▼          │
│      │              ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌───────┐ │
│      │              │ accepted │ │ rejected │ │ expired │ │revoked│ │
│      │              │(TERMINAL)│ │(TERMINAL)│ │(TERMINAL)│ │(TERM.)│ │
│      │              └──────────┘ └──────────┘ └─────────┘ └───────┘ │
│      │                                                              │
│      └──────────────────────────────────────────────────────────────►│
│                                (revoked directly from draft)        │
└─────────────────────────────────────────────────────────────────────┘
```

### Snapshot Lock

**After status != `draft`, these fields become IMMUTABLE**:
- `operational_cost_id`
- `total_cost`
- `total_selling_rate`
- `target_margin_percent`
- `terms_includes`
- `terms_excludes`

**Still Editable**:
- `status` (for state transitions)
- `sent_at`, `sent_via`, `sent_to`
- `rejection_reason`
- `updated_at`

**Trigger Enforcement**:
```sql
CREATE TRIGGER trg_enforce_quotation_snapshot
    BEFORE UPDATE ON public.customer_quotations
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_enforce_quotation_snapshot();
```

---

## 4. TRANSITION ORCHESTRATION

### Flow: Ops Submits Cost → Sales Requests Adjustment → Ops Revises

```
1. Ops submits cost (rpc_ticket_create_quote)
   → ticket_rate_quotes: status='submitted', is_current=TRUE
   → ticket: status='need_response', pending_response_from='creator'

2. Sales requests adjustment (rpc_ticket_request_adjustment)
   → ticket: status='need_adjustment', pending_response_from='assignee'
   → current cost (is_current=TRUE): status='revise_requested' (SNAPSHOT)

3. Ops submits revised cost (rpc_ticket_create_quote)
   → NEW ticket_rate_quotes row: status='submitted', is_current=TRUE
   → OLD cost: is_current=FALSE, superseded_by_id=NEW.id
   → ticket: status='waiting_customer', pending_response_from='creator'
```

### Flow: Quotation Sent → Customer Accepts/Rejects

```
1. Sales sends quotation (rpc_customer_quotation_mark_sent)
   → customer_quotation: status='sent' (SNAPSHOT LOCK activates)
   → operational_cost: status='sent_to_customer'
   → opportunity: stage='Quote Sent'
   → ticket: status='waiting_customer'

2a. Customer accepts (rpc_customer_quotation_mark_accepted)
    → customer_quotation: status='accepted' (TERMINAL)
    → operational_cost: status='won' (TERMINAL)
    → opportunity: stage='Closed Won'
    → ticket: status='closed', close_outcome='won'

2b. Customer rejects (rpc_customer_quotation_mark_rejected)
    → customer_quotation: status='rejected' (TERMINAL)
    → operational_cost: status='rejected' (TERMINAL)
    → opportunity: stage='Negotiation'
    → ticket: status='need_adjustment'
```

---

## 5. ERROR CODES

All state machine violations return HTTP 409 with specific error codes:

| Error Code | Description |
|------------|-------------|
| `CONFLICT_TICKET_CLOSED` | Ticket is closed (terminal) |
| `CONFLICT_QUOTE_WON` | Quote already won (terminal) |
| `CONFLICT_QUOTE_REJECTED` | Quote already rejected (terminal) |
| `CONFLICT_QUOTE_SNAPSHOT` | Quote in revise_requested (snapshot) |
| `CONFLICT_ALREADY_ACCEPTED` | Quotation already accepted |
| `CONFLICT_ALREADY_REJECTED` | Quotation already rejected |
| `CONFLICT_EXPIRED` | Quotation expired |
| `CONFLICT_REVOKED` | Quotation revoked |
| `INVALID_STATUS_TRANSITION` | Transition not allowed by state machine |
| `INVALID_STATUS` | Unknown status value |

---

## 6. QUALITY GATES

### Gate 1: Compile
- TypeScript build passes
- No status strings used outside SSOT constants

### Gate 2: Database
- All migrations apply cleanly
- No invalid enum casts
- All triggers compile

### Gate 3: Transitions
- Invalid transitions return 409 with clear error_code
- All endpoints validate state before update

### Gate 4: Versioning
- For any ticket_id: exactly 1 `is_current=TRUE` in ticket_rate_quotes
- Query: `SELECT ticket_id, COUNT(*) FROM ticket_rate_quotes WHERE is_current GROUP BY ticket_id HAVING COUNT(*) > 1`

### Gate 5: Snapshot
- Attempts to update quotation `operational_cost_id` after sent must fail
- Test trigger with direct UPDATE statement

### Gate 6: E2E Flow
Simulate complete flow:
```
submit cost → request adjustment → submit revised cost (new id)
→ send quotation → reject → submit revised → send new quotation → accept
```
Verify:
- Old quotation still references old cost
- New quotation references new cost
- Cost terminal states preserved

---

## 7. SSOT FILES

| File | Purpose |
|------|---------|
| `src/lib/constants.ts` | TypeScript enum definitions and transition maps |
| `097_state_machine_versioning_locks.sql` | Versioning columns, snapshot triggers, validators |
| `098_state_machine_rpc_alignment.sql` | RPC functions aligned with state machine |

---

**END OF STATE MACHINES SSOT DOCUMENTATION**
