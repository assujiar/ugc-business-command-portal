# Blueprint Lengkap: UGC Business Command Portal

**Versi**: 1.0
**Tanggal**: 29 Januari 2026
**Status**: Production Ready

---

## Daftar Isi

1. [Executive Summary](#1-executive-summary)
2. [Arsitektur Sistem](#2-arsitektur-sistem)
3. [Technology Stack](#3-technology-stack)
4. [Database Design](#4-database-design)
5. [Modul CRM](#5-modul-crm)
6. [Modul Ticketing](#6-modul-ticketing)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [API Design](#8-api-design)
9. [UI/UX Design System](#9-uiux-design-system)
10. [Security](#10-security)
11. [Deployment & Infrastructure](#11-deployment--infrastructure)
12. [Integration Points](#12-integration-points)

---

## 1. Executive Summary

### 1.1 Tentang Aplikasi

**UGC Business Command Portal** adalah platform B2B SaaS enterprise-grade yang mengintegrasikan sistem **CRM (Customer Relationship Management)** dan **Ticketing** untuk UGC Logistics. Platform ini dirancang untuk mengelola seluruh lifecycle pelanggan dari akuisisi hingga after-sales support.

### 1.2 Tujuan Bisnis

| Objektif | Deskripsi |
|----------|-----------|
| **Lead Management** | Mengotomatisasi proses triage dan distribusi leads dari marketing ke sales |
| **Sales Pipeline** | Memvisualisasikan dan mengoptimalkan proses penjualan |
| **Account Management** | Menjaga hubungan dan data pelanggan secara terpusat |
| **Ticketing & Support** | Mengelola permintaan quotation dan support tickets |
| **Analytics** | Menyediakan insight berbasis data untuk pengambilan keputusan |

### 1.3 Key Metrics & KPIs

```
┌─────────────────────────────────────────────────────────────────┐
│                    BUSINESS METRICS                              │
├─────────────────────────────────────────────────────────────────┤
│  Lead Conversion Rate    │  Pipeline Value         │  SLA       │
│  ────────────────────    │  ──────────────         │  ───       │
│  Leads → Opportunities   │  Total potential        │  Response  │
│  Target: >25%            │  revenue in pipeline    │  Time <4h  │
├─────────────────────────────────────────────────────────────────┤
│  Win Rate               │  Activity Completion    │  Customer   │
│  ─────────              │  ────────────────────   │  Retention  │
│  Opportunities → Won    │  Tasks completed on     │  Rate >85%  │
│  Target: >30%           │  time: >90%             │             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Arsitektur Sistem

### 2.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                 │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Browser   │  │   Mobile    │  │   Tablet    │  │  External   │     │
│  │   (Web App) │  │   Browser   │  │   Browser   │  │   Systems   │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
└─────────┼────────────────┼────────────────┼────────────────┼────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION LAYER                              │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                     Next.js 14 App Router                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │  │
│  │  │ Server       │  │ Client       │  │ Middleware               │  │  │
│  │  │ Components   │  │ Components   │  │ (Auth, Route Protection) │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                              API LAYER (BFF)                              │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐  │
│  │   /api/crm/*        │  │   /api/ticketing/*  │  │   /api/public/* │  │
│  │   35+ endpoints     │  │   40+ endpoints     │  │   Public APIs   │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            SERVICE LAYER                                  │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ Supabase    │  │ Email       │  │ AI/Gemini   │  │ File Storage    │ │
│  │ Client      │  │ Service     │  │ Integration │  │ (Supabase)      │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                             DATA LAYER                                    │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    Supabase PostgreSQL                             │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │  │
│  │  │ Tables (30+) │  │ Views (10+)  │  │ RPC Functions (20+)      │  │  │
│  │  │ with RLS     │  │ Materialized │  │ State Machines           │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LEAD-TO-CASH FLOW                                │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
    │  LEAD    │────▶│  TRIAGE  │────▶│  SALES   │────▶│ PIPELINE │
    │  CAPTURE │     │  (MKT)   │     │  INBOX   │     │  (SALES) │
    └──────────┘     └──────────┘     └──────────┘     └──────────┘
         │                │                │                │
         ▼                ▼                ▼                ▼
    ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
    │ Webform  │     │ Qualify  │     │  Claim   │     │ Stages:  │
    │ Instagram│     │ Nurture  │     │  by      │     │ Prospect │
    │ TikTok   │     │ Disqual  │     │ Salesrep │     │ Discovery│
    │ Event    │     │          │     │          │     │ Quote    │
    │ Referral │     │          │     │          │     │ Nego     │
    └──────────┘     └──────────┘     └──────────┘     └──────────┘
                                                            │
                          ┌─────────────────────────────────┘
                          ▼
    ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
    │ QUOTATION│────▶│  SEND    │────▶│ CUSTOMER │────▶│  CLOSE   │
    │ CREATE   │     │  EMAIL   │     │ RESPONSE │     │  DEAL    │
    └──────────┘     └──────────┘     └──────────┘     └──────────┘
         │                │                │                │
         ▼                ▼                ▼                ▼
    ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
    │ Line     │     │ PDF Gen  │     │ Accept   │     │ WON:     │
    │ Items    │     │ Tracking │     │ Reject   │     │ Account  │
    │ Terms    │     │ URL      │     │ Recreate │     │ Created  │
    │ Pricing  │     │          │     │          │     │          │
    └──────────┘     └──────────┘     └──────────┘     └──────────┘
```

### 2.3 Module Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION MODULES                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────────────────┐   ┌─────────────────────────────┐    │
│   │         CRM MODULE          │   │      TICKETING MODULE       │    │
│   │         /app/(crm)          │   │      /app/(ticketing)       │    │
│   ├─────────────────────────────┤   ├─────────────────────────────┤    │
│   │                             │   │                             │    │
│   │  ┌─────────────────────┐   │   │  ┌─────────────────────┐   │    │
│   │  │   Lead Management   │   │   │  │  Ticket Management  │   │    │
│   │  │   ───────────────   │   │   │  │  ─────────────────  │   │    │
│   │  │  • Lead Inbox       │   │   │  │  • Ticket Queue     │   │    │
│   │  │  • Lead Triage      │   │   │  │  • SLA Tracking     │   │    │
│   │  │  • Sales Inbox      │   │   │  │  • Assignments      │   │    │
│   │  │  • Nurture Pool     │   │   │  │  • Comments         │   │    │
│   │  └─────────────────────┘   │   │  └─────────────────────┘   │    │
│   │                             │   │                             │    │
│   │  ┌─────────────────────┐   │   │  ┌─────────────────────┐   │    │
│   │  │   Sales Pipeline    │   │   │  │   Quotation Mgmt    │   │    │
│   │  │   ──────────────    │   │   │  │   ──────────────    │   │    │
│   │  │  • Kanban Board     │   │   │  │  • Quote Creation   │   │    │
│   │  │  • Stage Tracking   │   │   │  │  • Email Delivery   │   │    │
│   │  │  • Activity Log     │   │   │  │  • PDF Generation   │   │    │
│   │  │  • Win/Loss         │   │   │  │  • Accept/Reject    │   │    │
│   │  └─────────────────────┘   │   │  └─────────────────────┘   │    │
│   │                             │   │                             │    │
│   │  ┌─────────────────────┐   │   │  ┌─────────────────────┐   │    │
│   │  │  Account Management │   │   │  │   Cost Management   │   │    │
│   │  │  ─────────────────  │   │   │  │   ───────────────   │   │    │
│   │  │  • Company Profile  │   │   │  │  • Operational Cost │   │    │
│   │  │  • Contact Mgmt     │   │   │  │  • Rate Components  │   │    │
│   │  │  • Tenure Tracking  │   │   │  │  • Rejection Flow   │   │    │
│   │  └─────────────────────┘   │   │  └─────────────────────┘   │    │
│   │                             │   │                             │    │
│   │  ┌─────────────────────┐   │   │  ┌─────────────────────┐   │    │
│   │  │     Analytics       │   │   │  │     Dashboards      │   │    │
│   │  │     ─────────       │   │   │  │     ──────────      │   │    │
│   │  │  • Sales Dashboard  │   │   │  │  • Overview         │   │    │
│   │  │  • KPI Tracking     │   │   │  │  • Performance      │   │    │
│   │  │  • Growth Insights  │   │   │  │  • SLA Metrics      │   │    │
│   │  └─────────────────────┘   │   │  └─────────────────────┘   │    │
│   │                             │   │                             │    │
│   └─────────────────────────────┘   └─────────────────────────────┘    │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                      SHARED SERVICES                             │   │
│   ├─────────────────────────────────────────────────────────────────┤   │
│   │  • Authentication (Supabase Auth)     • File Storage            │   │
│   │  • Authorization (RBAC + RLS)         • Email Service           │   │
│   │  • Audit Logging                      • AI Insights (Gemini)    │   │
│   │  • Notification Service               • PDF Generation          │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

### 3.1 Frontend Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Framework** | Next.js | 14.1 | App Router, SSR/SSG |
| **UI Library** | React | 18.2 | Component-based UI |
| **Components** | shadcn/ui | Latest | Pre-built accessible components |
| **Primitives** | Radix UI | Various | Headless UI primitives |
| **Styling** | Tailwind CSS | 3.4.1 | Utility-first CSS |
| **Forms** | React Hook Form | 7.49.3 | Form state management |
| **Validation** | Zod | 3.22.4 | Schema validation |
| **Charts** | Recharts | 2.10.4 | Data visualization |
| **Icons** | Lucide React | 0.309.0 | Icon library |
| **Date** | date-fns | 3.2.0 | Date manipulation |
| **Theme** | next-themes | 0.2.1 | Dark/Light mode |

### 3.2 Backend Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Runtime** | Node.js | Server-side JavaScript |
| **API** | Next.js API Routes | Backend-for-Frontend (BFF) |
| **Database** | Supabase PostgreSQL | Primary data store |
| **Auth** | Supabase Auth | Authentication & sessions |
| **Storage** | Supabase Storage | File uploads |
| **Email** | Nodemailer | SMTP email delivery |
| **AI** | Google Gemini | Growth insights |
| **PDF** | Custom Generator | Quotation PDFs |

### 3.3 Infrastructure

| Component | Service | Purpose |
|-----------|---------|---------|
| **Hosting** | Vercel | Serverless deployment |
| **Database** | Supabase | Managed PostgreSQL |
| **CDN** | Vercel Edge | Static asset delivery |
| **Maps** | Mapbox/OSM | Location visualization |
| **Email** | UGC SMTP | Corporate email |

### 3.4 Development Tools

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT TOOLCHAIN                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TypeScript ─────▶ ESLint ─────▶ Jest ─────▶ Vercel Deploy     │
│       │               │            │              │              │
│       ▼               ▼            ▼              ▼              │
│  Type Safety    Code Quality   Testing     Production           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Database Design

### 4.1 Entity Relationship Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CORE ENTITY RELATIONSHIPS                             │
└─────────────────────────────────────────────────────────────────────────┘

                        ┌──────────────┐
                        │   profiles   │
                        │   (users)    │
                        └──────┬───────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
    │    leads     │    │  activities  │    │   tickets    │
    └──────┬───────┘    └──────────────┘    └──────┬───────┘
           │                                       │
           ▼                                       ▼
    ┌──────────────┐                        ┌──────────────┐
    │ opportunities│                        │  customer_   │
    │  (pipeline)  │                        │  quotations  │
    └──────┬───────┘                        └──────────────┘
           │
           ▼
    ┌──────────────┐
    │   accounts   │◀────────────────────┐
    └──────┬───────┘                     │
           │                             │
           ▼                             │
    ┌──────────────┐              ┌──────────────┐
    │   contacts   │              │ operational_ │
    └──────────────┘              │    costs     │
                                  └──────────────┘
```

### 4.2 Core Tables

#### Authentication & Users

```sql
-- profiles: User accounts with roles
CREATE TABLE profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,           -- 15 predefined roles
    department TEXT,
    is_active BOOLEAN DEFAULT true,
    avatar_url TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### CRM Tables

```sql
-- accounts: Customer/prospect companies
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status account_status NOT NULL DEFAULT 'calon_account',
    industry TEXT,
    website TEXT,
    address TEXT,
    city TEXT,
    province TEXT,
    country TEXT DEFAULT 'Indonesia',
    phone TEXT,
    email TEXT,
    created_by UUID REFERENCES profiles(user_id),
    owned_by UUID REFERENCES profiles(user_id),
    tenure_start_date DATE,
    last_activity_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- leads: Incoming opportunities from marketing
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    source lead_source NOT NULL,
    triage_status lead_triage_status DEFAULT 'New',
    estimated_value DECIMAL(15,2),
    notes TEXT,
    account_id UUID REFERENCES accounts(id),
    created_by UUID REFERENCES profiles(user_id),
    owned_by UUID REFERENCES profiles(user_id),
    triaged_by UUID REFERENCES profiles(user_id),
    triaged_at TIMESTAMPTZ,
    handed_over_at TIMESTAMPTZ,
    claimed_by UUID REFERENCES profiles(user_id),
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- opportunities (pipeline): Sales pipeline records
CREATE TABLE opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    account_id UUID REFERENCES accounts(id),
    lead_id UUID REFERENCES leads(id),
    stage opportunity_stage DEFAULT 'Prospecting',
    estimated_value DECIMAL(15,2),
    probability INTEGER DEFAULT 0,
    expected_close_date DATE,
    actual_close_date DATE,
    close_reason TEXT,
    owned_by UUID REFERENCES profiles(user_id),
    created_by UUID REFERENCES profiles(user_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- activities: Tasks, calls, meetings
CREATE TABLE activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type activity_type NOT NULL,
    subject TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    status activity_status DEFAULT 'pending',
    account_id UUID REFERENCES accounts(id),
    lead_id UUID REFERENCES leads(id),
    opportunity_id UUID REFERENCES opportunities(id),
    assigned_to UUID REFERENCES profiles(user_id),
    created_by UUID REFERENCES profiles(user_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### Ticketing Tables

```sql
-- tickets: Support/request tickets
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status ticket_status DEFAULT 'New',
    priority ticket_priority DEFAULT 'Medium',
    category TEXT,
    account_id UUID REFERENCES accounts(id),
    opportunity_id UUID REFERENCES opportunities(id),
    created_by UUID REFERENCES profiles(user_id),
    assigned_to UUID REFERENCES profiles(user_id),
    first_response_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    sla_due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- customer_quotations: Customer-facing quotes
CREATE TABLE customer_quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_number TEXT UNIQUE NOT NULL,
    ticket_id UUID REFERENCES tickets(id),
    opportunity_id UUID REFERENCES opportunities(id),
    account_id UUID REFERENCES accounts(id),
    status quotation_status DEFAULT 'Draft',
    total_amount DECIMAL(15,2),
    valid_until DATE,
    terms_id UUID REFERENCES quotation_terms(id),
    sent_at TIMESTAMPTZ,
    sent_to_email TEXT,
    accepted_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    verification_code TEXT UNIQUE,
    created_by UUID REFERENCES profiles(user_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- operational_costs: Cost calculation breakdowns
CREATE TABLE operational_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES tickets(id),
    quotation_id UUID REFERENCES customer_quotations(id),
    status cost_status DEFAULT 'Draft',
    total_cost DECIMAL(15,2),
    created_by UUID REFERENCES profiles(user_id),
    approved_by UUID REFERENCES profiles(user_id),
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES profiles(user_id),
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.3 Enums & Types

```sql
-- Lead Sources
CREATE TYPE lead_source AS ENUM (
    'Webform (SEM)',
    'Webform (Organic)',
    'Instagram',
    'TikTok',
    'Facebook',
    'Event',
    'Referral',
    'Outbound',
    'Lainnya'
);

-- Lead Triage Status
CREATE TYPE lead_triage_status AS ENUM (
    'New',
    'In Review',
    'Qualified',
    'Assign to Sales',
    'Nurture',
    'Disqualified'
);

-- Opportunity Stages
CREATE TYPE opportunity_stage AS ENUM (
    'Prospecting',
    'Discovery',
    'Quote Sent',
    'Negotiation',
    'Closed Won',
    'Closed Lost',
    'On Hold'
);

-- Account Status
CREATE TYPE account_status AS ENUM (
    'calon_account',   -- Prospect
    'new_account',     -- New customer
    'failed_account',  -- Failed to convert
    'active_account',  -- Active customer
    'passive_account', -- Inactive
    'lost_account'     -- Churned
);

-- Activity Types
CREATE TYPE activity_type AS ENUM (
    'Call',
    'Email',
    'Meeting',
    'Site Visit',
    'WhatsApp',
    'Task',
    'Proposal',
    'Contract Review',
    'Online Meeting',
    'Phone Call',
    'Texting'
);

-- Ticket Status
CREATE TYPE ticket_status AS ENUM (
    'New',
    'Open',
    'In Progress',
    'In Review',
    'Closed'
);
```

### 4.4 Key Database Functions (RPC)

```sql
-- Lead Triage Function
CREATE FUNCTION rpc_triage_lead(
    p_lead_id UUID,
    p_status lead_triage_status,
    p_notes TEXT DEFAULT NULL
) RETURNS JSON;

-- Lead Claim Function (Race-safe)
CREATE FUNCTION rpc_claim_lead(
    p_lead_id UUID,
    p_user_id UUID
) RETURNS JSON;

-- Opportunity Stage Change
CREATE FUNCTION rpc_opportunity_change_stage(
    p_opportunity_id UUID,
    p_new_stage opportunity_stage,
    p_notes TEXT DEFAULT NULL
) RETURNS JSON;

-- Quotation Accept
CREATE FUNCTION rpc_quotation_accept(
    p_quotation_id UUID,
    p_verification_code TEXT
) RETURNS JSON;

-- Quotation Reject
CREATE FUNCTION rpc_quotation_reject(
    p_quotation_id UUID,
    p_verification_code TEXT,
    p_reason TEXT
) RETURNS JSON;
```

### 4.5 Views

```sql
-- Lead Inbox View (Marketing)
CREATE VIEW v_lead_inbox AS
SELECT
    l.*,
    p.name as created_by_name,
    a.name as account_name
FROM leads l
LEFT JOIN profiles p ON l.created_by = p.user_id
LEFT JOIN accounts a ON l.account_id = a.id
WHERE l.triage_status IN ('New', 'In Review');

-- Sales Inbox View
CREATE VIEW v_sales_inbox AS
SELECT
    l.*,
    p.name as triaged_by_name,
    a.name as account_name
FROM leads l
LEFT JOIN profiles p ON l.triaged_by = p.user_id
LEFT JOIN accounts a ON l.account_id = a.id
WHERE l.triage_status = 'Assign to Sales'
  AND l.claimed_by IS NULL;

-- Pipeline View
CREATE VIEW v_pipeline AS
SELECT
    o.*,
    a.name as account_name,
    l.company_name as lead_company,
    p.name as owner_name,
    COALESCE(
        (SELECT json_agg(sh.*) FROM stage_history sh
         WHERE sh.opportunity_id = o.id),
        '[]'::json
    ) as stage_history
FROM opportunities o
LEFT JOIN accounts a ON o.account_id = a.id
LEFT JOIN leads l ON o.lead_id = l.id
LEFT JOIN profiles p ON o.owned_by = p.user_id;
```

---

## 5. Modul CRM

### 5.1 Lead Management

#### 5.1.1 Lead Lifecycle State Machine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      LEAD STATE MACHINE                                  │
└─────────────────────────────────────────────────────────────────────────┘

                              ┌───────────┐
                              │    NEW    │
                              │  (Entry)  │
                              └─────┬─────┘
                                    │
                                    ▼
                              ┌───────────┐
                              │IN REVIEW  │
                              └─────┬─────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
              ┌───────────┐  ┌───────────┐  ┌───────────┐
              │ QUALIFIED │  │  NURTURE  │  │DISQUALIFIED│
              └─────┬─────┘  └───────────┘  └───────────┘
                    │               │
                    ▼               │
              ┌───────────┐        │
              │ ASSIGN TO │        │
              │   SALES   │◀───────┘
              └─────┬─────┘   (Re-qualify)
                    │
                    ▼
              ┌───────────┐
              │  CLAIMED  │
              │ (by Sales)│
              └─────┬─────┘
                    │
                    ▼
              ┌───────────┐
              │ CONVERTED │
              │(Opportunity)│
              └───────────┘
```

#### 5.1.2 Lead Inbox (Marketing)

**Route**: `/lead-inbox`
**Access**: Marketing Manager, Marcomm, DGO, MACX, VSDO, Admin

**Features**:
- View new and in-review leads
- Triage actions: Qualify, Nurture, Disqualify
- Bulk operations
- Filter by source, date, status
- Lead detail modal

**Component**: `src/components/crm/lead-inbox-table.tsx`

#### 5.1.3 Sales Inbox

**Route**: `/sales-inbox`
**Access**: Sales Manager, Salesperson, Admin

**Features**:
- View qualified leads ready for claiming
- Atomic claim operation (race-safe)
- Lead preview
- Filter by industry, value

**Component**: `src/components/crm/sales-inbox-table.tsx`

### 5.2 Sales Pipeline

#### 5.2.1 Pipeline Stage Machine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    OPPORTUNITY STAGE MACHINE                             │
└─────────────────────────────────────────────────────────────────────────┘

┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
│ PROSPECTING│──▶│  DISCOVERY │──▶│ QUOTE SENT │──▶│ NEGOTIATION│
│    10%     │   │    25%     │   │    50%     │   │    75%     │
└────────────┘   └────────────┘   └────────────┘   └─────┬──────┘
                                                         │
                      ┌──────────────────────────────────┼──────────────┐
                      │                                  │              │
                      ▼                                  ▼              ▼
                ┌────────────┐                    ┌────────────┐  ┌────────────┐
                │  ON HOLD   │                    │ CLOSED WON │  │ CLOSED LOST│
                │    25%     │                    │   100%     │  │    0%      │
                └────────────┘                    └────────────┘  └────────────┘
```

#### 5.2.2 Pipeline Dashboard (Kanban)

**Route**: `/pipeline`
**Access**: Sales Team, Admin

**Features**:
- Drag-and-drop stage transitions
- Value summary per stage
- Quick actions (edit, view detail)
- Stage history tracking
- Activity linking

**Component**: `src/components/crm/pipeline-dashboard.tsx`

### 5.3 Account Management

#### 5.3.1 Account Tenure Status

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ACCOUNT TENURE MACHINE                                │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────┐                              ┌─────────────┐
│   CALON     │───────(Win Deal)───────────▶│    NEW      │
│  (Prospect) │                              │  ACCOUNT    │
└──────┬──────┘                              └──────┬──────┘
       │                                            │
       │ (Lost/Failed)                              │ (Activity)
       ▼                                            ▼
┌─────────────┐                              ┌─────────────┐
│   FAILED    │                              │   ACTIVE    │
│  ACCOUNT    │                              │  ACCOUNT    │
└─────────────┘                              └──────┬──────┘
                                                    │
                                                    │ (No activity >90 days)
                                                    ▼
                                             ┌─────────────┐
                                             │   PASSIVE   │
                                             │  ACCOUNT    │
                                             └──────┬──────┘
                                                    │
                                                    │ (Churn)
                                                    ▼
                                             ┌─────────────┐
                                             │    LOST     │
                                             │  ACCOUNT    │
                                             └─────────────┘
```

#### 5.3.2 Account Detail Page

**Route**: `/accounts/[id]`
**Access**: All CRM users (filtered by ownership)

**Features**:
- Company profile
- Contact list management
- Linked leads and opportunities
- Activity history
- Revenue tracking
- Tenure visualization

**Component**: `src/components/crm/account-detail.tsx`

### 5.4 Activity Management

**Route**: `/activities`
**Access**: All CRM users

**Activity Types**:
| Type | Icon | Use Case |
|------|------|----------|
| Call | 📞 | Phone follow-ups |
| Email | 📧 | Email communications |
| Meeting | 🤝 | In-person meetings |
| Site Visit | 🏢 | Customer site visits |
| WhatsApp | 💬 | WhatsApp messages |
| Task | ✅ | General tasks |
| Proposal | 📄 | Proposal preparation |
| Contract Review | 📋 | Contract discussions |
| Online Meeting | 💻 | Video calls |

**Features**:
- Calendar view
- Due date tracking with overdue alerts
- Link to lead/opportunity/account
- Completion workflow
- Activity notes and outcomes

### 5.5 Sales Planning

**Route**: `/sales-plan`
**Access**: Sales Manager, Salesperson, Admin

**Features**:
- Set revenue targets (monthly/quarterly)
- Track potential pipeline value
- Upload evidence documents
- Performance vs target visualization
- Forecasting

---

## 6. Modul Ticketing

### 6.1 Ticket Management

#### 6.1.1 Ticket Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       TICKET STATE MACHINE                               │
└─────────────────────────────────────────────────────────────────────────┘

┌───────┐    ┌───────┐    ┌───────────┐    ┌───────────┐    ┌───────┐
│  NEW  │───▶│ OPEN  │───▶│IN PROGRESS│───▶│ IN REVIEW │───▶│CLOSED │
└───────┘    └───────┘    └───────────┘    └───────────┘    └───────┘
    │            │              │               │
    │            │              │               │
    └────────────┴──────────────┴───────────────┘
              (Can transition back for rework)

SLA Tracking:
─────────────
• First Response Time: < 4 hours (business hours)
• Resolution Time: Based on priority
  - Critical: < 4 hours
  - High: < 8 hours
  - Medium: < 24 hours
  - Low: < 72 hours
```

#### 6.1.2 Ticket Features

**Routes**:
- `/tickets` - Ticket queue
- `/tickets/new` - Create ticket
- `/tickets/[id]` - Ticket detail

**Features**:
- Status workflow management
- Assignment to users/departments
- SLA tracking with alerts
- Comments and interactions
- File attachments
- Quote request linking
- Audit trail

### 6.2 Quotation Management

#### 6.2.1 Quotation Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    QUOTATION STATE MACHINE                               │
└─────────────────────────────────────────────────────────────────────────┘

┌───────┐    ┌───────┐    ┌────────────┐
│ DRAFT │───▶│ SENT  │───▶│  ACCEPTED  │
└───────┘    └───┬───┘    └────────────┘
                 │
                 │        ┌────────────┐
                 └───────▶│  REJECTED  │───▶ (Recreate) ───▶ DRAFT
                          └────────────┘
```

#### 6.2.2 Quotation Features

**Routes**:
- `/customer-quotations` - Quotation list
- `/customer-quotations/[id]` - Quotation detail
- `/customer-quotations/[id]/edit` - Edit quotation
- `/quotation-verify/[code]` - Public verification

**Features**:
- Line item management
- Standard terms selection
- PDF generation
- Email delivery with tracking
- Customer portal (accept/reject)
- Verification code for security
- Link to opportunity for sync

### 6.3 Operational Costs

**Route**: `/operational-costs`

**Features**:
- Cost breakdown by service
- Rate components
- Approval workflow
- Rejection with reasons
- Link to quotations

### 6.4 Dashboards

#### Overview Dashboard
**Route**: `/overview-ticket`
- Total tickets by status
- SLA compliance rate
- First response time metrics
- Resolution time trends
- Department performance

#### Performance Dashboard
**Route**: `/performance`
- Individual user metrics
- Department comparison
- SLA achievement
- Workload distribution

---

## 7. Authentication & Authorization

### 7.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      AUTHENTICATION FLOW                                 │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  User   │───▶│   Login     │───▶│  Supabase   │───▶│   Session   │
│ Browser │    │   Page      │    │    Auth     │    │   Cookie    │
└─────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │   Profile   │
                                  │   Lookup    │
                                  └─────────────┘
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │   Role &    │
                                  │ Permissions │
                                  └─────────────┘
```

### 7.2 Role-Based Access Control (RBAC)

#### 7.2.1 Role Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ROLE HIERARCHY                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                         ADMIN                                    │   │
│   │             Director, super admin                                │   │
│   │                    (Full Access)                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│              ┌───────────────┼───────────────┐                          │
│              │               │               │                          │
│              ▼               ▼               ▼                          │
│   ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐          │
│   │    MARKETING    │ │      SALES      │ │   OPERATIONS    │          │
│   │ Marketing Mgr   │ │  Sales Manager  │ │    EXIM Ops     │          │
│   │ Marcomm         │ │  Salesperson    │ │  Domestics Ops  │          │
│   │ DGO             │ │  Sales Support  │ │ Import DTD Ops  │          │
│   │ MACX            │ │                 │ │Traffic/Warehouse│          │
│   │ VSDO            │ │                 │ │    Finance      │          │
│   └─────────────────┘ └─────────────────┘ └─────────────────┘          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 7.2.2 Permission Matrix

| Feature | Admin | Mkt Mgr | Marcomm | Sales Mgr | Salesperson | Ops | Finance |
|---------|:-----:|:-------:|:-------:|:---------:|:-----------:|:---:|:-------:|
| Lead Inbox | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Lead Triage | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Sales Inbox | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Claim Leads | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Pipeline | ✅ | 👁️ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Accounts | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Activities | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Tickets | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Quotations | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Op. Costs | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Analytics | ✅ | ✅ | 👁️ | ✅ | 👁️ | 👁️ | 👁️ |

Legend: ✅ Full Access | 👁️ View Only | ❌ No Access

### 7.3 Row Level Security (RLS)

```sql
-- Example: Leads RLS Policy
CREATE POLICY "Users can view their own leads" ON leads
    FOR SELECT
    USING (
        auth.uid() = created_by
        OR auth.uid() = owned_by
        OR auth.uid() = claimed_by
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE user_id = auth.uid()
            AND role IN ('Director', 'super admin', 'Marketing Manager', 'sales manager')
        )
    );

-- Example: Accounts RLS Policy
CREATE POLICY "Users can view accounts they own or created" ON accounts
    FOR SELECT
    USING (
        auth.uid() = created_by
        OR auth.uid() = owned_by
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE user_id = auth.uid()
            AND role IN ('Director', 'super admin', 'sales manager', 'Marketing Manager')
        )
    );
```

---

## 8. API Design

### 8.1 API Structure

```
/api
├── /crm
│   ├── /leads
│   │   ├── GET    /                    # List leads
│   │   ├── POST   /                    # Create lead
│   │   ├── GET    /[id]                # Get lead
│   │   ├── PATCH  /[id]                # Update lead
│   │   ├── POST   /[id]/triage         # Triage lead
│   │   ├── POST   /[id]/handover       # Handover to sales
│   │   ├── POST   /[id]/convert        # Convert to opportunity
│   │   └── POST   /claim               # Claim lead (atomic)
│   │
│   ├── /opportunities
│   │   ├── GET    /                    # List opportunities
│   │   ├── POST   /                    # Create opportunity
│   │   ├── GET    /[id]                # Get opportunity
│   │   ├── PATCH  /[id]                # Update opportunity
│   │   └── POST   /[id]/stage          # Change stage
│   │
│   ├── /accounts
│   │   ├── GET    /                    # List accounts
│   │   ├── POST   /                    # Create account
│   │   ├── GET    /[id]                # Get account
│   │   ├── PATCH  /[id]                # Update account
│   │   └── GET    /my-accounts         # User's accounts
│   │
│   ├── /activities
│   │   ├── GET    /                    # List activities
│   │   ├── POST   /                    # Create activity
│   │   ├── PATCH  /[id]                # Update activity
│   │   └── POST   /[id]/complete       # Mark complete
│   │
│   ├── /sales-plans
│   │   ├── GET    /                    # List plans
│   │   ├── POST   /                    # Create plan
│   │   ├── PATCH  /[id]                # Update plan
│   │   ├── POST   /[id]/evidence       # Upload evidence
│   │   └── PATCH  /[id]/potential      # Update potential
│   │
│   ├── /kpi                            # KPI calculations
│   ├── /insights                       # AI growth insights
│   └── /views
│       ├── /lead-inbox                 # Materialized view
│       ├── /sales-inbox                # Materialized view
│       └── /pipeline                   # Materialized view
│
├── /ticketing
│   ├── /tickets
│   │   ├── GET    /                    # List tickets
│   │   ├── POST   /                    # Create ticket
│   │   ├── GET    /[id]                # Get ticket
│   │   ├── PATCH  /[id]                # Update ticket
│   │   ├── POST   /[id]/transition     # Change status
│   │   ├── POST   /[id]/assign         # Assign ticket
│   │   ├── POST   /[id]/comments       # Add comment
│   │   └── POST   /[id]/attachments    # Upload file
│   │
│   ├── /customer-quotations
│   │   ├── GET    /                    # List quotations
│   │   ├── POST   /                    # Create quotation
│   │   ├── GET    /[id]                # Get quotation
│   │   ├── PATCH  /[id]                # Update quotation
│   │   ├── POST   /[id]/send           # Send via email
│   │   ├── POST   /[id]/accept         # Accept quotation
│   │   ├── POST   /[id]/reject         # Reject quotation
│   │   ├── POST   /[id]/recreate       # Recreate quotation
│   │   └── GET    /[id]/pdf            # Generate PDF
│   │
│   ├── /operational-costs
│   │   ├── GET    /                    # List costs
│   │   ├── POST   /                    # Create cost
│   │   ├── GET    /[id]                # Get cost
│   │   └── PATCH  /[id]                # Update cost
│   │
│   ├── /overview                       # Dashboard metrics
│   ├── /performance                    # Performance data
│   └── /analytics                      # Analytics data
│
├── /profile
│   ├── GET    /                        # Get profile
│   ├── PATCH  /                        # Update profile
│   ├── POST   /avatar                  # Upload avatar
│   └── POST   /password                # Change password
│
└── /public
    └── /quotation/[code]/pdf           # Public PDF access
```

### 8.2 API Response Format

```typescript
// Success Response
{
  "success": true,
  "data": { ... },
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20
  }
}

// Error Response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}
```

### 8.3 API Authentication

All API routes (except `/api/public/*`) require authentication via Supabase session cookie.

```typescript
// Middleware check
export async function middleware(request: NextRequest) {
  const supabase = createServerClient(...)
  const { data: { session } } = await supabase.auth.getSession()

  if (!session && !isPublicRoute(request.pathname)) {
    return NextResponse.redirect('/login')
  }

  return NextResponse.next()
}
```

---

## 9. UI/UX Design System

### 9.1 Brand Colors

```css
/* Primary Colors */
--brand-orange: #FF4600;      /* Primary brand color */
--brand-orange-dark: #E63E00; /* Hover state */
--brand-orange-light: #FF6B33;/* Active state */

/* Neutral Colors */
--background: #FFFFFF;        /* Light mode background */
--background-dark: #0A0A0A;   /* Dark mode background */
--foreground: #0A0A0A;        /* Light mode text */
--foreground-dark: #FAFAFA;   /* Dark mode text */

/* Semantic Colors */
--success: #22C55E;           /* Success states */
--warning: #F59E0B;           /* Warning states */
--error: #EF4444;             /* Error states */
--info: #3B82F6;              /* Info states */
```

### 9.2 Typography

```css
/* Font Family */
font-family: 'Lufga', system-ui, sans-serif;

/* Font Sizes */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */
--text-3xl: 1.875rem;  /* 30px */
```

### 9.3 Component Library

| Component | Library | Usage |
|-----------|---------|-------|
| Button | shadcn/ui | Primary, secondary, ghost, destructive variants |
| Input | shadcn/ui | Text, email, password, number inputs |
| Select | Radix UI | Dropdown selections |
| Dialog | Radix UI | Modals and dialogs |
| Table | Custom | Data tables with sorting, filtering |
| Toast | Radix UI | Notifications |
| Tabs | Radix UI | Tab navigation |
| Card | shadcn/ui | Content containers |
| Avatar | Radix UI | User avatars |
| Badge | shadcn/ui | Status indicators |

### 9.4 Responsive Breakpoints

```css
/* Tailwind Breakpoints */
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large desktop */
```

### 9.5 Dark Mode Support

```typescript
// Theme Provider
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
>
  {children}
</ThemeProvider>
```

---

## 10. Security

### 10.1 Security Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       SECURITY ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 1: Network Security                                       │   │
│  │  • HTTPS/TLS encryption                                          │   │
│  │  • Vercel Edge Network with DDoS protection                      │   │
│  │  • Rate limiting                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 2: Application Security                                   │   │
│  │  • Supabase Auth (JWT tokens)                                    │   │
│  │  • HTTP-only session cookies                                     │   │
│  │  • CSRF protection                                               │   │
│  │  • Input validation (Zod)                                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 3: Data Security                                          │   │
│  │  • Row Level Security (RLS)                                      │   │
│  │  • Role-based access control                                     │   │
│  │  • Encrypted connections to database                             │   │
│  │  • Audit logging                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Security Measures

| Measure | Implementation |
|---------|----------------|
| **Authentication** | Supabase Auth with JWT |
| **Session Management** | HTTP-only cookies, 1-hour expiry |
| **Input Validation** | Zod schema validation on all inputs |
| **SQL Injection** | Parameterized queries via Supabase |
| **XSS Prevention** | React's automatic escaping |
| **CSRF Protection** | SameSite cookies |
| **Rate Limiting** | Vercel Edge rate limits |
| **Audit Trail** | All changes logged to audit_logs table |

### 10.3 Data Privacy

- PII (Personally Identifiable Information) stored securely in PostgreSQL
- Access controlled via RLS policies
- Data encryption at rest (Supabase managed)
- Encrypted connections (TLS 1.3)

---

## 11. Deployment & Infrastructure

### 11.1 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT ARCHITECTURE                               │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────┐
                    │         GitHub              │
                    │    (Source Repository)      │
                    └──────────────┬──────────────┘
                                   │
                                   │ Push to main
                                   ▼
                    ┌─────────────────────────────┐
                    │       Vercel CI/CD          │
                    │    (Build & Deploy)         │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
         ┌─────────────────┐           ┌─────────────────┐
         │  Preview Deploy │           │ Production      │
         │  (PR branches)  │           │ Deploy          │
         └─────────────────┘           └────────┬────────┘
                                                │
                                                ▼
                                   ┌─────────────────────┐
                                   │    Vercel Edge      │
                                   │    Network (CDN)    │
                                   └──────────┬──────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    │                         │                         │
                    ▼                         ▼                         ▼
         ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
         │   Serverless    │      │    Supabase     │      │   External      │
         │   Functions     │      │   PostgreSQL    │      │   Services      │
         │   (API Routes)  │      │   + Storage     │      │  (SMTP, AI)     │
         └─────────────────┘      └─────────────────┘      └─────────────────┘
```

### 11.2 Environment Configuration

```bash
# .env.local (Development)
# .env.production (Production)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# App
NEXT_PUBLIC_APP_URL=https://portal.ugc.co.id

# AI Integration
GEMINI_API_KEY=xxx

# Email - Quotation
SMTP_HOST=smtp.ugc.co.id
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=quotation@ugc.co.id
SMTP_PASS=xxx
SMTP_FROM="Quotation | UGC Logistics <quotation@ugc.co.id>"

# Email - CRM Notifications
CRM_SMTP_HOST=smtp.ugc.co.id
CRM_SMTP_PORT=465
CRM_SMTP_SECURE=true
CRM_SMTP_USER=crm@ugc.co.id
CRM_SMTP_PASS=xxx
CRM_SMTP_FROM="CRM UGC Logistics <crm@ugc.co.id>"

# Cron Jobs
CRON_SECRET=xxx

# Maps
NEXT_PUBLIC_MAP_PROVIDER=mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=xxx
```

### 11.3 Monitoring & Logging

| Service | Purpose |
|---------|---------|
| **Vercel Analytics** | Performance monitoring |
| **Vercel Logs** | Application logs |
| **Supabase Logs** | Database query logs |
| **Custom Audit Logs** | Business event tracking |

---

## 12. Integration Points

### 12.1 Current Integrations

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       INTEGRATION ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────────────┘

                           ┌─────────────────┐
                           │  UGC Business   │
                           │ Command Portal  │
                           └────────┬────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│   Supabase    │          │  Google       │          │   UGC SMTP    │
│               │          │  Gemini AI    │          │   Server      │
├───────────────┤          ├───────────────┤          ├───────────────┤
│ • Database    │          │ • Growth      │          │ • Quotation   │
│ • Auth        │          │   Insights    │          │   emails      │
│ • Storage     │          │ • AI Analysis │          │ • CRM notifs  │
│ • Real-time   │          │               │          │               │
└───────────────┘          └───────────────┘          └───────────────┘
        │
        ▼
┌───────────────┐
│   Mapbox /    │
│   OpenStreet  │
├───────────────┤
│ • Site Visit  │
│   locations   │
│ • Map preview │
└───────────────┘
```

### 12.2 API Integration Points

| Integration | Type | Purpose |
|-------------|------|---------|
| **Supabase** | Database, Auth, Storage | Core platform services |
| **Google Gemini** | AI API | Growth insights generation |
| **Nodemailer** | SMTP | Email delivery |
| **Mapbox/OSM** | Maps API | Location visualization |

### 12.3 Future Integration Opportunities

| Integration | Purpose | Priority |
|-------------|---------|----------|
| WhatsApp Business API | Direct messaging | High |
| Google Calendar | Activity sync | Medium |
| Accounting System | Invoice sync | Medium |
| ERP System | Order management | Low |
| Marketing Automation | Lead nurturing | Low |

---

## Appendix A: File Structure

```
ugc-business-command-portal/
├── src/
│   ├── app/
│   │   ├── (crm)/                    # CRM module routes
│   │   │   ├── accounts/
│   │   │   ├── activities/
│   │   │   ├── lead-inbox/
│   │   │   ├── lead-management/
│   │   │   ├── leads/
│   │   │   ├── my-leads/
│   │   │   ├── nurture-leads/
│   │   │   ├── opportunities/
│   │   │   ├── overview-crm/
│   │   │   ├── pipeline/
│   │   │   ├── profile/
│   │   │   ├── sales-inbox/
│   │   │   ├── sales-plan/
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (ticketing)/              # Ticketing module routes
│   │   │   ├── customer-quotations/
│   │   │   ├── operational-costs/
│   │   │   ├── overview-ticket/
│   │   │   ├── performance/
│   │   │   ├── tickets/
│   │   │   └── layout.tsx
│   │   │
│   │   ├── api/                      # API routes (BFF)
│   │   │   ├── crm/
│   │   │   ├── ticketing/
│   │   │   ├── profile/
│   │   │   └── public/
│   │   │
│   │   ├── login/
│   │   ├── quotation-verify/
│   │   ├── globals.css
│   │   └── layout.tsx
│   │
│   ├── components/
│   │   ├── crm/                      # CRM-specific components
│   │   ├── ticketing/                # Ticketing components
│   │   ├── analytics/                # Analytics components
│   │   ├── providers/                # Context providers
│   │   └── ui/                       # shadcn/ui components
│   │
│   ├── lib/
│   │   ├── supabase/                 # Supabase client setup
│   │   ├── constants.ts              # App constants
│   │   ├── permissions.ts            # RBAC helpers
│   │   ├── utils.ts                  # Utility functions
│   │   ├── crm-email-templates.ts
│   │   ├── crm-notification-service.ts
│   │   └── ticketing-notification-service.ts
│   │
│   ├── types/
│   │   └── database.ts               # Supabase types
│   │
│   ├── hooks/
│   │   ├── use-toast.ts
│   │   └── use-transition-refresh.ts
│   │
│   └── middleware.ts                 # Auth middleware
│
├── supabase/
│   ├── migrations/                   # 110 SQL migrations
│   ├── seed.sql                      # Test data
│   └── data_scheme.md
│
├── docs/                             # Documentation
├── public/                           # Static assets
├── tests/                            # Test files
│
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
├── jest.config.js
└── vercel.json
```

---

## Appendix B: State Machine Definitions

### B.1 Lead Triage States

| State | Description | Allowed Transitions |
|-------|-------------|---------------------|
| `New` | Newly created lead | → `In Review` |
| `In Review` | Being evaluated | → `Qualified`, `Nurture`, `Disqualified` |
| `Qualified` | Ready for sales | → `Assign to Sales` |
| `Assign to Sales` | In sales pool | → `Claimed` (via claim) |
| `Nurture` | Long-term follow-up | → `In Review` (re-qualify) |
| `Disqualified` | Not a fit | Terminal |

### B.2 Opportunity Stages

| Stage | Probability | Description |
|-------|-------------|-------------|
| `Prospecting` | 10% | Initial research |
| `Discovery` | 25% | Understanding needs |
| `Quote Sent` | 50% | Quotation delivered |
| `Negotiation` | 75% | Terms discussion |
| `Closed Won` | 100% | Deal closed |
| `Closed Lost` | 0% | Deal lost |
| `On Hold` | 25% | Temporarily paused |

### B.3 Ticket States

| State | Description |
|-------|-------------|
| `New` | Just created |
| `Open` | Acknowledged |
| `In Progress` | Being worked on |
| `In Review` | Awaiting approval |
| `Closed` | Resolved |

### B.4 Quotation States

| State | Description |
|-------|-------------|
| `Draft` | Being prepared |
| `Sent` | Delivered to customer |
| `Accepted` | Customer accepted |
| `Rejected` | Customer rejected |

---

## Appendix C: API Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_REQUIRED` | 401 | Authentication required |
| `AUTH_INVALID` | 401 | Invalid credentials |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate) |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-29 | Claude | Initial blueprint creation |

---

*Blueprint ini adalah dokumentasi komprehensif untuk UGC Business Command Portal. Untuk informasi teknis lebih detail, silakan merujuk ke dokumentasi di folder `/docs/` dan kode sumber di `/src/`.*
