# UGC Business Command Portal

A comprehensive Business Command Portal for PT. Utama Global Indo Cargo (UGC Logistics) built with Next.js 14, Supabase, and shadcn/ui. This system integrates CRM, Ticketing, and Quotation management modules.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components (Radix UI)
- **Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **Authentication**: Supabase Auth with SSR
- **State Management**: React Server Components + React Hook Form
- **Email**: Nodemailer SMTP integration
- **PDF**: Server-side HTML-to-PDF with Puppeteer

## System Overview

The UGC Business Command Portal consists of three integrated modules:

### 1. CRM Module
Lead management, pipeline, and opportunity tracking for sales operations.

### 2. Ticketing Module
RFQ (Request for Quotation) and General ticket handling for operations team.

### 3. Quotation Module
Customer quotation creation, sending, and management with multi-shipment support.

---

## Features

### Lead Management (CRM)
- **Lead Inbox**: Marketing queue for new leads (New, In Review status)
- **Sales Inbox**: Handover pool for sales team to claim leads
- **My Leads**: Personal claimed leads dashboard
- **Lead Bidding**: Competitive bidding for high-value leads
- **Nurture Leads**: Long-term follow-up queue
- **Disqualified**: Archive of disqualified leads

### Pipeline Management (CRM)
- **Kanban Board**: Visual pipeline with drag-and-drop stages
- **Stages**: Prospecting → Discovery → Quote Sent → Negotiation → Closed Won/Lost
- **Stage History**: Full audit trail of stage changes
- **Activity Tracking**: Link activities to opportunities

### Account & Contact Management (CRM)
- **Accounts**: Company profiles with enriched data
- **Contacts**: Multiple contacts per account
- **Activity Tracking**: Link activities to accounts

### Ticketing System
- **RFQ Tickets**: Request for Quotation handling
  - Multi-shipment support per ticket
  - Service type categorization (Domestic, Export, Import, Import DTD)
  - Fleet and cargo management
  - SLA tracking (First Response, Resolution Time)
- **General Tickets**: Non-RFQ customer inquiries
- **Department Routing**: MKT, SAL, DOM, EXI, DTD, TRF
- **Assignment**: Auto-assign and manual assignment
- **Status Workflow**: open → need_response → in_progress → waiting_customer → need_adjustment → pending → resolved → closed

### Operational Cost Management
- **Single Shipment Cost**: Bundling or breakdown rate structure
- **Multi-Shipment Batch Cost**: Submit costs for all shipments in one dialog
- **Rate Components**: 50+ cost component types (freight, THC, customs, etc.)
- **Cost Resolution**: Automatic linking to tickets and shipments
- **SLA Tracking**: First response time based on cost submission

### Customer Quotation System
- **Quotation Creation**: From operational costs or standalone
- **Multi-Shipment Support**: Single quotation ID for multiple shipments with individual costs
- **Rate Structures**: Bundling (all-in) or Breakdown (itemized)
- **Per-Shipment Display**: Each shipment displayed as separate section with its own rate (no aggregate total)
- **Terms & Conditions**: Customizable includes/excludes
- **Validity Period**: Configurable validity days
- **Margin Validation**: User-determined margin with low margin warning (< 15%)
- **Low Margin Notification**: Automatic email to Sales Manager for quotations below 15% margin
- **Outputs**:
  - Professional PDF generation (per-shipment sections)
  - Email sending with HTML templates (per-shipment display)
  - WhatsApp message generation (per-shipment rates)
  - Online verification page with QR code

### Multi-Shipment Quotation Display (v1.5.2)
- **Separate Shipment Sections**: Each shipment displayed independently with:
  - Shipment header (Shipment 1, Shipment 2, etc.)
  - Route information (origin → destination)
  - Cargo description
  - Fleet type if applicable
  - Rate breakdown items (if breakdown mode)
  - Subtotal for that shipment only
- **No Aggregate Total**: For multi-shipment quotations, no combined total is shown
- **Consistent Display**: Same per-shipment format across:
  - PDF documents
  - Email HTML
  - WhatsApp text messages
  - Online verification page
  - Public PDF download

