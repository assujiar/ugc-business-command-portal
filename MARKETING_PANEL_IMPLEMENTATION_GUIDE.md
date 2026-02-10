# Marketing Panel - Implementation Guide

## Overview

Marketing Panel adalah modul baru di sidebar yang hanya bisa diakses oleh user di department marketing (Marketing Manager, Marcomm, DGO, MACX, VSDO) dan admin (Director, super admin).

### Sub-menu:
1. **Overview** - Dashboard landing page untuk Marketing Panel
2. **Digital Performance** - Analitik sosial media (TikTok, Instagram, YouTube, Facebook, LinkedIn)
3. **SEO-SEM Performance** - Coming soon
4. **Email Marketing** - Coming soon
5. **Content Plan** - Coming soon

---

## Arsitektur

```
┌──────────────┐      pg_cron (3x/hari)       ┌──────────────────┐
│  Supabase DB │ ────── pg_net HTTP POST ─────▶│ /api/marketing/  │
│  (pg_cron)   │                               │ social-media/    │
│              │◀──── INSERT analytics data ───│ fetch            │
└──────────────┘                               └────────┬─────────┘
       │                                                │
       │  pg_cron (setiap 6 jam)                        │ 1. Auto-refresh token
       │  ┌──────────────────┐                          │    jika expiring soon
       │  │ /api/marketing/  │                          │ 2. Fetch data dari
       │  │ social-media/    │                          │    API resmi platform
       │  │ token-refresh    │                          │
       │  └──────┬───────────┘                          │
       │         │ refresh OAuth token                  │
       │         │ update DB                            │
       │         ▼                                      │
       │  ┌──────────────────┐                          │
       │  │ OAuth Endpoints: │                          │
       │  │ Meta, Google,    │                          │
       │  │ TikTok, LinkedIn │                          │
       │  └──────────────────┘                          │
       │                                                │
       │ SELECT (RLS)                          fetch dari API resmi
       │                                       platform (TikTok,
       ▼                                       Instagram, YouTube,
┌──────────────┐                               Facebook, LinkedIn)
│ /api/marketing/                                       │
│ social-media/  │◀─────────────────────────────────────┘
│ analytics      │
└───────┬────────┘
        │ JSON response
        ▼
┌──────────────────┐
│ Digital           │
│ Performance       │
│ Dashboard (UI)    │
└──────────────────┘
```

### Flow:
1. **pg_cron** berjalan di Supabase, 3x sehari (08:00, 12:00, 17:00 WIB)
2. pg_cron memanggil `fn_trigger_social_media_fetch()` yang menggunakan **pg_net** untuk HTTP POST ke `/api/marketing/social-media/fetch`
3. **Sebelum fetch**, API route otomatis cek apakah token expiring soon → jika ya, auto-refresh via OAuth endpoint platform
4. API route fetch data dari API resmi setiap platform (menggunakan token yang sudah valid)
5. Data disimpan di tabel `marketing_social_media_analytics`
6. Setiap akhir hari (23:55 WIB), pg_cron menghitung daily summary
7. **Setiap 6 jam**, pg_cron juga memanggil `/api/marketing/social-media/token-refresh` untuk proactively refresh token yang akan expire
8. Dashboard UI membaca data dari `/api/marketing/social-media/analytics`

---

## Langkah Implementasi (Yang Harus Anda Lakukan)

### Step 1: Enable Supabase Extensions

Buka Supabase Dashboard > Database > Extensions, lalu enable:

1. **pg_cron** - untuk scheduled jobs
2. **pg_net** - untuk HTTP requests dari database

### Step 2: Jalankan Migration

```bash
supabase db push
# atau jalankan manual di SQL Editor:
# Copy isi file supabase/migrations/154_marketing_social_media_analytics.sql
```

### Step 3: Konfigurasi Supabase Vault / Database Settings

pg_cron perlu tahu URL aplikasi dan service_role key untuk memanggil webhook.
Pilih salah satu cara:

**Opsi A: Menggunakan Supabase Vault (Recommended)**

1. Buka Supabase Dashboard > Settings > Vault
2. Tambahkan secret:
   - Name: `app_url` → Value: `https://your-app-domain.com` (URL produksi)
   - Name: `service_role_key` → Value: (copy dari Settings > API > service_role key)
3. Update fungsi `fn_trigger_social_media_fetch` untuk membaca dari vault:

```sql
-- Jalankan di SQL Editor:
CREATE OR REPLACE FUNCTION fn_trigger_social_media_fetch()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
  v_time_slot TEXT;
  v_current_hour INTEGER;
BEGIN
  v_current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Jakarta')::INTEGER;

  IF v_current_hour = 8 THEN v_time_slot := '08:00';
  ELSIF v_current_hour = 12 THEN v_time_slot := '12:00';
  ELSIF v_current_hour = 17 THEN v_time_slot := '17:00';
  ELSE v_time_slot := LPAD(v_current_hour::TEXT, 2, '0') || ':00';
  END IF;

  -- Baca dari Vault
  SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets WHERE name = 'app_url';
  SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
    RAISE NOTICE 'Vault secrets not configured';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/api/marketing/social-media/fetch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := jsonb_build_object(
      'time_slot', v_time_slot,
      'triggered_by', 'pg_cron'
    )
  );
END;
$$;
```

