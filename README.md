# UGC Business Command Portal - CRM Module

A complete Customer Relationship Management module built with Next.js 16, Supabase, and shadcn/ui.

**SOURCE**: UGC BCP CRM Target-State Architecture and Flow Specification PDF

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **Authentication**: Supabase Auth with SSR
- **State Management**: React Server Components + Client hooks

## Features

### Lead Management
- **Lead Inbox**: Marketing queue for new leads (New, In Review status)
- **Sales Inbox**: Handover pool for sales team to claim leads
- **My Leads**: Personal claimed leads dashboard
- **Nurture Leads**: Long-term follow-up queue
- **Disqualified**: Archive of disqualified leads

### Pipeline Management
- **Kanban Board**: Visual pipeline with drag-and-drop stages
- **Stages**: Prospecting → Discovery → Quote Sent → Negotiation → Closed
- **Stage History**: Full audit trail of stage changes

### Account & Contact Management
- **Accounts**: Company profiles with enriched data
- **Contacts**: Multiple contacts per account
- **Activity Tracking**: Link activities to accounts

### Activity Management
- **Activity Planner**: Tasks, calls, meetings, site visits
- **Cadence System**: Automated follow-up sequences
- **Due Date Tracking**: Overdue indicators

### Prospecting Targets
- **Target Research**: Track prospecting efforts
- **Status Workflow**: new → researching → contacted → meeting_scheduled → converted
- **Convert to Account**: One-click conversion to account + opportunity

## Installation

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Supabase account

### Setup Steps

1. **Clone and Install**

```bash
cd ugc-business-command-portal
pnpm install
```

2. **Configure Environment**

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

3. **Run Database Migrations**

In Supabase SQL Editor, run migrations in order:

```
supabase/migrations/001_enums.sql
supabase/migrations/002_tables_core.sql
supabase/migrations/003_tables_leads.sql
supabase/migrations/004_tables_opportunities.sql
supabase/migrations/005_tables_activities.sql
supabase/migrations/006_tables_cadences.sql
supabase/migrations/007_tables_targets.sql
supabase/migrations/008_tables_imports_audit.sql
supabase/migrations/009_views.sql
supabase/migrations/010_rls_policies.sql
supabase/migrations/011_rpc_functions.sql
```

4. **Seed Test Data**

```sql
-- Run in Supabase SQL Editor
\i supabase/seed.sql
```

5. **Create Test Users in Supabase Auth**

Create users matching the seed data UUIDs and emails.

6. **Start Development Server**

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
ugc-business-command-portal/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (crm)/             # CRM pages (protected)
│   │   │   ├── dashboard/
│   │   │   ├── lead-inbox/
│   │   │   ├── sales-inbox/
│   │   │   ├── my-leads/
│   │   │   ├── pipeline/
│   │   │   ├── accounts/
│   │   │   ├── activities/
│   │   │   ├── targets/
│   │   │   ├── nurture-leads/
│   │   │   ├── disqualified-leads/
│   │   │   └── imports/
│   │   ├── api/crm/           # API Routes (BFF)
│   │   └── login/
│   ├── components/
│   │   ├── crm/               # CRM-specific components
│   │   ├── providers/         # Context providers
│   │   └── ui/                # shadcn/ui components
│   ├── lib/
│   │   ├── supabase/          # Supabase clients
│   │   ├── utils.ts           # Utility functions
│   │   ├── constants.ts       # App constants
│   │   └── permissions.ts     # Role-based permissions
│   └── types/
│       └── database.ts        # TypeScript types
├── supabase/
│   ├── migrations/            # SQL migrations
│   └── seed.sql              # Test data
└── docs/
    ├── CRM_REQUIREMENTS_TRACE.md
    └── QA_PLAYBOOK.md
```

## User Roles

| Role | Department | Access |
|------|------------|--------|
| Director | Executive | Full access |
| super admin | IT | Full access |
| Marketing Manager | Marketing | Lead inbox, nurture, reports |
| Marcomm | Marketing | Lead inbox |
| DGO | Marketing | Lead inbox |
| MACX | Marketing | Lead inbox |
| VSDO | Marketing | Lead inbox |
| sales manager | Sales | Sales inbox, pipeline, accounts |
| salesperson | Sales | Sales inbox, my leads, pipeline |
| sales support | Sales | Sales inbox support |
| EXIM Ops | Operations | Limited CRM access |
| domestics Ops | Operations | Limited CRM access |
| Import DTD Ops | Operations | Limited CRM access |
| traffic & warehous | Operations | Limited CRM access |
| finance | Finance | Limited CRM access |

## Key Workflows

### Lead Triage (Marketing)
1. New lead arrives in Lead Inbox
2. Marketing reviews and marks "In Review"
3. Marketing qualifies → Auto-handover to Sales Inbox
4. OR moves to Nurture/Disqualified

### Lead Claim (Sales)
1. Sales views Sales Inbox (handover pool)
2. Clicks "Claim" on lead (race-safe, atomic)
3. Account auto-created from lead data
4. Lead appears in "My Leads"

### Lead Conversion
1. From My Leads, click "Convert"
2. Opportunity created in Pipeline
3. Progress through stages to Close

## API Routes

### Leads
- `GET/POST /api/crm/leads` - List/Create leads
- `GET/PATCH /api/crm/leads/[id]` - Get/Update lead
- `POST /api/crm/leads/[id]/triage` - Triage action
- `POST /api/crm/leads/[id]/handover` - Handover to sales
- `POST /api/crm/leads/[id]/convert` - Convert to opportunity
- `POST /api/crm/leads/claim` - Claim from pool

### Opportunities
- `GET/POST /api/crm/opportunities` - List/Create
- `GET/PATCH /api/crm/opportunities/[id]` - Get/Update
- `POST /api/crm/opportunities/[id]/stage` - Change stage

### Other
- `GET/POST /api/crm/accounts`
- `GET/POST /api/crm/activities`
- `POST /api/crm/activities/[id]/complete`
- `GET/POST /api/crm/targets`
- `POST /api/crm/targets/[id]/convert`

## Design System

### Brand Colors
- **Primary**: `#FF4600` (Brand Orange)
- **Dark Mode**: Fully supported
- **Light Mode**: Fully supported

### Components
Built on shadcn/ui with custom CRM components:
- LeadInboxTable
- SalesInboxTable
- PipelineBoard
- ActivitiesTable
- TargetsTable

## Testing

See `docs/QA_PLAYBOOK.md` for complete test cases.

Quick test:
1. Login as marketing.mgr@ugc.com
2. Go to Lead Inbox
3. Triage a lead (Qualify)
4. Login as salesperson1@ugc.com
5. Go to Sales Inbox
6. Claim the lead
7. Convert to opportunity

## Build

```bash
pnpm build
```

## License

Proprietary - UGC Business Command Portal