---

## Project Structure

```
ugc-business-command-portal/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (crm)/             # CRM pages (protected)
│   │   │   ├── dashboard/
│   │   │   ├── lead-inbox/
│   │   │   ├── lead-bidding/
│   │   │   ├── lead-management/
│   │   │   ├── sales-inbox/
│   │   │   ├── my-leads/
│   │   │   ├── pipeline/
│   │   │   ├── overview-crm/
│   │   │   ├── nurture-leads/
│   │   │   ├── disqualified-leads/
│   │   │   └── imports/
│   │   ├── (ticketing)/       # Ticketing pages (protected)
│   │   │   ├── tickets/
│   │   │   ├── tickets/[id]/
│   │   │   ├── tickets/new/
│   │   │   ├── operational-costs/
│   │   │   ├── customer-quotations/
│   │   │   ├── overview-ticket/
│   │   │   └── performance/
│   │   ├── api/               # API Routes (BFF)
│   │   │   ├── crm/           # CRM APIs
│   │   │   ├── ticketing/     # Ticketing APIs
│   │   │   │   └── customer-quotations/
│   │   │   │       ├── [id]/
│   │   │   │       │   ├── pdf/route.ts       # PDF generation
│   │   │   │       │   ├── send/route.ts      # Email/WhatsApp
│   │   │   │       │   ├── accept/route.ts
│   │   │   │       │   └── reject/route.ts
│   │   │   │       ├── validate/[code]/route.ts  # Public validation
│   │   │   │       └── route.ts               # List/Create
│   │   │   └── public/        # Public APIs (no auth)
│   │   │       └── quotation/[code]/pdf/route.ts  # Public PDF
│   │   ├── quotation-verify/[code]/ # Public quotation verification
│   │   └── login/
│   ├── components/
│   │   ├── crm/               # CRM-specific components
│   │   ├── ticketing/         # Ticketing components
│   │   │   ├── ticket-detail.tsx
│   │   │   ├── create-ticket-form.tsx
│   │   │   ├── customer-quotation-dialog.tsx
│   │   │   ├── customer-quotation-edit-form.tsx
│   │   │   ├── customer-quotation-detail.tsx
│   │   │   ├── multi-shipment-cost-dialog.tsx
│   │   │   └── operational-cost-detail.tsx
│   │   ├── shared/            # Shared components
│   │   │   └── multi-shipment-form.tsx
│   │   ├── providers/         # Context providers
│   │   └── ui/                # shadcn/ui components
│   ├── lib/
│   │   ├── supabase/          # Supabase clients
│   │   │   ├── server.ts      # Server-side client
│   │   │   ├── admin.ts       # Admin/service role client
│   │   │   └── client.ts      # Client-side client
│   │   ├── email.ts           # Email service (Nodemailer)
│   │   ├── utils.ts           # Utility functions
│   │   ├── constants.ts       # Service types, departments
│   │   ├── constants/
│   │   │   └── rate-components.ts  # Cost component types
│   │   └── permissions.ts     # Role-based permissions
│   ├── hooks/                 # Custom React hooks
│   │   └── use-toast.ts
│   └── types/
│       ├── database.ts        # Supabase generated types
│       └── shipment.ts        # Shipment type definitions
├── supabase/
│   └── migrations/            # 130+ SQL migrations
│       ├── 001-034: Core CRM tables
│       ├── 035-060: Ticketing tables
│       ├── 061-090: Quotation system
│       ├── 091-128: Enhancements
│       ├── 129_multi_shipment_cost_support.sql
│       ├── 130_fix_multi_shipment_cost_revision.sql
│       ├── 131_fix_multi_shipment_cost_sync.sql
│       └── 132_fix_is_current_per_shipment.sql
└── public/
    └── logo/                  # Brand assets
```

---

## Database Schema

### Core Tables

