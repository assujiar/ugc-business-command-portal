# SEO-SEM Performance Module - Implementation Blueprint (SSOT)

> **Single Source of Truth** untuk pembangunan modul SEO-SEM Performance di Marketing Panel.
> Semua keputusan arsitektur, fitur, dan teknis mengacu ke dokumen ini.

---

## Daftar Isi

1. [Konteks Bisnis](#1-konteks-bisnis)
2. [Sumber Data & API](#2-sumber-data--api)
3. [Fase Implementasi](#3-fase-implementasi)
4. [Arsitektur Teknis](#4-arsitektur-teknis)
5. [Database Schema](#5-database-schema)
6. [Fitur per Bagian](#6-fitur-per-bagian)
7. [API Routes](#7-api-routes)
8. [Component Structure](#8-component-structure)
9. [Credential yang Dibutuhkan](#9-credential-yang-dibutuhkan)
10. [Cron Jobs & Data Refresh](#10-cron-jobs--data-refresh)
11. [File Map](#11-file-map)

---

## 1. Konteks Bisnis

**Perusahaan**: UGC (Utama Global Indocargo) - freight forwarding / logistik.

**Domain yang dimonitor**:
| Domain | Keterangan |
|--------|------------|
| `ugc.id` | Domain utama company |
| `board.ugc.id` | Portal CRM/internal |
| `board.utamaglobalindocargo.com` | Portal CRM (alias) |
| `utamaglobalindocargo.com` | Website korporat |

**Tujuan SEO**: Mendatangkan leads organik dari pencarian seperti:
- "jasa pengiriman barang", "freight forwarder Indonesia"
- "cargo import export", "jasa ekspedisi murah"
- "pengiriman barang antar pulau", "logistik Jakarta"

**Tujuan SEM**: Meningkatkan leads dari paid search (Google Ads, Meta Ads) dengan cost efficiency yang terukur.

**Target user**: Tim Digital Marketing (role: Director, super admin, Marketing Manager, Marcomm, DGO, MACX, VSDO).

---

## 2. Sumber Data & API

### API yang Digunakan (Semua Gratis)

| # | Sumber Data | Biaya API | Auth | Data Utama | Fase |
|---|-------------|-----------|------|------------|------|
| 1 | **Google Search Console API** | Gratis | OAuth2 | Keyword rankings, clicks, impressions, CTR, position | 1 |
| 2 | **Google Analytics 4 Data API** | Gratis | OAuth2 | Organic traffic, sessions, engagement, conversions | 1 |
| 3 | **Google PageSpeed Insights API** | Gratis | API Key | Core Web Vitals (LCP, CLS, INP), performance score | 1 |
| 4 | **Google Ads API** | Gratis | OAuth2 + Developer Token | Spend, CPC, ROAS, conversions, Quality Score | 2 |
| 5 | **Meta Marketing API** | Gratis | OAuth2 | FB/IG ads: spend, CPC, CTR, conversions | 3 |

### Detail Kemampuan Tiap API

#### Google Search Console API
- **Endpoint utama**: Search Analytics (Performance Data)
- **Metrics**: clicks, impressions, CTR, position
- **Dimensions**: query, page, country, device, date, searchAppearance
- **Batasan**: data delay 2-3 hari, max 25.000 row/request, histori 16 bulan
- **Search types**: web, image, video, news (query terpisah)
- **Fitur lain**: URL Inspection API (cek indexing), Sitemaps API
- **OAuth Scope**: `https://www.googleapis.com/auth/webmasters.readonly`

#### Google Analytics 4 Data API
- **Methods**: runReport, batchRunReports, runRealtimeReport
- **Dimensions penting**: sessionSource, sessionMedium, sessionDefaultChannelGroup, pagePath, landingPagePlusQueryString, deviceCategory, country, date
- **Metrics penting**: sessions, totalUsers, newUsers, engagedSessions, engagementRate, averageSessionDuration, bounceRate, conversions, screenPageViewsPerSession
- **Filter organic**: `sessionDefaultChannelGroup == "Organic Search"`
- **Filter paid**: `sessionDefaultChannelGroup == "Paid Search"`
- **OAuth Scope**: `https://www.googleapis.com/auth/analytics.readonly`

#### Google PageSpeed Insights API
- **Endpoint**: `https://www.googleapis.com/pagespeedonline/v5/runPagespeed`
- **Metrics**: Performance Score, LCP, CLS, INP, FCP, TTFB, Speed Index
- **Parameters**: url, strategy (mobile/desktop), category (performance)
- **Auth**: API Key saja (tidak perlu OAuth)
- **Rate limit**: 25.000 queries/hari (free)

#### Google Ads API (Fase 2)
- **Access level yang dibutuhkan**: Basic Access (read-only, 15.000 ops/hari)
- **Perlu**: Manager Account (MCC) + Developer Token
- **Data**: campaign, ad group, ad, keyword level performance
- **Metrics**: cost, clicks, impressions, ctr, average_cpc, conversions, conversion_value, cost_per_conversion
- **Special**: Quality Score (keyword-level), Search Term Report
- **OAuth Scope**: `https://www.googleapis.com/auth/adwords`

#### Meta Marketing API (Fase 3)
- **Data**: Ad Account level → Campaign → Ad Set → Ad performance
- **Metrics**: spend, impressions, clicks, cpc, ctr, conversions, cost_per_result, roas
- **Breakdown**: by age, gender, country, placement, device
- **Token**: same Meta OAuth as social media module (shared META_APP_ID / META_APP_SECRET)

---

## 3. Fase Implementasi

### Fase 1: SEO Dashboard (Google Search Console + GA4 + PageSpeed)

**Scope**:
- SEO overview KPI cards
- Keyword performance table + charts
- Page performance table
- Organic traffic trends dari GA4
- Core Web Vitals monitoring
- Device & country breakdown

**Data source**: GSC API, GA4 Data API, PageSpeed Insights API

**Credential**: OAuth2 (bisa reuse Google OAuth yang sudah ada di YouTube social media module)

### Fase 2: SEM Dashboard (Google Ads)

**Scope**:
- Google Ads campaign overview
- Spend tracking & budget utilization
- CPC, CPA, ROAS per campaign
- Keyword-level Quality Score
- Search term report
- Spend trend chart

**Data source**: Google Ads API

**Credential**: Perlu Google Ads Developer Token (apply di ads.google.com/aw/apicenter, butuh approval)

### Fase 3: Meta Ads + Combined View

**Scope**:
- Meta (Facebook/Instagram) ads performance
- Cross-platform ads comparison (Google vs Meta)
- Organic vs Paid combined view
- Blended CPA calculation
- Keyword overlap analysis

**Data source**: Meta Marketing API

**Credential**: Reuse Meta OAuth (META_APP_ID, META_APP_SECRET sudah ada)

---

## 4. Arsitektur Teknis

```
┌─────────────────────────────────────────────────────┐
│  Browser (Client Components)                         │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │  SEO-SEM Dashboard                               │ │
│  │  ├── SEOOverviewSection (KPI cards + trend)      │ │
│  │  ├── KeywordPerformanceSection (table + charts)  │ │
│  │  ├── PagePerformanceSection (table + vitals)     │ │
│  │  ├── AdsOverviewSection (campaigns + spend)      │ │
│  │  └── CombinedViewSection (organic vs paid)       │ │
│  └──────────────────┬──────────────────────────────┘ │
└─────────────────────┼───────────────────────────────┘
                      │ fetch()
┌─────────────────────▼───────────────────────────────┐
│  Next.js API Routes (BFF Pattern)                    │
│                                                      │
│  /api/marketing/seo-sem/                             │
│  ├── overview/route.ts        GET  KPI summary       │
│  ├── keywords/route.ts        GET  keyword data      │
│  ├── pages/route.ts           GET  page performance  │
│  ├── web-vitals/route.ts      GET  PageSpeed data    │
│  ├── ads/route.ts             GET  ads campaigns     │
│  └── fetch/route.ts           POST cron trigger      │
│                                                      │
│  Reads from DB (cached) → falls back to live API     │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
    ┌──────▼──────┐     ┌────────▼────────────────┐
    │  Supabase   │     │  External APIs           │
    │  Database   │     │  ├── Google Search Console│
    │  (cached    │     │  ├── GA4 Data API        │
    │   snapshots)│     │  ├── PageSpeed API       │
    │             │     │  ├── Google Ads API       │
    │             │     │  └── Meta Marketing API   │
    └─────────────┘     └─────────────────────────┘
```

**Data flow**:
1. **Cron job** (1x/hari) memanggil `/api/marketing/seo-sem/fetch`
2. Fetch route mengambil data dari external APIs
3. Data disimpan ke database tables (snapshot harian)
4. Dashboard membaca dari database (cepat, no rate limit)
5. Fallback: jika data hari ini belum ada, tampilkan data terakhir

---

## 5. Database Schema

### Tabel Konfigurasi

```sql
-- Reuse pattern dari social media module
-- Tambah records ke marketing_social_media_config ATAU buat tabel terpisah:

CREATE TABLE marketing_seo_config (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service TEXT NOT NULL UNIQUE,
    -- 'google_search_console', 'google_analytics', 'google_ads',
    -- 'meta_ads', 'pagespeed'
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  property_id TEXT,
    -- GSC: 'sc-domain:ugc.id' atau 'https://utamaglobalindocargo.com/'
    -- GA4: '123456789' (property ID)
    -- Google Ads: '123-456-7890' (customer ID)
    -- Meta Ads: 'act_123456789' (ad account ID)
    -- PageSpeed: NULL (pakai API key)
  api_key TEXT,
    -- Hanya untuk PageSpeed Insights
  extra_config JSONB DEFAULT '{}',
    -- Untuk data tambahan per service, contoh:
    -- GSC: {"sites": ["sc-domain:ugc.id", "sc-domain:utamaglobalindocargo.com"]}
    -- Google Ads: {"developer_token": "xxx", "manager_id": "123-456-7890"}
    -- Meta Ads: {"ad_account_id": "act_123456789"}
  is_active BOOLEAN DEFAULT TRUE,
  last_fetch_at TIMESTAMPTZ,
  last_fetch_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabel Data SEO (Fase 1)

```sql
-- Daily aggregate snapshot (GSC + GA4 combined)
CREATE TABLE marketing_seo_daily_snapshot (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  site TEXT NOT NULL,  -- 'ugc.id' atau 'utamaglobalindocargo.com'

  -- Dari Google Search Console
  gsc_total_clicks INTEGER DEFAULT 0,
  gsc_total_impressions INTEGER DEFAULT 0,
  gsc_avg_ctr NUMERIC(6,4) DEFAULT 0,       -- e.g. 0.0345 = 3.45%
  gsc_avg_position NUMERIC(6,2) DEFAULT 0,   -- e.g. 12.50

  -- Dari GA4
  ga_organic_sessions INTEGER DEFAULT 0,
  ga_organic_users INTEGER DEFAULT 0,
  ga_organic_new_users INTEGER DEFAULT 0,
  ga_organic_engaged_sessions INTEGER DEFAULT 0,
  ga_organic_engagement_rate NUMERIC(6,4) DEFAULT 0,
  ga_organic_avg_session_duration NUMERIC(10,2) DEFAULT 0, -- in seconds
  ga_organic_bounce_rate NUMERIC(6,4) DEFAULT 0,
  ga_organic_conversions INTEGER DEFAULT 0,
  ga_organic_page_views INTEGER DEFAULT 0,

  -- Device breakdown (dari GSC)
  gsc_desktop_clicks INTEGER DEFAULT 0,
  gsc_mobile_clicks INTEGER DEFAULT 0,
  gsc_tablet_clicks INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, site)
);

CREATE INDEX idx_seo_daily_date ON marketing_seo_daily_snapshot(fetch_date DESC);
CREATE INDEX idx_seo_daily_site_date ON marketing_seo_daily_snapshot(site, fetch_date DESC);

-- Keyword-level data (dari GSC)
CREATE TABLE marketing_seo_keywords (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  site TEXT NOT NULL,
  query TEXT NOT NULL,           -- keyword/search query
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr NUMERIC(6,4) DEFAULT 0,
  position NUMERIC(6,2) DEFAULT 0,
  device TEXT,                   -- 'DESKTOP', 'MOBILE', 'TABLET' atau NULL (all)
  country TEXT,                  -- country code atau NULL (all)
  is_branded BOOLEAN DEFAULT FALSE,  -- TRUE jika query mengandung brand name
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, site, query, device, country)
);

CREATE INDEX idx_seo_keywords_date ON marketing_seo_keywords(fetch_date DESC);
CREATE INDEX idx_seo_keywords_query ON marketing_seo_keywords(query);
CREATE INDEX idx_seo_keywords_site_date ON marketing_seo_keywords(site, fetch_date DESC);
CREATE INDEX idx_seo_keywords_clicks ON marketing_seo_keywords(clicks DESC);

-- Page-level data (dari GSC + GA4)
CREATE TABLE marketing_seo_pages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  site TEXT NOT NULL,
  page_url TEXT NOT NULL,        -- full URL

  -- Dari GSC
  gsc_clicks INTEGER DEFAULT 0,
  gsc_impressions INTEGER DEFAULT 0,
  gsc_ctr NUMERIC(6,4) DEFAULT 0,
  gsc_position NUMERIC(6,2) DEFAULT 0,

  -- Dari GA4
  ga_sessions INTEGER,
  ga_users INTEGER,
  ga_engagement_rate NUMERIC(6,4),
  ga_avg_session_duration NUMERIC(10,2),
  ga_bounce_rate NUMERIC(6,4),
  ga_conversions INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, site, page_url)
);

CREATE INDEX idx_seo_pages_date ON marketing_seo_pages(fetch_date DESC);
CREATE INDEX idx_seo_pages_site_date ON marketing_seo_pages(site, fetch_date DESC);

-- Core Web Vitals (dari PageSpeed Insights API)
CREATE TABLE marketing_seo_web_vitals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  page_url TEXT NOT NULL,
  strategy TEXT NOT NULL,        -- 'mobile' atau 'desktop'

  performance_score NUMERIC(5,2),  -- 0-100
  lcp_ms NUMERIC(10,2),           -- Largest Contentful Paint (ms)
  cls NUMERIC(6,4),               -- Cumulative Layout Shift
  inp_ms NUMERIC(10,2),           -- Interaction to Next Paint (ms)
  fcp_ms NUMERIC(10,2),           -- First Contentful Paint (ms)
  ttfb_ms NUMERIC(10,2),          -- Time to First Byte (ms)
  speed_index_ms NUMERIC(10,2),   -- Speed Index (ms)

  -- Rating: 'FAST', 'AVERAGE', 'SLOW'
  lcp_rating TEXT,
  cls_rating TEXT,
  inp_rating TEXT,

  raw_response JSONB,             -- full API response for debugging
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, page_url, strategy)
);

CREATE INDEX idx_web_vitals_date ON marketing_seo_web_vitals(fetch_date DESC);
```

### Tabel Data SEM (Fase 2 & 3)

```sql
-- Campaign-level data (Google Ads + Meta Ads)
CREATE TABLE marketing_sem_campaigns (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  platform TEXT NOT NULL,         -- 'google_ads', 'meta_ads'
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  campaign_status TEXT,           -- 'ENABLED', 'PAUSED', 'REMOVED'

  -- Performance metrics
  spend NUMERIC(12,2) DEFAULT 0,       -- dalam mata uang lokal (IDR)
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC(6,4) DEFAULT 0,
  avg_cpc NUMERIC(12,2) DEFAULT 0,
  conversions NUMERIC(10,2) DEFAULT 0,
  conversion_value NUMERIC(14,2) DEFAULT 0,
  cost_per_conversion NUMERIC(12,2) DEFAULT 0,  -- CPA
  roas NUMERIC(8,4) DEFAULT 0,                  -- return on ad spend

  -- Google Ads specific
  impression_share NUMERIC(6,4),    -- 0-1 (search impression share)
  quality_score_avg NUMERIC(4,2),   -- 1-10 average

  -- Budget
  daily_budget NUMERIC(12,2),
  budget_utilization NUMERIC(6,4),  -- spend / daily_budget

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, platform, campaign_id)
);

CREATE INDEX idx_sem_campaigns_date ON marketing_sem_campaigns(fetch_date DESC);
CREATE INDEX idx_sem_campaigns_platform ON marketing_sem_campaigns(platform, fetch_date DESC);

-- Daily aggregate spend per platform
CREATE TABLE marketing_sem_daily_spend (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  platform TEXT NOT NULL,         -- 'google_ads', 'meta_ads'

  total_spend NUMERIC(12,2) DEFAULT 0,
  total_impressions INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_conversions NUMERIC(10,2) DEFAULT 0,
  total_conversion_value NUMERIC(14,2) DEFAULT 0,
  avg_cpc NUMERIC(12,2) DEFAULT 0,
  avg_cpa NUMERIC(12,2) DEFAULT 0,
  overall_roas NUMERIC(8,4) DEFAULT 0,
  active_campaigns INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, platform)
);

CREATE INDEX idx_sem_daily_spend_date ON marketing_sem_daily_spend(fetch_date DESC);

-- Google Ads: keyword-level data (Fase 2)
CREATE TABLE marketing_sem_keywords (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  ad_group_id TEXT NOT NULL,
  ad_group_name TEXT,
  keyword_text TEXT NOT NULL,
  match_type TEXT,               -- 'EXACT', 'PHRASE', 'BROAD'

  spend NUMERIC(12,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC(6,4) DEFAULT 0,
  avg_cpc NUMERIC(12,2) DEFAULT 0,
  conversions NUMERIC(10,2) DEFAULT 0,
  quality_score INTEGER,         -- 1-10
  expected_ctr_rating TEXT,      -- 'ABOVE_AVERAGE', 'AVERAGE', 'BELOW_AVERAGE'
  ad_relevance_rating TEXT,
  landing_page_exp_rating TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, ad_group_id, keyword_text)
);

CREATE INDEX idx_sem_keywords_date ON marketing_sem_keywords(fetch_date DESC);

-- Google Ads: search term report (Fase 2)
CREATE TABLE marketing_sem_search_terms (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  search_term TEXT NOT NULL,
  campaign_name TEXT,
  ad_group_name TEXT,
  keyword_text TEXT,             -- matched keyword

  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend NUMERIC(12,2) DEFAULT 0,
  conversions NUMERIC(10,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, search_term, keyword_text)
);

CREATE INDEX idx_sem_search_terms_date ON marketing_sem_search_terms(fetch_date DESC);
```

### RLS Policies

```sql
-- Semua tabel marketing_seo_* dan marketing_sem_* menggunakan policy yang sama:
-- Hanya service_role dan user dengan role marketing-related yang bisa akses

-- Template policy (apply ke setiap tabel):
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

CREATE POLICY {table_name}_select_policy ON {table_name}
  FOR SELECT USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('super admin', 'Director')
    )
  );

CREATE POLICY {table_name}_insert_policy ON {table_name}
  FOR INSERT WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
  );
