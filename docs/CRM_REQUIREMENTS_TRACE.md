# CRM Requirements Trace Document

## SOURCE: UGC BCP CRM – Target-State Architecture and Flow Specification.pdf

---

## 1. Pages & Routes Mapping (SOURCE: PDF Section 1, Pages 1-3)

| Route | Purpose | PDF Reference |
|-------|---------|---------------|
| `/crm/lead-inbox` | Marketing Lead Queue - New/In Review leads | Section 1, Page 1 |
| `/crm/sales-inbox` | Sales Lead Pool - Handover pool + overdue tasks | Section 1, Page 1 |
| `/crm/my-leads` | Claimed leads by salesperson | Section 1, Page 1 |
| `/crm/pipeline` | Opportunity kanban board | Section 1, Page 1 |
| `/crm/activities` | Tasks and activities planner | Section 1, Page 1-2 |
| `/crm/accounts` | Customer accounts list | Section 1, Page 2 |
| `/crm/accounts/[id]` | Account 360 view | Section 1, Page 2 |
| `/crm/targets` | Prospecting targets workspace | Section 1, Page 2 |
| `/crm/imports` | Import management | Section 1, Page 2 |
| `/crm/nurture-leads` | Nurture leads list | Section 5, Page 17 |
| `/crm/disqualified-leads` | Disqualified leads archive | Section 5, Page 17 |

---

## 2. API Routes (SOURCE: PDF Section 1 & 3, Pages 2-3, 8-10)

| Endpoint | Method | Purpose | PDF Reference |
|----------|--------|---------|---------------|
| `/api/crm/leads` | GET | List leads by view param | Section 3, Page 8 |
| `/api/crm/leads` | POST | Create new lead | Section 3, Page 8 |
| `/api/crm/leads/[id]/triage` | PATCH | Update triage status | Section 3, Page 8 |
| `/api/crm/leads/[id]/handover` | POST | Handover to sales pool | Section 3, Page 8 |
| `/api/crm/leads/[id]/claim` | POST | Sales claim lead | Section 3, Page 9 |
| `/api/crm/leads/[id]/convert` | POST | Convert lead to opportunity | Section 3, Page 3 |
| `/api/crm/opportunities` | GET/POST | List/create opportunities | Section 3, Page 3 |
| `/api/crm/opportunities/[id]/stage` | PATCH | Change opportunity stage | Section 3, Page 3 |
| `/api/crm/activities` | GET/POST | List/create activities | Section 3, Page 3 |
| `/api/crm/activities/[id]/complete` | POST | Mark activity complete | Section 3, Page 3 |
| `/api/crm/accounts` | GET/POST | List/create accounts | Section 3, Page 3 |
| `/api/crm/accounts/[id]` | GET | Account 360 data | Section 3, Page 3 |
| `/api/crm/contacts` | POST | Create contact | Section 3, Page 3 |
| `/api/crm/targets` | GET/POST | List/create targets | Section 3, Page 3 |
| `/api/crm/targets/[id]/convert` | POST | Convert target to opp | Section 3, Page 3 |
| `/api/crm/imports` | GET/POST | Import history/upload | Section 1, Page 2 |

---

## 3. Database Schema (SOURCE: PDF Section 6, Pages 21-28)

### Enums Required:
- `lead_triage_status`: New, In Review, Qualified, Nurture, Disqualified, Assign to Sales (Page 21)
- `opportunity_stage`: Prospecting, Discovery, Quote Sent, Negotiation, Closed Won, Closed Lost (Page 7)
- `activity_type_v2`: Call, Email, Meeting, Task, Note (Page 24)
- `activity_status`: Planned, Done, Cancelled (Page 24)
- `target_status`: new_target, contacted, engaged, qualified, dropped, converted (Page 23)

### Tables Required:
1. **profiles** - User profiles with role/department (Page 21)
2. **leads** - Lead records with triage workflow (Pages 21-22)
3. **lead_handover_pool** - Handover tracking (Page 22)
4. **accounts** - Customer accounts (Page 22-23)
5. **contacts** - Account contacts (Page 23)
6. **opportunities** - Sales opportunities (Page 22)
7. **opportunity_stage_history** - Stage change audit (Page 7)
8. **prospecting_targets** - Pre-lead prospects (Page 23-24)
9. **activities** - Tasks and activities (Page 24)
10. **cadences** - Automation templates (Page 12)
11. **cadence_steps** - Cadence step definitions (Page 12)
12. **cadence_enrollments** - Active cadence tracking (Page 12)
13. **import_batches** - Import job tracking (Page 2)
14. **audit_logs** - System audit trail (Page 8)
15. **crm_idempotency** - Idempotency key storage (Page 25)