#### Ticketing
- `tickets` - Main ticket table
- `ticket_events` - Audit trail
- `ticket_rate_quotes` - Operational costs per shipment
- `ticket_rate_quote_items` - Breakdown cost items
- `ticket_assignments` - Ticket assignments history
- `ticket_sla_tracking` - SLA metrics

#### CRM
- `leads` - Lead management
- `opportunities` - Pipeline opportunities
- `accounts` - Company accounts
- `contacts` - Contact persons
- `activities` - Tasks, calls, meetings

#### Quotations
- `customer_quotations` - Customer quotations (includes `shipments` JSONB field)
- `customer_quotation_items` - Breakdown items
- `quotation_term_templates` - Terms & conditions templates

#### Shipments
- `shipment_details` - Multi-shipment support per lead/ticket

### Key Functions (RPC)

```sql
-- Multi-shipment cost functions
fn_resolve_all_shipment_costs(p_ticket_id, p_lead_id, p_opportunity_id)
rpc_batch_create_shipment_costs(p_ticket_id, p_shipment_costs, p_currency, p_valid_until)

-- Quotation state transition functions (with multi-shipment cost sync)
rpc_customer_quotation_mark_sent(p_quotation_id, p_sent_via, p_sent_to, p_actor_user_id, p_correlation_id, p_allow_autocreate)
-- Updates quotation to 'sent', syncs opportunity to 'Quote Sent', ticket to 'waiting_customer'
-- Updates ALL costs in operational_cost_ids to 'sent_to_customer' (Migration 131 fix)

rpc_customer_quotation_mark_rejected(p_quotation_id, p_reason_type, p_competitor_name, p_competitor_amount, ...)
-- Updates quotation to 'rejected', syncs opportunity to 'Negotiation', ticket to 'need_adjustment'
-- Updates ALL costs in operational_cost_ids to 'revise_requested' (Migration 131 fix)

rpc_customer_quotation_mark_accepted(p_quotation_id, p_actor_user_id, p_correlation_id)
-- Updates quotation to 'accepted', syncs opportunity to 'Closed Won', ticket to 'closed'
-- Updates ALL costs in operational_cost_ids to 'accepted' (Migration 131 fix)

fn_resolve_latest_operational_cost(p_ticket_id, p_lead_id, p_opportunity_id, p_provided_cost_id)

-- Ticket functions
rpc_ticket_create_quote(p_ticket_id, p_amount, p_rate_structure, p_items, ...)
record_response_exchange(p_ticket_id, p_responder_user_id, p_response_type)
```

---

## API Routes

### Ticketing APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/ticketing/tickets` | List/Create tickets |
| GET/PATCH | `/api/ticketing/tickets/[id]` | Get/Update ticket |
| POST | `/api/ticketing/tickets/[id]/assign` | Assign ticket |
| POST | `/api/ticketing/tickets/[id]/transition` | Status transition |
| GET/POST | `/api/ticketing/operational-costs` | List/Create costs |
| POST | `/api/ticketing/operational-costs/batch` | Batch cost creation |
| GET | `/api/ticketing/operational-costs/batch` | Get all shipment costs |
| GET/POST | `/api/ticketing/customer-quotations` | List/Create quotations |
| POST | `/api/ticketing/customer-quotations/[id]/send` | Send via email/WhatsApp |
| POST | `/api/ticketing/customer-quotations/[id]/accept` | Accept quotation (Closed Won) |
| POST | `/api/ticketing/customer-quotations/[id]/reject` | Reject quotation with reason |
| POST | `/api/ticketing/customer-quotations/[id]/pdf` | Generate PDF HTML |
| POST | `/api/ticketing/customer-quotations/low-margin-notification` | Send low margin email to Sales Manager |
| GET | `/api/ticketing/customer-quotations/validate/[code]` | Public validation |
| GET | `/api/public/quotation/[code]/pdf` | Public PDF download |