**Opsi B: Menggunakan Database Settings (Simpler)**

```sql
-- Jalankan di SQL Editor:
ALTER DATABASE postgres SET app.settings.app_url = 'https://your-app-domain.com';
ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key-here';
```

> **Catatan**: Opsi A lebih aman karena secret di-encrypt. Opsi B lebih simple tapi key disimpan plaintext di database settings.

### Step 4: Environment Variables untuk Token Refresh

Token refresh otomatis membutuhkan OAuth client credentials. Tambahkan ke environment variables (`.env.local` atau Vercel Environment Variables):

```env
# Meta (Instagram & Facebook) - Satu app untuk kedua platform
META_APP_ID=your-meta-app-id
META_APP_SECRET=your-meta-app-secret

# TikTok
TIKTOK_CLIENT_KEY=your-tiktok-client-key
TIKTOK_CLIENT_SECRET=your-tiktok-client-secret

# Google (YouTube)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# LinkedIn
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret
```

> **Catatan**: YouTube dengan API Key (bukan OAuth) tidak perlu refresh token. Hanya jika menggunakan OAuth2 untuk akses data privat (analytics, revenue, dll).

### Step 5: Konfigurasi API Platform

Untuk setiap platform, Anda perlu mendapatkan API credentials dan menyimpannya di tabel `marketing_social_media_config`.

> **PENTING**: Selalu isi `refresh_token` dan `token_expires_at` agar auto-refresh berfungsi!

#### TikTok

1. Buat TikTok Developer Account: https://developers.tiktok.com/
2. Buat App di TikTok for Business
3. Request akses ke **Research API** atau **Business API**
4. Dapatkan `access_token` dan `refresh_token` via OAuth flow
5. Update config:

```sql
UPDATE marketing_social_media_config
SET access_token = 'your-tiktok-access-token',
    refresh_token = 'your-tiktok-refresh-token',
    token_expires_at = NOW() + INTERVAL '24 hours',  -- TikTok: 24h default
    account_id = 'your-tiktok-user-id'
WHERE platform = 'tiktok';
```

6. Implementasi fetch di `src/app/api/marketing/social-media/fetch/route.ts`:

```typescript
async function fetchTikTokData(config: any): Promise<PlatformData | null> {
  const response = await fetch(
    `${config.api_base_url}/user/info/?fields=follower_count,likes_count,video_count`,
    {
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
      },
    }
  )
  const data = await response.json()
  const user = data.data.user

  // Fetch recent videos for engagement metrics
  const videosRes = await fetch(
    `${config.api_base_url}/video/list/?fields=id,title,view_count,like_count,comment_count,share_count`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ max_count: 20 }),
    }
  )
  const videosData = await videosRes.json()
  const videos = videosData.data?.videos || []

  const totalViews = videos.reduce((sum, v) => sum + (v.view_count || 0), 0)
  const totalLikes = videos.reduce((sum, v) => sum + (v.like_count || 0), 0)
  const totalComments = videos.reduce((sum, v) => sum + (v.comment_count || 0), 0)
  const totalShares = videos.reduce((sum, v) => sum + (v.share_count || 0), 0)

  return {
    followers_count: user.follower_count || 0,
    followers_gained: 0,
    following_count: user.following_count || 0,
    posts_count: user.video_count || 0,
    total_views: totalViews,
    total_likes: totalLikes,
    total_comments: totalComments,
    total_shares: totalShares,
    total_saves: 0,
    engagement_rate: totalViews > 0 ? ((totalLikes + totalComments + totalShares) / totalViews) * 100 : 0,
    reach: 0,
    impressions: totalViews,
    platform_specific_data: { video_views: totalViews, profile_views: user.profile_view_count },
    top_posts: videos.slice(0, 5).map(v => ({ post_id: v.id, title: v.title, views: v.view_count, likes: v.like_count })),
    audience_demographics: {},
    raw_api_response: data,
  }
}
```

#### Instagram

1. Buat Facebook Developer Account: https://developers.facebook.com/
2. Buat Facebook App
3. Hubungkan Instagram Business Account
4. Generate Long-Lived Page Access Token
5. Update config:

```sql
UPDATE marketing_social_media_config
SET access_token = 'your-instagram-long-lived-token',
    token_expires_at = NOW() + INTERVAL '60 days',  -- Meta long-lived: 60 days
    account_id = 'your-instagram-business-account-id'
WHERE platform = 'instagram';
-- Catatan: Instagram/Facebook menggunakan Long-Lived Token exchange (bukan refresh_token)
-- Auto-refresh via META_APP_ID + META_APP_SECRET
```

6. Implementasi fetch:

```typescript
async function fetchInstagramData(config: any): Promise<PlatformData | null> {
  // Account info
  const accountRes = await fetch(
    `${config.api_base_url}/${config.account_id}?fields=followers_count,follows_count,media_count&access_token=${config.access_token}`
  )
  const account = await accountRes.json()

  // Account insights (last 30 days)
  const insightsRes = await fetch(
    `${config.api_base_url}/${config.account_id}/insights?metric=reach,impressions,profile_views,website_clicks&period=day&access_token=${config.access_token}`
  )
  const insights = await insightsRes.json()

  // Recent media
  const mediaRes = await fetch(
    `${config.api_base_url}/${config.account_id}/media?fields=id,caption,like_count,comments_count,media_type,permalink,timestamp&limit=20&access_token=${config.access_token}`
  )
  const media = await mediaRes.json()
  const posts = media.data || []

  const totalLikes = posts.reduce((sum, p) => sum + (p.like_count || 0), 0)
  const totalComments = posts.reduce((sum, p) => sum + (p.comments_count || 0), 0)

  return {
    followers_count: account.followers_count || 0,
    followers_gained: 0,
    following_count: account.follows_count || 0,
    posts_count: account.media_count || 0,
    total_views: 0,
    total_likes: totalLikes,
    total_comments: totalComments,
    total_shares: 0,
    total_saves: 0,
    engagement_rate: account.followers_count > 0 ? ((totalLikes + totalComments) / account.followers_count) * 100 : 0,
    reach: insights.data?.[0]?.values?.[0]?.value || 0,
    impressions: insights.data?.[1]?.values?.[0]?.value || 0,
    platform_specific_data: { profile_visits: insights.data?.[2]?.values?.[0]?.value || 0 },
    top_posts: posts.slice(0, 5).map(p => ({ post_id: p.id, likes: p.like_count, comments: p.comments_count, url: p.permalink })),
    audience_demographics: {},
    raw_api_response: { account, insights: insights.data, media_count: posts.length },
  }
}
```

#### YouTube

1. Buat Google Cloud Project: https://console.cloud.google.com/
2. Enable YouTube Data API v3
3. Buat API Key atau OAuth2 credential
4. Update config:

```sql
-- Opsi A: Dengan API Key (tidak butuh refresh, tidak expire)
UPDATE marketing_social_media_config
SET access_token = 'your-youtube-api-key',
    account_id = 'your-youtube-channel-id'
WHERE platform = 'youtube';

-- Opsi B: Dengan OAuth2 (untuk data privat seperti analytics/revenue)
UPDATE marketing_social_media_config
SET access_token = 'your-youtube-oauth-token',
    refresh_token = 'your-google-refresh-token',
    token_expires_at = NOW() + INTERVAL '1 hour',  -- Google OAuth: 1h default
    account_id = 'your-youtube-channel-id'
WHERE platform = 'youtube';
```

5. Implementasi fetch:

```typescript
async function fetchYouTubeData(config: any): Promise<PlatformData | null> {
  const baseUrl = config.api_base_url
  const apiKey = config.access_token
  const channelId = config.account_id

  // Channel statistics
  const channelRes = await fetch(
    `${baseUrl}/channels?part=statistics,snippet&id=${channelId}&key=${apiKey}`
  )
  const channelData = await channelRes.json()
  const stats = channelData.items?.[0]?.statistics

  // Recent videos
  const searchRes = await fetch(
    `${baseUrl}/search?part=id&channelId=${channelId}&order=date&maxResults=20&type=video&key=${apiKey}`
  )
  const searchData = await searchRes.json()
  const videoIds = (searchData.items || []).map(i => i.id.videoId).join(',')

  let videoStats = []
  if (videoIds) {
    const videosRes = await fetch(
      `${baseUrl}/videos?part=statistics,snippet&id=${videoIds}&key=${apiKey}`
    )
    const videosData = await videosRes.json()
    videoStats = videosData.items || []
  }

  const totalViews = videoStats.reduce((sum, v) => sum + parseInt(v.statistics?.viewCount || '0'), 0)
  const totalLikes = videoStats.reduce((sum, v) => sum + parseInt(v.statistics?.likeCount || '0'), 0)
  const totalComments = videoStats.reduce((sum, v) => sum + parseInt(v.statistics?.commentCount || '0'), 0)

  return {
    followers_count: parseInt(stats?.subscriberCount || '0'),
    followers_gained: 0,
    following_count: 0,
    posts_count: parseInt(stats?.videoCount || '0'),
    total_views: parseInt(stats?.viewCount || '0'),
    total_likes: totalLikes,
    total_comments: totalComments,
    total_shares: 0,
    total_saves: 0,
    engagement_rate: totalViews > 0 ? ((totalLikes + totalComments) / totalViews) * 100 : 0,
    reach: 0,
    impressions: parseInt(stats?.viewCount || '0'),
    platform_specific_data: { subscribers: stats?.subscriberCount },
    top_posts: videoStats.slice(0, 5).map(v => ({
      post_id: v.id,
      title: v.snippet?.title,
      views: parseInt(v.statistics?.viewCount || '0'),
      likes: parseInt(v.statistics?.likeCount || '0'),
    })),
    audience_demographics: {},
    raw_api_response: channelData,
  }
}
```