### Views Required:
- `v_lead_inbox` - New/In Review leads (Page 16)
- `v_sales_inbox` - Unclaimed handover pool (Page 16)
- `v_my_leads` - Claimed leads by user (Page 17)
- `v_nurture_leads` - Nurture status leads (Page 17)
- `v_disqualified_leads` - Disqualified leads (Page 17)
- `v_pipeline_active` - Active opportunities (Page 17)
- `v_accounts_enriched` - Accounts with computed badges (Page 18)

---

## 4. Workflow State Transitions (SOURCE: PDF Section 2, Pages 4-8)

### Lead Triage State Machine (Page 4-5):
```
New → In Review (marketing begins triage)
In Review → Qualified (requires contact info validation)
In Review → Nurture (not ready, long-term follow-up)
In Review → Disqualified (requires reason)
Qualified → Assign to Sales (manual, creates pool entry with potential revenue required)
Assign to Sales → Claimed (sales takes ownership)
Claimed → Converted (creates opportunity + account)
```

### Auto-Handover Rule (Page 5):
"When a lead's triage_status is set to Qualified, the system immediately triggers a handover."

### Claim Lead Atomic Operations (Page 5):
1. Lock pool row (FOR UPDATE SKIP LOCKED)
2. Set claimed_by/claimed_at
3. Set leads.sales_owner_user_id
4. Find-or-create Account (dedupe)
5. Create Opportunity (link account + source_lead_id)
6. Seed Activities + Cadence enrollment
7. Write audit_logs
8. Idempotent via idempotency key

### Opportunity Stage Rules (Page 7):
- Lost requires `lost_reason`
- Stage changes logged to `opportunity_stage_history`
- Via RPC `rpc_opportunity_change_stage`

---

## 5. RLS Policy Requirements (SOURCE: PDF Section 6, Pages 25-27)

### Lead Policies:
- Marketing: See New/In Review/Nurture/Disqualified in their department
- Marketing: Cannot edit after Assign to Sales
- Sales: See handover pool + assigned leads
- Sales Manager: Read team's data
- Director/Super Admin: Full read access

### Opportunity Policies:
- Sales: Own opportunities
- Sales Manager: Team opportunities
- Director/Admin: All opportunities

### Import Policies:
- Only Marketing Manager, Sales Manager, Super Admin can import

---

## 6. UI Component Requirements (SOURCE: PDF Section 7, Blueprint Pages 6-7)

### Design System:
- Accent color: #FF4600
- Light + Dark theme support
- Design tokens for: bg, surface, border, text, muted, success, warn, danger, focus ring

### Components Required:
- Sidebar (role-based menu)
- Topbar (search, user menu, theme toggle)
- PageHeader (title, breadcrumbs, actions)
- KPI Cards
- DataTable (sorting, pagination, column visibility)
- Filter chips
- Forms (LeadTriageForm, AddLeadForm, AddAccountForm, AddContactForm, QuickAddOpportunityForm)
- ImportTargetsWizard
- Modal/Drawer patterns
- Toasts, tooltips, dropdowns

---

## 7. Roles (FIXED - SOURCE: Blueprint + PDF)

```
Director
super admin
Marketing Manager
Marcomm
DGO
MACX
VSDO
sales manager
salesperson
sales support
EXIM Ops
domestics Ops
Import DTD Ops
traffic & warehous
finance
```

---

## 8. Key Invariants (SOURCE: PDF Throughout)

1. **No vanishing leads**: Every lead appears in exactly one view at any time (Page 6)
2. **Owner + Next Action**: Every active lead/opportunity has owner and scheduled next action (Page 1-2)
3. **Atomic transitions**: Multi-entity changes in single transaction (Page 7)
4. **Idempotency**: All critical operations support idempotency keys (Page 7)
5. **Auto-handover**: Qualified immediately triggers handover (Page 5)
6. **Dedupe**: Accounts/targets use dedupe_key (Page 2)

---

## Document Version
- Generated: 2024
- Source: UGC BCP CRM – Target-State Architecture and Flow Specification.pdf
- Status: Wajib Lengkap Implementation