```

---

## 6. Fitur per Bagian

### Bagian 1: SEO Overview (KPI Cards + Trend)

**KPI Cards** (6 cards, data dari 30 hari terakhir vs 30 hari sebelumnya):

| KPI | Source | Perhitungan |
|-----|--------|-------------|
| Total Organic Clicks | GSC | SUM(gsc_total_clicks) 30 hari |
| Total Organic Impressions | GSC | SUM(gsc_total_impressions) 30 hari |
| Average CTR | GSC | total_clicks / total_impressions |
| Average Position | GSC | AVG(gsc_avg_position) 30 hari |
| Organic Sessions | GA4 | SUM(ga_organic_sessions) 30 hari |
| Organic Conversion Rate | GA4 | SUM(conversions) / SUM(sessions) |

Setiap KPI menampilkan:
- Nilai utama
- Persentase perubahan vs periode sebelumnya (hijau naik, merah turun)
- Sparkline mini chart (trend 30 hari)

**Charts**:
- **Line chart**: Organic Clicks & Impressions harian (30/90 hari, dual Y-axis)
- **Donut chart**: Device breakdown (Desktop vs Mobile vs Tablet)

**Filter global** (berlaku untuk semua bagian):
- Date range picker (7d, 30d, 90d, custom)
- Site picker (ugc.id / utamaglobalindocargo.com / semua)

### Bagian 2: Keyword Performance

**Tabel utama** (sortable, searchable, paginated):

| Kolom | Keterangan |
|-------|------------|
| Keyword | search query dari GSC |
| Clicks | jumlah klik |
| Impressions | jumlah tampil |
| CTR | click-through rate |
| Avg Position | rata-rata ranking |
| Position Change | perubahan vs periode sebelumnya (arrow up/down + angka) |
| Type | Badge "Branded" atau "Non-Branded" |

**Charts**:
- **Horizontal bar chart**: Keyword Position Distribution
  - Top 3 (hijau), Top 4-10 (biru), Top 11-20 (kuning), Top 21-50 (orange), >50 (merah)
- **Table cards**: Top 5 Gaining Keywords & Top 5 Losing Keywords (berdasarkan position change)

**Filter tambahan**:
- Device (All / Desktop / Mobile / Tablet)
- Type (All / Branded / Non-Branded)
- Search (cari keyword tertentu)
- Min impressions (filter noise, default: 10)

**Logika branded keyword**:
```
is_branded = TRUE jika query ILIKE ANY(
  '%ugc%', '%utama global%', '%utamaglobal%',
  '%indocargo%', '%utama indo cargo%'
)
```

### Bagian 3: Page Performance

**Tabel utama** (sortable, paginated):

| Kolom | Keterangan | Source |
|-------|------------|--------|
| Page URL | path halaman (truncated) | GSC |
| Clicks | klik dari search | GSC |
| Impressions | tampil di search | GSC |
| CTR | click-through rate | GSC |
| Avg Position | rata-rata ranking | GSC |
| Sessions | organic sessions | GA4 |
| Engagement Rate | engaged sessions / total sessions | GA4 |
| Bounce Rate | bounce rate | GA4 |
| Conversions | conversion count | GA4 |

**Expandable row** → saat diklik, tampilkan:
- Top 5 keywords yang mengarah ke halaman ini (dari GSC, filter by page)
- Core Web Vitals untuk halaman ini (dari PageSpeed data)

### Bagian 4: Core Web Vitals

**Score cards** (per halaman penting):

| Metric | Target | Rating |
|--------|--------|--------|
| LCP (Largest Contentful Paint) | < 2.5s | FAST / AVERAGE / SLOW |
| CLS (Cumulative Layout Shift) | < 0.1 | FAST / AVERAGE / SLOW |
| INP (Interaction to Next Paint) | < 200ms | FAST / AVERAGE / SLOW |
| Performance Score | > 90 | Circle gauge 0-100 |

**Layout**:
- Toggle: Mobile / Desktop
- Gauge chart: Overall Performance Score
- 3 metric cards: LCP, CLS, INP masing-masing dengan status badge
- Trend chart: Performance Score over time (weekly)

**Pages yang dimonitor** (configurable, default):
- Homepage (`/`)
- Top 5 landing pages by organic traffic (auto-detected dari GSC data)

### Bagian 5: SEM / Paid Ads Overview (Fase 2)

**KPI Cards**:
| KPI | Source |
|-----|--------|
| Total Ad Spend | Google Ads + Meta Ads |
| Total Conversions | Google Ads + Meta Ads |
| Average CPC | total spend / total clicks |
| Average CPA | total spend / total conversions |
| Overall ROAS | total conversion value / total spend |
| Budget Utilization | total spend / total daily budget |

**Campaign table** (sortable, filterable by platform):

| Kolom | Keterangan |
|-------|------------|
| Platform | icon Google / Meta |
| Campaign | nama campaign |
| Status | ENABLED / PAUSED badge |
| Spend | IDR |
| Impressions | jumlah |
| Clicks | jumlah |
| CTR | click-through rate |
| CPC | cost per click |
| Conversions | jumlah |
| CPA | cost per acquisition |
| ROAS | return on ad spend |
| Budget Use | progress bar |

**Charts**:
- **Area chart**: Daily Spend trend (Google Ads vs Meta Ads stacked)
- **Bar chart**: Top 5 Campaigns by ROAS

### Bagian 6: SEO vs SEM Combined View (Fase 3)

**Organic vs Paid Split**:
- **Donut chart**: Sessions by channel (Organic Search vs Paid Search vs lainnya)
- **Stacked bar chart**: Monthly traffic trend per channel

**Blended Metrics**:
| Metric | Formula |
|--------|---------|
| Blended CPA | total_ads_spend / (organic_conversions + paid_conversions) |
| Organic Share | organic_sessions / total_sessions × 100% |
| Paid Share | paid_sessions / total_sessions × 100% |

**Keyword Overlap Table**:
- Keywords yang ranking organik DAN juga di-bid paid
- Kolom: keyword, organic position, organic clicks, paid clicks, paid CPC
- Insight: "Keyword ini ranking #2 organik, pertimbangkan kurangi bid paid"

---

## 7. API Routes

```
src/app/api/marketing/seo-sem/
├── overview/
│   └── route.ts          GET   → KPI summary + daily trend data
│                                  Query: ?range=30d&site=ugc.id
│                                  Response: { kpis, dailyTrend[], deviceBreakdown }
│
├── keywords/
│   └── route.ts          GET   → Keyword performance data
│                                  Query: ?range=30d&site=ugc.id&device=all
│                                         &branded=all&search=&page=1&limit=50
│                                  Response: { keywords[], distribution, gaining[], losing[], total }
│
├── pages/
│   └── route.ts          GET   → Page performance data
│                                  Query: ?range=30d&site=ugc.id&page=1&limit=50
│                                  Response: { pages[], total }
│
├── web-vitals/
│   └── route.ts          GET   → Core Web Vitals data
│                                  Query: ?site=ugc.id
│                                  Response: { pages[{ url, mobile, desktop }] }
│
├── ads/
│   └── route.ts          GET   → SEM campaign data (Fase 2)
│                                  Query: ?range=30d&platform=all&page=1&limit=50
│                                  Response: { kpis, campaigns[], dailySpend[], total }
│
├── combined/
│   └── route.ts          GET   → Organic vs Paid combined view (Fase 3)
│                                  Query: ?range=30d
│                                  Response: { channelSplit, blendedMetrics, keywordOverlap[] }
│
└── fetch/
    └── route.ts          POST  → Trigger data fetch (called by pg_cron)
                                   Body: { source: 'pg_cron' | 'manual' }
                                   Auth: service_role key
                                   Actions: fetch dari semua active APIs → simpan ke DB
