# UGC Business Command Portal

> **Single Source of Truth (SSOT) Documentation**
> Version: 1.7.1 | Last Updated: 2026-02-09

A comprehensive Business Command Portal for **PT. Utama Global Indo Cargo (UGC Logistics)** integrating CRM, Ticketing, and Quotation management into a unified platform for freight forwarding operations.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Data Model](#data-model)
5. [User Roles & Permissions](#user-roles--permissions)
6. [Module: CRM](#module-crm)
7. [Module: Ticketing](#module-ticketing)
8. [Module: Quotations](#module-quotations)
9. [Workflows & State Machines](#workflows--state-machines)
10. [Auto-Update Mechanisms](#auto-update-mechanisms)
11. [API Reference](#api-reference)
12. [Database Schema](#database-schema)
13. [Installation & Setup](#installation--setup)
14. [Version History](#version-history)
15. [Technical Notes](#technical-notes)

---

## System Overview

### Business Context

UGC Logistics provides freight forwarding services including:
- **Domestics**: Land freight (LTL, FTL) within Indonesia
- **Export**: Sea (LCL/FCL) and Air freight from Indonesia
- **Import**: Sea and Air freight into Indonesia
- **Import DTD (Door-to-Door)**: Complete import with customs clearance

### System Purpose

The Business Command Portal handles:
1. **Lead Management**: Marketing qualification → Sales handover → Opportunity conversion
2. **Ticket Processing**: RFQ (Request for Quotation) handling from inquiry to closure
3. **Cost Calculation**: Internal operational cost quotes from Operations team
4. **Customer Quotations**: External quotes with margin calculation sent to customers
5. **Pipeline Tracking**: Sales opportunity lifecycle from prospecting to closed won/lost

### Key Metrics Tracked

| Metric | Description | SLA Target |
|--------|-------------|------------|
| First Response Time | Time from ticket creation to first cost submission | 4 hours |
| Resolution Time | Time from ticket creation to closure | 24-72 hours |
| Quote Sent Rate | Quotations sent vs tickets created | >80% |
| Win Rate | Accepted quotations vs sent quotations | >30% |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript |
| **Styling** | Tailwind CSS, shadcn/ui (Radix UI components) |
| **Database** | Supabase PostgreSQL with Row Level Security (RLS) |
| **Authentication** | Supabase Auth with SSR cookie handling |
| **State Management** | React Server Components + TanStack Query |
| **Forms** | React Hook Form + Zod validation |
| **Email** | Nodemailer SMTP integration |
| **PDF Generation** | Server-side HTML-to-PDF |
| **File Storage** | Supabase Storage |

---

## Architecture

### Project Structure

```
ugc-business-command-portal/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (crm)/                    # CRM pages (protected)
│   │   │   ├── dashboard/            # Main CRM dashboard
│   │   │   ├── lead-inbox/           # Marketing lead triage
│   │   │   ├── sales-inbox/          # Sales lead claiming
│   │   │   ├── my-leads/             # Personal claimed leads
│   │   │   ├── pipeline/             # Kanban pipeline board
│   │   │   ├── lead-bidding/         # Account details view
│   │   │   ├── nurture-leads/        # Long-term follow-up
│   │   │   └── disqualified-leads/   # Disqualified archive
│   │   │
│   │   ├── (ticketing)/              # Ticketing pages (protected)
│   │   │   ├── tickets/              # Ticket list & detail
│   │   │   ├── operational-costs/    # Cost quote management
│   │   │   ├── customer-quotations/  # Customer quotation management
│   │   │   ├── overview-ticket/      # Ticketing dashboard
│   │   │   └── performance/          # Performance metrics
│   │   │
│   │   ├── api/                      # API Routes (BFF pattern)
│   │   │   ├── crm/                  # CRM endpoints
│   │   │   ├── ticketing/            # Ticketing endpoints
│   │   │   └── public/               # Public endpoints (no auth)
│   │   │
│   │   ├── quotation-verify/[code]/  # Public quotation verification
│   │   └── login/                    # Authentication page
│   │
│   ├── components/
│   │   ├── crm/                      # CRM-specific components
│   │   ├── ticketing/                # Ticketing components
│   │   ├── shared/                   # Shared components
│   │   ├── providers/                # Context providers
│   │   └── ui/                       # shadcn/ui components
│   │
│   ├── lib/
│   │   ├── supabase/                 # Supabase client configurations
│   │   │   ├── server.ts             # Server-side client (SSR)
│   │   │   ├── admin.ts              # Service role client
│   │   │   └── client.ts             # Browser client
│   │   ├── constants.ts              # All app constants (SSOT)
│   │   ├── constants/
│   │   │   └── rate-components.ts    # 60+ cost component types
│   │   ├── email.ts                  # Email service
│   │   ├── utils.ts                  # Utility functions
│   │   └── permissions.ts            # Role-based permissions
│   │
│   ├── hooks/                        # Custom React hooks
│   └── types/                        # TypeScript definitions
│
├── supabase/
│   └── migrations/                   # 143 SQL migrations
│       ├── 001-034                   # Core CRM tables
│       ├── 035-060                   # Ticketing system
│       ├── 061-090                   # Quotation system
│       ├── 091-128                   # Enhancements
│       ├── 129-132                   # Multi-shipment support
│       ├── 133-136                   # Bug fixes & schema fixes
│       ├── 137-142                   # Audit fixes, RPC regressions, activity/stage fixes
│       └── 143                       # Fix rejection logging & mirror trigger
│
└── public/
    └── logo/                         # Brand assets
```

### Request Flow

```
Browser → Next.js App Router → API Route → Supabase RPC/Query → PostgreSQL
                                    ↓
                              RLS Policy Check
                                    ↓
                              Trigger Execution
                                    ↓
                              Auto-sync Related Data
```

---

## Data Model

### Entity Relationship Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   LEADS     │────→│  ACCOUNTS   │────→│  OPPORTUNITIES  │
│             │     │             │     │                 │
│ triage_status│    │ company_name│     │ stage           │
│ sales_owner │     │ owner_user  │     │ expected_value  │
└─────────────┘     └─────────────┘     └─────────────────┘
       │                  │                     │
       │                  │                     │
       ▼                  ▼                     ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  CONTACTS   │     │  ACTIVITIES │     │    TICKETS      │
│             │     │             │     │                 │
│ email       │     │ activity_type│    │ ticket_type     │
│ phone       │     │ status      │     │ status          │
└─────────────┘     └─────────────┘     └─────────────────┘
                                               │
                          ┌────────────────────┼────────────────────┐
                          │                    │                    │
                          ▼                    ▼                    ▼
                   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
                   │  SHIPMENT    │    │ OPERATIONAL  │    │  CUSTOMER    │
                   │  DETAILS     │    │ COSTS        │    │  QUOTATIONS  │
                   │              │    │              │    │              │
                   │ service_type │    │ amount       │    │ selling_rate │
                   │ origin/dest  │    │ rate_structure│   │ status       │
                   └──────────────┘    └──────────────┘    └──────────────┘
                                              │                    │
                                              └─────────┬──────────┘
                                                        │
                                                        ▼
                                               ┌──────────────────┐
                                               │ QUOTATION ITEMS  │
                                               │                  │
                                               │ component_type   │
                                               │ selling_rate     │
                                               └──────────────────┘
```

### Data Directional Flow

```
1. LEAD CREATION (Marketing)
   └─→ lead_handover_pool (auto on qualify)
       └─→ ACCOUNT (auto on claim)
           └─→ OPPORTUNITY (auto on claim/convert)
               └─→ TICKET (RFQ linked)
                   ├─→ SHIPMENT_DETAILS (1:N)
                   ├─→ OPERATIONAL_COST (internal quote)
                   │   └─→ COST_ITEMS (if breakdown)
                   └─→ CUSTOMER_QUOTATION (external quote)
                       └─→ QUOTATION_ITEMS (if breakdown)

2. STATUS SYNC (Bidirectional)
   QUOTATION.sent → OPPORTUNITY.stage = 'Quote Sent'
                  → TICKET.status = 'waiting_customer'
                  → COST.status = 'sent_to_customer'

   QUOTATION.accepted → OPPORTUNITY.stage = 'Closed Won'
                      → TICKET.status = 'closed'
                      → COST.status = 'accepted'
                      → ACCOUNT.status = 'active_account'

   QUOTATION.rejected → OPPORTUNITY.stage = 'Negotiation'
                      → TICKET.status = 'need_adjustment'
                      → COST.status = 'revise_requested'
```

---

## User Roles & Permissions

### Role Hierarchy

| Role | Code | Department | Access Level |
|------|------|------------|--------------|
| Director | `director` | Executive | Full access to all modules |
| Super Admin | `super admin` | IT | Full access + system config |
| Marketing Manager | `marketing_manager` | Marketing | Lead inbox, reports, triage |
| Sales Manager | `sales_manager` | Sales | Sales inbox, pipeline, quotations |
| Salesperson | `salesperson` | Sales | My leads, pipeline, quotations |
| EXIM Ops | `exim_ops` | Operations | Export/Import tickets, costs |
| Domestics Ops | `domestics_ops` | Operations | Domestic tickets, costs |
| Import DTD Ops | `import_dtd_ops` | Operations | DTD tickets, costs |
| Traffic & Warehouse | `traffic_warehouse` | Operations | Limited ticket access |
| Finance | `finance` | Finance | View quotations, costs |

### Permission Matrix

| Action | Director | Admin | Mkt Mgr | Sales Mgr | Sales | Ops | Finance |
|--------|----------|-------|---------|-----------|-------|-----|---------|
| View Lead Inbox | ✓ | ✓ | ✓ | - | - | - | - |
| Triage Leads | ✓ | ✓ | ✓ | - | - | - | - |
| Claim Leads | ✓ | ✓ | - | ✓ | ✓ | - | - |
| View Pipeline | ✓ | ✓ | - | ✓ | ✓ | - | - |
| Create Tickets | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| Submit Costs | ✓ | ✓ | - | - | - | ✓ | - |
| Create Quotations | ✓ | ✓ | - | ✓ | ✓ | - | - |
| Send Quotations | ✓ | ✓ | - | ✓ | ✓ | - | - |
| Accept/Reject Quotations | ✓ | ✓ | - | ✓ | ✓ | - | - |
| View Reports | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ |

---

## Module: CRM

### Lead Management

#### Lead Lifecycle States

```
┌─────────┐    triage    ┌───────────┐    qualify    ┌───────────┐
│   NEW   │ ──────────→  │ IN REVIEW │ ──────────→   │ QUALIFIED │
└─────────┘              └───────────┘               └───────────┘
     │                        │                            │
     │ disqualify             │ nurture                    │ auto-handover
     ▼                        ▼                            ▼
┌─────────────┐        ┌─────────────┐            ┌──────────────────┐
│ DISQUALIFIED│        │   NURTURE   │            │ HANDOVER POOL    │
└─────────────┘        └─────────────┘            └──────────────────┘
                                                          │
                                                          │ claim (race-safe)
                                                          ▼
                                                   ┌──────────────┐
                                                   │   CLAIMED    │
                                                   │ (My Leads)   │
                                                   └──────────────┘
                                                          │
                                                          │ convert
                                                          ▼
                                                   ┌──────────────┐
                                                   │ OPPORTUNITY  │
                                                   │ (Pipeline)   │
                                                   └──────────────┘
```

#### Lead Data Structure

```typescript
interface Lead {
  lead_id: string              // UUID primary key
  company_name: string         // Required
  contact_name: string
  contact_email: string
  contact_phone: string
  source: LeadSource           // Webform, Instagram, Event, etc.
  service_codes: string[]      // Requested services
  triage_status: TriageStatus  // New → In Review → Qualified/Nurture/Disqualified
  marketing_owner_user_id: string
  sales_owner_user_id: string
  handover_eligible: boolean   // Auto-set when qualified
  opportunity_id: string       // Link after conversion
  customer_id: string          // Link to account
}
```

### Pipeline Management

#### Opportunity Stages

| Stage | Days Allowed | Probability | Description |
|-------|--------------|-------------|-------------|
| Prospecting | 1 | 10% | Initial contact, needs identification |
| Discovery | 2 | 25% | Understanding requirements |
| Quote Sent | 1 | 50% | Quotation delivered to customer |
| Negotiation | 3 | 75% | Price/terms discussion |
| Closed Won | - | 100% | Deal successful |
| Closed Lost | - | 0% | Deal lost |
| On Hold | - | - | Temporarily paused |

#### Stage Transition Rules

```
Prospecting ──→ Discovery ──→ Quote Sent ──→ Negotiation ──→ Closed Won
     │              │              │              │
     │              │              │              └──→ Closed Lost
     │              │              │
     │              │              └──→ Negotiation (on rejection)
     │              │
     │              └──→ On Hold
     │
     └──→ Closed Lost / On Hold

Note: Closed Won/Lost are terminal states - no transitions allowed
```

**Automatic Stage Transitions (Migration 144)**:
- **Quotation Sent (1st time, no rejections)**: Prospecting/Discovery → Quote Sent
- **Quotation Sent (after previous rejection)**: ANY non-terminal stage → Negotiation (prioritized check)
- **Quotation Rejected**: ANY non-terminal stage (except Negotiation) → Negotiation
- **Quotation Accepted**: → Closed Won
- `v_previous_rejected_count` is calculated across `ticket_id`, `opportunity_id`, and `lead_id` (fallback) to handle cases where quotations resolve to different opportunities

### Account Status Lifecycle (Migration 148)

#### Status Enum

| Status | Description | Triggered By |
|--------|-------------|--------------|
| `calon_account` | Prospect/candidate | Lead claim, lead creation, or retry from failed |
| `new_account` | First deal completed | Opportunity won (from calon/failed/passive/lost) |
| `failed_account` | All opportunities lost | Last opportunity closed lost (only if no deals and no open opps) |
| `active_account` | Mature customer | 3+ months since first_transaction_date |
| `passive_account` | Idle customer | 1+ month since last_transaction_date |
| `lost_account` | Churned customer | 3+ months since last_transaction_date |

#### Transition Diagram

```
OPPORTUNITY-BASED (event-driven, stored immediately):

  Lead Claimed / Created
        │
        ▼
  ┌─────────────┐     Opp WON     ┌─────────────┐
  │calon_account│ ──────────────→  │ new_account  │
  └─────────────┘                  └─────────────┘
        │                                │
        │ ALL opps LOST                  │ Opp WON (reactivation)
        │ (no deals, no open opps)       │
        ▼                                │
  ┌──────────────┐                       │
  │failed_account│ ───── Opp WON ────────┘
  └──────────────┘
        │
        │ New Opp Created (auto-trigger)
        ▼
  ┌─────────────┐
  │calon_account│  (retry cycle)
  └─────────────┘

AGING-BASED (time-driven, computed on API read + cron):

  ┌─────────────┐  3mo since first_tx  ┌───────────────┐
  │ new_account  │ ──────────────────→  │active_account │
  └─────────────┘                       └───────────────┘
        │                                      │
        │  1mo idle                             │  1mo idle
        ▼                                      ▼
  ┌────────────────┐                    ┌────────────────┐
  │passive_account │                    │passive_account │
  └────────────────┘                    └────────────────┘
        │                                      │
        │  3mo idle                             │  3mo idle
        ▼                                      ▼
  ┌──────────────┐                      ┌──────────────┐
  │ lost_account │                      │ lost_account │
  └──────────────┘                      └──────────────┘
        │                                      │
        │  Opp WON (reactivation)              │  Opp WON
        ▼                                      ▼
  ┌─────────────┐                       ┌─────────────┐
  │ new_account  │                      │ new_account  │
  └─────────────┘                       └─────────────┘
```

#### Implementation Details

**Opportunity-Based Transitions** (handled by `sync_opportunity_to_account` + triggers):
- **WON**: `calon/failed/passive/lost` → `new_account` (sets transaction dates)
- **WON** (new/active): Only updates `last_transaction_date` (no status change)
- **LOST**: `calon` → `failed` **ONLY IF**: (1) no Closed Won opps exist, (2) no open opps remain
- **New Opportunity Created**: `failed` → `calon` (via `trg_reset_failed_on_new_opportunity` trigger)

**Aging-Based Transitions** (computed by `fn_compute_effective_account_status`):
- Priority: `lost` (3mo idle) > `passive` (1mo idle) > `active` (3mo mature)
- Applied on API read via `applyAccountAging()` TypeScript utility
- Periodically persisted via `fn_bulk_update_account_aging()` (cron-callable)
- View `v_accounts_with_status` includes `calculated_status` column

**Guard Conditions for LOST → FAILED**:
1. Account has NO opportunities with stage = 'Closed Won' (no deals)
2. Account has NO opportunities with stage NOT IN ('Closed Won', 'Closed Lost') (no open opps)
3. Account status is currently `calon_account`

---

## Module: Ticketing

### Ticket Types

| Type | Code | Description | Default Department |
|------|------|-------------|-------------------|
| RFQ | `RFQ` | Request for Quotation | Based on service type |
| General | `GEN` | General inquiry | Marketing |

### Ticket Status Flow

```
┌────────┐     assign      ┌───────────────┐
│  OPEN  │ ─────────────→  │ NEED_RESPONSE │
└────────┘                 └───────────────┘
                                  │
                                  │ cost submitted
                                  ▼
                          ┌───────────────┐     quotation sent    ┌───────────────────┐
                          │  IN_PROGRESS  │ ───────────────────→  │ WAITING_CUSTOMER  │
                          └───────────────┘                       └───────────────────┘
                                                                         │
                                  ┌──────────────────────────────────────┤
                                  │                                      │
                          quotation rejected                     quotation accepted
                                  ▼                                      ▼
                          ┌───────────────┐                       ┌───────────┐
                          │NEED_ADJUSTMENT│                       │  CLOSED   │
                          └───────────────┘                       │  (won)    │
                                  │                               └───────────┘
                                  │ new cost submitted
                                  └──→ IN_PROGRESS (loop)
```

### Ticket Code Format

```
[TYPE][DEPT][ddmmyy][XXX]

Examples:
- RFQDOM030226001 = RFQ for Domestics, 03 Feb 2026, sequence 1
- RFQEXI030226015 = RFQ for EXIM, 03 Feb 2026, sequence 15
- GENMKT030226003 = General ticket for Marketing, sequence 3
```

### Department Routing

| Service Scope | Department Code | Ops Role |
|---------------|-----------------|----------|
| Domestics | DOM | domestics_ops |
| Export | EXI | exim_ops |
| Import | EXI | exim_ops |
| Import DTD | DTD | import_dtd_ops |

### Multi-Shipment Support

A single ticket can contain multiple shipments:

```typescript
interface ShipmentDetail {
  shipment_detail_id: string
  shipment_order: number         // 1, 2, 3...
  shipment_label: string         // "Shipment 1", "Shipment 2"
  service_type_code: string      // DOM, EXI, DTD

  // Route
  origin_city: string
  origin_country: string
  destination_city: string
  destination_country: string

  // Cargo
  cargo_description: string
  weight_total_kg: number
  volume_total_cbm: number

  // For Domestics
  fleet_type?: string            // Blindvan, CDD, etc.
  fleet_quantity?: number

  // For Export/Import
  incoterm?: string              // FOB, CIF, EXW, etc.
}
```

---

## Module: Quotations

### Operational Cost (Internal)

Internal cost quote created by Operations team:

```typescript
interface OperationalCost {
  id: string
  ticket_id: string
  quote_number: string           // Auto-generated
  amount: number                 // Total cost (internal)
  currency: string               // IDR, USD
  rate_structure: 'bundling' | 'breakdown'
  status: QuoteStatus
  valid_until: Date

  // For multi-shipment
  shipment_detail_id?: string    // Which shipment this cost is for
  is_current: boolean            // Latest cost for this shipment
}
```

### Customer Quotation (External)

External quote sent to customer with margin applied:

```typescript
interface CustomerQuotation {
  id: string
  ticket_id: string
  quotation_number: string       // QUO-YYYYMM-XXXX
  validation_code: string        // UUID for public access

  // Customer
  customer_name: string
  customer_email: string
  customer_phone: string

  // Pricing
  total_cost: number             // INTERNAL - never expose!
  target_margin_percent: number
  total_selling_rate: number     // Customer sees this
  currency: string

  // Multi-shipment data
  shipments: ShipmentData[]      // JSONB array
  operational_cost_ids: string[] // Array of linked costs

  // Status & Timestamps
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
  sent_via: 'email' | 'whatsapp' | 'manual'
  sent_at: Date
  accepted_at: Date | null    // Set when accepted (Migration 136)
  rejected_at: Date | null    // Set when rejected (Migration 136)

  // Terms
  terms_includes: string[]
  terms_excludes: string[]
  validity_days: number
  valid_until: Date
}
```

### Rate Structures

#### Bundling Mode
- Single total price shown to customer
- Internal: `total_cost` + `margin` = `selling_rate`
- Customer sees only `total_selling_rate`

#### Breakdown Mode
- Itemized price list shown to customer
- Each item: `cost_amount` + `margin` = `selling_rate`
- Items prefixed with shipment number for multi-shipment

```
Shipment 1: Sea Freight .................. IDR 15,000,000
Shipment 1: THC Origin ................... IDR 2,500,000
Shipment 1: Customs Clearance ............ IDR 3,000,000
Shipment 2: Sea Freight .................. IDR 18,000,000
Shipment 2: THC Origin ................... IDR 2,800,000
```

### Quotation Outputs

| Output | Format | Access | Shows Per-Shipment |
|--------|--------|--------|-------------------|
| Internal PDF | HTML | Authenticated | Yes |
| Public PDF | HTML | Public (via validation_code) | Yes |
| Email HTML | HTML | Customer inbox | Yes |
| WhatsApp | Plain text | Customer WhatsApp | Yes |
| Validation Page | Web | Public (via validation_code) | Yes |

### Security: Cost vs Selling Rate

```
┌─────────────────────────────────────────────────────────────┐
│                    INTERNAL ONLY                            │
│  ┌─────────────┐      ┌─────────────┐                      │
│  │ cost_amount │  +   │   margin    │   (visible to staff) │
│  └─────────────┘      └─────────────┘                      │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   CUSTOMER FACING                           │
│                   ┌──────────────┐                          │
│                   │ selling_rate │   (visible to customer)  │
│                   └──────────────┘                          │
└─────────────────────────────────────────────────────────────┘

CRITICAL: cost_amount must NEVER appear in:
- Public PDF
- Validation page API response
- Email/WhatsApp content
- Any customer-facing document
```

---

## Workflows & State Machines

### Quotation State Machine

```
┌─────────┐    send     ┌────────┐
│  DRAFT  │ ─────────→  │  SENT  │
└─────────┘             └────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        customer       customer      validity
        accepts        rejects       expires
              │             │             │
              ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌─────────┐
        │ ACCEPTED │  │ REJECTED │  │ EXPIRED │
        └──────────┘  └──────────┘  └─────────┘
             │
             │ (terminal - can create new quotation)
```

### Operational Cost State Machine

```
┌─────────┐   submit    ┌───────────┐
│  DRAFT  │ ─────────→  │ SUBMITTED │
└─────────┘             └───────────┘
                              │
                   quotation sent to customer
                              ▼
                    ┌─────────────────────┐
                    │  SENT_TO_CUSTOMER   │
                    └─────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        quotation       quotation        quotation
        accepted        rejected         expired
              │               │               │
              ▼               ▼               ▼
        ┌──────────┐  ┌────────────────┐  ┌─────────┐
        │ ACCEPTED │  │ REVISE_REQUEST │  │ EXPIRED │
        └──────────┘  └────────────────┘  └─────────┘
                              │
                    new cost submitted
                              │
                              └──→ SUBMITTED (new cost record)
```

---

## Auto-Update Mechanisms

### Trigger-Based Updates

#### 1. Lead Handover (on qualify)
```sql
-- When lead status changes to 'Qualified'
TRIGGER: trg_lead_auto_handover
ACTION:
  1. Set handover_eligible = TRUE
  2. Create lead_handover_pool entry
  3. Set expires_at = NOW() + 7 days
```

#### 2. Opportunity Stage History
```sql
-- When opportunity.stage changes
TRIGGER: trg_log_stage_change (AFTER UPDATE on opportunities)
ACTION:
  1. INSERT INTO opportunity_stage_history
  2. Record from_stage, to_stage, old_stage, new_stage, changed_by, changed_at
  NOTE: Only fires when auth.uid() IS NOT NULL (user-client calls).
        For adminClient calls (RPCs), stage history is inserted manually by the RPC.

TRIGGER: trg_autofill_stage_history (BEFORE INSERT on opportunity_stage_history) [Migration 149]
ACTION:
  1. Auto-fill to_stage   ← COALESCE(to_stage, new_stage)
  2. Auto-fill from_stage ← COALESCE(from_stage, old_stage)
  3. Auto-fill old_stage  ← COALESCE(old_stage, from_stage)
  4. Auto-fill new_stage  ← COALESCE(new_stage, to_stage)
  NOTE: Ensures column pair compatibility. Any INSERT with EITHER
        (from_stage/to_stage) OR (old_stage/new_stage) will succeed.
```

#### 3. Quotation Status Sync (RPC)
```sql
-- rpc_customer_quotation_mark_sent
ACTION:
  1. UPDATE quotation.status = 'sent'
  2. UPDATE opportunity.stage = 'Quote Sent'
  3. UPDATE ticket.status = 'waiting_customer'
  4. UPDATE ALL costs.status = 'sent_to_customer'
  5. INSERT ticket_event
  6. INSERT activity

-- rpc_customer_quotation_mark_accepted
ACTION:
  1. UPDATE quotation.status = 'accepted', accepted_at = NOW()
  2. UPDATE opportunity.stage = 'Closed Won', estimated_value, closed_at
  3. UPDATE ticket.status = 'closed' (close_outcome = 'won')
  4. UPDATE ALL costs.status = 'accepted' (single + multi-shipment)
  5. UPDATE account.account_status = 'active_account'
  6. UPDATE lead.quotation_status = 'accepted'
  7. INSERT opportunity_stage_history (old_stage, new_stage, changed_by)
  8. INSERT pipeline_updates (approach_method='Email', old_stage, new_stage)
  9. INSERT activity (activity_type_v2='Email')
  10. UPDATE ticket_sla_tracking.resolution_at
  11. INSERT ticket_events (status_changed + closed)

-- rpc_customer_quotation_mark_rejected
ACTION:
  1. UPDATE quotation.status = 'rejected', rejected_at = NOW()
  2. INSERT quotation_rejection_reasons (with competitor/budget data)
  3. UPDATE opportunity.stage = 'Negotiation'
  4. UPDATE ticket.status = 'need_adjustment', pending_response_from = 'assignee'
  5. UPDATE ALL costs.status = 'revise_requested' (single + multi-shipment)
  6. UPDATE lead.quotation_status = 'rejected'
  7. INSERT opportunity_stage_history (old_stage, new_stage, changed_by)
  8. INSERT pipeline_updates (approach_method='Email', old_stage, new_stage)
  9. INSERT ticket_events (customer_quotation_rejected + request_adjustment)
  10. INSERT ticket_comments (is_internal=FALSE, visible to all users) [Migration 143]
  11. INSERT activity (activity_type_v2='Email')
```

#### 4. Cost Supersession
```sql
-- When new cost is submitted for same shipment
TRIGGER: trg_cost_supersede_per_shipment
ACTION:
  1. SET is_current = FALSE for previous cost (same shipment_detail_id)
  2. SET is_current = TRUE for new cost
```

#### 5. SLA Tracking
```sql
-- On first cost submission
TRIGGER: trg_update_sla_on_cost
ACTION:
  1. UPDATE ticket_sla_tracking.first_response_at = NOW()
  2. Calculate first_response_met based on SLA config

-- On ticket resolution
TRIGGER: trg_update_sla_on_close
ACTION:
  1. UPDATE ticket_sla_tracking.resolution_at = NOW()
  2. Calculate resolution_met based on SLA config
```

### Multi-Shipment Sync (v1.6.0+)

When a quotation with multiple shipments is created/updated:

```sql
-- Creating quotation with operational_cost_ids = [cost_A, cost_B]
ACTION:
  1. UPDATE cost_A.customer_quotation_id = quotation.id
  2. UPDATE cost_B.customer_quotation_id = quotation.id

-- When quotation is sent/accepted/rejected
ACTION:
  1. UPDATE cost_A.status = new_status
  2. UPDATE cost_B.status = new_status
  -- Both costs updated atomically in same transaction
```

---

## API Reference

### CRM Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/crm/leads` | List leads with filters |
| POST | `/api/crm/leads` | Create new lead |
| GET | `/api/crm/leads/[id]` | Get lead detail |
| PATCH | `/api/crm/leads/[id]` | Update lead |
| POST | `/api/crm/leads/[id]/triage` | Change triage status |
| POST | `/api/crm/leads/[id]/handover` | Handover to sales |
| POST | `/api/crm/leads/claim` | Claim lead (race-safe) |
| POST | `/api/crm/leads/[id]/convert` | Convert to opportunity |
| GET | `/api/crm/opportunities` | List opportunities |
| POST | `/api/crm/opportunities/[id]/stage` | Change stage |
| GET | `/api/crm/views/pipeline` | Pipeline kanban data |
| GET | `/api/crm/views/lead-inbox` | Marketing inbox |
| GET | `/api/crm/views/sales-inbox` | Sales inbox |

### Ticketing Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ticketing/tickets` | List tickets |
| POST | `/api/ticketing/tickets` | Create ticket |
| GET | `/api/ticketing/tickets/[id]` | Get ticket detail |
| PATCH | `/api/ticketing/tickets/[id]` | Update ticket |
| POST | `/api/ticketing/tickets/[id]/assign` | Assign ticket |
| POST | `/api/ticketing/tickets/[id]/transition` | Change status |
| GET | `/api/ticketing/operational-costs` | List costs |
| POST | `/api/ticketing/operational-costs` | Create cost |
| POST | `/api/ticketing/operational-costs/batch` | Batch create (multi-shipment) |

### Quotation Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ticketing/customer-quotations` | List quotations |
| POST | `/api/ticketing/customer-quotations` | Create quotation |
| GET | `/api/ticketing/customer-quotations/[id]` | Get quotation |
| POST | `/api/ticketing/customer-quotations/[id]/send` | Send quotation |
| POST | `/api/ticketing/customer-quotations/[id]/accept` | Accept quotation |
| POST | `/api/ticketing/customer-quotations/[id]/reject` | Reject quotation |
| GET | `/api/ticketing/customer-quotations/[id]/pdf` | Generate PDF |
| GET | `/api/public/quotation/[code]/pdf` | Public PDF access |
| GET | `/api/ticketing/customer-quotations/validate/[code]` | Validate code |

---

## Database Schema

### Core Tables

| Table | Description | Key Fields |
|-------|-------------|------------|
| `profiles` | User accounts | user_id, role, department |
| `accounts` | Customer companies | account_id, company_name, owner_user_id |
| `contacts` | Contact persons | contact_id, account_id, email |
| `leads` | Lead records | lead_id, triage_status, sales_owner_user_id |
| `opportunities` | Sales deals | opportunity_id, stage, account_id |
| `activities` | Tasks/calls/meetings | activity_id, activity_type, status |

### Ticketing Tables

| Table | Description | Key Fields |
|-------|-------------|------------|
| `tickets` | Main ticket | id, ticket_code, status, department |
| `ticket_events` | Audit trail | ticket_id, event_type, actor_user_id |
| `ticket_rate_quotes` | Operational costs | id, ticket_id, amount, status |
| `ticket_rate_quote_items` | Cost breakdown | quote_id, component_type, cost_amount |
| `ticket_sla_tracking` | SLA metrics | ticket_id, first_response_at |
| `shipment_details` | Multi-shipment | shipment_detail_id, ticket_id |

### Quotation Tables

| Table | Description | Key Fields |
|-------|-------------|------------|
| `customer_quotations` | Customer quotes | id, quotation_number, status |
| `customer_quotation_items` | Quote breakdown | quotation_id, selling_rate |
| `customer_quotation_rejection_reasons` | Rejection details | quotation_id, reason_type |
| `quotation_term_templates` | Terms library | term_type, term_text |

---

## Installation & Setup

### Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase account (or local Supabase)

### Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email (for quotation sending)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM=noreply@ugc.co.id

# Optional
SALES_MANAGER_EMAIL=sales.manager@ugc.co.id  # Low margin notification fallback
```

### Setup Steps

```bash
# 1. Clone and install
git clone <repository>
cd ugc-business-command-portal
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your values

# 3. Run migrations (in Supabase SQL Editor)
# Execute migrations 001-143 in order

# 4. Start development
npm run dev
```

### Build Commands

```bash
npm run dev      # Development server
npm run build    # Production build
npm run lint     # ESLint check
npx tsc --noEmit # TypeScript check
```

---

## Version History

### v1.7.1 (Current)
- **Fix Quotation Rejection/Sent Activity Timeline (Migration 149)**: Fixed rejection events not appearing in ticket activity
  - **Root Cause**: `rpc_customer_quotation_mark_rejected` and `rpc_customer_quotation_mark_sent` INSERT into `opportunity_stage_history` with only `old_stage`/`new_stage` columns, but `to_stage` is NOT NULL (migration 004). When called via `adminClient` (service_role), the `log_stage_change()` trigger **skips** (`auth.uid()` = NULL, by design in migration 023), so the RPC's manual INSERT runs and **fails**. The `EXCEPTION WHEN OTHERS` handler rolls back the **entire transaction** — including `ticket_events` and `ticket_comments` — and returns `{success: false}`.
  - **Why mark_sent appeared to work**: Stage changes only on FIRST send (Prospecting/Discovery → Quote Sent). Resends and already-at-Quote-Sent cases skip the INSERT. Rejection ALWAYS changes stage (→ Negotiation) on first reject.
  - **Fix**: Added `trg_autofill_stage_history` BEFORE INSERT trigger on `opportunity_stage_history` that auto-fills `to_stage` from `new_stage` (and vice versa). This ensures any INSERT with either column pair succeeds.
  - **No duplicate risk**: AdminClient calls skip the `log_stage_change()` trigger (auth.uid()=NULL), so only the RPC's manual INSERT runs. User-client calls trigger `log_stage_change()` first, and the RPC's dedup check finds the record and skips.

### v1.7.0
- **Account Status Lifecycle Logic (Migration 148)**: Comprehensive account status transitions based on opportunity outcomes and transaction aging
  - **New Function**: `fn_compute_effective_account_status()` — computes aging-based status (lost > passive > active priority)
  - **Updated**: `sync_opportunity_to_account()` — added "has deal" and "has open opportunities" guards for LOST→FAILED transition
  - **Updated**: WON path now reactivates `passive/lost` accounts back to `new_account`
  - **New Trigger**: `trg_reset_failed_on_new_opportunity` — auto-resets `failed_account` → `calon_account` when new opportunity is created
  - **Fixed**: `v_accounts_with_status` view CASE evaluation order (was: active > lost > passive, now: lost > passive > active)
  - **New**: `fn_bulk_update_account_aging()` — cron-callable function for batch aging updates
  - **New**: `src/lib/account-status.ts` — TypeScript aging utility applied on API response
  - **Fixed**: Pipeline update API removed direct account_status update (delegated to trigger to avoid double-update)
  - **Fixed**: Lead claim route now explicitly sets `account_status: 'calon_account'`
  - **Removed**: Duplicate trigger `trg_sync_account_on_opportunity_create` (superseded)

### v1.6.7
- **Fix Mark Won/Lost Stage History (Migration 147)**: Fixed `to_stage` NOT NULL violation when closing tickets
  - **Root Cause**: `opportunity_stage_history` has 4 stage columns: `from_stage`/`to_stage` (original, NOT NULL) + `old_stage`/`new_stage` (added migration 023). The manual INSERT in RPCs only filled `old_stage`/`new_stage`, leaving `to_stage` NULL
  - **Previous Error (Migration 146)**: Fixed type mismatch (`v_old_stage TEXT` → `opportunity_stage`), which unmasked the `to_stage` NOT NULL error
  - **Fix**: Removed redundant manual INSERT from both `rpc_ticket_mark_won` and `rpc_ticket_mark_lost`. The `log_stage_change()` trigger on the `opportunities` table already creates the history entry with all 4 columns when stage is updated

### v1.6.6
- **Hotfix: RLS Infinite Recursion (Migration 145)**: Fixed 42P17 error that broke ALL ticket, quotation, and operational cost access
  - **Root Cause**: Migration 144's `tickets_select_policy` used `EXISTS (SELECT FROM customer_quotations)`, but `customer_quotations_select` RLS queries `tickets` — creating circular dependency
  - **Fix**: Created `is_quotation_creator_for_ticket(UUID, UUID)` SECURITY DEFINER helper that bypasses RLS on `customer_quotations`
  - **Fix**: Updated all 3 affected policies (tickets, ticket_events, ticket_comments) to use helper function instead of direct EXISTS subquery

### v1.6.5
- **Fix Sent Pipeline Stage & Ticket Visibility (Migration 144)**: Fixed pipeline not transitioning to Negotiation and ticket_id showing null
  - **Root Cause 1**: `v_previous_rejected_count` only checked by `opportunity_id` — if Q1 and Q2 resolve to different opportunities, count is 0 and stage stays at Quote Sent
  - **Root Cause 2**: Stage transition logic checked `Prospecting/Discovery → Quote Sent` BEFORE checking for previous rejections — so even with rejections, a new opportunity goes to Quote Sent
  - **Root Cause 3**: `tickets_select_policy` RLS did NOT include quotation creators — the GET endpoint's ticket join returned null for users who created quotations but didn't create/get assigned to the ticket
  - **Root Cause 4**: `mark_sent` comment used `is_internal=TRUE` (same bug as rejection, fixed in 143 but not for sent)
  - **Root Cause 5**: Mirror trigger created `ticket_responses` entry for events with direct RPC comments, causing duplicate SLA tracking entries
  - **Fix**: `v_previous_rejected_count` now checks by `ticket_id` AND `opportunity_id` (with `lead_id` as fallback when `ticket_id` is null)
  - **Fix**: Stage transition reordered — previous rejections → Negotiation regardless of current stage (unless already Negotiation/terminal)
  - **Fix**: Updated `tickets_select_policy` to include quotation creators (ticket join now returns data)
  - **Fix**: Sent comment now `is_internal=FALSE` — visible to sales users in activity timeline
  - **Fix**: Mirror trigger now skips entirely (`RETURN NEW`) for events with direct RPC comments (prevents duplicate ticket_responses)
  - **Fix**: GET endpoint now accepts both `snake_case` and `camelCase` query params for robustness
  - **Observability**: Added RAISE NOTICE for pipeline stage transition debugging

### v1.6.4
- **Fix Rejection Logging (Migration 143)**: Fixed quotation rejection not appearing in ticket activity
  - **Root Cause 1**: `source_event_id` column was BIGINT but `ticket_events.id` is UUID — mirror trigger silently failed on every event
  - **Root Cause 2**: Rejection comment used `is_internal=TRUE` — RLS hides internal comments from non-ops/non-admin users (e.g., sales)
  - **Root Cause 3**: Missing `quotation_number` in rejection event `new_value` JSONB — auto-comments were incomplete
  - **Fix**: Corrected `source_event_id` to UUID, mirror trigger now works properly
  - **Fix**: Rejection comment now `is_internal=FALSE` — visible to all users with ticket access
  - **Fix**: Event `new_value` now includes `quotation_id`, `quotation_number`, `competitor_name`, `competitor_amount`, `customer_budget`
  - **Fix**: Updated RLS policies — quotation creators can now see ticket events/comments for linked tickets
  - **Fix**: Comment now created even when ticket is closed/resolved (previously skipped in ELSE branch)
  - **Fix**: Mirror trigger skips auto-comment for events with direct RPC comments (avoids duplicates)
  - **Fix**: Added `SET search_path` to mirror trigger function for security
  - **Performance**: Added composite index `(ticket_id, created_by)` on `customer_quotations` for RLS subquery
  - **Observability**: RPC now returns `ticket_events_created` and `ticket_comment_created` in response
  - **Logging**: Improved structured logging in reject API route with `[CustomerQuotation REJECT]` prefix
- **Migrations 137-142** (accumulated fixes from prior sessions):
  - Migration 137: Comprehensive audit fixes (RPC comments, function signatures)
  - Migration 138: Fix RPC regressions and grants
  - Migration 139-140: Deep audit fixes
  - Migration 141: Fix migration 140 compile errors
  - Migration 142: Fix quotation activity & stage transition (Quote Sent → Negotiation on 2nd+ quotation after rejection)
  - Migration 143: Fix rejection logging & mirror trigger (source_event_id UUID, is_internal=FALSE, RLS for quotation creators)
  - Migration 144: Fix sent pipeline stage & ticket visibility (broadened rejected count, mirror trigger dedup, tickets RLS)
  - Migration 145: Hotfix RLS infinite recursion — SECURITY DEFINER helper `is_quotation_creator_for_ticket()` for tickets/events/comments policies
  - Migration 146: Fix mark_won/mark_lost type mismatch — `v_old_stage TEXT` → `opportunity_stage`, explicit casts
  - Migration 147: Fix mark_won/mark_lost to_stage NOT NULL — removed redundant manual INSERT, trigger handles it
  - Migration 148: Account status lifecycle — aging function, sync guards, failed→calon trigger, view fix

### v1.6.3
- **Schema Fix (Migration 136)**: Definitively fixed "column accepted_at/rejected_at does not exist" error
  - Added `accepted_at TIMESTAMPTZ` column to `customer_quotations` table
  - Added `rejected_at TIMESTAMPTZ` column to `customer_quotations` table
  - Backfilled existing accepted/rejected quotations with timestamps from `updated_at`
  - Recreated `rpc_customer_quotation_mark_accepted` with all accumulated fixes
  - Recreated `rpc_customer_quotation_mark_rejected` with all accumulated fixes
  - Added partial indexes for query performance
  - Consolidated fixes: TEXT opportunity_id type, safe v_return_ticket_status
- **Column/Table Mismatch Fixes (Migration 136 audit)**: Corrected 8 schema mismatches in RPC functions
  - `pipeline_updates` INSERT: fixed columns from `update_type/old_value/new_value` to `approach_method/old_stage/new_stage`
  - `pipeline_updates` NOT EXISTS check: fixed from `update_type` to `old_stage/new_stage`
  - `quotation_rejection_reasons`: fixed table name from `customer_quotation_rejection_reasons`
  - `opportunities` UPDATE: fixed `expected_value` → `estimated_value`, `close_date` → `closed_at`
  - `accounts` UPDATE: fixed column `status` → `account_status`
  - `tickets` UPDATE: removed non-existent `closed_by` column
  - `pending_response_from`: fixed enum value from `'ops'` → `'assignee'` (valid response_owner)
  - Added `service_role` GRANT for both RPC functions (required by adminClient API calls)
- **TypeScript Types**: Added `CustomerQuotation`, `CustomerQuotationItem` interfaces, `QuotationRejectionReasonType` enum
- **UI Updates**: Added accepted_at/rejected_at display in quotation detail and "Response" column in dashboard

### v1.6.2
- **Accept/Reject Fix (Migration 135)**: Attempted fix for "column does not exist" errors
  - Removed references to accepted_at/rejected_at from RPC functions
  - Fixed opportunity_id type regression (TEXT not UUID)
  - Superseded by v1.6.3 which adds the missing columns instead

### v1.6.1
- **Activity Timeline Fix (Migration 133)**: Fixed quotation activity not appearing in timeline
- **v_ticket NULL Fix (Migration 134)**: Fixed "v_ticket is not assigned yet" error
- **Redundant Sections Removed**: Hide aggregate sections for multi-shipment (shown per-shipment)
- **Security Fix**: Removed cost_amount from public APIs
- **Per-Shipment Display**: Added service type, weight, volume, incoterm per shipment

### v1.6.0
- **Multi-Shipment Cost Sync**: All operational_cost_ids updated atomically
- **is_current Per Shipment**: Changed unique constraint from per-ticket to per-shipment
- **Margin Validation**: Required explicit margin input, low margin warning at 15%
- **Low Margin Notification**: Email to Sales Manager for quotations below 15%

### v1.5.x
- Multi-shipment quotation display with per-shipment sections
- Cost revision flow for multi-shipment
- Batch cost API for multi-shipment tickets

---

## Technical Notes

### Opportunity ID Type

The `opportunities.opportunity_id` is TEXT (not UUID) with format "OPP20260129608534".

```sql
-- CORRECT: Use TEXT type
v_effective_opportunity_id TEXT := NULL;
v_derived_opportunity_id TEXT := NULL;

-- WRONG: Causes "Invalid input syntax for type uuid"
v_effective_opportunity_id UUID := NULL;
```

### Customer Quotations Timestamp Columns

The `customer_quotations` table status-related columns:

| Column | Type | Added In | Description |
|--------|------|----------|-------------|
| status | ENUM | Migration 050 | draft, sent, accepted, rejected, expired |
| sent_at | TIMESTAMPTZ | Migration 050 | When quotation was sent to customer |
| updated_at | TIMESTAMPTZ | Migration 050 | Last modification timestamp |
| rejection_reason | TEXT | Migration 061 | Rejection reason type |
| accepted_at | TIMESTAMPTZ | **Migration 136** | When quotation was accepted |
| rejected_at | TIMESTAMPTZ | **Migration 136** | When quotation was rejected |

**History**: `accepted_at` and `rejected_at` were planned in the original BLUEPRINT but omitted from migration 050. Migration 131 introduced RPC references to these columns (causing errors). Migration 136 adds them properly with backfill.

### Ticket Activity Visibility (RLS)

Ticket events and comments are protected by Row Level Security. Visibility rules:

| User Type | Ticket Events | Non-Internal Comments | Internal Comments |
|-----------|--------------|----------------------|-------------------|
| Director / Super Admin | All | All | All |
| Ops (EXIM, Domestics, DTD, Traffic) | All | All | All |
| Ticket Creator | Their tickets | Their tickets | Hidden |
| Ticket Assignee | Their tickets | Their tickets | Hidden |
| Quotation Creator (Migration 143) | Linked tickets | Linked tickets | Hidden |

**Important (Migration 144)**:
- Both rejection and sent RPCs create comments with `is_internal = FALSE` — visible to sales users
- The mirror trigger's auto-comments use `is_internal = TRUE` (ops/admin only)
- To avoid duplicate comments AND duplicate `ticket_responses`, the mirror trigger skips entirely (`RETURN NEW`) for events with direct RPC comments (`customer_quotation_rejected`, `customer_quotation_sent`)
- SLA tracking for these events is handled by `trigger_auto_record_response` on the direct comment INSERT
- **Tickets RLS (Migration 144)**: Quotation creators can now see tickets linked to their quotations, ensuring the ticket join in GET `/api/ticketing/customer-quotations` returns data

### Opportunity Stage History Dual-Column Architecture

The `opportunity_stage_history` table has **two pairs of stage columns** for historical reasons:

| Column | Type | Nullable | Added In | Purpose |
|--------|------|----------|----------|---------|
| `from_stage` | opportunity_stage | YES | Migration 004 | Legacy: source stage |
| `to_stage` | opportunity_stage | **NO** | Migration 004 | Legacy: target stage (NOT NULL!) |
| `old_stage` | opportunity_stage | YES | Migration 023 | New: source stage |
| `new_stage` | opportunity_stage | **NO** | Migration 023 | New: target stage (NOT NULL!) |

**Key behaviors:**
- **`log_stage_change()` trigger** (migration 023): Fires on `opportunities` UPDATE, inserts ALL 4 columns. **Skips when `auth.uid()` is NULL** (adminClient/service_role calls).
- **RPC manual INSERTs** (migrations 143, 144): Only specify `old_stage`/`new_stage` (not `from_stage`/`to_stage`).
- **`trg_autofill_stage_history`** (migration 149): BEFORE INSERT trigger that auto-fills missing columns between pairs. Ensures any INSERT with either column pair succeeds.
- **Dedup pattern**: RPCs use `NOT EXISTS (...changed_at > NOW() - INTERVAL '1 minute')` to prevent duplicates when both trigger and manual INSERT would run.

**When writing new code**: Always insert using ALL 4 columns for explicitness. The auto-fill trigger is a safety net, not a design pattern.

### Multi-Shipment Data Structure

```typescript
// Stored in customer_quotations.shipments JSONB
interface ShipmentData {
  shipment_detail_id: string
  origin_city: string
  destination_city: string
  cost_amount: number        // INTERNAL ONLY
  selling_rate: number       // Customer facing
  margin_percent: number
  service_type_code?: string
  weight_total_kg?: number
  volume_total_cbm?: number
  incoterm?: string
}
```

---

## Support

**PT. Utama Global Indo Cargo (UGC Logistics)**
- Email: service@ugc.co.id
- Web: www.utamaglobalindocargo.com

---

*This documentation is the Single Source of Truth (SSOT) for the UGC Business Command Portal. Update this document when making changes to the system.*
