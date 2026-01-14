# Supabase Storage Bucket Setup Guide

## Overview

Aplikasi ini membutuhkan storage bucket `attachments` untuk menyimpan:
- **Shipment Attachments**: File lampiran untuk lead/shipment (PDF, DOC, gambar, dll)
- **Pipeline Evidence**: Bukti update pipeline (foto kunjungan, dokumen, dll)

## Method 1: Via Migration (Recommended)

Migration file sudah tersedia di `supabase/migrations/015_storage_bucket_attachments.sql`

### Langkah-langkah:

1. **Pastikan Supabase CLI terinstall**
   ```bash
   npm install -g supabase
   ```

2. **Login ke Supabase**
   ```bash
   supabase login
   ```

3. **Link project (jika belum)**
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. **Jalankan migration**
   ```bash
   supabase db push
   ```

---

## Method 2: Via Supabase Dashboard (Manual)

Jika migration gagal, ikuti langkah-langkah berikut di Supabase Dashboard:

### Step 1: Buat Storage Bucket

1. Buka [Supabase Dashboard](https://supabase.com/dashboard)
2. Pilih project Anda
3. Navigasi ke **Storage** di sidebar kiri
4. Klik **New bucket**
5. Isi detail:
   - **Name**: `attachments`
   - **Public bucket**: ❌ **JANGAN centang** (harus private)
   - **File size limit**: `52428800` (50MB)
   - **Allowed MIME types**:
     ```
     application/pdf
     application/msword
     application/vnd.openxmlformats-officedocument.wordprocessingml.document
     application/vnd.ms-excel
     application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
     image/jpeg
     image/png
     image/gif
     image/webp
     text/csv
     ```
6. Klik **Create bucket**

### Step 2: Konfigurasi RLS Policies

1. Di halaman Storage, klik bucket `attachments`
2. Klik tab **Policies**
3. Klik **New policy** untuk setiap policy berikut:

#### Policy 1: Upload (INSERT)
- **Policy name**: `Authenticated users can upload attachments`
- **Allowed operation**: `INSERT`
- **Target roles**: `authenticated`
- **WITH CHECK expression**:
  ```sql
  bucket_id = 'attachments'
  ```

#### Policy 2: View (SELECT)
- **Policy name**: `Authenticated users can view attachments`
- **Allowed operation**: `SELECT`
- **Target roles**: `authenticated`
- **USING expression**:
  ```sql
  bucket_id = 'attachments'
  ```

#### Policy 3: Update (UPDATE)
- **Policy name**: `Authenticated users can update attachments`
- **Allowed operation**: `UPDATE`
- **Target roles**: `authenticated`
- **USING expression**:
  ```sql
  bucket_id = 'attachments'
  ```

#### Policy 4: Delete (DELETE)
- **Policy name**: `Authenticated users can delete attachments`
- **Allowed operation**: `DELETE`
- **Target roles**: `authenticated`
- **USING expression**:
  ```sql
  bucket_id = 'attachments'
  ```

---

## Method 3: Via SQL Editor

1. Buka Supabase Dashboard
2. Navigasi ke **SQL Editor**
3. Jalankan SQL berikut:

```sql
-- Create attachments bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/csv'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy: Upload
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'attachments');

-- RLS Policy: View
CREATE POLICY "Authenticated users can view attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'attachments');

-- RLS Policy: Update
CREATE POLICY "Authenticated users can update attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'attachments');

-- RLS Policy: Delete
CREATE POLICY "Authenticated users can delete attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'attachments');
```

---

## Verifikasi Setup

Setelah setup selesai, verifikasi dengan langkah berikut:

### 1. Cek Bucket Exists
```sql
SELECT * FROM storage.buckets WHERE id = 'attachments';
```

### 2. Cek Policies
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'objects'
AND schemaname = 'storage';
```

### 3. Test Upload di Aplikasi
1. Login ke aplikasi
2. Buka form Add Lead
3. Upload file attachment
4. Pastikan tidak ada error

---

## Struktur Folder Storage

```
attachments/
├── shipments/
│   └── {lead_id}/
│       └── {timestamp}_{filename}
└── evidence/
    └── {opportunity_id}/
        └── {timestamp}_{filename}
```

---

## Troubleshooting

### Error: "Bucket not found"
- Pastikan bucket `attachments` sudah dibuat
- Cek nama bucket harus persis `attachments` (case-sensitive)

### Error: "new row violates row-level security policy"
- Pastikan RLS policies sudah dibuat
- Pastikan user sudah authenticated

### Error: "File type not allowed"
- Cek allowed_mime_types di bucket settings
- Pastikan file type sesuai dengan yang diizinkan

### Error: "File size limit exceeded"
- Default limit: 50MB
- Adjust `file_size_limit` jika perlu

---

## File Terkait di Codebase

| File | Fungsi |
|------|--------|
| `src/app/api/crm/leads/attachments/route.ts` | API upload shipment attachments |
| `src/app/api/crm/pipeline/update/route.ts` | API upload pipeline evidence |
| `src/components/crm/add-lead-dialog.tsx` | Frontend form dengan file upload |
| `supabase/migrations/013_tables_shipment.sql` | Database table `shipment_attachments` |
| `supabase/migrations/015_storage_bucket_attachments.sql` | Storage bucket migration |
