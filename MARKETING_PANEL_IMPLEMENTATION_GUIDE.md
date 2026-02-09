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
3. API route tersebut fetch data dari API resmi setiap platform
4. Data disimpan di tabel `marketing_social_media_analytics`
5. Setiap akhir hari (23:55 WIB), pg_cron menghitung daily summary
6. Dashboard UI membaca data dari `/api/marketing/social-media/analytics`

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

### Step 4: Konfigurasi API Platform

Untuk setiap platform, Anda perlu mendapatkan API credentials dan menyimpannya di tabel `marketing_social_media_config`.

#### TikTok

1. Buat TikTok Developer Account: https://developers.tiktok.com/
2. Buat App di TikTok for Business
3. Request akses ke **Research API** atau **Business API**
4. Dapatkan `access_token`
5. Update config:

```sql
UPDATE marketing_social_media_config
SET access_token = 'your-tiktok-access-token',
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
SET access_token = 'your-instagram-page-token',
    account_id = 'your-instagram-business-account-id'
WHERE platform = 'instagram';
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
UPDATE marketing_social_media_config
SET access_token = 'your-youtube-api-key',
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
SET access_token = 'your-facebook-page-token',
    account_id = 'your-facebook-page-id'
WHERE platform = 'facebook';
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

### Step 5: Verifikasi pg_cron Jobs

Setelah migration dijalankan, verifikasi cron jobs sudah terdaftar:

```sql
-- Cek semua cron jobs
SELECT * FROM cron.job;

-- Cek history eksekusi
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

Anda seharusnya melihat 4 jobs:
- `social-media-fetch-0800` (setiap hari jam 01:00 UTC = 08:00 WIB)
- `social-media-fetch-1200` (setiap hari jam 05:00 UTC = 12:00 WIB)
- `social-media-fetch-1700` (setiap hari jam 10:00 UTC = 17:00 WIB)
- `social-media-daily-summary` (setiap hari jam 16:55 UTC = 23:55 WIB)

### Step 6: Test Manual

Anda bisa test fetch secara manual:

```bash
# Test fetch endpoint (ganti URL dan key sesuai environment)
curl -X POST https://your-app.com/api/marketing/social-media/fetch \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"time_slot": "08:00", "triggered_by": "manual"}'
```

---

## Struktur File

```
src/
├── app/
│   ├── (crm)/
│   │   └── marketing/
│   │       ├── layout.tsx              # Auth guard (canAccessMarketingPanel)
│   │       ├── overview/page.tsx       # Marketing Panel landing
│   │       ├── digital-performance/page.tsx  # Social media analytics
│   │       ├── seo-sem/page.tsx        # Coming soon
│   │       ├── email-marketing/page.tsx # Coming soon
│   │       └── content-plan/page.tsx   # Coming soon
│   └── api/
│       └── marketing/
│           └── social-media/
│               ├── analytics/route.ts  # GET - read data for dashboard
│               └── fetch/route.ts      # POST - webhook from pg_cron
├── components/
│   └── marketing/
│       └── digital-performance-dashboard.tsx  # Main dashboard UI
├── lib/
│   └── permissions.ts                  # canAccessMarketingPanel() added
└── components/
    └── crm/
        └── sidebar.tsx                 # Marketing Panel menu added

supabase/
└── migrations/
    └── 154_marketing_social_media_analytics.sql  # Tables, RLS, pg_cron jobs
```

## Database Tables

| Table | Deskripsi |
|-------|-----------|
| `marketing_social_media_config` | Konfigurasi API per platform (tokens, account IDs) |
| `marketing_social_media_analytics` | Snapshot data per fetch (3x sehari per platform) |
| `marketing_social_media_daily_summary` | Ringkasan harian (computed dari snapshots) |

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

## FAQ

**Q: Bagaimana jika token expired?**
A: Untuk platform yang menggunakan OAuth (Instagram, Facebook, LinkedIn, TikTok), Anda perlu implement token refresh. Simpan refresh_token di config table dan buat logic untuk auto-refresh sebelum token expire.

**Q: Bagaimana jika fetch gagal?**
A: Error dicatat di kolom `fetch_status` dan `error_message` di tabel analytics. Daily summary hanya menghitung row dengan `fetch_status = 'success'`.

**Q: Bisa tambah platform lain?**
A: Ya, tambahkan value baru ke enum `social_media_platform`, tambah config seed, dan implement fetch function baru di API route.

**Q: Kenapa pakai pg_cron bukan Vercel cron?**
A: pg_cron berjalan langsung di database Supabase, tidak tergantung pada deployment platform (Vercel, Railway, dll). Lebih reliable dan tidak membutuhkan konfigurasi tambahan di hosting. pg_net digunakan untuk memanggil API endpoint secara async dari database.

**Q: Bagaimana cara melihat log pg_cron?**
A: Jalankan query `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 50;` di SQL Editor.