### CRM APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/crm/leads` | List/Create leads |
| GET/PATCH | `/api/crm/leads/[id]` | Get/Update lead |
| POST | `/api/crm/leads/[id]/triage` | Triage action |
| POST | `/api/crm/leads/[id]/handover` | Handover to sales |
| POST | `/api/crm/leads/[id]/convert` | Convert to opportunity |
| POST | `/api/crm/leads/claim` | Claim from pool |
| GET/POST | `/api/crm/opportunities` | List/Create opportunities |
| POST | `/api/crm/opportunities/[id]/stage` | Change stage |

---

## User Roles

| Role | Department | CRM Access | Ticketing Access |
|------|------------|------------|------------------|
| Director | Executive | Full | Full |
| super admin | IT | Full | Full |
| Marketing Manager | Marketing | Lead inbox, nurture, reports | View only |
| sales manager | Sales | Sales inbox, pipeline | Create/manage quotations |
| salesperson | Sales | My leads, pipeline | Create/manage quotations |
| EXIM Ops | Operations | Limited | Full ticketing access, cost submission |
| domestics Ops | Operations | Limited | Full ticketing access, cost submission |
| Import DTD Ops | Operations | Limited | Full ticketing access, cost submission |
| traffic & warehous | Operations | Limited | Limited ticketing |
| finance | Finance | Limited | View quotations/costs |

---

## Key Workflows

### Multi-Shipment Cost Submission
1. Creator creates RFQ ticket with multiple shipments
2. Ticket routed to Ops department based on service type
3. Ops opens ticket, clicks "Submit Costs (N Shipments)"
4. Multi-shipment cost dialog shows all shipments
5. Ops enters cost for each shipment (bundling or breakdown)
6. Submit creates costs atomically for all shipments
7. First response SLA tracked on first cost submission

### Customer Quotation with Multi-Shipment (v1.5.2)
1. Sales creates quotation from ticket with costs
2. System loads all shipment costs automatically
3. Each shipment stored with its route, cost, and selling rate
4. **Display**: Each shipment shown as separate section with:
   - Shipment header and route
   - Items breakdown (if breakdown mode)
   - Subtotal for that shipment
5. **No aggregate total** for multi-shipment scenarios
6. Send quotation via email or WhatsApp
7. Customer receives quotation with per-shipment rates
8. Online verification shows same per-shipment format

### Cost Revision Flow (After Quotation Rejection)
1. Customer rejects quotation → Cost status changes to `revise_requested`
2. Ops receives notification to revise cost
3. Ops opens ticket, clicks "Submit Costs (N Shipments)"
4. Dialog shows shipments - previously rejected costs are NOT shown as "Cost Submitted"
5. Ops enters revised costs for shipments that need revision
6. Submit creates NEW costs with status `submitted`
7. Sales creates new quotation → Only LATEST `submitted` costs per shipment are used
8. Old rejected costs are excluded automatically

### Lead Triage (Marketing)
1. New lead arrives in Lead Inbox
2. Marketing reviews and marks "In Review"
3. Marketing qualifies → Auto-handover to Sales Inbox
4. OR moves to Nurture/Disqualified

### Lead Claim and Conversion (Sales)
1. Sales views Sales Inbox (handover pool)
2. Clicks "Claim" on lead (race-safe, atomic)
3. Account auto-created from lead data
4. Lead appears in "My Leads"
5. From My Leads, click "Convert"
6. Opportunity created in Pipeline
7. Progress through stages to Close

---

## Installation

### Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase account

### Setup Steps

1. **Clone and Install**

```bash
cd ugc-business-command-portal
npm install
```

2. **Configure Environment**

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email (optional - for quotation sending)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM=noreply@ugc.co.id
```

3. **Run Database Migrations**

In Supabase SQL Editor, run migrations in order (001-132).

4. **Start Development Server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Design System

### Brand Colors
- **Primary**: `#FF4600` (UGC Orange)
- **Secondary**: `#1e293b` (Slate 800)
- **Success**: `#22c55e` (Green 500)
- **Warning**: `#eab308` (Yellow 500)
- **Danger**: `#dc2626` (Red 600)

