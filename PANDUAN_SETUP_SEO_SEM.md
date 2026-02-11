================================================================================
  PANDUAN SETUP SEO-SEM PERFORMANCE MODULE
  Untuk Tim Digital Marketing & Developer
================================================================================

Hai Tim!

Panduan ini membantu kalian mengaktifkan fitur SEO-SEM Performance di
UGC Business Command Portal. Modul ini mengambil data dari:

  1. PageSpeed Insights  - Web performance & Core Web Vitals
  2. Google Search Console (GSC) - Organic search clicks, keywords, pages
  3. Google Analytics 4 (GA4)   - Organic sessions, engagement, conversions
  4. Google Ads (Coming Soon)   - Paid search campaigns
  5. Meta Ads (Coming Soon)     - Paid social campaigns

================================================================================
  DAFTAR ISI
================================================================================

  Fase 1: PageSpeed Insights (Paling Mudah) ............. Bagian A
  Fase 2: Google OAuth Setup (untuk GSC & GA4) .......... Bagian B
  Fase 3: Google Search Console ......................... Bagian C
  Fase 4: Google Analytics 4 ............................ Bagian D
  Fase 5: Vercel Environment Variables .................. Bagian E
  Fase 6: Aktivasi di Aplikasi .......................... Bagian F
  Fase 7: Google Ads (Coming Soon) ...................... Bagian G
  Fase 8: Meta Ads (Coming Soon) ........................ Bagian H
  Ringkasan Environment Variables ....................... Bagian I
  Troubleshooting ....................................... Bagian J
  FAQ ................................................... Bagian K


================================================================================
  FASE 1: PAGESPEED INSIGHTS
  (Paling Mudah - Hanya butuh API Key, GRATIS)
================================================================================

PageSpeed Insights mengukur performa website secara langsung dari Google.
Data yang diambil:
  - Performance Score (0-100)
  - Core Web Vitals: LCP, CLS, INP, FCP, TTFB
  - Total Blocking Time (TBT) - 30% bobot Lighthouse!
  - Speed Index
  - Diagnostics & Opportunities (saran perbaikan)
  - Resource Breakdown (JS, CSS, images, fonts, dll)
  - Origin CrUX (data real user dari seluruh domain)

GRATIS: 25.000 queries/hari (lebih dari cukup).
TIDAK butuh OAuth, hanya API Key biasa.

--- Langkah-langkah ---

1. Buka Google Cloud Console:
   https://console.cloud.google.com/

2. Buat Project baru (atau gunakan project yang sudah ada):
   - Klik dropdown project di atas > "New Project"
   - Nama: "UGC Business Portal" (atau nama lain)
   - Klik "Create"

3. Enable PageSpeed Insights API:
   - Buka: https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com
   - Klik "ENABLE"

4. Buat API Key:
   - Buka: https://console.cloud.google.com/apis/credentials
   - Klik "CREATE CREDENTIALS" > "API key"
   - Copy API Key yang muncul
   - (Opsional tapi direkomendasikan) Klik "RESTRICT KEY":
     - Application restrictions: "HTTP referrers"
     - Website restrictions: tambahkan domain Anda
       Contoh: https://board.ugc.id/*
     - API restrictions: pilih "PageSpeed Insights API"

5. Simpan API Key:
   - Di Vercel: set PAGESPEED_API_KEY=<api_key_anda>
   - ATAU langsung di aplikasi: SEO-SEM > Settings > PageSpeed > API Key

6. Konfigurasi URL yang Dimonitor:
   Di aplikasi, buka SEO-SEM > Settings > PageSpeed:
   - Tambahkan URL yang ingin dimonitor, contoh:
     * https://www.utamaglobalindocargo.com
     * https://rewards.utamaglobalindocargo.com
     * https://www.ugc.id

7. Test:
   - Klik tombol "Fetch Now" di sebelah PageSpeed
   - Data akan muncul di tab "Web Vitals"

--- Apa yang Terjadi Otomatis ---

Setelah aktif, sistem otomatis:
  - Fetch Web Vitals setiap Senin jam 07:00 WIB (via pg_cron)
  - Data disimpan per URL per strategy (mobile & desktop)
  - Trend line ditampilkan untuk tracking progress


