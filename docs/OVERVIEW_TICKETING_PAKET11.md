# Overview Ticketing V2 — Paket 11

**Date**: 2026-01-27
**Purpose**: Complete rebuild of Overview Ticketing dashboard with new metrics structure

---

## 1. UI STRUCTURE

### Component Hierarchy

```
OverviewDashboardV2 (src/components/ticketing/overview-dashboard-v2.tsx)
├── Header
│   ├── Period Selector (7/30/90 days)
│   ├── Ticket Type Filter (TOTAL/RFQ/GEN)
│   └── Refresh Button
├── Section 1: Ticket Distribution
│   ├── Total Tickets Card
│   ├── Active Tickets Card
│   ├── Completed Tickets Card
│   ├── Resolution Rate Card
│   └── RFQ vs GEN Breakdown (when TOTAL selected)
├── Section 2: Status Cards (Clickable → Drilldown)
│   └── Grid of status cards (open, need_response, in_progress, etc.)
├── Section 3: SLA Compliance + Response Times
│   ├── SLA Compliance Card
│   │   ├── First Response SLA Gauge (met/breached/pending)
│   │   ├── Resolution SLA Gauge (met/breached/pending)
│   │   └── RFQ without Quote indicator
│   └── Response Time Metrics Card
│       ├── Assignee First Response Avg
│       ├── Assignee Avg Stage Response
│       ├── Creator Avg Stage Response
│       ├── Avg Resolution Time
│       ├── First Response Distribution
│       └── Ops First Quote (RFQ only)
├── Section 4: Quotation Analytics
│   ├── Summary Tab
│   │   ├── Status Breakdown (draft/sent/accepted/rejected/expired)
│   │   ├── Value Summary (total/accepted/pending)
│   │   ├── Win Rate
│   │   └── By Type (RFQ/GEN) Breakdown
│   └── Rejection Analysis Tab
│       └── Rejection Reasons with percentages
├── Section 5: Ops Cost Analytics
│   ├── Summary Tab
│   │   ├── Status Breakdown (draft/submitted/sent/accepted/rejected)
│   │   ├── Approval Rate
│   │   ├── Avg Turnaround
│   │   └── Approved Value
│   └── Rejection Analysis Tab
│       └── Rejection Reasons with percentages
├── Section 6: Leaderboards (Director/Manager scope only)
│   ├── By Completion Tab
│   ├── By Response Speed Tab
│   ├── By Quotes Tab
│   └── By Win Rate Tab
└── DrilldownModal (opens when clicking metric cards)
    └── Ticket List with links to detail page
```

---

## 2. API CONTRACT

### Primary API: `/api/ticketing/overview/v2`

**Method**: GET

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `period` | number | 30 | Number of days to look back |

**Response Shape**:
```typescript
interface OverviewV2Response {
  success: boolean
  data: {
    meta: {
      period_days: number
      start_date: string
      scope: 'all' | 'department' | 'user'
      department: string | null
      generated_at: string
    }
    counts_by_type: {
      RFQ: TypeCounts
      GEN: TypeCounts
      TOTAL: TypeCounts
    }
    status_cards: {
      by_status: Record<string, number>
      by_priority: Record<string, number>
      by_status_and_type: {
        RFQ: Record<string, number>
        GEN: Record<string, number>
      }
    }
    response_time_metrics: {
      RFQ: ResponseMetrics
      GEN: ResponseMetrics
      TOTAL: ResponseMetrics
    }
    sla_compliance: {
      RFQ: SLAMetrics
      GEN: SLAMetrics
      TOTAL: SLAMetrics
    }
    quotation_analytics: {
      summary: QuotationSummary
      value: QuotationValue
      conversion: ConversionRates
      by_type: ByTypeBreakdown
      rejection_reasons: Record<string, number>
    }
    ops_cost_analytics: {
      summary: OpsCostSummary
      value: OpsCostValue
      turnaround: TurnaroundMetrics
      by_type: ByTypeBreakdown
      rejection_reasons: Record<string, number>
      approval_rate: number
    }
    leaderboards: {
      by_completion: LeaderboardEntry[]
      by_response_speed: LeaderboardEntry[]
      by_quotes: LeaderboardEntry[]
      by_win_rate: LeaderboardEntry[]
    }
  }
}

interface TypeCounts {
  total: number
  active: number
  completed: number
  created_today: number
  resolved_today: number
}

interface ResponseMetrics {
  first_response: {
    count: number
    avg_seconds: number
    min_seconds: number
    max_seconds: number
  }
  avg_response: {
    assignee_avg: number
    creator_avg: number
  }
  resolution: {
    count: number
    avg_seconds: number
  }
  first_quote?: {
    count: number
    avg_seconds: number
  }
  distribution: {
    under_1_hour: number
    from_1_to_4_hours: number
    from_4_to_24_hours: number
    over_24_hours: number
  }
}

interface SLAMetrics {
  first_response: {
    met: number
    breached: number
    pending: number
    compliance_rate: number
  }
  resolution: {
    met: number
    breached: number
    pending: number
    compliance_rate: number
  }
  first_quote_pending?: number
  total: number
}

interface LeaderboardEntry {
  user_id: string
  name: string
  role: string
  department: string
  tickets_completed?: number
  completion_rate?: number
  avg_first_response_seconds?: number
  quotes_submitted?: number
  tickets_won?: number
  tickets_lost?: number
  win_rate?: number
}
```