```

---

## 8. Component Structure

```
src/components/marketing/
├── (existing files...)
├── seo-sem-dashboard.tsx              -- Main dashboard container (client component)
│                                         Manages state: dateRange, site, activeTab
│                                         Renders all sections below
│
├── seo/
│   ├── seo-overview-section.tsx       -- KPI cards + trend line chart + device donut
│   ├── keyword-performance-section.tsx -- Keyword table + position distribution chart
│   │                                     + gaining/losing cards
│   ├── page-performance-section.tsx   -- Page table with expandable rows
│   └── web-vitals-section.tsx         -- Performance gauge + metric cards + trend
│
├── sem/
│   ├── ads-overview-section.tsx       -- KPI cards + campaign table + spend chart (Fase 2)
│   └── combined-view-section.tsx      -- Organic vs Paid analysis (Fase 3)
│
└── seo-sem-icons.tsx                  -- Google, Google Ads, Meta icons (SVG)
```

**Page file** update:
```
src/app/(crm)/marketing/seo-sem/page.tsx
  → Import dan render <SEOSEMDashboard />
```

---

## 9. Credential yang Dibutuhkan

### Dari Tim Digital Marketing

| # | Service | Yang Harus Disiapkan | Cara Mendapatkan |
|---|---------|---------------------|------------------|
| 1 | **Google Search Console** | Akses owner/full ke property GSC | Buka search.google.com/search-console, pastikan domain sudah diverifikasi |
| 2 | **Google Analytics 4** | GA4 Property ID | Buka analytics.google.com > Admin > Property Settings > Property ID |
| 3 | **Google Ads** | Customer ID (xxx-xxx-xxxx) | Buka ads.google.com > klik icon profil > lihat Customer ID |
| 4 | **Meta Ads** | Ad Account ID | Buka business.facebook.com > Ad Accounts > copy ID |

### Dari Developer (Teknis)

| # | Service | Yang Harus Dilakukan |
|---|---------|---------------------|
| 1 | **Google OAuth** | Reuse GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET yang sudah ada (dari YouTube setup). Tambah scope: `webmasters.readonly`, `analytics.readonly` |
| 2 | **Google Ads Developer Token** | Apply di ads.google.com/aw/apicenter → tunggu approval Basic Access |
| 3 | **PageSpeed API Key** | Buat di console.cloud.google.com > APIs & Services > Credentials > Create API Key. Enable "PageSpeed Insights API" |
| 4 | **Meta Ads** | Reuse META_APP_ID + META_APP_SECRET. Tambah permission: `ads_read` |

### Environment Variables (Tambahan)

```env
# Google OAuth sudah ada (reuse dari YouTube):
# GOOGLE_CLIENT_ID=xxx
# GOOGLE_CLIENT_SECRET=xxx