================================================================================
  FASE 2: GOOGLE OAUTH SETUP
  (Diperlukan untuk Google Search Console & Analytics)
================================================================================

GSC dan GA4 membutuhkan OAuth 2.0 karena mengakses data private.
SATU OAuth Client dipakai untuk KEDUA service (GSC + GA4).

--- Prerequisites ---

  * Akun Google Cloud Console (sama dengan Fase 1)
  * Akses ke Google Search Console sebagai Owner/Verified
  * Akses ke Google Analytics 4 sebagai Admin/Editor
  * Domain production (OAuth redirect tidak bisa ke localhost di production)

--- Langkah-langkah ---

1. Buka Google Cloud Console > APIs & Services > Credentials:
   https://console.cloud.google.com/apis/credentials

2. Konfigurasi OAuth Consent Screen (jika belum):
   - Buka: https://console.cloud.google.com/apis/credentials/consent
   - User Type: "External" (atau "Internal" jika pakai Google Workspace)
   - App name: "UGC Business Command Portal"
   - User support email: email admin Anda
   - Developer contact: email developer
   - Klik "Save and Continue"

3. Tambahkan Scopes:
   Di halaman Scopes, klik "ADD OR REMOVE SCOPES":
   - https://www.googleapis.com/auth/webmasters.readonly
   - https://www.googleapis.com/auth/analytics.readonly
   - https://www.googleapis.com/auth/analytics
   Klik "Update" > "Save and Continue"

4. Tambahkan Test Users (jika User Type = External & belum dipublish):
   - Tambahkan email Google yang akan digunakan untuk connect
   - Klik "Save and Continue"

5. Buat OAuth 2.0 Client ID:
   - Kembali ke Credentials: https://console.cloud.google.com/apis/credentials
   - Klik "CREATE CREDENTIALS" > "OAuth client ID"
   - Application type: "Web application"
   - Name: "UGC Portal SEO-SEM"
   - Authorized redirect URIs, tambahkan:

     https://board.ugc.id/api/auth/google/callback

     (Ganti "board.ugc.id" dengan domain production Anda)

     Untuk development, tambahkan juga:
     http://localhost:3000/api/auth/google/callback

   - Klik "CREATE"

6. CATAT Client ID dan Client Secret:

   ┌──────────────────────────────────────────────────────────────┐
   │  GOOGLE_CLIENT_ID     = xxxxxxxxxxxx.apps.googleusercontent.com  │
   │  GOOGLE_CLIENT_SECRET = GOCSPX-xxxxxxxxxxxxxxxxxx               │
   └──────────────────────────────────────────────────────────────┘

   PENTING: Client Secret hanya ditampilkan SEKALI saat pembuatan.
   Download JSON credential sebagai backup.

7. Enable APIs yang diperlukan:

   A. Google Search Console API:
      https://console.cloud.google.com/apis/library/searchconsole.googleapis.com
      > Klik "ENABLE"

   B. Google Analytics Data API (untuk mengambil data laporan):
      https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com
      > Klik "ENABLE"

   C. Google Analytics Admin API (untuk auto-detect property):
      https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com
      > Klik "ENABLE"


================================================================================
  FASE 3: GOOGLE SEARCH CONSOLE
  (Organic Search Keywords, Pages, Clicks, Impressions)
================================================================================

Data yang diambil dari GSC:
  - Total clicks, impressions, average CTR, average position
  - Top keywords (5000 per hari) dengan branded detection
  - Top pages (1000 per hari)
  - Device breakdown (desktop, mobile, tablet)

--- Prerequisites ---

  * Website sudah terverifikasi di Google Search Console
    Buka: https://search.google.com/search-console
  * Akun Google yang dipakai untuk OAuth punya akses Owner/Full

--- Cara Verifikasi Website di GSC (jika belum) ---

1. Buka https://search.google.com/search-console
2. Klik "Add property"
3. Pilih "Domain" (recommended):
   - Masukkan domain: utamaglobalindocargo.com
   - Ikuti langkah verifikasi DNS
4. ATAU pilih "URL prefix":
   - Masukkan: https://www.utamaglobalindocargo.com
   - Verifikasi via HTML tag, file upload, atau Google Analytics

--- Aktivasi di Aplikasi ---

