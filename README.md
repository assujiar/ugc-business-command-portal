# UGC Business Command Portal

> **Single Source of Truth (SSOT) Documentation**
> Version: 1.6.3 | Last Updated: 2026-02-06

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
│   └── migrations/                   # 136 SQL migrations
│       ├── 001-034                   # Core CRM tables
│       ├── 035-060                   # Ticketing system
│       ├── 061-090                   # Quotation system
│       ├── 091-128                   # Enhancements
│       ├── 129-132                   # Multi-shipment support
│       ├── 133-135                   # Bug fixes
│       └── 136                       # Schema fix: accepted_at/rejected_at
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
     │              │              └──→ Negotiation (rejection)
     │              │
     │              └──→ On Hold
     │
     └──→ Closed Lost / On Hold

Note: Closed Won/Lost are terminal states - no transitions allowed
```

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
TRIGGER: trg_opportunity_stage_history
ACTION:
  1. INSERT INTO opportunity_stage_history
  2. Record old_stage, new_stage, changed_by, changed_at
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
  9. INSERT ticket_events (status_changed + request_adjustment)
  10. INSERT activity (activity_type_v2='Email')
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
# Execute migrations 001-136 in order

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

### v1.6.3 (Current)
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