### Components
Built on shadcn/ui with custom components:
- `MultiShipmentCostDialog` - Batch cost submission
- `CustomerQuotationDialog` - Quotation creation
- `CustomerQuotationEditForm` - Quotation editing with multi-shipment
- `MultiShipmentForm` - Shipment editor
- `PipelineBoard` - Kanban pipeline
- `LeadInboxTable` / `SalesInboxTable`

---

## Build & Deploy

```bash
# Build
npm run build

# Type check
npx tsc --noEmit

# Lint
npm run lint
```

---

## Version History

### Latest Changes (v1.6.0)
- **Multi-Shipment Cost Sync Fix**: When quotation is sent/rejected/accepted, ALL operational costs in `operational_cost_ids` array are now updated (not just single `operational_cost_id`)
- **Bidirectional Cost-Quotation Link Fix**: When quotation is created, ALL costs in `operational_cost_ids` now have their `customer_quotation_id` updated (not just single cost)
- **is_current Per Shipment Fix**: Changed unique constraint from per-ticket to per-shipment
  - Each shipment in a ticket can now have its own current cost (`is_current = TRUE`)
  - Updated triggers to only supersede costs for the same shipment
  - Enables proper multi-shipment cost submission without conflicts
- **Margin Validation Enhancement**:
  - No hardcoded default margin - user must explicitly set target margin
  - Input shows placeholder instead of default value
  - Warning alert when margin < 15%
  - Confirmation dialog required for low margin quotations
- **Low Margin Email Notification**: Automatic email to Sales Manager when quotation is created with margin below 15%
  - Professional HTML email template
  - Shows quotation details, customer info, and financial summary
  - Links to quotation detail page
  - Queries Sales Manager users from database with fallback to environment variable
- **Database Migration 131**: Updates all three RPC functions to sync multi-shipment costs atomically

### v1.5.2
- **Per-Shipment Quotation Display**: Multi-shipment quotations now display each shipment as a separate section
- **No Aggregate Total**: For quotations with multiple shipments, no combined total is shown
- **PDF Enhancement**: Each shipment shown with header, route, items (if breakdown), and subtotal
- **Email HTML Enhancement**: Per-shipment cards with route and rate information
- **WhatsApp Enhancement**: Per-shipment rates listed without aggregate total
- **Validation Page Enhancement**: Header shows "Multiple Shipments" instead of aggregate total
- **Backward Compatible**: Single-shipment quotations still show total as before

### v1.5.1
- **Cost Revision Fix for Multi-Shipment**: When a quotation is rejected and ops submits a revised cost, only the latest submitted cost per shipment is used
- **Deduplication Logic**: `fn_resolve_all_shipment_costs` now uses `DISTINCT ON (shipment_detail_id)` to return only the most recent submitted cost per shipment
- **Status Filtering**: Customer quotation dialog now properly filters for `status === 'submitted'` costs, excluding rejected costs
- **Database Migration 130**: Updates cost resolution to handle revision scenarios correctly

### v1.5.0
- **Multi-Shipment Cost Support**: Submit costs for all shipments in one dialog
- **Batch Cost API**: `/api/ticketing/operational-costs/batch`
- **Customer Quotation Multi-Cost**: Link multiple operational costs to one quotation
- **PDF/Email Enhancement**: Show shipment costs in quotation outputs
- **Database Migration 129**: `fn_resolve_all_shipment_costs`, `rpc_batch_create_shipment_costs`

### Previous Versions
- v1.4.0: SLA tracking improvements, first response on cost submission
- v1.3.0: Multi-shipment support in tickets
- v1.2.0: Customer quotation system with PDF/email
- v1.1.0: Operational cost management
- v1.0.0: Initial CRM and ticketing modules

---

## Technical Notes

### Multi-Shipment Cost Sync (v1.6.0)

When a quotation with multiple shipments is sent/rejected/accepted, ALL operational costs need to be updated atomically:

**Data Structure:**
- `customer_quotations.operational_cost_id` - Single cost (legacy/backward compatible)
- `customer_quotations.operational_cost_ids` - Array of cost IDs (multi-shipment)