1. Pastikan Fase 2 sudah selesai (OAuth Client + env vars)
2. Buka aplikasi > Marketing > SEO-SEM > tab Settings
3. Klik "Connect Google Search Console"
4. Login dengan akun Google yang punya akses ke GSC
5. Berikan izin yang diminta
6. Sistem otomatis detect site yang terdaftar di GSC
7. Klik "Fetch Now" untuk test

--- Catatan Penting ---

  * Data GSC tertunda 2-3 hari (Google memproses data)
  * Saat fetch manual, sistem mengambil data 3 hari yang lalu
  * Auto-fetch setiap hari jam 06:00 WIB (23:00 UTC) via pg_cron
  * Keyword "branded" otomatis ditandai jika mengandung:
    ugc, utama global, utamaglobal, indocargo, utama indo cargo


================================================================================
  FASE 4: GOOGLE ANALYTICS 4
  (Organic Sessions, Engagement, Bounce Rate, Conversions)
================================================================================

Data yang diambil dari GA4:
  - Organic search sessions, users, new users
  - Engaged sessions, engagement rate
  - Average session duration, bounce rate
  - Conversions (goals), page views
  - Per-page organic performance (top 500 pages)

--- Prerequisites ---

  * GA4 property sudah aktif untuk website
    Buka: https://analytics.google.com
  * Akun Google yang dipakai untuk OAuth punya akses Admin/Editor

--- Cara Cek GA4 Property ID ---

1. Buka https://analytics.google.com
2. Klik gear icon (Admin) di kiri bawah
3. Di kolom "Property", klik "Property Settings"
4. Property ID terlihat di bagian atas, contoh: 123456789
   (hanya angka, tanpa prefix "properties/")

--- Aktivasi di Aplikasi ---

1. Pastikan Fase 2 sudah selesai (OAuth Client + env vars)
2. Buka aplikasi > Marketing > SEO-SEM > tab Settings
3. Klik "Connect Google Analytics"
4. Login dengan akun Google yang punya akses ke GA4
5. Berikan izin yang diminta
6. Sistem otomatis detect Property ID (property pertama)
7. Jika Property ID tidak otomatis terdetect:
   - Masukkan Property ID manual di field yang tersedia
   - Masukkan domain site (contoh: utamaglobalindocargo.com)
   - Klik "Save"
8. Klik "Fetch Now" untuk test

--- Catatan Penting ---

  * GA4 data biasanya tersedia dalam 24-48 jam
  * Sistem hanya mengambil data channel "Organic Search"
  * Property ID HARUS benar agar data bisa ditarik


================================================================================
  FASE 5: VERCEL ENVIRONMENT VARIABLES
  (Wajib untuk Production)
================================================================================

Semua credential harus disimpan sebagai Environment Variables di Vercel.
JANGAN pernah hardcode credential di source code.

--- Cara Set di Vercel ---

1. Buka https://vercel.com/dashboard
2. Pilih project "ugc-business-command-portal"
3. Klik "Settings" > "Environment Variables"
4. Tambahkan variable berikut:

   ┌─────────────────────────┬──────────────────────────────────────────┐
   │ Variable Name           │ Nilai                                    │
   ├─────────────────────────┼──────────────────────────────────────────┤
   │ GOOGLE_CLIENT_ID        │ xxxx.apps.googleusercontent.com          │
   │ GOOGLE_CLIENT_SECRET    │ GOCSPX-xxxxxxxxxx                       │
   │ PAGESPEED_API_KEY       │ AIzaSyxxxxxxxxxxxxxxxxxx                 │
   └─────────────────────────┴──────────────────────────────────────────┘

   Environment: Production, Preview, Development (centang semua)

5. Klik "Save" untuk setiap variable

6. REDEPLOY aplikasi agar env vars aktif:
   - Buka tab "Deployments"
   - Klik "..." pada deployment terakhir > "Redeploy"
   - ATAU push commit baru ke trigger auto-deploy

--- Verifikasi ---

Setelah redeploy:
  - Buka SEO-SEM > Settings
  - Jika banner kuning "Google OAuth belum dikonfigurasi" hilang,
    berarti GOOGLE_CLIENT_ID sudah terbaca
  - Tombol "Connect Google Search Console" dan "Connect Google Analytics"
    akan muncul