### Drilldown API: `/api/ticketing/overview/drilldown`

**Method**: GET

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `metric` | string | required | Metric to drill down (e.g., `status_open`, `first_response_met`) |
| `ticket_type` | string | 'TOTAL' | Filter by ticket type |
| `period` | number | 30 | Number of days |
| `department` | string | null | Department filter (directors only) |
| `limit` | number | 100 | Max results (max 500) |
| `offset` | number | 0 | Pagination offset |

**Supported Metrics**:
- `status_<status>` - e.g., `status_open`, `status_closed`
- `first_response_met`, `first_response_breached`, `first_response_pending`
- `resolution_met`, `resolution_breached`, `resolution_pending`
- `first_quote_met`, `first_quote_breached`, `first_quote_pending`

---

## 3. SQL BACKING FOR EACH METRIC

All metrics are computed by the `rpc_ticketing_overview_v2` function in migration 093.

### 3.1 Ticket Counts by Type

```sql
-- SQL equivalent for counts_by_type
SELECT
    ticket_type,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed')) as active,
    COUNT(*) FILTER (WHERE status IN ('resolved', 'closed')) as completed,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as created_today,
    COUNT(*) FILTER (WHERE status IN ('resolved', 'closed')
                     AND updated_at >= NOW() - INTERVAL '1 day') as resolved_today
FROM public.tickets t
WHERE created_at >= NOW() - INTERVAL '30 days'
-- Role-based scoping applied here
GROUP BY ticket_type;
```

### 3.2 Status Distribution

```sql
-- SQL equivalent for status_cards.by_status
SELECT status, COUNT(*) as count
FROM public.tickets
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY status;

-- SQL equivalent for status_cards.by_status_and_type
SELECT status, ticket_type, COUNT(*) as count
FROM public.tickets
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY status, ticket_type;
```

### 3.3 Response Time Metrics

```sql
-- SQL equivalent for response_time_metrics
SELECT
    t.ticket_type,
    -- First Response
    COUNT(*) FILTER (WHERE trm.assignee_first_response_seconds IS NOT NULL) as first_response_count,
    ROUND(AVG(trm.assignee_first_response_seconds) FILTER (WHERE trm.assignee_first_response_seconds IS NOT NULL)) as first_response_avg,
    -- Avg Response (per stage)
    ROUND(AVG(trm.assignee_avg_response_seconds)) as assignee_avg_response,
    ROUND(AVG(trm.creator_avg_response_seconds)) as creator_avg_response,
    -- Resolution
    COUNT(*) FILTER (WHERE trm.time_to_resolution_seconds IS NOT NULL) as resolution_count,
    ROUND(AVG(trm.time_to_resolution_seconds)) as resolution_avg,
    -- First Quote (RFQ only)
    ROUND(AVG(trm.time_to_first_quote_seconds)) as first_quote_avg,
    -- Distribution
    COUNT(*) FILTER (WHERE trm.assignee_first_response_seconds < 3600) as under_1_hour,
    COUNT(*) FILTER (WHERE trm.assignee_first_response_seconds >= 3600
                     AND trm.assignee_first_response_seconds < 14400) as from_1_to_4_hours,
    COUNT(*) FILTER (WHERE trm.assignee_first_response_seconds >= 14400
                     AND trm.assignee_first_response_seconds < 86400) as from_4_to_24_hours,
    COUNT(*) FILTER (WHERE trm.assignee_first_response_seconds >= 86400) as over_24_hours
FROM public.ticket_response_metrics trm
JOIN public.tickets t ON t.id = trm.ticket_id
WHERE t.created_at >= NOW() - INTERVAL '30 days'
GROUP BY t.ticket_type;
```