# Tambahan untuk SEO-SEM:
GOOGLE_ADS_DEVELOPER_TOKEN=xxx            # Fase 2
GOOGLE_ADS_CUSTOMER_ID=xxx-xxx-xxxx       # Fase 2
GOOGLE_ADS_MANAGER_ID=xxx-xxx-xxxx        # Fase 2 (jika pakai MCC)
PAGESPEED_API_KEY=xxx                     # Fase 1

# Meta OAuth sudah ada (reuse dari social media):
# META_APP_ID=xxx
# META_APP_SECRET=xxx
META_ADS_ACCOUNT_ID=act_xxxxxxxxx         # Fase 3
```

### Tabel Ringkasan Credential (Isi Bersama Tim Marketing)

```
+-----------------------------------+----------------------------------------------+
| Data                              | Nilai / Value                                |
+-----------------------------------+----------------------------------------------+
| Google Search Console Property    |                                              |
| (contoh: sc-domain:ugc.id)        |                                              |
+-----------------------------------+----------------------------------------------+
| GA4 Property ID                   |                                              |
| (contoh: 123456789)               |                                              |
+-----------------------------------+----------------------------------------------+
| Google Ads Customer ID            |                                              |
| (contoh: 123-456-7890)            | (Fase 2)                                     |
+-----------------------------------+----------------------------------------------+
| Meta Ads Account ID               |                                              |
| (contoh: act_123456789)           | (Fase 3)                                     |
+-----------------------------------+----------------------------------------------+
| PageSpeed API Key                 |                                              |
| (diisi Developer)                 |                                              |
+-----------------------------------+----------------------------------------------+
| GOOGLE_CLIENT_ID                  |                                              |
| (sudah ada dari YouTube setup)    |                                              |
+-----------------------------------+----------------------------------------------+
| GOOGLE_CLIENT_SECRET              |                                              |
| (sudah ada dari YouTube setup)    |                                              |
+-----------------------------------+----------------------------------------------+
| Google Ads Developer Token        |                                              |
| (diisi Developer, perlu approval) | (Fase 2)                                     |
+-----------------------------------+----------------------------------------------+
```

---

## 10. Cron Jobs & Data Refresh

### Schedule

| Job | Schedule | Apa yang Dilakukan |
|-----|----------|-------------------|
| `seo-sem-daily-fetch` | Setiap hari jam 06:00 WIB (23:00 UTC H-1) | Fetch GSC + GA4 data untuk H-3 (data delay 2-3 hari) |
| `seo-sem-weekly-vitals` | Setiap Senin jam 07:00 WIB (00:00 UTC) | Fetch PageSpeed untuk top pages |
| `seo-sem-ads-fetch` | Setiap hari jam 08:00 WIB (01:00 UTC) | Fetch Google Ads + Meta Ads data untuk H-1 (Fase 2) |
| `seo-sem-cleanup` | Setiap Minggu jam 03:00 UTC | Hapus data > 12 bulan |

### Data Freshness

| Source | Delay | Fetch Frequency | Histori Disimpan |
|--------|-------|-----------------|------------------|
| GSC | 2-3 hari | 1x/hari | 12 bulan |
| GA4 | ~24 jam | 1x/hari | 12 bulan |
| PageSpeed | Real-time | 1x/minggu | 6 bulan |
| Google Ads | ~24 jam | 1x/hari | 12 bulan |
| Meta Ads | ~24 jam | 1x/hari | 12 bulan |

---

## 11. File Map

Daftar lengkap file yang akan dibuat/dimodifikasi:

### Fase 1 (SEO Dashboard)

```
# SQL Migration
supabase/migrations/157_marketing_seo_sem_schema.sql        -- NEW: tables + indexes + RLS