**Flow Example (2-shipment quotation):**
1. User creates quotation with `operational_cost_ids = [cost_A, cost_B]`
2. User sends quotation → BOTH cost_A AND cost_B become `sent_to_customer`
3. Customer rejects → BOTH cost_A AND cost_B become `revise_requested`
4. Ops revises both costs → cost_A2, cost_B2 created as `submitted`
5. User creates new quotation with `[cost_A2, cost_B2]`
6. Customer accepts → BOTH cost_A2 AND cost_B2 become `accepted`

**Status Transitions:**
| Quotation Action | Single Cost Status | Multi-Cost Status |
|-----------------|-------------------|-------------------|
| Send | `sent_to_customer` | All → `sent_to_customer` |
| Reject | `revise_requested` | All → `revise_requested` |
| Accept | `accepted` | All → `accepted` |

### is_current Per Shipment (v1.6.0)

The `is_current` flag on `ticket_rate_quotes` now works per shipment instead of per ticket:

**Old behavior (broken):**
- Unique constraint: `(ticket_id) WHERE is_current = TRUE`
- Only ONE cost per ticket could be current
- Multi-shipment batch insert would cause constraint violations

**New behavior (fixed):**
- Unique constraint: `(ticket_id, shipment_detail_id) WHERE is_current = TRUE`
- Each shipment can have ONE current cost
- Multi-shipment batch insert works correctly

**Data Model:**
```
1 ticket_id → N shipment_detail_ids → each has 1 is_current cost
```

**Flow:**
1. Ops submits costs for Shipment 1 and Shipment 2 in batch
2. Both costs get `is_current = TRUE` (no conflict because different shipment_detail_id)
3. When creating quotation, system gets ALL costs with `is_current = TRUE`
4. On rejection, new costs supersede only their respective shipment's previous cost

### Margin Validation (v1.6.0)

- **No default margin**: User must explicitly set `targetMarginPercent`
- **Input shows placeholder**: Empty input initially, not pre-filled with 15%
- **Warning threshold**: 15% minimum margin
- **Confirmation required**: AlertDialog appears when margin < 15%
- **Email notification**: Sent to Sales Manager for low margin quotations
- **Recipients**: Queries `profiles` table for `role = 'sales manager'` plus fallback `SALES_MANAGER_EMAIL` env var

### Multi-Shipment Quotation Data Structure

The `customer_quotations` table stores shipment data in a JSONB field:

```typescript
interface ShipmentData {
  shipment_detail_id: string
  origin_city: string
  origin_country: string
  destination_city: string
  destination_country: string
  cost_amount: number
  selling_rate: number
  cost_currency: string
  margin_percent: number
  cargo_description?: string
  fleet_type?: string
  fleet_quantity?: number
}
```

### Item Grouping by Shipment

For breakdown rate structure, items are stored with shipment prefix:
- `component_name: "Shipment 1: Sea Freight"`
- `component_name: "Shipment 2: THC Origin"`

The display logic parses these prefixes to group items per shipment:

```typescript
const groupItemsByShipment = (items: any[], shipments: any[]): Map<number, any[]> => {
  const itemsByShipment = new Map<number, any[]>()
  shipments.forEach((_, idx) => itemsByShipment.set(idx, []))

  items.forEach((item: any) => {
    const componentName = item.component_name || ''
    const shipmentMatch = componentName.match(/^Shipment\s*(\d+)\s*:\s*/i)
    if (shipmentMatch) {
      const shipmentIndex = parseInt(shipmentMatch[1]) - 1
      if (itemsByShipment.has(shipmentIndex)) {
        const cleanedItem = {
          ...item,
          component_name: componentName.replace(/^Shipment\s*\d+\s*:\s*/i, '')
        }
        itemsByShipment.get(shipmentIndex)!.push(cleanedItem)
      }
    }
  })
  return itemsByShipment
}
```

---

## License

Proprietary - PT. Utama Global Indo Cargo (UGC Logistics)

---

## Support

For technical support, contact:
- Email: service@ugc.co.id
- Web: www.utamaglobalindocargo.com