#### Facebook

1. Buat Facebook Developer Account: https://developers.facebook.com/
2. Buat Facebook App
3. Generate Page Access Token (long-lived)
4. Update config:

```sql
UPDATE marketing_social_media_config
SET access_token = 'your-facebook-long-lived-page-token',
    token_expires_at = NOW() + INTERVAL '60 days',  -- Meta long-lived: 60 days
    account_id = 'your-facebook-page-id'
WHERE platform = 'facebook';
-- Catatan: Sama seperti Instagram, menggunakan Meta long-lived token exchange
-- Auto-refresh via META_APP_ID + META_APP_SECRET
```

5. Implementasi serupa dengan Instagram (gunakan Graph API).

#### LinkedIn

1. Buat LinkedIn Developer App: https://www.linkedin.com/developers/
2. Request akses ke Marketing API
3. Dapatkan Organization URN dan access_token
4. Update config:

```sql
UPDATE marketing_social_media_config
SET access_token = 'your-linkedin-access-token',
    refresh_token = 'your-linkedin-refresh-token',
    token_expires_at = NOW() + INTERVAL '60 days',  -- LinkedIn: 60 days default
    account_id = 'your-linkedin-organization-id'
WHERE platform = 'linkedin';
```

5. Implementasi fetch:

```typescript
async function fetchLinkedInData(config: any): Promise<PlatformData | null> {
  const orgUrn = `urn:li:organization:${config.account_id}`

  // Follower statistics
  const followersRes = await fetch(
    `${config.api_base_url}/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}`,
    {
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'LinkedIn-Version': '202401',
      },
    }
  )
  const followersData = await followersRes.json()

  // Share statistics
  const sharesRes = await fetch(
    `${config.api_base_url}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}`,
    {
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'LinkedIn-Version': '202401',
      },
    }
  )
  const sharesData = await sharesRes.json()

  const totalFollowers = followersData.elements?.[0]?.followerCounts?.organicFollowerCount || 0
  const shareStats = sharesData.elements?.[0]?.totalShareStatistics || {}

  return {
    followers_count: totalFollowers,
    followers_gained: 0,
    following_count: 0,
    posts_count: shareStats.shareCount || 0,
    total_views: shareStats.impressionCount || 0,
    total_likes: shareStats.likeCount || 0,
    total_comments: shareStats.commentCount || 0,
    total_shares: shareStats.shareCount || 0,
    total_saves: 0,
    engagement_rate: shareStats.impressionCount > 0
      ? ((shareStats.likeCount + shareStats.commentCount + shareStats.shareCount) / shareStats.impressionCount) * 100
      : 0,
    reach: shareStats.uniqueImpressionsCount || 0,
    impressions: shareStats.impressionCount || 0,
    platform_specific_data: {
      connections: 0,
      page_followers: totalFollowers,
      click_through_rate: shareStats.clickCount > 0 && shareStats.impressionCount > 0
        ? (shareStats.clickCount / shareStats.impressionCount) * 100
        : 0,
    },
    top_posts: [],
    audience_demographics: {},
    raw_api_response: { followers: followersData, shares: sharesData },
  }
}
```

### Step 6: Verifikasi pg_cron Jobs

Setelah migration dijalankan, verifikasi cron jobs sudah terdaftar:

```sql
-- Cek semua cron jobs
SELECT * FROM cron.job;

-- Cek history eksekusi
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

Anda seharusnya melihat 6 jobs:
- `social-media-fetch-0800` (setiap hari jam 01:00 UTC = 08:00 WIB)
- `social-media-fetch-1200` (setiap hari jam 05:00 UTC = 12:00 WIB)
- `social-media-fetch-1700` (setiap hari jam 10:00 UTC = 17:00 WIB)
- `social-media-daily-summary` (setiap hari jam 16:55 UTC = 23:55 WIB)
- `social-media-token-refresh` (setiap 6 jam - auto-refresh expiring tokens)
- `cleanup-token-refresh-logs` (mingguan - bersihkan log >30 hari)

### Step 7: Test Manual

Anda bisa test fetch secara manual:

```bash
# Test fetch endpoint (ganti URL dan key sesuai environment)
curl -X POST https://your-app.com/api/marketing/social-media/fetch \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"time_slot": "08:00", "triggered_by": "manual"}'

# Test token refresh (cek & refresh semua token yang expiring)
curl -X POST https://your-app.com/api/marketing/social-media/token-refresh \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source": "manual"}'

# Cek status token semua platform
curl -X GET https://your-app.com/api/marketing/social-media/token-refresh \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

---

## Struktur File