### 3.4 SLA Compliance

```sql
-- SQL equivalent for sla_compliance
SELECT
    t.ticket_type,
    -- First Response SLA
    COUNT(*) FILTER (WHERE tst.first_response_met = TRUE) as fr_met,
    COUNT(*) FILTER (WHERE tst.first_response_met = FALSE) as fr_breached,
    COUNT(*) FILTER (WHERE tst.first_response_at IS NULL
                     AND t.status NOT IN ('resolved', 'closed')) as fr_pending,
    -- Resolution SLA
    COUNT(*) FILTER (WHERE tst.resolution_met = TRUE) as res_met,
    COUNT(*) FILTER (WHERE tst.resolution_met = FALSE) as res_breached,
    COUNT(*) FILTER (WHERE t.status NOT IN ('resolved', 'closed')) as res_pending,
    -- Compliance Rates
    ROUND(
        COUNT(*) FILTER (WHERE tst.first_response_met = TRUE)::NUMERIC /
        NULLIF(COUNT(*) FILTER (WHERE tst.first_response_met IS NOT NULL), 0) * 100,
        1
    ) as fr_compliance_rate
FROM public.ticket_sla_tracking tst
JOIN public.tickets t ON t.id = tst.ticket_id
WHERE t.created_at >= NOW() - INTERVAL '30 days'
GROUP BY t.ticket_type;

-- First Quote Pending (RFQ without submitted cost)
SELECT COUNT(*)
FROM public.tickets t
WHERE t.ticket_type = 'RFQ'
AND t.status NOT IN ('resolved', 'closed')
AND t.created_at >= NOW() - INTERVAL '30 days'
AND NOT EXISTS (
    SELECT 1 FROM public.ticket_rate_quotes trq
    WHERE trq.ticket_id = t.id
    AND trq.status IN ('submitted', 'sent_to_customer', 'accepted')
);
```

### 3.5 Quotation Analytics

```sql
-- SQL equivalent for quotation_analytics
SELECT
    -- Summary
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'draft') as draft,
    COUNT(*) FILTER (WHERE status = 'sent') as sent,
    COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
    COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
    COUNT(*) FILTER (WHERE status = 'expired') as expired,
    -- Value
    SUM(total_selling_rate) as total_value,
    SUM(total_selling_rate) FILTER (WHERE status = 'accepted') as accepted_value,
    SUM(total_selling_rate) FILTER (WHERE status IN ('draft', 'sent')) as pending_value,
    -- Conversion
    ROUND(
        COUNT(*) FILTER (WHERE status = 'accepted')::NUMERIC /
        NULLIF(COUNT(*) FILTER (WHERE status IN ('accepted', 'rejected')), 0) * 100,
        1
    ) as win_rate
FROM public.customer_quotations
WHERE created_at >= NOW() - INTERVAL '30 days';

-- Rejection Reasons
SELECT
    qrr.reason_type::TEXT as reason,
    COUNT(*) as count
FROM public.quotation_rejection_reasons qrr
JOIN public.customer_quotations cq ON cq.id = qrr.quotation_id
WHERE cq.created_at >= NOW() - INTERVAL '30 days'
GROUP BY qrr.reason_type;
```

### 3.6 Ops Cost Analytics

