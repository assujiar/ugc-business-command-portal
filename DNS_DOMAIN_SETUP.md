# DNS & Domain Setup Guide

Panduan konfigurasi domain **bcp.ugc.id** dan **bcp.utamaglobalindocargo.com** untuk deployment Vercel + Supabase.

---

## Arsitektur

```
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│   bcp.ugc.id    │────▶│   Vercel (Next.js)   │────▶│    Supabase      │
│                 │     │   Frontend + API      │     │  PostgreSQL + Auth│
└─────────────────┘     └──────────────────────┘     └──────────────────┘
┌─────────────────────────────┐        │
│ bcp.utamaglobalindocargo.com│────────┘
└─────────────────────────────┘
```

Kedua domain mengarah ke **satu deployment Vercel yang sama**. Supabase diakses melalui API routes (BFF pattern), bukan langsung dari browser ke Supabase.

---

## 1. Konfigurasi Domain di Vercel

### Step 1: Tambahkan Domain di Vercel Dashboard

1. Buka [Vercel Dashboard](https://vercel.com) → Project **ugc-business-command-portal**
2. Masuk ke **Settings** → **Domains**
3. Tambahkan kedua domain:

| Domain | Tipe |
|--------|------|
| `bcp.ugc.id` | Primary (domain utama) |
| `bcp.utamaglobalindocargo.com` | Secondary (redirect atau mirror) |

4. Vercel akan menampilkan DNS records yang harus dikonfigurasi (lihat Step 2)

### Step 2: Pilih Konfigurasi Domain

**Opsi A - Redirect** (Recommended):
- `bcp.ugc.id` sebagai primary domain
- `bcp.utamaglobalindocargo.com` redirect 308 ke `bcp.ugc.id`
- Semua traffic akhirnya ke satu canonical URL (bagus untuk SEO)

**Opsi B - Mirror**:
- Kedua domain serve konten yang sama tanpa redirect
- Masing-masing domain berdiri sendiri

---

## 2. Konfigurasi DNS Records

### Domain: bcp.ugc.id

Buka DNS management untuk zone `ugc.id` (di registrar atau DNS provider seperti Cloudflare, Niagahoster, dll).

**Opsi A: CNAME Record (Recommended untuk subdomain)**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | `bcp` | `cname.vercel-dns.com.` | 3600 |

**Opsi B: A Record (jika CNAME tidak bisa digunakan)**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `bcp` | `76.76.21.21` | 3600 |

> **Catatan**: IP `76.76.21.21` adalah Vercel's Anycast IP. Jika Vercel mengubah IP-nya, gunakan CNAME saja yang lebih stabil.

---

### Domain: bcp.utamaglobalindocargo.com

Buka DNS management untuk zone `utamaglobalindocargo.com`.

**Opsi A: CNAME Record (Recommended)**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | `bcp` | `cname.vercel-dns.com.` | 3600 |

**Opsi B: A Record**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `bcp` | `76.76.21.21` | 3600 |

---

### Jika Menggunakan Cloudflare

Jika DNS dikelola oleh Cloudflare:

1. **Matikan Proxy (orange cloud) → DNS Only (grey cloud)**
   - Vercel memerlukan DNS-only agar SSL provisioning berjalan
   - Cloudflare proxy akan mengganggu Vercel's SSL certificate
2. Set record CNAME seperti di atas dengan Proxy status: **DNS only**

```
bcp.ugc.id              → CNAME → cname.vercel-dns.com  [DNS only]
bcp.utamaglobalindocargo.com → CNAME → cname.vercel-dns.com  [DNS only]
```

---

## 3. Verifikasi DNS & SSL

### Verifikasi DNS Propagation

Setelah DNS records ditambahkan, cek propagasi:

```bash
# Cek CNAME resolution
dig bcp.ugc.id CNAME +short
# Expected: cname.vercel-dns.com.

dig bcp.utamaglobalindocargo.com CNAME +short
# Expected: cname.vercel-dns.com.

# Cek A record resolution
dig bcp.ugc.id A +short
# Expected: 76.76.21.21

# Atau gunakan nslookup
nslookup bcp.ugc.id
nslookup bcp.utamaglobalindocargo.com
```

Bisa juga cek online di: https://dnschecker.org

### SSL Certificate

- Vercel akan **otomatis** provision SSL certificate (Let's Encrypt) setelah DNS ter-resolve
- Biasanya aktif dalam **beberapa menit** setelah DNS propagation selesai
- Cek status di Vercel Dashboard → Settings → Domains → lihat status "Valid Configuration" dan "SSL Certificate"

---

## 4. Environment Variables di Vercel

Set environment variables di Vercel Dashboard → Settings → Environment Variables:

### Wajib diubah untuk production domain

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_APP_URL` | `https://bcp.ugc.id` |

### Existing variables (pastikan sudah diset)

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<anon key dari Supabase>` |
| `SUPABASE_SERVICE_ROLE_KEY` | `<service role key dari Supabase>` |
| `SMTP_HOST` | `smtp.ugc.co.id` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | `quotation@ugc.co.id` |
| `SMTP_PASS` | `<password>` |
| `SMTP_FROM` | `Quotation \| UGC Logistics <quotation@ugc.co.id>` |
| `CRM_SMTP_HOST` | `smtp.ugc.co.id` |
| `CRM_SMTP_PORT` | `465` |
| `CRM_SMTP_SECURE` | `true` |
| `CRM_SMTP_USER` | `crm@ugc.co.id` |
| `CRM_SMTP_PASS` | `<password>` |
| `CRM_SMTP_FROM` | `CRM UGC Logistics <crm@ugc.co.id>` |
| `CRON_SECRET` | `<random secret>` |

---

## 5. Konfigurasi Supabase

### A. Authentication Redirect URLs

1. Buka **Supabase Dashboard** → **Authentication** → **URL Configuration**
2. Set **Site URL**: `https://bcp.ugc.id`
3. Tambahkan **Redirect URLs**:

```
https://bcp.ugc.id/**
https://bcp.utamaglobalindocargo.com/**
http://localhost:3000/**
```

### B. Update Vault (untuk pg_cron social media fetch)

Jika menggunakan Supabase Vault untuk pg_cron:

1. Buka **Supabase Dashboard** → **Settings** → **Vault**
2. Update secret `app_url`:
   - Name: `app_url`
   - Value: `https://bcp.ugc.id`

Atau via SQL Editor:

```sql
-- Opsi A: Vault (encrypted, recommended)
-- Update di Supabase Dashboard > Settings > Vault

-- Opsi B: Database Settings (simpler)
ALTER DATABASE postgres SET app.settings.app_url = 'https://bcp.ugc.id';
```

### C. CORS / Allowed Origins (jika diperlukan)

Supabase biasanya tidak perlu konfigurasi CORS tambahan karena akses melalui API routes (server-side). Tapi jika ada client-side Supabase calls:

1. Buka **Supabase Dashboard** → **Settings** → **API**
2. Pastikan **Additional Redirect URLs** mencakup domain baru

---

## 6. Google OAuth Configuration

Jika menggunakan Google OAuth (YouTube, Search Console, Analytics):

1. Buka [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Edit **OAuth 2.0 Client ID**
3. Tambahkan **Authorized redirect URIs**:

```
https://bcp.ugc.id/api/auth/google/callback
https://bcp.utamaglobalindocargo.com/api/auth/google/callback
http://localhost:3000/api/auth/google/callback
```

4. Tambahkan **Authorized JavaScript origins**:

```
https://bcp.ugc.id
https://bcp.utamaglobalindocargo.com
http://localhost:3000
```

---

## 7. Checklist Deployment

### DNS Setup
- [ ] CNAME record `bcp.ugc.id` → `cname.vercel-dns.com`
- [ ] CNAME record `bcp.utamaglobalindocargo.com` → `cname.vercel-dns.com`
- [ ] DNS propagation verified (`dig` atau dnschecker.org)
- [ ] Jika pakai Cloudflare: proxy dimatikan (DNS only / grey cloud)

### Vercel
- [ ] Domain `bcp.ugc.id` ditambahkan di Vercel project settings
- [ ] Domain `bcp.utamaglobalindocargo.com` ditambahkan di Vercel project settings
- [ ] SSL certificate issued & valid di kedua domain
- [ ] `NEXT_PUBLIC_APP_URL` diset ke `https://bcp.ugc.id`
- [ ] Semua environment variables terisi di Vercel

### Supabase
- [ ] Site URL diset ke `https://bcp.ugc.id`
- [ ] Redirect URLs mencakup kedua domain + localhost
- [ ] Vault secret `app_url` diupdate ke `https://bcp.ugc.id`

### Third-party Services
- [ ] Google OAuth redirect URIs diupdate
- [ ] SMTP server bisa diakses dari Vercel (port 465)

### Verifikasi Final
- [ ] `https://bcp.ugc.id` bisa diakses dan load halaman login
- [ ] `https://bcp.utamaglobalindocargo.com` bisa diakses (atau redirect ke bcp.ugc.id)
- [ ] Login/logout berfungsi
- [ ] Email notifikasi terkirim
- [ ] Cron jobs berjalan (cek Vercel Functions logs)

---

## Troubleshooting

### DNS belum resolve
- DNS propagation bisa memakan waktu hingga 48 jam (biasanya 15-30 menit)
- Cek di https://dnschecker.org apakah sudah propagate global
- Pastikan tidak ada typo di CNAME value

### SSL Certificate gagal di Vercel
- Pastikan DNS sudah resolve ke Vercel (bukan Cloudflare proxy)
- Matikan Cloudflare proxy jika aktif
- Di Vercel Dashboard, klik "Refresh" pada domain yang bermasalah

### Supabase auth redirect error
- Pastikan domain sudah ada di Supabase Redirect URLs
- Site URL harus tanpa trailing slash: `https://bcp.ugc.id` (bukan `https://bcp.ugc.id/`)

### Vercel cron jobs tidak jalan
- Cek apakah `CRON_SECRET` sudah diset
- Cek Vercel Functions logs di dashboard
- Pastikan `vercel.json` sudah ter-deploy (cron schedule terdaftar)

### Hardcoded URL di codebase
Beberapa file masih menggunakan hardcoded URL. Pastikan `NEXT_PUBLIC_APP_URL` digunakan:

| File | Issue |
|------|-------|
| `src/app/api/ticketing/customer-quotations/[id]/send/route.ts` | Hardcoded `ugc-business-command-portal.vercel.app` |
| `src/app/api/ticketing/customer-quotations/[id]/pdf/route.ts` | Hardcoded `ugc-business-command-portal.vercel.app` |

Gunakan `process.env.NEXT_PUBLIC_APP_URL` sebagai pengganti hardcoded URL.
