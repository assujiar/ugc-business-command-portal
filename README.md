# UGC Business Command Portal

A comprehensive Business Command Portal for PT. Utama Global Indo Cargo (UGC Logistics) built with Next.js 14, Supabase, and shadcn/ui. This system integrates CRM, Ticketing, and Quotation management modules.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components (Radix UI)
- **Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **Authentication**: Supabase Auth with SSR
- **State Management**: React Server Components + React Hook Form
- **Email**: Nodemailer SMTP integration

## System Overview

The UGC Business Command Portal consists of three integrated modules:

### 1. CRM Module
Lead management, pipeline, and opportunity tracking for sales operations.

### 2. Ticketing Module
RFQ (Request for Quotation) and General ticket handling for operations team.

### 3. Quotation Module
Customer quotation creation, sending, and management.

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
- **Terms & Conditions**: Customizable includes/excludes
- **Validity Period**: Configurable validity days
- **Outputs**:
  - Professional PDF generation
  - Email sending with HTML templates
  - WhatsApp message generation
  - Online verification page with QR code

### Multi-Shipment Support
- **Per-Ticket Multi-Shipment**: Add multiple shipments to single ticket
- **Per-Shipment Costing**: Each shipment has its own operational cost
- **Batch Cost Submission**: Ops can submit costs for all shipments in one action
- **Aggregated Quotations**: Customer quotation includes all shipment costs
- **PDF/Email Display**: All shipments shown with individual routes and costs

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
│   │   │   └── public/        # Public APIs (no auth)
│   │   ├── quotation-verify/[code]/ # Public quotation verification
│   │   └── login/
│   ├── components/
│   │   ├── crm/               # CRM-specific components
│   │   ├── ticketing/         # Ticketing components
│   │   │   ├── ticket-detail.tsx
│   │   │   ├── create-ticket-form.tsx
│   │   │   ├── customer-quotation-dialog.tsx
│   │   │   ├── customer-quotation-edit-form.tsx
│   │   │   ├── multi-shipment-cost-dialog.tsx  # NEW
│   │   │   └── operational-cost-detail.tsx
│   │   ├── shared/            # Shared components
│   │   │   └── multi-shipment-form.tsx
│   │   ├── providers/         # Context providers
│   │   └── ui/                # shadcn/ui components
│   ├── lib/
│   │   ├── supabase/          # Supabase clients
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
│   └── migrations/            # 129 SQL migrations
│       ├── 001-034: Core CRM tables
│       ├── 035-060: Ticketing tables
│       ├── 061-090: Quotation system
│       ├── 091-128: Enhancements
│       └── 129_multi_shipment_cost_support.sql  # NEW
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
- `customer_quotations` - Customer quotations
- `customer_quotation_items` - Breakdown items
- `quotation_term_templates` - Terms & conditions templates

#### Shipments
- `shipment_details` - Multi-shipment support per lead/ticket

### Key Functions (RPC)

```sql
-- Multi-shipment cost functions
fn_resolve_all_shipment_costs(p_ticket_id, p_lead_id, p_opportunity_id)
rpc_batch_create_shipment_costs(p_ticket_id, p_shipment_costs, p_currency, p_valid_until)

-- Quotation functions
rpc_customer_quotation_mark_sent(p_quotation_id, p_sent_via, p_sent_to, ...)
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
| POST | `/api/ticketing/operational-costs/batch` | **Batch cost creation** |
| GET | `/api/ticketing/operational-costs/batch` | Get all shipment costs |
| GET/POST | `/api/ticketing/customer-quotations` | List/Create quotations |
| POST | `/api/ticketing/customer-quotations/[id]/send` | Send via email/WhatsApp |
| POST | `/api/ticketing/customer-quotations/[id]/pdf` | Generate PDF HTML |
| GET | `/api/ticketing/customer-quotations/validate/[code]` | Public validation |

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

### Multi-Shipment Cost Submission (NEW)
1. Creator creates RFQ ticket with multiple shipments
2. Ticket routed to Ops department based on service type
3. Ops opens ticket, clicks "Submit Costs (N Shipments)"
4. Multi-shipment cost dialog shows all shipments
5. Ops enters cost for each shipment (bundling or breakdown)
6. Submit creates costs atomically for all shipments
7. First response SLA tracked on first cost submission

### Customer Quotation with Multi-Shipment
1. Sales creates quotation from ticket with costs
2. System loads all shipment costs automatically
3. Each shipment shows with its route and cost
4. Total = sum of all shipment selling rates
5. Send quotation via email or WhatsApp
6. Customer receives quotation with all shipments listed
7. Online verification shows shipment details

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

In Supabase SQL Editor, run migrations in order (001-129).

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

### Latest Changes (v1.5.0)
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

## License

Proprietary - PT. Utama Global Indo Cargo (UGC Logistics)

---

## Support

For technical support, contact:
- Email: service@ugc.co.id
- Web: www.utamaglobalindocargo.com