```sql
-- SQL equivalent for ops_cost_analytics
SELECT
    -- Summary
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'draft') as draft,
    COUNT(*) FILTER (WHERE status = 'submitted') as submitted,
    COUNT(*) FILTER (WHERE status = 'sent_to_customer') as sent_to_customer,
    COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
    COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
    -- Value
    SUM(amount) as total_value,
    SUM(amount) FILTER (WHERE status IN ('submitted', 'sent_to_customer', 'accepted')) as approved_value,
    -- Turnaround
    ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))
          FILTER (WHERE status IN ('submitted', 'sent_to_customer', 'accepted')))) as avg_turnaround,
    -- Approval Rate
    ROUND(
        COUNT(*) FILTER (WHERE status IN ('submitted', 'sent_to_customer', 'accepted'))::NUMERIC /
        NULLIF(COUNT(*) FILTER (WHERE status IN ('submitted', 'sent_to_customer', 'accepted', 'rejected')), 0) * 100,
        1
    ) as approval_rate
FROM public.ticket_rate_quotes
WHERE created_at >= NOW() - INTERVAL '30 days';

-- Rejection Reasons
SELECT
    ocrr.reason_type::TEXT as reason,
    COUNT(*) as count
FROM public.operational_cost_rejection_reasons ocrr
JOIN public.ticket_rate_quotes trq ON trq.id = ocrr.operational_cost_id
WHERE trq.created_at >= NOW() - INTERVAL '30 days'
GROUP BY ocrr.reason_type;
```

### 3.7 Leaderboards

```sql
-- SQL equivalent for leaderboards (by_completion example)
WITH user_stats AS (
    SELECT
        p.user_id,
        p.full_name as name,
        p.role,
        p.department,
        COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id
                           AND t.status IN ('resolved', 'closed') THEN t.id END) as tickets_completed,
        COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id THEN t.id END) as tickets_assigned
    FROM public.profiles p
    LEFT JOIN public.tickets t ON t.assigned_to = p.user_id
    WHERE t.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY p.user_id, p.full_name, p.role, p.department
    HAVING COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id THEN t.id END) > 0
)
SELECT
    user_id, name, role, department,
    tickets_completed,
    ROUND((tickets_completed::NUMERIC / tickets_assigned) * 100, 1) as completion_rate
FROM user_stats
ORDER BY tickets_completed DESC
LIMIT 10;
```

---

## 4. ROLE SCOPE BEHAVIOR

| Role | Scope | Data Access |
|------|-------|-------------|
| `super_admin`, `director`, `ticketing_director` | `all` | All departments, global leaderboards |
| `manager`, `ticketing_manager`, `ops_manager` | `department` | Own department only, dept leaderboards |
| Other roles | `user` | Only tickets created by or assigned to self |

---

## 5. DRILLDOWN FUNCTIONALITY

### Supported Drilldown Metrics

| Card Clicked | Drilldown Metric | Filter Logic |
|--------------|------------------|--------------|
| Status Open | `status_open` | `WHERE status = 'open'` |
| Status Closed | `status_closed` | `WHERE status = 'closed'` |
| FR SLA Met | `first_response_met` | `WHERE first_response_met = TRUE` |
| FR SLA Breached | `first_response_breached` | `WHERE first_response_met = FALSE` |
| FR SLA Pending | `first_response_pending` | `WHERE first_response_at IS NULL` |
| Resolution Met | `resolution_met` | `WHERE resolution_met = TRUE` |
| Resolution Breached | `resolution_breached` | `WHERE resolution_met = FALSE` |
| Resolution Pending | `resolution_pending` | `WHERE status NOT IN ('resolved', 'closed')` |
| First Quote Pending | `first_quote_pending` | RFQ without submitted cost |

---

## 6. QUALITY GATES

### Gate 1: Data Accuracy
**Requirement**: Dashboard numbers must match audit query results

```sql
-- Audit Query: Verify total ticket count for period
SELECT COUNT(*)
FROM public.tickets
WHERE created_at >= NOW() - INTERVAL '30 days';

-- Audit Query: Verify SLA compliance numbers
SELECT
    COUNT(*) FILTER (WHERE first_response_met = TRUE) as fr_met,
    COUNT(*) FILTER (WHERE first_response_met = FALSE) as fr_breached
FROM public.ticket_sla_tracking tst
JOIN public.tickets t ON t.id = tst.ticket_id
WHERE t.created_at >= NOW() - INTERVAL '30 days';
```

### Gate 2: Drilldown Consistency
**Requirement**: Drilldown list count must match card number

```
Card shows: 15 FR Breached
Drilldown returns: 15 tickets
```

### Gate 3: Role Scope Enforcement
**Requirement**: Users only see data within their scope

| Test | Expected |
|------|----------|
| Director views all | Sees all departments |
| Manager views dashboard | Sees only own department |
| Staff views dashboard | Sees only own tickets |

