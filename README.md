# UGC Business Command Portal

> **Single Source of Truth (SSOT) Documentation**
> Version: 2.1.1 | Last Updated: 2026-02-12

A comprehensive Business Command Portal for **PT. Utama Global Indo Cargo (UGC Logistics)** integrating CRM, Ticketing, and Quotation management into a unified platform for freight forwarding operations.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Data Model](#data-model)
5. [User Roles & Permissions](#user-roles--permissions)
6. [Module: CRM](#module-crm)
7. [Module: CRM Dashboard](#module-crm-dashboard)
8. [Module: Ticketing](#module-ticketing)
9. [Module: Quotations](#module-quotations)
10. [Workflows & State Machines](#workflows--state-machines)
11. [Auto-Update Mechanisms](#auto-update-mechanisms)
12. [API Reference](#api-reference)
13. [Database Schema](#database-schema)
14. [Installation & Setup](#installation--setup)
15. [Version History](#version-history)
16. [Technical Notes](#technical-notes)

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
| **AI Insights** | Google Gemini API for growth analytics |
| **Charts** | Recharts (LineChart, BarChart, PieChart) |

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
│   │   │   ├── searchable-select.tsx # Searchable dropdown (for large option lists)
│   │   │   ├── country-select.tsx    # Country dropdown with search
│   │   │   └── multi-shipment-form.tsx # Multi-shipment input form
│   │   ├── providers/                # Context providers
│   │   └── ui/                       # shadcn/ui components
│   │
│   ├── lib/
│   │   ├── supabase/                 # Supabase client configurations
│   │   │   ├── server.ts             # Server-side client (SSR)
│   │   │   ├── admin.ts              # Service role client
│   │   │   └── client.ts             # Browser client
│   │   ├── insights/                 # AI Insight system
│   │   │   ├── gemini-client.ts      # Gemini API calls for growth insights
│   │   │   └── snapshot-builder.ts   # Builds data snapshot for AI
│   │   ├── constants.ts              # All app constants (SSOT)
│   │   ├── constants/
│   │   │   └── rate-components.ts    # 60+ cost component types
│   │   ├── email.ts                  # Email service
│   │   ├── account-status.ts         # Account aging computation (TS mirror of SQL)
│   │   ├── utils.ts                  # Utility functions
│   │   └── permissions.ts            # Role-based permissions
│   │
│   ├── hooks/                        # Custom React hooks
│   └── types/                        # TypeScript definitions
│
├── supabase/
│   └── migrations/                   # 172 SQL migrations
│       ├── 001-034                   # Core CRM tables
│       ├── 035-060                   # Ticketing system
│       ├── 061-090                   # Quotation system
│       ├── 091-128                   # Enhancements
│       ├── 129-132                   # Multi-shipment support
│       ├── 133-136                   # Bug fixes & schema fixes
│       ├── 137-142                   # Audit fixes, RPC regressions, activity/stage fixes
│       ├── 143-145                   # Fix rejection logging, sent pipeline, RLS recursion
│       ├── 146-149                   # Fix mark_won/lost, account lifecycle, stage history
│       ├── 150-152                   # Fix mark_sent fallback, trigger interference, ambiguous opp
│       ├── 153                       # Countries reference table
│       ├── 154-157                   # Marketing module (social media, content plan, token refresh)
│       ├── 158-159                   # Fix accepted/rejected pipeline_updates columns
│       ├── 171                       # Fix accepted UUID type, activity subjects, link trigger, lead_id derivation
│       └── 172                       # Fix accepted account column name (status→account_status via sync_opportunity_to_account)
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

### Data Directional Flow & Cardinality

```
1. LEAD CREATION (Marketing)
   └─→ lead_handover_pool (auto on qualify)
       └─→ ACCOUNT (auto on claim)                        [1 Lead → 1 Account]
           └─→ OPPORTUNITY (auto on claim/convert)        [1 Account → N Opportunities]
               └─→ TICKET (RFQ linked)                    [1 Opportunity → 1 Ticket]
                   ├─→ SHIPMENT_DETAILS (1:N)              [1 Ticket → N Shipments]
                   ├─→ OPERATIONAL_COST (internal quote)   [1 Shipment → 1 Active Cost (is_current)]
                   │   └─→ COST_ITEMS (if breakdown)
                   └─→ CUSTOMER_QUOTATION (external quote) [1 Cost → 1 Customer Quotation]
                       └─→ QUOTATION_ITEMS (if breakdown)  [N Costs → 1 Quotation (multi-shipment)]

   Bidirectional linking:
   - customer_quotations.operational_cost_id ← single cost reference
   - customer_quotations.operational_cost_ids ← UUID[] array for multi-shipment
   - ticket_rate_quotes.customer_quotation_id ← back-reference (set by link trigger)

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

| Role | DB Value | Department | Access Level |
|------|----------|------------|--------------|
| Director | `Director` | Executive | Full access to all modules |
| Super Admin | `super admin` | IT | Full access + system config |
| Marketing Manager | `Marketing Manager` | Marketing | Lead inbox, reports, triage |
| MACX | `MACX` | Marketing | Same as Marketing Manager (all marketing dept data) |
| Marcomm | `Marcomm` | Marketing | Own leads only |
| DGO | `DGO` | Marketing | Own leads only |
| VDCO | `VDCO` | Marketing | Own leads only |
| Sales Manager | `sales manager` | Sales | All sales team data |
| Sales Support | `sales support` | Sales | All sales team data (view), own data (edit) |
| Salesperson | `salesperson` | Sales | Own leads, pipeline, quotations |
| EXIM Ops | `EXIM Ops` | Operations | Export/Import tickets, costs |
| Domestics Ops | `domestics Ops` | Operations | Domestic tickets, costs |
| Import DTD Ops | `Import DTD Ops` | Operations | DTD tickets, costs |
| Traffic & Warehouse | `traffic & warehous` | Operations | Limited ticket access |
| Finance | `finance` | Finance | DSO/AR (coming soon), Performance |

### Permission Matrix

| Action | Director | Admin | Mkt Mgr/MACX | Sales Mgr | Sales Support | Salesperson | Marcomm/DGO/VDCO | Ops | Finance |
|--------|----------|-------|-------------|-----------|---------------|-------------|-------------------|-----|---------|
| View Lead Inbox | ✓ | ✓ | ✓ | - | - | - | ✓ | - | - |
| Triage Leads | ✓ | ✓ | ✓ | - | - | - | ✓ | - | - |
| Handover Leads | ✓ | ✓ | ✓ | - | - | - | ✓ | - | - |
| Claim Leads | ✓ | ✓ | - | ✓ | ✓ | ✓ | - | - | - |
| View Pipeline | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | - |
| Update Pipeline | ✓ | ✓ | - | - | - | ✓ (own) | - | - | - |
| View Accounts | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | - |
| Create Tickets | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| Submit Op Costs | ✓ | ✓ | - | - | - | - | - | ✓ | - |
| Create Quotations | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | - |
| View Reports | ✓ | ✓ | ✓ | ✓ | ✓ | - | - | ✓ | - |

### Module Access by Role (Sidebar Visibility)

| Module | Sales | Marketing | Ops | Finance | Director/Admin |
|--------|-------|-----------|-----|---------|----------------|
| CRM | Yes | Yes | No | No | Yes |
| Ticketing | Yes | Yes | Yes | No | Yes |
| Marketing Panel | No | Yes | No | No | Yes |
| DSO/AR | Yes | No | No | Yes | Yes |
| Performance | Yes | Yes | Yes | Yes | Yes |

### Post-Login Redirect by Role

| Role | Default Redirect |
|------|-----------------|
| Sales (salesperson, sales manager, sales support) | `/overview-crm` |
| Marketing (Marketing Manager, Marcomm, DGO, MACX, VDCO) | `/marketing/overview` |
| Ops (EXIM Ops, domestics Ops, Import DTD Ops, traffic & warehous) | `/overview-ticket` |
| Finance | `/overview-crm` (DSO coming soon) |
| Director / super admin | `/overview-crm` |

### Dashboard Data Scoping by Role

| Role | Leads | Opportunities & Accounts | Pipeline/Activities | Ticketing Analytics |
|------|-------|--------------------------|---------------------|---------------------|
| Director / super admin | All data | All data | All data | All departments |
| Sales Manager | All sales leads | All sales opps/accounts | All sales activities | Sales department |
| Sales Support | All sales leads | All sales opps/accounts | All sales activities | Sales department |
| Salesperson | Own leads only | Own opps/accounts only | Own activities only | Own tickets only |
| Marketing Manager / MACX | All marketing dept leads | Opps/accounts from marketing leads (`original_creator_id` in marketing dept) | Marketing-originated | Marketing department |
| Marcomm / DGO / VDCO | Own leads only | Opps/accounts from own leads (`original_creator_id = userId`) | Own-originated | Own tickets only |
| Ops roles | N/A (redirected) | N/A | N/A | Own department |
| Finance | N/A | N/A | N/A | No access |

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

## Module: CRM Dashboard

### Overview (`/overview-crm`)

The CRM Dashboard is the main analytics hub for Sales and Marketing departments. It provides comprehensive role-based analytics with drill-down capabilities.

### Architecture

- **Server Component**: `src/app/(crm)/overview-crm/page.tsx` — Fetches all data from Supabase via `adminClient` (bypasses RLS), applies role-based scoping, serializes to client
- **Client Component**: `src/components/crm/crm-dashboard-content.tsx` — Renders all dashboard sections with interactive charts (Recharts)
- **AI Insights**: `src/components/crm/dashboard-insights-section.tsx` + `growth-insights-card.tsx` — Period-selectable AI-powered insights via Gemini

### Data Sources

| Table | Fields Used | Purpose |
|-------|-------------|---------|
| `leads` | lead_id, company_name, source, triage_status, handed_over_at, claimed_at, account_id, created_by | Lead analytics, MQL time |
| `opportunities` | opportunity_id, stage, estimated_value, original_creator_id, closed_at, lost_reason | Pipeline analytics |
| `accounts` | account_id, account_status, industry, original_creator_id | Account status, industry analytics |
| `activities` | activity_id, activity_type, status, owner_user_id | Activity tracking |
| `sales_plans` | plan_id, plan_type, status, potential_status | Sales plan analytics |
| `pipeline_updates` | update_id, approach_method, updated_by | Activity by method |
| `customer_quotations` | status, total_selling_rate, service_type | Service analytics, deal value |
| `tickets` (RFQ) | rfq_data (JSONB: service_type, cargo_category, origin/dest) | RFQ analytics |
| `opportunity_stage_history` | old_stage, new_stage, changed_at | Sales cycle calculation |
| `profiles` (sales) | user_id, name, role | Leaderboard, filters |
| `profiles` (marketing) | user_id, name, role | Marketing dept scoping |

### Dashboard Sections

#### For All Roles (Sales + Marketing)

| Section | Description |
|---------|-------------|
| **My Performance Summary** | 4 KPI cards: Pipeline Value, Won Value/Deal Value, Win Rate, Avg Sales Cycle |
| **Pipeline Funnel** | Stage breakdown (Prospecting → Negotiation) with count and % |
| **Weekly Analytics** | Line chart showing pipeline movement over last 12 weeks |
| **Account Status** | 6-status breakdown (calon/new/active/passive/lost/failed) with % |
| **Quick Actions** | Links to Pipeline, Activities, Sales Plan, Accounts, etc. |
| **Lost Pipeline Analysis** | Interactive bar chart with lost reasons, value, and percentage |
| **Industry (Bidang Usaha)** | Horizontal bar chart of accounts by industry |
| **Service Analytics** | Pie chart of quotations by service type with status breakdown |
| **RFQ Analytics** | Service type, cargo category, and top routes from RFQ tickets |

#### Sales-Specific Sections

| Section | Description | Roles |
|---------|-------------|-------|
| **Salesperson Filter** | Dropdown to filter by salesperson | Sales Manager, Sales Support, Admin |
| **Lead Source** | Lead distribution by source with conversion count | Sales Manager, Sales Support, Admin |
| **Activity by Method** | Site Visit, Phone, Online Meeting, WhatsApp, Email, Texting | Sales, Admin |
| **Sales Plan** | Plan type and status breakdown | Sales, Admin |
| **Leaderboard** | Top 5 by won value, pipeline value, activities | Sales Manager, Admin |
| **Salesperson Performance** | Detailed table per salesperson | Sales Manager, Sales Support, Admin |

#### Marketing-Specific Sections

| Section | Description | Roles |
|---------|-------------|-------|
| **Lead Status Analysis** | Triage status breakdown (New/In Review/Qualified/Assign to Sales/Nurture/Disqualified) with count and % | Marketing dept, Admin |
| **Lead-to-MQL Time** | Time from lead creation to handover, categorized (<1h, 1-2h, 2-6h, 6-12h, 12-24h, >24h) with average | Marketing dept, Admin |
| **MQL Conversion Rate** | Pie chart showing lead → account status conversion (Won/On Progress/Failed/No Account) | Marketing dept, Admin |

### Marketing Data Scoping Logic

Marketing roles see only data originated from their department's leads, using `original_creator_id`:

```
DGO/Marcomm/VDCO (individual staff):
├── Leads: created_by = userId OR marketing_owner_user_id = userId
├── Opportunities: original_creator_id = userId
└── Accounts: original_creator_id = userId

Marketing Manager / MACX (department managers):
├── Leads: marketing_owner_user_id IS NOT NULL
├── Opportunities: original_creator_id IN (all marketing dept user IDs)
└── Accounts: original_creator_id IN (all marketing dept user IDs)
```

### AI Insights (Gemini)

- **Period Selection**: Filter Aktif (URL params), Mingguan (week number), Bulanan (month), Year-to-Date
- **System Instruction**: Requires temporal comparison (weekly/monthly/YTD growth)
- **Data Snapshot**: Built from all dashboard data via `snapshot-builder.ts`
- **Output Format**: Executive summary, KPI table, recommendations, risk alerts

### Percentage Display

All charts and analytics sections display both count and percentage (%) against total:
- Pipeline funnel stages show `count (x%)` format
- Account status cards show percentage below count
- Lost reasons show both count% and value%
- Service/RFQ/Industry analytics include percentage in badges and tooltips

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

### Creation Paths (All Verified End-to-End)

#### Customer Quotation Creation Paths (4)

| # | Source | Entry Point | Route | Key Fields |
|---|--------|-------------|-------|------------|
| 1 | Ticket | Ticket detail → Create Quotation | POST `/api/ticketing/customer-quotations` | ticket_id, source_type='ticket' |
| 2 | Lead | Lead detail dialog → Create Quotation | POST `/api/ticketing/customer-quotations` | lead_id, source_type='lead', direct_quotation=true |
| 3 | Opportunity | Pipeline detail dialog → Create Quotation | POST `/api/ticketing/customer-quotations` | opportunity_id, lead_id, source_type='opportunity', direct_quotation=true |
| 4 | Standalone | Quotation dashboard → New Quotation | POST `/api/ticketing/customer-quotations` | source_type='standalone', direct_quotation=true |

#### Ticket Creation Paths (5)

| # | Source | Entry Point | Route |
|---|--------|-------------|-------|
| 1 | Standalone | Sidebar → Tickets → New | `/tickets/new` |
| 2 | Lead | Lead detail → Create Ticket | `/tickets/new?from=lead&lead_id=...` |
| 3 | Opportunity | Pipeline detail → Create Ticket | `/tickets/new?from=opportunity&opportunity_id=...` |
| 4 | Account | Account detail → Tickets tab → Create Ticket | `/tickets/new?from=account&account_id=...` |
| 5 | Dashboard | Ticket dashboard → New Ticket | `/tickets/new` |

#### Opportunity Creation Paths (2)

| # | Source | Entry Point | Route |
|---|--------|-------------|-------|
| 1 | Lead | Lead detail → Convert to Opportunity | POST `/api/crm/leads/[id]/create-opportunity` |
| 2 | Account | Account detail → Create Opportunity | POST `/api/crm/opportunities/create` |

### Quotation Dialog Tabs (Multi-Shipment Support)

The `CustomerQuotationDialog` has 6 tabs, all supporting multi-shipment:

| Tab | Multi-Shipment | Description |
|-----|---------------|-------------|
| Customer | N/A (shared) | Customer info applies to all shipments |
| Service | Shipment selector | Per-shipment service type, fleet/incoterm, cargo details |
| Route | Shipment selector | Per-shipment origin/destination with city, country, port, address |
| Rate | Per-shipment display | Bundling: per-shipment rate cards. Breakdown: grouped items |
| Terms | N/A (shared) | Scope of work, includes/excludes apply to entire quotation |
| Preview | Per-shipment details | Full summary with service, route, cargo, and rate per shipment |

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
  1. SET GUC flag 'app.in_quotation_rpc' = 'true' (prevents trigger interference) [Migration 171]
  2. UPDATE quotation.status = 'sent'
  3. Resolve/create opportunity via fn_resolve_or_create_opportunity (fallback to quotation.opportunity_id)
  4. UPDATE opportunity.stage = 'Quote Sent' (first send, no rejections) or 'Negotiation' (after rejection)
  5. UPDATE ticket.status = 'waiting_customer'
  6. UPDATE ALL costs.status = 'sent_to_customer' (single + multi-shipment)
  7. UPDATE lead.quotation_status = 'sent', quotation_count++
  8. INSERT opportunity_stage_history (from_stage, to_stage, old_stage, new_stage — all 4 columns)
  9. INSERT pipeline_updates (approach_method='Email', old_stage, new_stage)
  10. INSERT ticket_events (customer_quotation_sent) + ticket_comments (is_internal=FALSE)
  11. INSERT activity (subject='Pipeline Update: {old} → {new}', activity_type_v2='Email', related_lead_id=derived) [Migration 171]

-- rpc_customer_quotation_mark_accepted
ACTION:
  1. UPDATE quotation.status = 'accepted', accepted_at = NOW()
  2. UPDATE opportunity.stage = 'Closed Won', estimated_value, closed_at
  3. UPDATE ticket.status = 'closed' (close_outcome = 'won')
  4. UPDATE ALL costs.status = 'accepted' (single + multi-shipment)
  5. CALL sync_opportunity_to_account(opp_id, 'won') → account_status lifecycle [Migration 172]
  6. UPDATE lead.quotation_status = 'accepted'
  7. INSERT opportunity_stage_history (from_stage, to_stage, old_stage, new_stage — all 4 columns)
  8. INSERT pipeline_updates (approach_method='Email', old_stage, new_stage)
  9. INSERT activity (subject='Pipeline Update: {old} → Closed Won', activity_type_v2='Email', related_lead_id=derived) [Migration 171]
  10. UPDATE ticket_sla_tracking.resolution_at
  11. INSERT ticket_events (status_changed + closed)
  NOTE: opportunity_id variables are TEXT type (not UUID) — "OPP2026021268704A" format [Migration 171]

-- rpc_customer_quotation_mark_rejected
ACTION:
  1. UPDATE quotation.status = 'rejected', rejected_at = NOW()
  2. INSERT quotation_rejection_reasons (with competitor/budget data)
  3. UPDATE opportunity.stage = 'Negotiation'
  4. UPDATE ticket.status = 'need_adjustment', pending_response_from = 'assignee'
  5. UPDATE ALL costs.status = 'revise_requested' (single + multi-shipment)
  6. UPDATE lead.quotation_status = 'rejected'
  7. INSERT opportunity_stage_history (from_stage, to_stage, old_stage, new_stage — all 4 columns)
  8. INSERT pipeline_updates (approach_method='Email', old_stage, new_stage)
  9. INSERT ticket_events (customer_quotation_rejected + request_adjustment)
  10. INSERT ticket_comments (is_internal=FALSE, visible to all users) [Migration 143]
  11. INSERT activity (subject='Pipeline Update: {old} → {new}', activity_type_v2='Email', related_lead_id=derived) [Migration 171]
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

### Multi-Shipment Sync (v1.6.0+, fixed in v2.1.0)

When a quotation with multiple shipments is created/updated:

```sql
-- Creating quotation with operational_cost_ids = [cost_A, cost_B]
-- Trigger: link_quotation_to_operational_cost (AFTER INSERT on customer_quotations)
ACTION:
  1. UPDATE cost_A.customer_quotation_id = quotation.id  (via operational_cost_id — single)
  2. UPDATE cost_A.customer_quotation_id = quotation.id  (via operational_cost_ids array — multi-shipment) [Migration 171]
  3. UPDATE cost_B.customer_quotation_id = quotation.id  (via operational_cost_ids array — multi-shipment) [Migration 171]

-- When quotation is sent/accepted/rejected
ACTION:
  1. UPDATE cost_A.status = new_status
  2. UPDATE cost_B.status = new_status
  -- Both costs updated atomically in same transaction
```

**Important (Migration 171)**: Prior to v2.1.0, the `link_quotation_to_operational_cost` trigger only handled `operational_cost_id` (single). Multi-shipment quotations using `operational_cost_ids` array had `customer_quotation_id = NULL` in their `ticket_rate_quotes`. Migration 171 fixes this and includes a backfill query.

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
# Execute migrations 001-172 in order

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

### v2.1.1 (Current)
- **Fix mark_accepted Total Rollback (Migration 172)**: Fixed all 4 acceptance bugs caused by ONE root cause — wrong column name `status` instead of `account_status` in `UPDATE accounts`
  - **Root Cause**: Migration 159 changed the correct column reference `account_status` (from migration 136) to `status` (wrong). This was hidden because the UUID type bug prevented reaching that code. Migration 171 fixed the UUID bug, exposing this column-name bug. The `EXCEPTION WHEN OTHERS` handler caught the "column status does not exist" error and **rolled back the entire transaction** — reverting quotation status, opportunity stage, activity, pipeline_updates, and preventing ticket closure.
  - **Bug #1 (Account)**: Account didn't change from `calon_account` → `new_account` on first accepted quotation
  - **Bug #2 (Pipeline)**: Pipeline didn't move to `Closed Won` (UPDATE rolled back by exception)
  - **Bug #3 (Activity)**: No activity/pipeline_updates/stage_history created (INSERT rolled back by exception)
  - **Bug #4 (Ticket)**: Ticket didn't auto-close (code AFTER the account UPDATE was never reached)
  - **Fix**: Replaced broken direct `UPDATE accounts SET status = 'active_account'` with `sync_opportunity_to_account(opportunity_id, 'won')` which:
    - Uses correct column name `account_status`
    - Handles full lifecycle: `calon_account` → `new_account` (first deal), `failed/passive/lost` → `new_account` (reactivation)
    - Sets `first_transaction_date` and `last_transaction_date` properly
    - Wrapped in nested `BEGIN..EXCEPTION` block to prevent any future account-related issues from cascading to the main transaction

### v2.1.0
- **Fix mark_accepted UUID Type Error (Migration 171, Bug #7)**: Fixed `"invalid input syntax for type uuid: \"OPP2026021268704A\""` when accepting a customer quotation
  - **Root Cause**: Migration 159 re-introduced `v_derived_opportunity_id UUID` and `v_effective_opportunity_id UUID` declarations in `rpc_customer_quotation_mark_accepted`. Since `opportunity_id` is TEXT type (values like "OPP2026021268704A"), PostgreSQL fails on assignment. Migration 135 had fixed this to TEXT, but 159 regressed it.
  - **Fix**: Changed both variable declarations from `UUID` to `TEXT` in migration 171.
- **Fix Activity Subject Format (Migration 171, Bug #1)**: Activity records from quotation lifecycle events now use standardized "Pipeline Update: {old_stage} → {new_stage}" subject format
  - **Before**: "1st Quotation Rejected → Stage moved to Negotiation"
  - **After**: "Pipeline Update: Quote Sent → Negotiation"
  - Applied to all three RPCs: `mark_rejected`, `mark_accepted`, `mark_sent`
  - When stage does not change (e.g., already at Negotiation), falls back to "{nth} Quotation Rejected" format
- **Fix Multi-Shipment Link Trigger (Migration 171, Bug #2)**: `link_quotation_to_operational_cost` trigger now handles `operational_cost_ids` array for multi-shipment quotations
  - **Root Cause**: Trigger only checked `NEW.operational_cost_id` (single), not `NEW.operational_cost_ids` (UUID array for multi-shipment). Multi-shipment quotations had `customer_quotation_id = NULL` in their `ticket_rate_quotes`.
  - **Fix**: Added array handling block to trigger function. Includes backfill query for existing data.
- **Fix Pipeline Auto-Update for Quotations from Pipeline (Bug #3)**: PATCH endpoint now syncs `total_selling_rate` to `opportunity.estimated_value` when rate data changes
  - Ensures quotations created from the opportunity/pipeline menu correctly update the pipeline when edited
  - Only syncs to non-terminal opportunities (excludes Closed Won/Closed Lost)
- **Fix lead_id Derivation (Migration 171, Bug #4-5)**: All RPCs now derive `lead_id` via priority chain: `quotation.lead_id` → `opportunity.source_lead_id` → `ticket.lead_id`
  - Ensures activity records have correct `related_lead_id` even for pipeline-originated quotations where `quotation.lead_id` is NULL
  - Returns `lead_id` in RPC response JSONB for traceability
- **Fix Timeline Duplicate Grouping (Bug #6)**: Added Rule 8 to `deduplicateTimelineItems` — events from same user within same second are grouped into one response
  - Exception: cost items (showing amounts) are always kept separate
  - Uses badge type priority to keep the most meaningful event when collapsing duplicates
- **Fix mark_sent Missing GUC Flag (Migration 171)**: Added `set_config('app.in_quotation_rpc', 'true', true)` to `rpc_customer_quotation_mark_sent` which was missing from migration 150
  - Prevents AFTER UPDATE trigger `trg_quotation_status_sync` from interfering with the RPC's atomic operations
- **mark_sent Stage History Fix**: Stage history INSERT now uses all 4 columns (from_stage, to_stage, old_stage, new_stage) for full compatibility

### v2.0.0
- **Comprehensive CRM Dashboard Overhaul**: Complete redesign of `/overview-crm` with role-based analytics
  - **My Performance Summary**: 4 KPI cards (Pipeline Value, Won+Deal Value, Win Rate, Avg Sales Cycle)
  - **Pipeline Funnel**: Stage breakdown with interactive drill-down, count and percentage display
  - **Weekly Analytics**: 12-week line chart tracking pipeline creation, won, and lost trends
  - **Account Status**: 6-status grid (calon/new/active/passive/lost/failed) with percentages
  - **Lost Pipeline Analysis**: Interactive Recharts bar chart with lost reasons, value percentages
  - **Industry Analytics**: Horizontal bar chart of accounts by bidang usaha (industry)
  - **Service Analytics**: Pie chart from customer quotations by service type with accepted/sent/rejected status breakdown
  - **RFQ Analytics**: Service type breakdown, cargo category badges, and top routes from RFQ ticket data
  - **Leaderboard**: Top 5 by won value, pipeline value, and activity count
  - **Salesperson Performance Table**: Detailed per-person metrics for managers
- **Marketing Department Dashboard**: Full analytics parity with sales department
  - **Marketing Data Scoping**: Opportunities and accounts now filtered by `original_creator_id` for marketing roles
    - DGO/Marcomm/VDCO: Only see data from leads they created
    - Marketing Manager/MACX: See data from all marketing department leads
  - **Lead Status Analysis**: Triage status breakdown (New/In Review/Qualified/Assign to Sales/Nurture/Disqualified)
  - **Lead-to-MQL Time**: Time analysis from lead creation to handover, categorized (<1h to >24h) with average
  - **MQL Conversion Rate**: Pie chart showing lead → account status conversion (Won/On Progress/Failed/No Account)
  - **Quick Actions**: Lead Management, Lead Inbox links for marketing users
- **Percentage Display on All Charts**: Every chart and analytics section now shows count and value percentages against total
  - Pipeline funnel, Account status, Lost reasons, Industry, Service, RFQ, Activity by method
- **AI Insights Period Selector**: Choose analysis period: Filter Aktif, Mingguan (week), Bulanan (month), Year-to-Date
  - Week/month/year dropdown selectors for precise period control
  - Updated Gemini prompt with temporal context for period-aware analysis
- **Unified Activity Count**: Activities count now matches Activities submenu (combines sales_plans + pipeline_updates + activities with deduplication)
- **Sales Plan Data Fix**: Fixed `source_account_id` column reference (was incorrectly using `account_id`)
- **Won Pipeline Deal Value**: Now shows both estimated_value and customer quotation deal value

### v1.9.0
- **Fix Pipeline Activity for Quotation Rejection/Acceptance (Migration 158)**: Fixed activities not appearing in pipeline activity when quotation is rejected or accepted
  - **Root Cause**: `rpc_customer_quotation_mark_accepted` (from migration 133) used wrong column names for `pipeline_updates` INSERT: `update_type`, `old_value`, `new_value`. The actual table has `approach_method`, `old_stage`, `new_stage` (migration 014). This caused the INSERT to fail silently in EXCEPTION block, resulting in ZERO pipeline_updates and activities records.
  - **Fix**: Redefined `mark_accepted` with correct column names and added GUC flag `app.in_quotation_rpc` to prevent AFTER UPDATE trigger interference.
  - **Impact**: Pipeline activities now reliably appear for all quotation lifecycle events (sent, rejected, accepted).
- **Activities Page Enhancement**: Now fetches from 3 data sources instead of 2:
  - `sales_plans` (manual sales activities)
  - `pipeline_updates` (stage change records)
  - `activities` table (quotation lifecycle events created by RPC functions)
  - Deduplication logic prevents double-counting between pipeline_updates and activities
- **Timeline Deduplication Enhancement**: Reduced spam in ticket activity timeline
  - Extended dedup window from 5s to 30s for related events
  - Rule 5: Lifecycle events (rejected/accepted/sent) absorb status_changed events from same actor
  - Rule 6: Lifecycle events absorb auto-generated events (assigned, adjustment) from same actor
  - Rule 7: Consecutive status_changed events from same user within 30s window keep only the latest
- **Role-Based Post-Login Redirect**: Users now redirect to their department's home page after login
  - Sales dept → `/overview-crm`
  - Ops dept → `/overview-ticket`
  - Marketing dept → `/marketing/overview`
  - Finance → `/overview-crm` (DSO coming soon)
  - Director/SuperAdmin → `/overview-crm`
- **RBAC Menu Access Control**: Sidebar now enforces strict module visibility by role
  - Sales: CRM, Ticketing, Performance, DSO/AR
  - Marketing: CRM, Ticketing, Marketing Panel, Performance
  - Ops: Ticketing, Performance only (CRM hidden)
  - Finance: DSO/AR, Performance only
  - Director/SuperAdmin: All modules
- **DSO/AR Module Placeholder**: Added DSO/AR module section in sidebar with "Coming Soon" indicator
- **Page-Level Access Guards**: Ops users redirected from `/overview-crm` to `/overview-ticket`

### v1.8.0
- **Comprehensive Dashboard RBAC Audit & Fix**: Audited all 17+ dashboard pages and 40+ API routes for role-based data access issues
  - **CRM Dashboard**: Fixed Ops/finance roles seeing ALL data (no filter applied). Now restricts to own data only.
  - **Accounts Page**: Added `canAccessPipeline()` access control. Previously any authenticated user could access `/accounts` directly.
  - **Account Detail Page**: Added `canAccessPipeline()` authorization check.
  - **Pipeline Page**: Fixed `sales support` role filtering — now sees all sales pipelines (consistent with `canViewPipeline()` permissions), not just own data.
  - **Nurture/Disqualified Leads**: Added `canAccessLeadManagement()` redirect for unauthorized roles.
- **API Route Permission Hardening**: Added missing role/ownership checks to 4 critical API endpoints:
  - `POST /api/crm/leads/claim`: Added `canClaimLeads()` check (prevents non-sales users from claiming)
  - `POST /api/crm/leads/[id]/triage`: Added `canTriageLeads()` check (prevents non-marketing users from triaging)
  - `POST /api/crm/leads/[id]/handover`: Added `canTriageLeads()` check (prevents unauthorized handover)
  - `POST /api/crm/pipeline/update`: Added `canUpdatePipeline()` ownership check (prevents unauthorized pipeline modifications)
- **Sidebar Enhancement**: Added Performance page link to Ticketing module navigation
- **README Updated**: Comprehensive RBAC matrix with all 15 roles, dashboard data scoping table, updated permission matrix

### v1.7.5
- **Multi-Shipment Quotation Dialog Enhancement**: All 6 tabs now fully accommodate multi-shipment quotations
  - **Route tab**: Added shipment selector — users can now switch between shipments to view/edit route details (origin/destination city, country, port, address) per shipment
  - **Preview tab**: Enhanced to show per-shipment service type, route, cargo category, weight/volume, fleet/incoterm, cost, and margin — previously only showed route and selling rate
  - **Service tab**: Already had shipment selector (unchanged)
  - **Rate tab**: Already displayed per-shipment breakdown (unchanged)
- **Searchable Select Component**: Created `SearchableSelect` for large dropdown lists, applied to:
  - Rate Component Type (186+ items), Service Type (19 items), Fleet Type (15 items), Incoterm (11 items), Unit of Measure (15 items)
  - Applied across 6 files: customer-quotation-dialog, customer-quotation-edit-form, multi-shipment-form, multi-shipment-cost-dialog, ticket-detail
- **Creation Path Verification**: Verified all 11 creation paths end-to-end (4 quotation + 5 ticket + 2 opportunity)
  - Fixed `direct_quotation: true` missing in lead-detail-dialog and pipeline-dashboard quotation creation
  - Added "Create Ticket" button to account-detail Tickets tab header
- **Countries Reference Table (Migration 153)**: Added `countries` table with 250 countries + ISO codes, `CountrySelect` component
- **Timeline Deduplication**: Fixed duplicate entries in ticket activity timeline

### v1.7.4
- **Fix AMBIGUOUS_OPPORTUNITY + Mark Sent Trigger Interference (Migration 152)**: Fixed quotation send failing with "Multiple opportunities found" when account has multiple active opportunities
  - **Root Cause 1**: `fn_resolve_or_create_opportunity` calls `fn_repair_orphan_opportunity` when quotation's opportunity_id is orphaned. The repair function returns `AMBIGUOUS_OPPORTUNITY` error when ticket/lead/account point to different opportunities. The resolve function hard-fails on this error (when `p_allow_autocreate=FALSE`), never reaching Steps 2-6 which handle multiple opportunities gracefully.
  - **Fix 1**: Updated `fn_resolve_or_create_opportunity` to continue to Steps 2-6 when repair fails with AMBIGUOUS, instead of returning error immediately. Step 3 uses `LIMIT 1 ORDER BY updated_at DESC` which handles multiple opportunities per account.
  - **Root Cause 2**: `mark_sent` has same trigger interference as `mark_rejected` — `trg_quotation_status_sync` fires AFTER UPDATE and competes with the RPC.
  - **Fix 2**: Added GUC flag (`app.in_quotation_rpc`) before quotation UPDATE in mark_sent, same as migration 151. Also saves `ticket_id` before UPDATE RETURNING for robustness.
  - **Fix 3**: mark_sent no longer hard-fails on fn_resolve errors — logs warning and uses fallback to quotation.opportunity_id.

### v1.7.3
- **Fix Rejection Trigger-RPC Interference (Migration 151)**: Fixed `ticket_events_created=0` despite `success=true` — rejection events never appearing in ticket activity
  - **Root Cause**: AFTER UPDATE trigger `trg_quotation_status_sync` on `customer_quotations` fires when status changes to 'rejected', calling `sync_quotation_to_all` → `sync_quotation_to_ticket`. This trigger and the RPC (`rpc_customer_quotation_mark_rejected`) **compete** to do the same work (update ticket, create events, update opportunity). The trigger's `EXCEPTION WHEN OTHERS` creates a savepoint — if any sub-function fails, ALL trigger operations roll back, corrupting the state that the RPC depends on.
  - **Fix Part 1**: Updated `trigger_sync_quotation_on_status_change` to skip when called from RPC context (`app.in_quotation_rpc` GUC flag) or `service_role` JWT (all API routes use adminClient). The trigger now only fires for direct user updates (e.g., Supabase dashboard).
  - **Fix Part 2**: Redefined `rpc_customer_quotation_mark_rejected` to set `app.in_quotation_rpc='true'` before the quotation UPDATE, preventing trigger interference. Also saves `ticket_id` before UPDATE RETURNING for robustness, broadens `previous_rejected_count` to check by ticket_id + lead_id, and adds comprehensive RAISE NOTICE debugging.
  - **Impact**: Rejection events now reliably appear in ticket activity timeline.

### v1.7.2
- **Fix Mark Sent Opportunity Fallback (Migration 150)**: Fixed pipeline not updating stage when sending revised quotation after rejection
  - **Root Cause**: `rpc_customer_quotation_mark_sent` relies entirely on `fn_resolve_or_create_opportunity` to return the opportunity_id. If the resolve function returns no rows or NULL opportunity_id without an error code, `v_effective_opportunity_id` stays NULL — skipping the entire opportunity section (stage transitions, pipeline_updates, activities) even when the quotation already has an opportunity_id.
  - **Contrast**: `rpc_customer_quotation_mark_rejected` correctly starts with `v_effective_opportunity_id := v_quotation.opportunity_id` and derives from lead/ticket if null.
  - **Fix**: Added fallback after the resolve call: if `v_effective_opportunity_id` is still NULL but `v_quotation.opportunity_id` is NOT NULL, use the quotation's own opportunity_id.
  - **Impact**: Pipeline now correctly transitions Quote Sent → Negotiation when sending a revised quotation after rejection.

### v1.7.1
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
  - Migration 149: Stage history auto-fill trigger (trg_autofill_stage_history)
  - Migration 150: Fix mark_sent opportunity fallback
  - Migration 151: Fix rejection trigger interference (GUC flag pattern)
  - Migration 152: Fix ambiguous opportunity + mark_sent trigger interference
  - Migration 153: Countries reference table
  - Migration 154-157: Marketing module
  - Migration 158-159: Fix accepted/rejected pipeline_updates columns
  - Migration 171: Comprehensive fix — UUID→TEXT, activity subjects, link trigger, lead_id derivation
  - Migration 172: Fix accepted account column name — sync_opportunity_to_account, nested exception

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

### Searchable Select Component

The `SearchableSelect` component replaces standard `Select` dropdowns where the number of options is large (>10 items). It uses a Popover with text search filtering.

**Usage locations**:
- **Rate Component Type**: 186+ items across 5+ categories (Freight, Port, Customs, etc.)
- **Service Type**: 19 service types across 4 scopes (Domestics, Export, Import, DTD)
- **Fleet Type**: 15 fleet types (Blindvan, CDD, Fuso, Tronton, etc.)
- **Incoterm**: 11 trade terms (FOB, CIF, EXW, etc.)
- **Unit of Measure**: 15 units (kg, cbm, TEU, etc.)

**Props**: `options` (flat list) or `groups` (categorized list), `value`, `onValueChange`, `searchPlaceholder`, `popoverWidth`

### Countries Reference Table (Migration 153)

The `countries` table provides a reference list of 250 countries with ISO codes, used by the `CountrySelect` component.

```sql
CREATE TABLE countries (
  id SERIAL PRIMARY KEY,
  code VARCHAR(3) NOT NULL UNIQUE,    -- ISO 3166-1 alpha-2/3
  name VARCHAR(100) NOT NULL,
  region VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE
);
```

### Lead ID Derivation in RPCs (Migration 171)

All three quotation RPCs (`mark_sent`, `mark_rejected`, `mark_accepted`) derive `related_lead_id` for activity records using a priority chain:

```
1. quotation.lead_id          ← Direct lead reference (set for lead/ticket-originated quotations)
2. opportunity.source_lead_id ← Original lead that created the opportunity (set for pipeline-originated)
3. ticket.lead_id             ← Ticket's lead reference (fallback)
```

This ensures activity records always have a `related_lead_id` even when quotations are created from the pipeline/opportunity menu where `quotation.lead_id` is NULL.

### Activity Subject Format (Migration 171)

All quotation lifecycle activities use a standardized subject format:

| Scenario | Subject Format |
|----------|---------------|
| Stage changes | `Pipeline Update: {old_stage} → {new_stage}` |
| No stage change (rejection, already Negotiation) | `{nth} Quotation Rejected` |
| No stage change (sent, already at Quote Sent) | `{nth} Quotation Sent` |
| Accepted | `Pipeline Update: {old_stage} → Closed Won` |

### Timeline Deduplication Rules

The `deduplicateTimelineItems` function in `ticket-detail.tsx` uses 8 rules to reduce noise:

| Rule | Window | Description |
|------|--------|-------------|
| 1 | 30s | Same user, related badge types → keep higher-priority badge |
| 2 | 30s | Same type pair (e.g., two status_changed) → keep latest |
| 3 | 30s | Assignment + status_changed same actor → keep assignment |
| 4 | 30s | Created + assigned same actor → keep created |
| 5 | 30s | Lifecycle (rejected/accepted/sent) absorbs status_changed |
| 6 | 30s | Lifecycle absorbs auto-generated events (assigned/adjustment) |
| 7 | 30s | Consecutive status_changed same user → keep latest |
| 8 | 1s | Same user, exact same second → group as one response (except cost items) |

Rule 8 (added in v2.1.0) uses a badge priority system to determine which event to keep when collapsing exact-second duplicates.

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
