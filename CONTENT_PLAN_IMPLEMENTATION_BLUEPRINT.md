# Content Plan Module - Implementation Blueprint (SSOT)

> **Single Source of Truth** untuk pembangunan modul Content Plan di Marketing Panel.
> Semua keputusan arsitektur, fitur, dan teknis mengacu ke dokumen ini.

---

## Daftar Isi

1. [Konteks & Tujuan](#1-konteks--tujuan)
2. [Hubungan dengan Modul Lain](#2-hubungan-dengan-modul-lain)
3. [Fitur Lengkap](#3-fitur-lengkap)
4. [User Flow](#4-user-flow)
5. [Database Schema](#5-database-schema)
6. [API Routes](#6-api-routes)
7. [Component Structure](#7-component-structure)
8. [Arsitektur & Data Flow](#8-arsitektur--data-flow)
9. [Fase Implementasi](#9-fase-implementasi)
10. [File Map](#10-file-map)

---

## 1. Konteks & Tujuan

### Masalah yang Diselesaikan

Tim Digital Marketing saat ini merencanakan konten social media menggunakan spreadsheet/Google Sheets terpisah. Ini menyebabkan:
- Tidak ada single view untuk semua platform
- Sulit melacak status konten (draft → approved → published)
- Tidak bisa langsung melihat performa konten yang sudah dipublish
- Tidak ada histori perubahan/approval
- Koordinasi antar anggota tim tidak efisien

### Tujuan Module

Menyediakan tool terintegrasi untuk **merencanakan, mengelola, dan memantau** konten social media di 5 platform (TikTok, Instagram, YouTube, Facebook, LinkedIn) langsung dari portal.

### Target User & Roles

| Role | Akses |
|------|-------|
| Director | Full access: view, create, edit, approve, delete |
| super admin | Full access |
| Marketing Manager | Full access: view, create, edit, approve, delete |
| Marcomm | Create & edit own content, view all |
| DGO (Digital Graphic Officer) | Create & edit own content, view all |
| MACX | Create & edit own content, view all |
| VSDO (Video & Social Director Officer) | Create & edit own content, view all |

---

## 2. Hubungan dengan Modul Lain

Content Plan tidak berdiri sendiri. Ia terhubung dengan data yang sudah ada:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  MARKETING PANEL                                                        │
│                                                                         │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │ Digital          │    │ Content Plan     │    │ SEO-SEM          │  │
│  │ Performance      │◄───│ (MODULE INI)     │    │ Performance      │  │
│  │                  │    │                  │    │                  │  │
│  │ • Account stats  │    │ • Calendar       │    │ • Keywords       │  │
│  │ • Content perf   │    │ • Planning       │    │ • Rankings       │  │
│  │ • Analytics      │    │ • Workflow       │    │ • Ads            │  │
│  └────────┬─────────┘    └────────┬─────────┘    └──────────────────┘  │
│           │                       │                                     │
│           │    ┌──────────────────▼──────────────────┐                  │
│           └───►│ marketing_social_media_content      │                  │
│                │ (Tabel existing dari migration 155) │                  │
│                │                                      │                  │
│                │ Data performa aktual per konten:     │                  │
│                │ views, likes, comments, shares,      │                  │
│                │ engagement_rate, reach, impressions   │                  │
│                └─────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Koneksi kunci**:
- Content Plan item yang sudah dipublish bisa di-link ke `marketing_social_media_content` (data performa aktual)
- Ini memungkinkan perbandingan: **planned vs actual performance**
- Hashtag yang dipakai di Content Plan bisa dianalisis efektivitasnya via data performa

---

## 3. Fitur Lengkap

### 3.1 Content Overview Dashboard

Halaman utama saat membuka Content Plan. Memberikan gambaran cepat status konten.

**KPI Cards (baris atas)**:

| KPI | Penjelasan |
|-----|------------|
| Total Planned | Jumlah konten yang dijadwalkan bulan ini |
| Published | Jumlah konten yang sudah dipublish bulan ini |
| In Review | Jumlah konten menunggu approval |
| Draft | Jumlah konten masih draft |
| Completion Rate | Published / Total Planned × 100% |
| Avg Engagement | Rata-rata engagement rate konten yang sudah publish (dari data aktual) |

**Quick Views**:
- **Upcoming This Week**: 5-7 konten terdekat yang akan dipublish (card list)
- **Needs Attention**: Konten yang overdue (jadwal lewat tapi belum publish) atau rejected
- **Recent Activity**: Log aktivitas terbaru (siapa buat/edit/approve apa)

### 3.2 Content Calendar

Tampilan kalender visual untuk melihat jadwal konten di semua platform.

**View Modes**:

| Mode | Tampilan |
|------|----------|
| **Month View** | Grid kalender bulanan, setiap tanggal menampilkan dot/badge per platform |
| **Week View** | 7 kolom, detail lebih banyak per hari, bisa lihat judul + platform |
| **List View** | Tabel kronologis semua konten, sortable & filterable |

**Interaksi**:
- Klik tanggal di kalender → buka panel samping dengan konten hari itu
- Klik item konten → buka detail/edit modal
- Klik tombol "+" di tanggal → buat konten baru untuk tanggal itu
- Color coding per platform (sesuai brand colors yang sudah ada di `social-media-icons.tsx`)
- Status indicator: dot warna berbeda untuk draft/review/approved/published/rejected

**Filter Calendar**:
- By platform (multi-select: TikTok, Instagram, YouTube, Facebook, LinkedIn)
- By status (All, Draft, In Review, Approved, Published, Rejected)
- By assigned user
- By content type
- By campaign/label

### 3.3 Content Plan Creator (Form)

Form untuk membuat dan mengedit content plan item.

**Form Fields**:

| Field | Type | Required | Keterangan |
|-------|------|----------|------------|
| Title | Text input | Ya | Judul/nama konten (internal reference) |
| Platform | Multi-select | Ya | Bisa pilih >1 platform (cross-post) |
| Content Type | Select | Ya | Sesuai platform: post, video, reel, story, short, carousel, live, article |
| Scheduled Date | Date picker | Ya | Tanggal rencana publish |
| Scheduled Time | Time picker | Tidak | Jam rencana publish (opsional) |
| Caption / Copy | Rich textarea | Tidak | Teks caption yang akan dipost |
| Hashtags | Tag input | Tidak | Hashtag yang akan digunakan, pilih dari library atau ketik baru |
| Visual Reference | File upload / URL | Tidak | Upload gambar/video preview atau link ke Google Drive/Canva |
| Campaign | Select / Create | Tidak | Campaign/label group (contoh: "Promo Lebaran 2026", "Brand Awareness Q1") |
| Notes | Textarea | Tidak | Catatan internal (brief untuk designer, referensi, dll) |
| Assigned To | User select | Tidak | Siapa yang bertanggung jawab membuat konten ini |
| Priority | Select | Tidak | Low / Medium / High |
| Target Metrics | Number inputs | Tidak | Target views, likes, engagement rate (untuk perbandingan dengan aktual nanti) |

**Cross-posting**:
Jika user memilih >1 platform, sistem membuat 1 parent item + child items per platform. Ini memungkinkan:
- Caption berbeda per platform (edit individual)
- Jadwal berbeda per platform
- Tracking performa per platform terpisah
- Tapi tetap tergroup sebagai 1 konten logis

### 3.4 Editorial Workflow

Alur kerja persetujuan konten sebelum publish.

**Status Flow**:

```
                    ┌──────────┐
                    │  DRAFT   │  ← Konten baru dibuat
                    └────┬─────┘
                         │ Submit for Review
                    ┌────▼─────┐
                    │IN REVIEW │  ← Menunggu approval
                    └────┬─────┘
                    ┌────┴─────┐
               ┌────▼───┐ ┌───▼────┐
               │APPROVED│ │REJECTED│
               └────┬───┘ └───┬────┘
                    │         │ Revise → kembali ke DRAFT
               ┌────▼─────┐
               │PUBLISHED │  ← Sudah dipost (manual mark atau auto-detect)
               └────┬─────┘
               ┌────▼─────┐
               │ARCHIVED  │  ← Konten lama yang sudah tidak relevan
               └──────────┘
```

**Status Definitions**:

| Status | Siapa yang Set | Keterangan |
|--------|----------------|------------|
| `draft` | Creator | Konten masih dikerjakan |
| `in_review` | Creator (submit) | Dikirim ke Manager/Director untuk review |
| `approved` | Manager / Director | Disetujui, siap publish |
| `rejected` | Manager / Director | Ditolak, perlu revisi (wajib isi alasan) |
| `published` | Creator (manual mark) | Sudah dipost di platform |
| `archived` | Siapa saja | Dipindahkan ke arsip |

**Approval Features**:
- Review comment: Approver bisa beri catatan saat approve/reject
- Rejection reason: Wajib isi alasan saat reject
- Approval history: Log siapa approve/reject kapan dengan catatan apa
- Notification indicator: Badge count untuk konten yang perlu di-review

### 3.5 Campaign / Label Management

Grouping konten ke dalam campaign atau label untuk organisasi.

**Campaign Fields**:

| Field | Type | Keterangan |
|-------|------|------------|
| Name | Text | Nama campaign (contoh: "Promo Lebaran 2026") |
| Description | Text | Deskripsi singkat campaign |
| Color | Color picker | Warna badge untuk visual di calendar |
| Start Date | Date | Tanggal mulai campaign |
| End Date | Date | Tanggal berakhir campaign |
| Status | Select | Active / Completed / Cancelled |

**Campaign Dashboard**:
- Card per campaign: nama, period, jumlah konten planned/published, progress bar
- Klik campaign → filter calendar hanya konten campaign itu
- Summary: total reach, total engagement dari konten campaign (dari data aktual)

### 3.6 Hashtag Library

Database hashtag yang sering digunakan untuk konsistensi dan efisiensi.

**Hashtag Fields**:

| Field | Keterangan |
|-------|------------|
| Tag | Teks hashtag (tanpa #, auto-prefix saat display) |
| Category | Kategori: Brand, Product, Campaign, Industry, Trending |
| Platforms | Platform mana yang cocok (multi-select) |
| Usage Count | Berapa kali dipakai di content plans |
| Avg Engagement | Rata-rata engagement konten yang pakai hashtag ini (computed dari data aktual) |

**Features**:
- Autocomplete saat mengetik hashtag di content plan form
- Hashtag groups: set hashtag yang sering dipakai bersamaan (bisa diinsert sekaligus)
- Sort by usage count atau avg engagement
- Suggest trending hashtags (berdasarkan data content performance)

### 3.7 Content Performance Link

Menghubungkan content plan dengan data performa aktual.

**Cara kerja**:
1. Setelah konten dipublish, user set status ke "Published"
2. User bisa meng-link ke content ID dari `marketing_social_media_content` (data yang sudah di-fetch otomatis 3x/hari)
3. Setelah di-link, dashboard menampilkan:
   - **Planned vs Actual**: target views vs actual views, target engagement vs actual
   - **Performance badge**: Exceeded Target / On Target / Below Target
4. Auto-link (future): sistem otomatis mencocokkan berdasarkan platform + published_at + caption similarity

**Metrics Comparison Table**:

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Views | 10.000 | 12.500 | Exceeded (+25%) |
| Likes | 500 | 430 | Below (-14%) |
| Engagement Rate | 5.0% | 6.2% | Exceeded (+24%) |

### 3.8 Content Templates

Template caption/konten yang bisa dipakai ulang.

**Template Fields**:

| Field | Keterangan |
|-------|------------|
| Name | Nama template |
| Platform | Platform yang cocok |
| Content Type | Tipe konten |
| Caption Template | Teks dengan placeholder: `{product}`, `{promo}`, `{cta}` |
| Default Hashtags | Set hashtag default |
| Notes | Catatan penggunaan |

**Use case**: Konten rutin seperti "Testimoni Pelanggan", "Promo Mingguan", "Behind the Scenes" yang formatnya mirip tapi isinya berbeda.

### 3.9 Activity Log & Audit Trail

Tracking semua perubahan untuk akuntabilitas.

| Event | Data yang Dicatat |
|-------|-------------------|
| content_created | user, content_id, title, platform |
| content_updated | user, content_id, fields_changed |
| status_changed | user, content_id, from_status, to_status, comment |
| content_linked | user, content_id, linked_content_id (data aktual) |
| content_deleted | user, content_id, title |
| campaign_created | user, campaign_id, name |
| campaign_updated | user, campaign_id, fields_changed |

---

## 4. User Flow

### Flow 1: Membuat Content Plan Baru

```
1. User buka Content Plan → lihat Overview Dashboard
2. Klik "Buat Konten Baru" (tombol utama) atau klik "+" di tanggal kalender
3. Isi form: judul, platform, tipe, tanggal, caption, hashtag, visual ref
4. (Opsional) Pilih campaign, assign ke orang, set priority, set target metrics
5. Klik "Simpan sebagai Draft" atau "Submit for Review"
6. Konten muncul di kalender dengan status badge
```

### Flow 2: Review & Approval

```
1. Manager/Director lihat badge "3 needs review" di overview
2. Klik → lihat daftar konten In Review
3. Klik konten → lihat detail: caption, visual, hashtag, catatan
4. Pilih: Approve (+ optional comment) atau Reject (+ wajib alasan)
5. Creator menerima notification (badge) bahwa kontennya di-approve/reject
6. Jika rejected: Creator revisi → submit ulang
```

### Flow 3: Publish & Link Performance

```
1. Tanggal publish tiba, user post konten ke platform secara manual
2. Kembali ke Content Plan, ubah status ke "Published"
3. (Opsional) Link ke content ID dari data analytics yang sudah di-fetch
4. Dashboard menampilkan planned vs actual performance
```

### Flow 4: Campaign Planning

```
1. User buat Campaign baru: "Promo Lebaran 2026", 1 Mar - 15 Apr
2. Buat beberapa konten, assign ke campaign tersebut
3. Lihat Campaign Dashboard: progress, timeline, performa gabungan
4. Setelah campaign selesai, lihat summary report
```

---

## 5. Database Schema

### Tabel Utama

```sql
-- =====================================================
-- Content Plan Items
-- =====================================================
CREATE TABLE marketing_content_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Basic info
  title TEXT NOT NULL,
  caption TEXT,                         -- Caption/copy yang akan dipost
  notes TEXT,                           -- Catatan internal

  -- Platform & type
  platform social_media_platform NOT NULL,  -- tiktok, instagram, youtube, facebook, linkedin
  content_type TEXT NOT NULL DEFAULT 'post',
    -- post, video, reel, story, short, carousel, live, article

  -- Scheduling
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,                  -- nullable, jam rencana publish

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'draft',
    -- draft, in_review, approved, rejected, published, archived
  status_changed_at TIMESTAMPTZ,
  status_changed_by UUID REFERENCES profiles(user_id),

  -- Assignment
  created_by UUID NOT NULL REFERENCES profiles(user_id),
  assigned_to UUID REFERENCES profiles(user_id),
  priority TEXT DEFAULT 'medium',       -- low, medium, high

  -- Visual reference
  visual_url TEXT,                      -- URL ke gambar/video (Google Drive, Canva, upload)
  visual_thumbnail_url TEXT,            -- Thumbnail preview

  -- Campaign grouping
  campaign_id UUID REFERENCES marketing_content_campaigns(id) ON DELETE SET NULL,

  -- Cross-post grouping
  parent_plan_id UUID REFERENCES marketing_content_plans(id) ON DELETE SET NULL,
    -- NULL = standalone atau parent
    -- NOT NULL = child (cross-post variant)

  -- Target metrics (for planned vs actual comparison)
  target_views INTEGER,
  target_likes INTEGER,
  target_comments INTEGER,
  target_shares INTEGER,
  target_engagement_rate NUMERIC(6,4),  -- e.g. 0.0500 = 5.00%

  -- Link to actual published content (from fetch data)
  linked_content_id BIGINT REFERENCES marketing_social_media_content(id) ON DELETE SET NULL,

  -- Timestamps
  published_at TIMESTAMPTZ,             -- Actual publish timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_plans_date ON marketing_content_plans(scheduled_date);
CREATE INDEX idx_content_plans_status ON marketing_content_plans(status);
CREATE INDEX idx_content_plans_platform ON marketing_content_plans(platform);
CREATE INDEX idx_content_plans_campaign ON marketing_content_plans(campaign_id);
CREATE INDEX idx_content_plans_created_by ON marketing_content_plans(created_by);
CREATE INDEX idx_content_plans_assigned_to ON marketing_content_plans(assigned_to);
CREATE INDEX idx_content_plans_parent ON marketing_content_plans(parent_plan_id);


-- =====================================================
-- Campaigns / Label Groups
-- =====================================================
CREATE TABLE marketing_content_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',         -- Hex color for calendar badge
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, cancelled
  created_by UUID NOT NULL REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_campaigns_status ON marketing_content_campaigns(status);
CREATE INDEX idx_content_campaigns_dates ON marketing_content_campaigns(start_date, end_date);


-- =====================================================
-- Hashtag Library
-- =====================================================
CREATE TABLE marketing_hashtags (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tag TEXT NOT NULL UNIQUE,             -- without #, lowercase
  category TEXT DEFAULT 'general',      -- brand, product, campaign, industry, trending, general
  platforms TEXT[] DEFAULT '{}',         -- {'tiktok','instagram','youtube','facebook','linkedin'}
  usage_count INTEGER DEFAULT 0,        -- auto-incremented when used in content plans
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hashtags_tag ON marketing_hashtags(tag);
CREATE INDEX idx_hashtags_category ON marketing_hashtags(category);
CREATE INDEX idx_hashtags_usage ON marketing_hashtags(usage_count DESC);


-- =====================================================
-- Content Plan ↔ Hashtag junction table
-- =====================================================
CREATE TABLE marketing_content_plan_hashtags (
  content_plan_id UUID NOT NULL REFERENCES marketing_content_plans(id) ON DELETE CASCADE,
  hashtag_id BIGINT NOT NULL REFERENCES marketing_hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (content_plan_id, hashtag_id)
);


-- =====================================================
-- Hashtag Groups (pre-defined sets)
-- =====================================================
CREATE TABLE marketing_hashtag_groups (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,                   -- e.g. "Logistik Indonesia", "Promo Standard"
  hashtag_ids BIGINT[] NOT NULL,        -- array of hashtag IDs
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- =====================================================
-- Content Templates
-- =====================================================
CREATE TABLE marketing_content_templates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  platform social_media_platform,       -- NULL = semua platform
  content_type TEXT,                     -- NULL = semua tipe
  caption_template TEXT,                -- Teks dengan placeholder: {product}, {promo}, {cta}
  default_hashtag_ids BIGINT[],         -- Array hashtag IDs
  notes TEXT,
  created_by UUID REFERENCES profiles(user_id),
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_templates_platform ON marketing_content_templates(platform);


-- =====================================================
-- Editorial Workflow / Approval Comments
-- =====================================================
CREATE TABLE marketing_content_plan_comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content_plan_id UUID NOT NULL REFERENCES marketing_content_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(user_id),
  comment TEXT NOT NULL,
  comment_type TEXT NOT NULL DEFAULT 'comment',
    -- comment        : catatan biasa
    -- approval       : komentar saat approve
    -- rejection      : alasan reject (wajib)
    -- status_change  : auto-generated saat status berubah
    -- revision       : catatan revisi
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_plan_comments_plan ON marketing_content_plan_comments(content_plan_id);
CREATE INDEX idx_plan_comments_user ON marketing_content_plan_comments(user_id);


-- =====================================================
-- Activity Log / Audit Trail
-- =====================================================
CREATE TABLE marketing_content_activity_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(user_id),
  entity_type TEXT NOT NULL,            -- content_plan, campaign, hashtag, template
  entity_id TEXT NOT NULL,              -- UUID or BIGINT as text
  action TEXT NOT NULL,
    -- created, updated, deleted, status_changed, linked,
    -- comment_added, assigned, campaign_added, campaign_removed
  details JSONB DEFAULT '{}',
    -- Contoh: {"from_status": "draft", "to_status": "in_review"}
    -- Contoh: {"fields_changed": ["caption", "scheduled_date"]}
    -- Contoh: {"linked_content_id": 12345}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_log_entity ON marketing_content_activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_user ON marketing_content_activity_log(user_id);
CREATE INDEX idx_activity_log_created ON marketing_content_activity_log(created_at DESC);
```

### RLS Policies

```sql
-- Semua tabel menggunakan pola yang sama:

-- SELECT: semua marketing roles bisa baca
-- INSERT: semua marketing roles bisa buat
-- UPDATE: creator bisa edit own draft/rejected, Manager/Director bisa edit semua
-- DELETE: hanya creator (own draft) atau Manager/Director

-- Content Plans
ALTER TABLE marketing_content_plans ENABLE ROW LEVEL SECURITY;

-- SELECT: semua user marketing bisa lihat semua content plans
CREATE POLICY content_plans_select ON marketing_content_plans
  FOR SELECT USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('super admin', 'Director', 'Marketing Manager',
                            'Marcomm', 'DGO', 'MACX', 'VSDO')
    )
  );

-- INSERT: semua user marketing bisa buat content plan
CREATE POLICY content_plans_insert ON marketing_content_plans
  FOR INSERT WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('super admin', 'Director', 'Marketing Manager',
                            'Marcomm', 'DGO', 'MACX', 'VSDO')
    )
  );

-- UPDATE: creator bisa edit own (draft/rejected saja), approver bisa edit semua
CREATE POLICY content_plans_update ON marketing_content_plans
  FOR UPDATE USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR (
      -- Creator bisa edit konten sendiri yang masih draft atau rejected
      created_by = auth.uid()
      AND status IN ('draft', 'rejected')
    )
    OR EXISTS (
      -- Manager/Director bisa edit semua
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('super admin', 'Director', 'Marketing Manager')
    )
  );

-- DELETE: creator own draft atau Manager/Director
CREATE POLICY content_plans_delete ON marketing_content_plans
  FOR DELETE USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR (created_by = auth.uid() AND status = 'draft')
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('super admin', 'Director', 'Marketing Manager')
    )
  );

-- Pattern yang sama untuk tabel lain (campaigns, hashtags, templates, comments, activity_log)
-- Lihat implementasi lengkap di migration file
```

### Triggers & Functions

```sql
-- Auto-update updated_at
CREATE OR REPLACE FUNCTION fn_content_plan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_content_plans_updated_at
  BEFORE UPDATE ON marketing_content_plans
  FOR EACH ROW EXECUTE FUNCTION fn_content_plan_updated_at();

-- Auto-log status changes
CREATE OR REPLACE FUNCTION fn_content_plan_status_log()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at := NOW();
    NEW.status_changed_by := auth.uid();

    INSERT INTO marketing_content_activity_log
      (user_id, entity_type, entity_id, action, details)
    VALUES (
      COALESCE(auth.uid(), NEW.status_changed_by),
      'content_plan',
      NEW.id::TEXT,
      'status_changed',
      jsonb_build_object(
        'from_status', OLD.status,
        'to_status', NEW.status
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_content_plan_status_log
  BEFORE UPDATE ON marketing_content_plans
  FOR EACH ROW EXECUTE FUNCTION fn_content_plan_status_log();

-- Auto-increment hashtag usage_count
CREATE OR REPLACE FUNCTION fn_hashtag_usage_increment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE marketing_hashtags
  SET usage_count = usage_count + 1
  WHERE id = NEW.hashtag_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_hashtag_usage_increment
  AFTER INSERT ON marketing_content_plan_hashtags
  FOR EACH ROW EXECUTE FUNCTION fn_hashtag_usage_increment();

-- Auto-decrement on remove
CREATE OR REPLACE FUNCTION fn_hashtag_usage_decrement()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE marketing_hashtags
  SET usage_count = GREATEST(0, usage_count - 1)
  WHERE id = OLD.hashtag_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_hashtag_usage_decrement
  AFTER DELETE ON marketing_content_plan_hashtags
  FOR EACH ROW EXECUTE FUNCTION fn_hashtag_usage_decrement();
```

---

## 6. API Routes

```
src/app/api/marketing/content-plan/

├── plans/
│   └── route.ts
│       GET    → List content plans (calendar/list data)
│                Query: ?start_date=&end_date=&platform=&status=&campaign_id=
│                       &assigned_to=&search=&page=1&limit=50&view=calendar|list
│                Response: { plans[], total, statusCounts }
│
│       POST   → Create new content plan
│                Body: { title, platform, content_type, scheduled_date,
│                        scheduled_time?, caption?, notes?, campaign_id?,
│                        assigned_to?, priority?, hashtag_ids?, visual_url?,
│                        target_views?, target_likes?, target_engagement_rate?,
│                        cross_post_platforms?[] }
│                Response: { plan } (atau { plans[] } jika cross-post)
│
├── plans/[id]/
│   └── route.ts
│       GET    → Get single plan detail (with comments, hashtags, linked content)
│                Response: { plan, comments[], hashtags[], linkedContent?, activityLog[] }
│
│       PATCH  → Update plan
│                Body: { title?, caption?, scheduled_date?, status?, ...any field }
│                Response: { plan }
│
│       DELETE → Delete plan (only draft by creator, or Manager/Director)
│                Response: { success: true }
│
├── plans/[id]/status/
│   └── route.ts
│       PATCH  → Change status with comment
│                Body: { status: 'in_review'|'approved'|'rejected'|'published'|'archived',
│                        comment?: string }
│                Validation:
│                  - draft → in_review: creator only
│                  - in_review → approved/rejected: Manager/Director only
│                  - rejected → draft: creator only (auto on edit)
│                  - approved → published: creator or Manager/Director
│                  - any → archived: Manager/Director only
│                Response: { plan }
│
├── plans/[id]/link/
│   └── route.ts
│       PATCH  → Link to actual published content
│                Body: { linked_content_id: number }
│                Response: { plan, linkedContent }
│
├── plans/[id]/comments/
│   └── route.ts
│       GET    → Get comments for a plan
│                Response: { comments[] }
│
│       POST   → Add comment
│                Body: { comment: string, comment_type?: string }
│                Response: { comment }
│
├── campaigns/
│   └── route.ts
│       GET    → List campaigns
│                Query: ?status=active|completed|cancelled
│                Response: { campaigns[] }
│
│       POST   → Create campaign
│                Body: { name, description?, color?, start_date?, end_date? }
│                Response: { campaign }
│
├── campaigns/[id]/
│   └── route.ts
│       PATCH  → Update campaign
│       DELETE → Delete campaign
│
├── hashtags/
│   └── route.ts
│       GET    → List/search hashtags
│                Query: ?search=&category=&platform=&sort=usage_count|tag&limit=50
│                Response: { hashtags[] }
│
│       POST   → Create hashtag
│                Body: { tag, category?, platforms?[] }
│                Response: { hashtag }
│
├── hashtags/groups/
│   └── route.ts
│       GET    → List hashtag groups
│       POST   → Create hashtag group
│
├── templates/
│   └── route.ts
│       GET    → List templates
│                Query: ?platform=&content_type=&search=
│                Response: { templates[] }
│
│       POST   → Create template
│                Body: { name, platform?, content_type?, caption_template,
│                        default_hashtag_ids?[], notes? }
│                Response: { template }
│
├── templates/[id]/
│   └── route.ts
│       PATCH  → Update template
│       DELETE → Delete template
│
├── overview/
│   └── route.ts
│       GET    → Overview dashboard data
│                Query: ?month=2026-02
│                Response: {
│                  kpis: { totalPlanned, published, inReview, draft,
│                          completionRate, avgEngagement },
│                  upcomingThisWeek: [],
│                  needsAttention: [],
│                  recentActivity: []
│                }
│
└── activity/
    └── route.ts
        GET    → Activity log
                 Query: ?entity_type=&entity_id=&user_id=&page=1&limit=20
                 Response: { activities[], total }
```

---

## 7. Component Structure

```
src/components/marketing/

├── content-plan/
│   ├── content-plan-dashboard.tsx          -- Main container, tab switching
│   │                                         Tabs: Overview | Calendar | List | Campaigns
│   │
│   ├── overview/
│   │   ├── content-overview-section.tsx    -- KPI cards + quick views
│   │   ├── upcoming-content-list.tsx       -- Upcoming this week card list
│   │   └── needs-attention-list.tsx        -- Overdue/rejected items
│   │
│   ├── calendar/
│   │   ├── content-calendar.tsx           -- Calendar grid (month/week views)
│   │   ├── calendar-month-view.tsx        -- Month grid with platform dots
│   │   ├── calendar-week-view.tsx         -- Week columns with detail cards
│   │   ├── calendar-day-panel.tsx         -- Side panel: konten di tanggal tertentu
│   │   └── calendar-filters.tsx           -- Platform, status, user, campaign filters
│   │
│   ├── list/
│   │   └── content-list-view.tsx          -- Table/list view with sorting & filtering
│   │
│   ├── form/
│   │   ├── content-plan-form.tsx          -- Create/edit form (dialog/sheet)
│   │   ├── content-plan-detail.tsx        -- View detail with all info + comments
│   │   ├── cross-post-selector.tsx        -- Multi-platform selection with per-platform caption
│   │   ├── hashtag-input.tsx              -- Tag input with autocomplete from library
│   │   ├── target-metrics-input.tsx       -- Optional target views/likes/engagement fields
│   │   └── template-selector.tsx          -- Pick from saved templates
│   │
│   ├── workflow/
│   │   ├── status-badge.tsx               -- Colored badge per status
│   │   ├── status-change-dialog.tsx       -- Dialog for approve/reject with comment
│   │   ├── comment-thread.tsx             -- Comment list + add comment form
│   │   └── review-queue.tsx               -- List of items pending review
│   │
│   ├── campaigns/
│   │   ├── campaign-list.tsx              -- Campaign cards with progress
│   │   ├── campaign-form.tsx              -- Create/edit campaign dialog
│   │   └── campaign-detail.tsx            -- Campaign detail with content list
│   │
│   ├── hashtags/
│   │   ├── hashtag-library.tsx            -- Full hashtag management page
│   │   ├── hashtag-group-manager.tsx      -- Create/manage hashtag groups
│   │   └── hashtag-analytics.tsx          -- Which hashtags perform best
│   │
│   ├── templates/
│   │   ├── template-list.tsx              -- Template library
│   │   └── template-form.tsx              -- Create/edit template
│   │
│   └── performance/
│       ├── planned-vs-actual.tsx           -- Comparison view after linking
│       └── content-link-dialog.tsx         -- Dialog to link plan → actual content
│
└── (existing files...)
```

**Page file**:
```
src/app/(crm)/marketing/content-plan/page.tsx
  → Import dan render <ContentPlanDashboard />
```

---

## 8. Arsitektur & Data Flow

```
┌────────────────────────────────────────────────────────────────┐
│  Browser (Client Components)                                    │
│                                                                 │
│  ContentPlanDashboard                                           │
│  ├── Overview Tab → fetch /api/.../overview                     │
│  ├── Calendar Tab → fetch /api/.../plans?view=calendar          │
│  ├── List Tab     → fetch /api/.../plans?view=list              │
│  └── Campaigns Tab→ fetch /api/.../campaigns                    │
│                                                                 │
│  Form/Dialogs:                                                  │
│  ├── Create/Edit  → POST/PATCH /api/.../plans                  │
│  ├── Status Change→ PATCH /api/.../plans/[id]/status            │
│  ├── Comment      → POST /api/.../plans/[id]/comments           │
│  └── Link Content → PATCH /api/.../plans/[id]/link              │
└──────────────────────┬─────────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────────┐
│  Next.js API Routes (BFF)                                       │
│                                                                 │
│  Auth: getSessionAndProfile() → verify marketing role           │
│  DB:   adminClient (service_role) for writes                    │
│        user client for reads (RLS enforced)                     │
│                                                                 │
│  Writes:                                                        │
│  ├── Create plan → INSERT marketing_content_plans               │
│  │                 INSERT marketing_content_plan_hashtags        │
│  │                 INSERT marketing_content_activity_log         │
│  ├── Status change → UPDATE status, trigger logs status change  │
│  │                   INSERT comment (if approval/rejection)     │
│  └── Link content → UPDATE linked_content_id                    │
│                     JOIN marketing_social_media_content          │
│                                                                 │
│  Reads (with RLS):                                              │
│  ├── Calendar → SELECT plans + JOIN campaigns + JOIN hashtags   │
│  ├── Overview → Aggregate counts by status + upcoming + overdue │
│  └── Detail   → SELECT plan + comments + linked content perf   │
└──────────────────────┬─────────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────────┐
│  Supabase PostgreSQL                                            │
│                                                                 │
│  Tables:                                                        │
│  ├── marketing_content_plans           (core)                   │
│  ├── marketing_content_campaigns       (grouping)               │
│  ├── marketing_hashtags                (library)                │
│  ├── marketing_content_plan_hashtags   (junction)               │
│  ├── marketing_hashtag_groups          (preset groups)          │
│  ├── marketing_content_templates       (reusable templates)     │
│  ├── marketing_content_plan_comments   (workflow comments)      │
│  ├── marketing_content_activity_log    (audit trail)            │
│  │                                                              │
│  Linked tables (existing):                                      │
│  ├── marketing_social_media_content    (actual published data)  │
│  ├── marketing_social_media_content_history (metric trends)     │
│  └── profiles                          (users)                  │
│                                                                 │
│  Triggers:                                                      │
│  ├── trg_content_plans_updated_at      (auto updated_at)        │
│  ├── trg_content_plan_status_log       (auto activity log)      │
│  ├── trg_hashtag_usage_increment       (count usage)            │
│  └── trg_hashtag_usage_decrement       (count usage)            │
└────────────────────────────────────────────────────────────────┘
```

**Tidak ada external API call** — module ini sepenuhnya internal (data planning disimpan di database sendiri). Satu-satunya link ke external data adalah melalui tabel `marketing_social_media_content` yang sudah di-fetch oleh Digital Performance module.

---

## 9. Fase Implementasi

### Fase 1: Core Planning (Foundation)

**Scope**: Calendar + Form + List + Basic Workflow

| Item | Detail |
|------|--------|
| Migration | Buat semua tabel, indexes, RLS, triggers |
| API | plans CRUD, plans/[id]/status, overview |
| Components | content-plan-dashboard, calendar (month view), content-plan-form, content-list-view, status-badge |
| Page | Replace "Coming Soon" dengan dashboard |

**Deliverable**: User bisa membuat content plan, lihat di kalender, dan ubah status (draft → publish).

### Fase 2: Editorial Workflow

**Scope**: Approval flow + Comments + Review queue

| Item | Detail |
|------|--------|
| API | plans/[id]/comments, status change with validation |
| Components | status-change-dialog, comment-thread, review-queue, needs-attention-list |
| Logic | Role-based status transition validation |

**Deliverable**: Manager bisa approve/reject, ada komentar, review queue.

### Fase 3: Campaign & Hashtag Management

**Scope**: Campaign grouping + Hashtag library + Groups

| Item | Detail |
|------|--------|
| API | campaigns CRUD, hashtags CRUD, hashtags/groups |
| Components | campaign-list, campaign-form, hashtag-library, hashtag-input (autocomplete), hashtag-group-manager |

**Deliverable**: User bisa bikin campaign, manage hashtag library, hashtag autocomplete di form.

### Fase 4: Templates + Cross-posting + Performance Link

**Scope**: Content templates + Multi-platform + Planned vs Actual

| Item | Detail |
|------|--------|
| API | templates CRUD, plans/[id]/link |
| Components | template-list, template-form, template-selector, cross-post-selector, planned-vs-actual, content-link-dialog |

**Deliverable**: User bisa pakai template, cross-post, dan lihat perbandingan planned vs actual performance.

### Fase 5: Polish & Enhanced Views

**Scope**: Week view, activity log, hashtag analytics, campaign detail dashboard

| Item | Detail |
|------|--------|
| Components | calendar-week-view, hashtag-analytics, campaign-detail, activity log view |
| UX | Drag-and-drop reschedule di calendar (nice-to-have) |

---

## 10. File Map

### Semua File yang Dibuat/Dimodifikasi

```
# SQL Migration
supabase/migrations/157_marketing_content_plan_schema.sql     -- NEW

# API Routes (11 files)
src/app/api/marketing/content-plan/
├── overview/route.ts                                          -- NEW
├── plans/route.ts                                             -- NEW (GET list, POST create)
├── plans/[id]/route.ts                                        -- NEW (GET detail, PATCH, DELETE)
├── plans/[id]/status/route.ts                                 -- NEW (PATCH status)
├── plans/[id]/link/route.ts                                   -- NEW (PATCH link content)
├── plans/[id]/comments/route.ts                               -- NEW (GET, POST)
├── campaigns/route.ts                                         -- NEW (GET, POST)
├── campaigns/[id]/route.ts                                    -- NEW (PATCH, DELETE)
├── hashtags/route.ts                                          -- NEW (GET, POST)
├── hashtags/groups/route.ts                                   -- NEW (GET, POST)
├── templates/route.ts                                         -- NEW (GET, POST)
├── templates/[id]/route.ts                                    -- NEW (PATCH, DELETE)
└── activity/route.ts                                          -- NEW (GET)

# Components (25+ files)
src/components/marketing/content-plan/
├── content-plan-dashboard.tsx                                 -- NEW
├── overview/
│   ├── content-overview-section.tsx                            -- NEW
│   ├── upcoming-content-list.tsx                               -- NEW
│   └── needs-attention-list.tsx                                -- NEW
├── calendar/
│   ├── content-calendar.tsx                                    -- NEW
│   ├── calendar-month-view.tsx                                 -- NEW
│   ├── calendar-week-view.tsx                                  -- NEW (Fase 5)
│   ├── calendar-day-panel.tsx                                  -- NEW
│   └── calendar-filters.tsx                                    -- NEW
├── list/
│   └── content-list-view.tsx                                   -- NEW
├── form/
│   ├── content-plan-form.tsx                                   -- NEW
│   ├── content-plan-detail.tsx                                 -- NEW
│   ├── cross-post-selector.tsx                                 -- NEW (Fase 4)
│   ├── hashtag-input.tsx                                       -- NEW (Fase 3)
│   ├── target-metrics-input.tsx                                -- NEW
│   └── template-selector.tsx                                   -- NEW (Fase 4)
├── workflow/
│   ├── status-badge.tsx                                        -- NEW
│   ├── status-change-dialog.tsx                                -- NEW (Fase 2)
│   ├── comment-thread.tsx                                      -- NEW (Fase 2)
│   └── review-queue.tsx                                        -- NEW (Fase 2)
├── campaigns/
│   ├── campaign-list.tsx                                       -- NEW (Fase 3)
│   ├── campaign-form.tsx                                       -- NEW (Fase 3)
│   └── campaign-detail.tsx                                     -- NEW (Fase 5)
├── hashtags/
│   ├── hashtag-library.tsx                                     -- NEW (Fase 3)
│   ├── hashtag-group-manager.tsx                               -- NEW (Fase 3)
│   └── hashtag-analytics.tsx                                   -- NEW (Fase 5)
├── templates/
│   ├── template-list.tsx                                       -- NEW (Fase 4)
│   └── template-form.tsx                                       -- NEW (Fase 4)
└── performance/
    ├── planned-vs-actual.tsx                                   -- NEW (Fase 4)
    └── content-link-dialog.tsx                                 -- NEW (Fase 4)

# Page (modify existing)
src/app/(crm)/marketing/content-plan/page.tsx                  -- MODIFY: replace Coming Soon
```

---

> **Catatan**: Dokumen ini adalah living document. Update setiap kali ada perubahan keputusan arsitektur atau penambahan fitur.
>
> **Terakhir diperbarui**: Februari 2026