### Gate 4: RFQ/GEN Breakdown
**Requirement**: Filtering by type shows correct subset

```
TOTAL: 100 tickets
RFQ: 60 tickets
GEN: 40 tickets
RFQ + GEN = TOTAL ✓
```

### Gate 5: Rejection Reason Validation
**Requirement**: Rejection reasons aggregate correctly

```sql
-- Verify quotation rejection reasons total matches rejected count
SELECT
    (SELECT COUNT(*) FROM quotation_rejection_reasons
     WHERE quotation_id IN (SELECT id FROM customer_quotations WHERE status = 'rejected')) as reason_count,
    (SELECT COUNT(*) FROM customer_quotations WHERE status = 'rejected') as rejected_count;
-- reason_count <= rejected_count (some may not have reasons)
```

---

## 7. TEST PLAN

### Manual Test Cases

| # | Test Case | Steps | Expected |
|---|-----------|-------|----------|
| 1 | Load Dashboard | Navigate to /overview-ticket | All sections load without error |
| 2 | Period Filter | Change period to 7 days | Numbers update, data reduces |
| 3 | Type Filter | Select RFQ only | Shows RFQ metrics only |
| 4 | Status Drilldown | Click "Open" status card | Modal shows list of open tickets |
| 5 | SLA Drilldown | Click FR Met count | Modal shows tickets with FR met |
| 6 | Ticket Link | Click ticket in drilldown | Navigates to ticket detail |
| 7 | Refresh | Click refresh button | Data reloads |
| 8 | Director Scope | Login as director | Sees all departments, global leaderboard |
| 9 | Manager Scope | Login as manager | Sees own department only |
| 10 | Leaderboard Tabs | Switch leaderboard tabs | Different rankings shown |

### Integration Test

```typescript
// Test: Overview V2 API returns valid structure
describe('Overview V2 API', () => {
  it('returns all required sections', async () => {
    const res = await fetch('/api/ticketing/overview/v2?period=30')
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(json.data.counts_by_type).toBeDefined()
    expect(json.data.status_cards).toBeDefined()
    expect(json.data.response_time_metrics).toBeDefined()
    expect(json.data.sla_compliance).toBeDefined()
    expect(json.data.quotation_analytics).toBeDefined()
    expect(json.data.ops_cost_analytics).toBeDefined()
    expect(json.data.leaderboards).toBeDefined()
  })

  it('respects role-based scoping', async () => {
    // Login as manager
    const res = await fetch('/api/ticketing/overview/v2?period=30')
    const json = await res.json()

    expect(json.data.meta.scope).toBe('department')
  })
})
```

---

## 8. FILES CHANGED

| File | Change |
|------|--------|
| `src/components/ticketing/overview-dashboard-v2.tsx` | **NEW** - Complete dashboard rebuild |
| `src/app/(ticketing)/overview-ticket/page.tsx` | Updated to use V2 component |
| `docs/OVERVIEW_TICKETING_PAKET11.md` | **NEW** - This documentation |

### Existing Files Used (No Changes)
| File | Purpose |
|------|---------|
| `src/app/api/ticketing/overview/v2/route.ts` | API wrapper for RPC |
| `src/app/api/ticketing/overview/drilldown/route.ts` | Drilldown API |
| `supabase/migrations/093_overview_ticketing_v2.sql` | Main RPC function |
| `supabase/migrations/086_rejection_analytics_views.sql` | Rejection analytics views |

---

## 9. SUMMARY

### New Features
- Single API call for all dashboard data (V2 RPC)
- RFQ vs GEN breakdown for all metrics
- Clickable status cards with drilldown modals
- SLA compliance gauges with met/breached/pending breakdown
- Response time distribution visualization
- Quotation analytics with rejection reason breakdown
- Ops cost analytics with approval rate and turnaround
- Role-based leaderboards (completion, response speed, quotes, win rate)

### Role Scope Behavior
- **Director/Superadmin**: All departments + global leaderboards
- **Manager**: Department scope + department leaderboards
- **Staff**: Personal metrics only

### Quality Assurance
- All metrics backed by auditable SQL
- Drilldown counts match card numbers
- Role scope enforced at API and RPC level

---

**END OF PAKET 11 DOCUMENTATION**