```
src/
├── app/
│   ├── (crm)/
│   │   └── marketing/
│   │       ├── layout.tsx                        # Auth guard (canAccessMarketingPanel)
│   │       ├── overview/page.tsx                  # Marketing Panel landing
│   │       ├── digital-performance/page.tsx       # Social media analytics
│   │       ├── seo-sem/page.tsx                   # Coming soon
│   │       ├── email-marketing/page.tsx           # Coming soon
│   │       └── content-plan/page.tsx              # Coming soon
│   └── api/
│       └── marketing/
│           └── social-media/
│               ├── analytics/route.ts             # GET - read data for dashboard
│               ├── content/route.ts               # GET - content-level data
│               ├── fetch/route.ts                 # POST - webhook from pg_cron (with auto token refresh)
│               └── token-refresh/route.ts         # POST - proactive token refresh, GET - token status
├── components/
│   └── marketing/
│       ├── digital-performance-dashboard.tsx      # Main dashboard UI
│       ├── analytics-enhancements.tsx             # KPIs, weekly comparison, charts, health scores
│       ├── content-performance-table.tsx           # Content-level analytics table
│       └── social-media-icons.tsx                 # SVG social media brand icons
├── lib/
│   ├── permissions.ts                             # canAccessMarketingPanel() added
│   └── social-media-token-refresh.ts              # Auto token refresh utility
└── components/
    └── crm/
        └── sidebar.tsx                            # Marketing Panel menu added

supabase/
└── migrations/
    ├── 154_marketing_social_media_analytics.sql   # Tables, RLS, pg_cron jobs
    ├── 155_marketing_content_level_analytics.sql   # Content-level tables
    └── 156_marketing_token_refresh.sql            # Token refresh log, pg_cron job
```

## Database Tables

| Table | Deskripsi |
|-------|-----------|
| `marketing_social_media_config` | Konfigurasi API per platform (tokens, refresh_tokens, account IDs, token_expires_at) |
| `marketing_social_media_analytics` | Snapshot data per fetch (3x sehari per platform) |
| `marketing_social_media_daily_summary` | Ringkasan harian (computed dari snapshots) |
| `marketing_social_media_content` | Data per konten/post (views, likes, comments per item) |
| `marketing_social_media_content_history` | History perubahan metrik konten (tracking over time) |
| `marketing_token_refresh_log` | Audit log setiap token refresh attempt (auto-cleanup 30 hari) |

## RLS Policies

- **Config table**: Hanya admin (Director, super admin) yang bisa baca/tulis
- **Analytics & Summary**: Marketing + Admin bisa baca, service_role bisa tulis (cron job)

## Scheduling (pg_cron)

| Job | Jadwal (UTC) | Jadwal (WIB) | Fungsi |
|-----|-------------|-------------|--------|
| `social-media-fetch-0800` | 01:00 | 08:00 | Fetch data dari API platform |
| `social-media-fetch-1200` | 05:00 | 12:00 | Fetch data dari API platform |
| `social-media-fetch-1700` | 10:00 | 17:00 | Fetch data dari API platform |
| `social-media-daily-summary` | 16:55 | 23:55 | Hitung daily summary |
| `social-media-token-refresh` | setiap 6 jam | setiap 6 jam | Auto-refresh expiring tokens |
| `cleanup-token-refresh-logs` | Minggu 02:00 | Minggu 09:00 | Bersihkan log refresh >30 hari |

## FAQ

**Q: Bagaimana jika token expired?**
A: Token di-refresh secara **otomatis** melalui 2 mekanisme:
1. **Reactive**: Sebelum setiap fetch, sistem cek `token_expires_at`. Jika token akan expire dalam 15 menit, auto-refresh via OAuth endpoint platform.
2. **Proactive**: pg_cron job `social-media-token-refresh` berjalan setiap 6 jam untuk refresh semua token yang akan expire.

Pastikan `refresh_token` dan `token_expires_at` terisi di `marketing_social_media_config`, dan environment variables OAuth sudah dikonfigurasi.

**Q: Bagaimana cara cek status token?**
A: Gunakan API endpoint:
```bash
curl -X GET https://your-app.com/api/marketing/social-media/token-refresh \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```
Atau cek di database:
```sql
SELECT platform, token_expires_at, last_refresh_at, last_refresh_error
FROM marketing_social_media_config WHERE is_active = true;
```

**Q: Bagaimana jika auto-refresh gagal?**
A: Error dicatat di `marketing_token_refresh_log` dan `last_refresh_error` di config table. Jika refresh gagal dan token expired, fetch akan di-skip dan error "Token expired, refresh failed" dicatat. Anda perlu manual update token via SQL atau OAuth flow ulang.

**Q: Bagaimana jika fetch gagal?**
A: Error dicatat di kolom `fetch_status` dan `error_message` di tabel analytics. Daily summary hanya menghitung row dengan `fetch_status = 'success'`.

**Q: Bisa tambah platform lain?**
A: Ya, tambahkan value baru ke enum `social_media_platform`, tambah config seed, implement fetch function di API route, dan tambah refresh function di `src/lib/social-media-token-refresh.ts`.