================================================================================
  FASE 6: AKTIVASI DI APLIKASI
  (Step-by-Step Connect Semua Service)
================================================================================

Setelah semua env vars di-set dan aplikasi di-redeploy:

--- Step 1: Aktifkan PageSpeed Insights ---

1. Login ke aplikasi sebagai Director/Super Admin
2. Buka: Marketing > SEO-SEM > tab "Settings"
3. Di card "PageSpeed Insights":
   a. Masukkan API Key (jika belum di env var)
   b. Tambahkan URL yang ingin dimonitor:
      - https://www.utamaglobalindocargo.com
      - https://rewards.utamaglobalindocargo.com
      - https://www.ugc.id
   c. Klik "Simpan URL"
   d. Klik "Fetch Now"
4. Buka tab "Web Vitals" - data seharusnya sudah muncul

--- Step 2: Connect Google Search Console ---

1. Di tab "Settings", card "Google Search Console":
   a. Klik "Connect Google Search Console"
   b. Pilih akun Google yang punya akses ke GSC
   c. Grant permission "See your Search Console data"
   d. Anda akan redirect kembali ke aplikasi
   e. Badge berubah menjadi "Connected" (hijau)
   f. Klik "Fetch Now" untuk test

--- Step 3: Connect Google Analytics 4 ---

1. Di tab "Settings", card "Google Analytics 4":
   a. Klik "Connect Google Analytics"
   b. Pilih akun Google yang punya akses ke GA4
   c. Grant permission "See your Google Analytics data"
   d. Anda akan redirect kembali ke aplikasi
   e. Badge berubah menjadi "Connected" (hijau)
   f. Jika Property ID belum terdeteksi:
      - Masukkan Property ID (angka dari GA4 Admin)
      - Masukkan domain site
      - Klik "Save"
   g. Klik "Fetch Now" untuk test

--- Step 4: Verifikasi Semua Service ---

1. Buka tab "SEO Overview":
   - Harus ada data clicks, impressions, CTR (dari GSC)
   - Harus ada data organic sessions (dari GA4)
   - Badge service di atas menunjukkan tanggal last fetch

2. Buka tab "Keywords":
   - Tabel keywords dari GSC

3. Buka tab "Pages":
   - Tabel halaman dengan data GSC + GA4 gabungan

4. Buka tab "Web Vitals":
   - Score performance, Core Web Vitals, TBT
   - Diagnostics & Opportunities
   - Resource Breakdown

--- Jadwal Otomatis (pg_cron) ---

Setelah semua terkoneksi, sistem berjalan otomatis:

  ┌────────────────────────┬────────────────────────┬─────────────┐
  │ Job                    │ Jadwal                 │ Data        │
  ├────────────────────────┼────────────────────────┼─────────────┤
  │ seo-sem-daily-fetch    │ Setiap hari 06:00 WIB  │ GSC + GA4   │
  │ seo-sem-weekly-vitals  │ Senin 07:00 WIB        │ PageSpeed   │
  │ seo-sem-cleanup        │ Minggu 10:00 WIB       │ Hapus >12bl │
  └────────────────────────┴────────────────────────┴─────────────┘


================================================================================
  FASE 7: GOOGLE ADS (Coming Soon)
================================================================================

Status: Belum diimplementasi. Akan tersedia di update berikutnya.

