# VDCO — Visual Design Creative Order
# Implementation Blueprint (SSOT)

> **Submenu:** Marketing Panel → Design Request (VDCO)
> **Versi:** 1.0
> **Terakhir diperbarui:** 2026-02-10

---

## 1. Ringkasan

Modul VDCO memungkinkan user role marketing (Marcomm, MACX, DGO, Marketing Manager) untuk membuat
request produksi design visual ke tim VDCO. VDCO memproduksi, mengirim hasil design, dan user
melakukan review — approve atau minta revisi — hingga design final disetujui.

Seluruh mekanisme dilengkapi time-tracking otomatis untuk mengukur efisiensi produksi.

---

## 2. Roles & Permissions

### 2.1 Requester (Marketing)
| Role | Bisa Request | Approve/Revisi | Lihat Semua |
|------|-------------|----------------|-------------|
| Marketing Manager | Ya | Ya (semua) | Ya |
| Marcomm | Ya | Ya (own) | Ya |
| DGO | Ya | Ya (own) | Ya |
| MACX | Ya | Ya (own) | Ya |
| Director | Ya | Ya (semua) | Ya |
| super admin | Ya | Ya (semua) | Ya |

### 2.2 Producer (VDCO)
| Aksi | VDCO |
|------|------|
| Lihat request | Ya (assigned / unassigned) |
| Accept request | Ya |
| Upload design (deliver) | Ya |
| Comment/discuss | Ya |
| Approve/reject | Tidak |

### 2.3 Helper Functions (RLS)
- `fn_is_design_requester()` → Marketing roles (can create requests)
- `fn_is_design_producer()` → VDCO role (can deliver designs)
- `fn_is_design_approver()` → Director, super admin, Marketing Manager (can approve any)

---

## 3. Status Flow

```
draft → submitted → accepted → in_progress → delivered → approved ✓
   │                                              ↑         │
   │                                              │         ↓
   └→ cancelled                              in_progress ← revision_requested
```

| Status | Siapa yang Set | Deskripsi |
|--------|---------------|-----------|
| draft | Requester | Brief sedang ditulis, belum dikirim |
| submitted | Requester | Brief dikirim ke VDCO, menunggu diterima |
| accepted | VDCO | VDCO sudah terima, mulai kerja |
| in_progress | VDCO | VDCO sedang mengerjakan |
| delivered | VDCO | Design sudah dikirim (version baru) |
| revision_requested | Requester | Requester minta revisi dengan feedback |
| approved | Requester | Design disetujui, selesai |
| cancelled | Requester | Request dibatalkan |

### Valid Transitions
```
draft           → submitted, cancelled
submitted       → accepted, cancelled
accepted        → in_progress
in_progress     → delivered
delivered       → approved, revision_requested
revision_requested → in_progress
approved        → (terminal)
cancelled       → (terminal)
```

---

## 4. Database Schema

### 4.1 marketing_design_requests (Tabel Utama)

```sql
id                  UUID PK DEFAULT gen_random_uuid()
title               TEXT NOT NULL            -- Judul request
description         TEXT NOT NULL            -- Deskripsi detail kebutuhan
design_type         TEXT NOT NULL            -- Jenis design (lihat §4.4)
design_subtype      TEXT                     -- Sub-jenis (opsional)
platform_target     TEXT[]                   -- Platform tujuan: instagram, tiktok, dll
dimensions          TEXT                     -- Ukuran: "1080x1080", "1920x1080", dll
brand_guidelines    TEXT                     -- Panduan brand/warna/font
reference_urls      TEXT[]                   -- URL referensi visual (max 5)
reference_notes     TEXT                     -- Catatan tentang referensi
copy_text           TEXT                     -- Teks/copywriting yang harus ada di design
cta_text            TEXT                     -- Call-to-action text
color_preferences   TEXT                     -- Preferensi warna
mood_tone           TEXT                     -- Mood/tone: professional, playful, bold, dll
output_format       TEXT[]                   -- Format output: png, jpg, pdf, psd, ai, mp4
quantity            INTEGER DEFAULT 1        -- Jumlah variasi design
priority            TEXT DEFAULT 'medium'    -- low, medium, high, urgent
deadline            DATE                     -- Deadline request
status              TEXT DEFAULT 'draft'     -- Status saat ini
requested_by        UUID FK profiles(user_id) NOT NULL
assigned_to         UUID FK profiles(user_id) -- VDCO yang di-assign
campaign_id         UUID FK marketing_content_campaigns(id)  -- Opsional link ke campaign

-- Time tracking (auto-set via status changes)
submitted_at        TIMESTAMPTZ
accepted_at         TIMESTAMPTZ
first_delivered_at  TIMESTAMPTZ
approved_at         TIMESTAMPTZ
cancelled_at        TIMESTAMPTZ

-- Computed (bisa dihitung di API)
revision_count      INTEGER DEFAULT 0

created_at          TIMESTAMPTZ DEFAULT NOW()
updated_at          TIMESTAMPTZ DEFAULT NOW()
```

### 4.2 marketing_design_versions (Setiap Delivery dari VDCO)

```sql
id                  BIGINT GENERATED ALWAYS AS IDENTITY PK
request_id          UUID FK marketing_design_requests(id) ON DELETE CASCADE
version_number      INTEGER NOT NULL         -- 1, 2, 3, ...
design_url          TEXT NOT NULL             -- URL hasil design (Google Drive, Figma, dll)
design_url_2        TEXT                      -- URL tambahan
thumbnail_url       TEXT                      -- Preview thumbnail
file_format         TEXT                      -- png, pdf, psd, dll
notes               TEXT                      -- Catatan dari VDCO
delivered_by        UUID FK profiles(user_id) NOT NULL
delivered_at        TIMESTAMPTZ DEFAULT NOW()

-- Review oleh requester
review_status       TEXT DEFAULT 'pending'   -- pending, approved, revision_requested
reviewed_by         UUID FK profiles(user_id)
reviewed_at         TIMESTAMPTZ
review_comment      TEXT                      -- Feedback dari reviewer
```