**Q: Kenapa pakai pg_cron bukan Vercel cron?**
A: pg_cron berjalan langsung di database Supabase, tidak tergantung pada deployment platform (Vercel, Railway, dll). Lebih reliable dan tidak membutuhkan konfigurasi tambahan di hosting. pg_net digunakan untuk memanggil API endpoint secara async dari database.

**Q: Bagaimana cara melihat log pg_cron?**
A: Jalankan query `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 50;` di SQL Editor.

**Q: Berapa lama token berlaku untuk setiap platform?**
A:
| Platform | Token Expiry | Refresh Method |
|----------|-------------|----------------|
| TikTok | 24 jam | refresh_token (new refresh_token issued) |
| Instagram | 60 hari | Long-lived token exchange via Meta App |
| YouTube (API Key) | Tidak expire | Tidak perlu refresh |
| YouTube (OAuth) | 1 jam | refresh_token via Google OAuth |
| Facebook | 60 hari | Long-lived token exchange via Meta App |
| LinkedIn | 60 hari | refresh_token (may issue new refresh_token) |

---

## Panduan Lengkap Mendapatkan API Credentials Per Platform

### A. TikTok - Business API

#### Prasyarat
- Akun TikTok Business (bukan personal)
- Minimal 1000 followers (untuk beberapa fitur API)

#### Langkah-langkah

**1. Buat TikTok Developer Account**
1. Buka https://developers.tiktok.com/
2. Klik "My Apps" > "Connect TikTok account" atau "Sign up"
3. Login dengan akun TikTok Anda
4. Lengkapi profil developer (nama, email, deskripsi)

**2. Buat App Baru**
1. Di Developer Portal, klik "Manage Apps" > "Create an app"
2. Isi informasi app:
   - App Name: `[Nama Perusahaan] Marketing Analytics`
   - App Description: `Social media analytics dashboard`
   - Platform: `Web`
3. Pada bagian "Login Kit / Product" pilih:
   - **TikTok Login Kit** (untuk OAuth)
   - **Content Posting API** atau **Business API** (untuk membaca data analytics)
4. Isi Redirect URI: `https://your-app.com/api/auth/tiktok/callback`
5. Submit untuk review (biasanya 1-3 hari kerja)

**3. Dapatkan Client Key dan Client Secret**
1. Setelah app disetujui, buka app details
2. Catat **Client Key** dan **Client Secret**
3. Simpan ke environment variables:
   ```env
   TIKTOK_CLIENT_KEY=your_client_key
   TIKTOK_CLIENT_SECRET=your_client_secret
   ```

**4. Dapatkan Access Token via OAuth**
1. Arahkan user ke URL authorization:
   ```
   https://www.tiktok.com/v2/auth/authorize/?client_key={CLIENT_KEY}&response_type=code&scope=user.info.basic,user.info.stats,video.list&redirect_uri={REDIRECT_URI}&state={STATE}
   ```
2. User login dan authorize app → redirect ke callback URL dengan `code`
3. Exchange code untuk access_token:
   ```bash
   curl -X POST https://open.tiktokapis.com/v2/oauth/token/ \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "client_key={CLIENT_KEY}&client_secret={CLIENT_SECRET}&code={AUTH_CODE}&grant_type=authorization_code&redirect_uri={REDIRECT_URI}"
   ```
4. Response berisi: `access_token`, `refresh_token`, `open_id`, `expires_in`

**5. Simpan ke Database**
```sql
UPDATE marketing_social_media_config
SET access_token = '{access_token}',
    refresh_token = '{refresh_token}',
    token_expires_at = NOW() + INTERVAL '24 hours',
    account_id = '{open_id}',
    api_base_url = 'https://open.tiktokapis.com/v2'
WHERE platform = 'tiktok';
```

---

### B. Instagram - Graph API (via Meta/Facebook)

#### Prasyarat
- Akun Instagram Business atau Creator (bukan personal)
- Facebook Page yang terhubung ke akun Instagram tersebut
- Facebook Developer Account

#### Langkah-langkah

**1. Konversi ke Instagram Business Account**
1. Buka Instagram > Settings > Account > Switch to Professional Account
2. Pilih "Business"
3. Hubungkan ke Facebook Page (buat baru jika belum ada)

**2. Buat Facebook Developer Account & App**
1. Buka https://developers.facebook.com/
2. Klik "My Apps" > "Create App"
3. Pilih use case: **"Other"** > App type: **"Business"**
4. Isi nama app: `[Perusahaan] Marketing Analytics`
5. App dibuat, catat **App ID** dan **App Secret** dari Settings > Basic
6. Simpan ke env:
   ```env
   META_APP_ID=your_app_id
   META_APP_SECRET=your_app_secret
   ```

**3. Tambahkan Products ke App**
1. Di App Dashboard, klik "Add Product"
2. Tambahkan **"Instagram Graph API"**
3. Tambahkan **"Facebook Login for Business"**

**4. Dapatkan User Access Token**
1. Buka Graph API Explorer: https://developers.facebook.com/tools/explorer/
2. Pilih app Anda
3. Klik "Generate Access Token"
4. Pilih permissions:
   - `instagram_basic`
   - `instagram_manage_insights`
   - `pages_show_list`
   - `pages_read_engagement`
   - `business_management`