Yang dibutuhkan nanti:
  - Google Ads Developer Token (apply di https://ads.google.com/aw/apicenter)
  - Google Ads Customer ID (format: xxx-xxx-xxxx)
  - Google Ads Manager ID (jika pakai MCC account)

Environment Variables (nanti):
  GOOGLE_ADS_DEVELOPER_TOKEN=
  GOOGLE_ADS_CUSTOMER_ID=
  GOOGLE_ADS_MANAGER_ID=

Data yang akan diambil:
  - Campaign performance (spend, clicks, impressions, conversions)
  - Keyword quality scores
  - Search term reports
  - Budget utilization


================================================================================
  FASE 8: META ADS (Coming Soon)
================================================================================

Status: Belum diimplementasi. Akan tersedia di update berikutnya.

Yang dibutuhkan nanti:
  - Meta Business Suite access
  - Meta Ads Account ID
  - Reuse META_APP_ID/SECRET dari Social Media module

Environment Variables (nanti):
  META_ADS_ACCOUNT_ID=

Data yang akan diambil:
  - Campaign performance (spend, reach, clicks, conversions)
  - Audience insights
  - Ad set breakdown


================================================================================
  BAGIAN I: RINGKASAN ENVIRONMENT VARIABLES
================================================================================

  ┌───────────────────────────┬──────────┬────────────────────────────────────┐
  │ Variable                  │ Wajib?   │ Keterangan                         │
  ├───────────────────────────┼──────────┼────────────────────────────────────┤
  │ GOOGLE_CLIENT_ID          │ Ya*      │ OAuth Client ID dari GCP           │
  │ GOOGLE_CLIENT_SECRET      │ Ya*      │ OAuth Client Secret dari GCP       │
  │ PAGESPEED_API_KEY         │ Opsional │ Bisa juga simpan via UI Settings   │
  │ GOOGLE_ADS_DEVELOPER_TOKEN│ Nanti    │ Fase 7 (belum aktif)               │
  │ GOOGLE_ADS_CUSTOMER_ID   │ Nanti    │ Fase 7 (belum aktif)               │
  │ GOOGLE_ADS_MANAGER_ID    │ Nanti    │ Fase 7 (belum aktif)               │
  │ META_ADS_ACCOUNT_ID      │ Nanti    │ Fase 8 (belum aktif)               │
  └───────────────────────────┴──────────┴────────────────────────────────────┘

  *) Wajib jika ingin menggunakan GSC dan GA4.
     PageSpeed bisa berjalan tanpa OAuth (hanya API Key).

  Catatan: GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET dipakai bersama
  dengan YouTube (Social Media module). Jika sudah di-set untuk YouTube,
  TIDAK perlu membuat yang baru. Cukup tambahkan scope GSC & GA4
  di OAuth Consent Screen.


================================================================================
  BAGIAN J: TROUBLESHOOTING
================================================================================

--- Error: "Google Search Console not configured or token expired" ---

  Penyebab:
  1. Belum connect GSC (klik Connect di Settings)
  2. Token expired dan auto-refresh gagal
  3. GOOGLE_CLIENT_ID/SECRET belum di-set di env vars

  Solusi:
  1. Buka Settings > klik "Connect Google Search Console"
  2. Jika sudah connected tapi error: Disconnect > Connect ulang
  3. Pastikan env vars sudah di-set dan app sudah di-redeploy

--- Error: "Google Analytics not configured or token expired" ---

  Solusi sama dengan GSC di atas, tapi untuk Google Analytics.

--- Error: "PageSpeed API key not configured" ---

  Solusi:
  1. Set PAGESPEED_API_KEY di Vercel env vars, ATAU
  2. Masukkan API Key via UI: Settings > PageSpeed > API Key > Save

--- Error: "GA4 property_id not configured" ---

  Penyebab: Property ID belum di-set setelah connect GA4.

  Solusi:
  1. Buka GA4 Admin > Property Settings > catat Property ID (angka)
  2. Di Settings > Google Analytics > masukkan Property ID > Save

--- Web Vitals menunjukkan "N/A" untuk INP ---

  INP (Interaction to Next Paint) adalah field metric dari Chrome UX Report.
  Data hanya tersedia jika:
  - Website punya cukup traffic (real user data)
  - Chrome user mengunjungi halaman tersebut

  Ini NORMAL untuk website dengan traffic rendah.
  LCP, CLS, TBT, FCP, TTFB tetap tersedia dari lab test.

--- Data GSC/GA4 kosong setelah Fetch Now ---

  Penyebab:
  1. Data GSC tertunda 2-3 hari (Google memproses)
  2. Tanggal target mungkin belum ada data
  3. Property ID GA4 salah

  Solusi:
  1. Coba lagi besok (data hari ini belum tersedia di GSC)
  2. Pastikan website punya traffic organic
  3. Verifikasi Property ID di GA4 Admin

--- OAuth redirect error ---

  Penyebab: Redirect URI tidak cocok dengan yang didaftarkan di GCP.

  Solusi:
  1. Buka GCP > Credentials > edit OAuth Client
  2. Pastikan Authorized Redirect URI persis:
     https://DOMAIN_ANDA/api/auth/google/callback
  3. Tidak boleh ada trailing slash
  4. Harus HTTPS (kecuali localhost)