# Config library
src/lib/seo-sem-fetcher.ts                                  -- NEW: fetch dari GSC + GA4 + PageSpeed APIs

# API Routes
src/app/api/marketing/seo-sem/overview/route.ts             -- NEW
src/app/api/marketing/seo-sem/keywords/route.ts             -- NEW
src/app/api/marketing/seo-sem/pages/route.ts                -- NEW
src/app/api/marketing/seo-sem/web-vitals/route.ts           -- NEW
src/app/api/marketing/seo-sem/fetch/route.ts                -- NEW

# Components
src/components/marketing/seo-sem-dashboard.tsx               -- NEW: main container
src/components/marketing/seo/seo-overview-section.tsx        -- NEW
src/components/marketing/seo/keyword-performance-section.tsx -- NEW
src/components/marketing/seo/page-performance-section.tsx    -- NEW
src/components/marketing/seo/web-vitals-section.tsx          -- NEW

# Page (modify existing)
src/app/(crm)/marketing/seo-sem/page.tsx                    -- MODIFY: replace "Coming Soon"
```

### Fase 2 (SEM Dashboard - Google Ads)

```
src/lib/google-ads-fetcher.ts                               -- NEW
src/app/api/marketing/seo-sem/ads/route.ts                  -- NEW
src/components/marketing/sem/ads-overview-section.tsx        -- NEW
```

### Fase 3 (Meta Ads + Combined View)

```
src/lib/meta-ads-fetcher.ts                                 -- NEW
src/app/api/marketing/seo-sem/combined/route.ts             -- NEW
src/components/marketing/sem/combined-view-section.tsx       -- NEW
src/components/marketing/seo-sem-icons.tsx                   -- NEW: Google, Meta SVG icons
```

---

> **Catatan**: Dokumen ini adalah living document. Update setiap kali ada perubahan keputusan arsitektur atau penambahan fitur.
>
> **Terakhir diperbarui**: Februari 2026