5. Login dan authorize

**5. Dapatkan Instagram Business Account ID**
```bash
# Dapatkan list Facebook Pages
curl "https://graph.facebook.com/v21.0/me/accounts?access_token={USER_TOKEN}"

# Dari response, catat page_id dan page_access_token
# Lalu dapatkan Instagram Business Account ID
curl "https://graph.facebook.com/v21.0/{PAGE_ID}?fields=instagram_business_account&access_token={PAGE_ACCESS_TOKEN}"
# Catat instagram_business_account.id → ini adalah account_id
```

**6. Buat Long-Lived Page Access Token**
```bash
# Step 1: Exchange short-lived user token → long-lived user token
curl "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_LIVED_USER_TOKEN}"
# Catat long-lived user access_token (60 hari)

# Step 2: Get long-lived page access token
curl "https://graph.facebook.com/v21.0/me/accounts?access_token={LONG_LIVED_USER_TOKEN}"
# Catat access_token dari page yang diinginkan → ini TIDAK EXPIRE (Page token)
```

**7. Simpan ke Database**
```sql
UPDATE marketing_social_media_config
SET access_token = '{long_lived_page_access_token}',
    token_expires_at = NOW() + INTERVAL '60 days',
    account_id = '{instagram_business_account_id}',
    api_base_url = 'https://graph.facebook.com/v21.0'
WHERE platform = 'instagram';
```

> **Tips**: Page Access Token yang dibuat dari Long-Lived User Token sebenarnya TIDAK expire. Tapi simpan `token_expires_at` agar sistem tetap auto-refresh untuk keamanan.

---

### C. YouTube - Data API v3

#### Prasyarat
- Google Account dengan YouTube Channel
- Google Cloud Project

#### Langkah-langkah

**1. Buat Google Cloud Project**
1. Buka https://console.cloud.google.com/
2. Klik dropdown project > "New Project"
3. Nama: `[Perusahaan] Marketing Analytics`
4. Klik "Create"

**2. Enable YouTube Data API v3**
1. Buka menu > APIs & Services > Library
2. Cari "YouTube Data API v3"
3. Klik "Enable"

**3. Opsi A: API Key (Simple - untuk data publik)**
1. Buka APIs & Services > Credentials
2. Klik "Create Credentials" > "API Key"
3. Catat API Key
4. (Opsional) Restrict key: HTTP referrers atau IP address
5. Simpan ke database:
```sql
UPDATE marketing_social_media_config
SET access_token = '{API_KEY}',
    account_id = '{YOUTUBE_CHANNEL_ID}',
    api_base_url = 'https://www.googleapis.com/youtube/v3'
WHERE platform = 'youtube';
-- Tidak perlu refresh_token dan token_expires_at untuk API Key
```