--- Token refresh gagal berulang ---

  Penyebab: Refresh token dicabut atau OAuth consent revoked.

  Solusi:
  1. Disconnect service di Settings
  2. Buka https://myaccount.google.com/permissions
  3. Revoke akses "UGC Business Command Portal"
  4. Connect ulang di Settings (ini akan generate refresh token baru)


================================================================================
  BAGIAN K: FAQ
================================================================================

Q: Siapa yang bisa mengakses modul SEO-SEM?
A: Director, Super Admin, Marketing Manager, Marcomm, DGO, MACX, VDCO.

Q: Siapa yang bisa mengubah Settings (connect/disconnect)?
A: Hanya Director dan Super Admin.

Q: Apakah data realtime?
A: Tidak. GSC tertunda 2-3 hari. GA4 tertunda 24-48 jam.
   PageSpeed diambil saat fetch (bisa manual atau terjadwal).

Q: Berapa biaya Google APIs?
A: GRATIS untuk semua yang digunakan:
   - PageSpeed Insights: 25.000 queries/hari
   - Google Search Console API: Gratis unlimited
   - Google Analytics Data API: 200.000 tokens/hari (lebih dari cukup)

Q: Apakah perlu membuat project GCP terpisah?
A: Tidak. Gunakan project GCP yang sama dengan Social Media module
   (YouTube). Cukup tambahkan API baru dan scope OAuth.

Q: Bagaimana jika token expired?
A: Sistem otomatis refresh menggunakan refresh_token. Jika refresh
   gagal (misal: password akun Google berubah), perlu connect ulang.

Q: Data disimpan berapa lama?
A: Auto-cleanup via pg_cron:
   - SEO data (daily, keywords, pages): 12 bulan
   - Web Vitals: 6 bulan
   - SEM data: 12 bulan

Q: Bisa monitor lebih dari 1 website?
A: Ya! Tambahkan beberapa URL di PageSpeed Settings.
   GSC otomatis detect semua site yang terverifikasi.
   GA4 mengambil data dari 1 property (pilih yang utama).

Q: Apa bedanya "Lab Data" dan "Field Data" di Web Vitals?
A: Lab Data = Lighthouse simulasi (FCP, TBT, Speed Index, LCP lab)
   Field Data = Chrome UX Report dari real users (INP, LCP field, CLS field)
   Sistem mengambil KEDUA-nya untuk analisis lengkap.


================================================================================
  CHECKLIST IMPLEMENTASI
================================================================================

  [ ] Fase 1: PageSpeed API Key sudah di-buat dan di-set
  [ ] Fase 1: URL website sudah ditambahkan di Settings
  [ ] Fase 1: Web Vitals berhasil di-fetch (tab Web Vitals ada data)

  [ ] Fase 2: OAuth Client ID sudah di-buat di GCP
  [ ] Fase 2: Redirect URI sudah ditambahkan (production + localhost)
  [ ] Fase 2: 3 Google APIs sudah di-enable (GSC, GA4 Data, GA4 Admin)
  [ ] Fase 2: OAuth Consent Screen sudah dikonfigurasi

  [ ] Fase 3: Website terverifikasi di Google Search Console
  [ ] Fase 3: GSC berhasil connect (badge hijau di Settings)
  [ ] Fase 3: Keywords dan Pages berhasil di-fetch

  [ ] Fase 4: GA4 Property ID sudah di-set
  [ ] Fase 4: GA4 berhasil connect (badge hijau di Settings)
  [ ] Fase 4: Organic sessions data muncul di SEO Overview

  [ ] Fase 5: GOOGLE_CLIENT_ID di-set di Vercel
  [ ] Fase 5: GOOGLE_CLIENT_SECRET di-set di Vercel
  [ ] Fase 5: PAGESPEED_API_KEY di-set di Vercel (atau via UI)
  [ ] Fase 5: Aplikasi sudah di-redeploy setelah set env vars

  [ ] Fase 6: Semua 3 service menunjukkan "Connected" di Settings
  [ ] Fase 6: Tab SEO Overview menampilkan data lengkap
  [ ] Fase 6: Tab Web Vitals menampilkan score + diagnostics

================================================================================
  END OF DOCUMENT
================================================================================