### 4.3 marketing_design_comments (Diskusi)

```sql
id                  BIGINT GENERATED ALWAYS AS IDENTITY PK
request_id          UUID FK marketing_design_requests(id) ON DELETE CASCADE
user_id             UUID FK profiles(user_id) NOT NULL
comment             TEXT NOT NULL
comment_type        TEXT DEFAULT 'comment'   -- comment, revision_feedback, system
version_ref         INTEGER                  -- Referensi ke version number (opsional)
created_at          TIMESTAMPTZ DEFAULT NOW()
```

### 4.4 Design Types

```
social_media_post       Post untuk sosial media (feed)
social_media_story      Story/status
social_media_banner     Banner/cover sosial media
social_media_ads        Iklan sosial media
presentation            Presentasi/deck
infographic             Infografis
brochure                Brosur
flyer                   Flyer/leaflet
poster                  Poster
banner_ads              Banner iklan digital
video_thumbnail         Thumbnail video
logo                    Logo/branding
packaging               Packaging design
event_material          Material event (backdrop, ID card, dll)
email_template          Template email
web_banner              Banner website
merchandise             Design merchandise
other                   Lainnya
```

---

## 5. API Endpoints

### 5.1 Requests
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/marketing/design-requests` | List requests + filters + pagination |
| POST | `/api/marketing/design-requests` | Buat request baru |
| GET | `/api/marketing/design-requests/[id]` | Detail request + versions + comments |
| PATCH | `/api/marketing/design-requests/[id]` | Update request (draft only) |
| DELETE | `/api/marketing/design-requests/[id]` | Hapus request (draft only) |

### 5.2 Status
| Method | Path | Deskripsi |
|--------|------|-----------|
| PATCH | `/api/marketing/design-requests/[id]/status` | Ubah status dengan validasi transition |

### 5.3 Versions (Delivery)
| Method | Path | Deskripsi |
|--------|------|-----------|
| POST | `/api/marketing/design-requests/[id]/versions` | VDCO kirim design baru |
| PATCH | `/api/marketing/design-requests/[id]/versions/[vid]/review` | Requester approve/revisi |

### 5.4 Comments
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/marketing/design-requests/[id]/comments` | List comments |
| POST | `/api/marketing/design-requests/[id]/comments` | Tambah comment |

### 5.5 Analytics
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/marketing/design-requests/analytics` | KPI + time metrics + stats |

---

## 6. UI Components

### 6.1 Tab Structure
1. **Overview** — KPI cards, active requests, time metrics
2. **Requests** — List semua request dengan filter
3. **My Requests** — Request milik user saat ini
4. **Analytics** — Statistik performa, waktu, tipe design

### 6.2 Dialogs
1. **Create Request** — Form pembuatan request (comprehensive)
2. **Request Detail** — Detail + version gallery + timeline + comments
3. **Deliver Design** — Form VDCO kirim design (URL + notes)
4. **Review Design** — Form approve/revision request
5. **Status Change** — Konfirmasi perubahan status

### 6.3 Form Pembuatan Request (Comprehensive)

**Section 1 — Informasi Dasar:**
- Judul request
- Tipe design (dropdown)
- Sub-tipe (opsional)
- Prioritas (low/medium/high/urgent)
- Deadline

**Section 2 — Brief & Deskripsi:**
- Deskripsi detail kebutuhan
- Copy/teks yang harus ada di design
- Call-to-action text
- Platform target (multi-select: instagram, tiktok, youtube, dll)

**Section 3 — Spesifikasi Visual:**
- Dimensi/ukuran
- Preferensi warna
- Mood/tone
- Brand guidelines notes
- Format output (multi-select: png, jpg, pdf, psd, ai)
- Jumlah variasi

**Section 4 — Referensi:**
- URL referensi visual (sampai 5 URL)
- Catatan tentang referensi
- Link ke campaign (opsional)

---

## 7. Time Metrics (Auto-calculated)

| Metrik | Formula | Tampilan |
|--------|---------|----------|
| Time to Accept | accepted_at - submitted_at | "2 jam 15 menit" |
| Time to First Delivery | first_delivered_at - accepted_at | "1 hari 4 jam" |
| Time per Revision Cycle | Avg(next_delivery - revision_requested) | "6 jam" |
| Total Revisions | Count versions with review_status='revision_requested' | "3 revisi" |
| Total Turnaround | approved_at - submitted_at | "3 hari 8 jam" |
| SLA Compliance | deadline >= approved_at ? on_time : overdue | "On Time / Overdue" |

---

## 8. Navigation

Tambahkan di sidebar setelah "Content Plan":

```tsx
<Link href="/marketing/design-request">
  <Palette className="h-4 w-4" />
  Design Request
</Link>
```

---

## 9. File Structure

```
src/
├── app/(crm)/marketing/design-request/
│   └── page.tsx
├── app/api/marketing/design-requests/
│   ├── route.ts                          (GET list, POST create)
│   ├── [id]/
│   │   ├── route.ts                      (GET detail, PATCH, DELETE)
│   │   ├── status/route.ts              (PATCH status)
│   │   ├── versions/route.ts            (POST deliver)
│   │   ├── versions/[vid]/review/route.ts (PATCH review)
│   │   └── comments/route.ts            (GET, POST)
│   └── analytics/route.ts              (GET analytics)
├── components/marketing/design-request/
│   └── design-request-dashboard.tsx
supabase/migrations/
└── 159_marketing_design_requests.sql
```