**3. Opsi B: OAuth2 (untuk data privat - analytics, revenue)**
1. Buka APIs & Services > Credentials
2. Klik "Create Credentials" > "OAuth client ID"
3. Application type: "Web application"
4. Authorized redirect URIs: `https://your-app.com/api/auth/google/callback`
5. Catat **Client ID** dan **Client Secret**
6. Simpan ke env:
   ```env
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```
7. Generate access token via OAuth consent flow (gunakan OAuth Playground: https://developers.google.com/oauthplayground/)
   - Select scope: `YouTube Data API v3 → https://www.googleapis.com/auth/youtube.readonly`
   - Authorize APIs → Exchange authorization code for tokens
   - Catat `access_token` dan `refresh_token`

**4. Dapatkan YouTube Channel ID**
1. Buka YouTube Studio: https://studio.youtube.com/
2. Klik ikon profil > Settings > Channel > Advanced settings
3. Catat "Channel ID" (dimulai dengan `UC...`)

Atau via API:
```bash
curl "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&access_token={ACCESS_TOKEN}"
```

---

### D. Facebook - Graph API

#### Prasyarat
- Facebook Page (bukan profil personal)
- Facebook Developer Account (sama dengan Instagram)

#### Langkah-langkah

**1. Gunakan App yang Sama dengan Instagram**
- Jika sudah buat Meta App untuk Instagram, gunakan app yang sama
- `META_APP_ID` dan `META_APP_SECRET` sudah tersedia

**2. Dapatkan Page Access Token**
(Langkah sama dengan Instagram Step 4-6)

```bash
# Dapatkan pages dan page access token
curl "https://graph.facebook.com/v21.0/me/accounts?access_token={LONG_LIVED_USER_TOKEN}"
```

**3. Dapatkan Page ID**
- Dari response di atas, catat `id` dari page yang diinginkan

Atau cara manual:
1. Buka Facebook Page
2. Klik "About" / "Tentang"
3. Scroll ke bawah → "Page ID" ada di bagian Page Transparency

**4. Simpan ke Database**
```sql
UPDATE marketing_social_media_config
SET access_token = '{long_lived_page_access_token}',
    token_expires_at = NOW() + INTERVAL '60 days',
    account_id = '{facebook_page_id}',
    api_base_url = 'https://graph.facebook.com/v21.0'
WHERE platform = 'facebook';
```

**5. Test Koneksi**
```bash
# Test: Dapatkan info page
curl "https://graph.facebook.com/v21.0/{PAGE_ID}?fields=name,fan_count,followers_count&access_token={PAGE_TOKEN}"
```

---

### E. LinkedIn - Marketing API

#### Prasyarat
- LinkedIn Company Page (harus jadi admin)
- LinkedIn Developer App dengan Marketing API access

#### Langkah-langkah

**1. Buat LinkedIn Developer App**
1. Buka https://www.linkedin.com/developers/apps
2. Klik "Create App"
3. Isi informasi:
   - App name: `[Perusahaan] Marketing Analytics`
   - LinkedIn Page: Pilih company page Anda
   - App logo: Upload logo
   - Legal agreement: Centang
4. Klik "Create app"

**2. Request API Products**
1. Di app dashboard, buka tab "Products"
2. Request akses ke:
   - **Share on LinkedIn** (untuk basic posting)
   - **Marketing Developer Platform** (untuk analytics - butuh review)
   - **Community Management API** (opsional)
3. **Marketing Developer Platform** membutuhkan review (3-5 hari kerja)
   - Isi form penggunaan, deskripsikan use case analytics
   - Pastikan Company Page sudah terverifikasi

**3. Dapatkan Client ID dan Client Secret**
1. Di app dashboard, buka tab "Auth"
2. Catat **Client ID** dan **Primary Client Secret**
3. Simpan ke env:
   ```env
   LINKEDIN_CLIENT_ID=your_client_id
   LINKEDIN_CLIENT_SECRET=your_client_secret
   ```
4. Tambahkan Authorized redirect URLs: `https://your-app.com/api/auth/linkedin/callback`

**4. Dapatkan Access Token via OAuth 2.0**
1. Arahkan user ke authorization URL:
   ```
   https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=r_organization_social,rw_organization_admin,r_organization_social_feed,w_organization_social_feed
   ```
2. User authorize → redirect dengan `code`
3. Exchange code untuk token:
   ```bash
   curl -X POST https://www.linkedin.com/oauth/v2/accessToken \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code&code={AUTH_CODE}&client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}&redirect_uri={REDIRECT_URI}"
   ```
4. Response berisi: `access_token`, `refresh_token`, `expires_in`

**5. Dapatkan Organization ID**
```bash
# Cara 1: Via API
curl "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "LinkedIn-Version: 202401"
# Catat organization ID dari response (angka numerik)

# Cara 2: Manual
# Buka LinkedIn Company Page > Admin view > URL bar
# URL: linkedin.com/company/12345678 → 12345678 adalah Organization ID
```

**6. Simpan ke Database**
```sql
UPDATE marketing_social_media_config
SET access_token = '{access_token}',
    refresh_token = '{refresh_token}',
    token_expires_at = NOW() + INTERVAL '60 days',
    account_id = '{organization_id}',
    api_base_url = 'https://api.linkedin.com/v2'
WHERE platform = 'linkedin';
```

**7. Test Koneksi**
```bash
curl "https://api.linkedin.com/v2/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:{ORG_ID}" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "LinkedIn-Version: 202401"
```

---

## Troubleshooting Token Refresh

### Cek Status Token
```sql
-- Lihat status semua token
SELECT
  platform,
  CASE
    WHEN access_token IS NULL THEN 'Belum dikonfigurasi'
    WHEN token_expires_at IS NULL THEN 'Tidak ada info expiry'
    WHEN token_expires_at < NOW() THEN 'EXPIRED ❌'
    WHEN token_expires_at < NOW() + INTERVAL '1 hour' THEN 'Expiring soon ⚠️'
    ELSE 'Valid ✅ (expires ' || token_expires_at::text || ')'
  END AS status,
  last_refresh_at,
  last_refresh_error
FROM marketing_social_media_config
WHERE is_active = true;
```

### Lihat Log Refresh Terakhir
```sql
SELECT * FROM marketing_token_refresh_log
ORDER BY created_at DESC LIMIT 20;
```

### Manual Refresh via API
```bash
curl -X POST https://your-app.com/api/marketing/social-media/token-refresh \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source": "manual"}'
```

### Jika Token Tidak Bisa Di-Refresh
1. Cek apakah `refresh_token` terisi di database
2. Cek apakah environment variables OAuth sudah diset (META_APP_ID, dll)
3. Cek apakah OAuth app masih aktif di developer portal
4. Jika `refresh_token` juga expired (TikTok: 365 hari, LinkedIn: 365 hari), harus ulang OAuth flow dari awal
5. Update token manual:
```sql
UPDATE marketing_social_media_config
SET access_token = '{new_access_token}',
    refresh_token = '{new_refresh_token}',
    token_expires_at = NOW() + INTERVAL '{duration}',
    last_refresh_error = NULL
WHERE platform = '{platform}';
```
