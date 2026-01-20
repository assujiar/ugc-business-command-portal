-- =====================================================
-- Migration: 039_ticketing_storage_bucket.sql
-- Storage Bucket Setup for Ticketing Attachments
-- =====================================================
-- This migration creates the storage bucket for ticketing file attachments
-- Used by: ticket attachments upload feature
--
-- NOTE: Storage bucket creation requires admin/service role access
-- If this migration fails, create the bucket manually via Supabase Dashboard:
-- 1. Go to Storage in Supabase Dashboard
-- 2. Create a new bucket named 'ticketing-attachments'
-- 3. Set it as public or configure RLS policies
-- =====================================================

-- =====================================================
-- 1. CREATE STORAGE BUCKET
-- =====================================================
-- Create the 'ticketing-attachments' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticketing-attachments',
  'ticketing-attachments',
  true,  -- Public bucket for easier access to attachment URLs
  10485760,  -- 10MB max file size (matches API validation)
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain',
    'text/csv'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =====================================================
-- 2. ADD file_path COLUMN TO ticket_attachments
-- =====================================================
-- Add file_path column to store the storage path
ALTER TABLE public.ticket_attachments
ADD COLUMN IF NOT EXISTS file_path TEXT;

-- =====================================================
-- 3. RLS POLICIES FOR TICKETING STORAGE
-- =====================================================
-- Policy: Authenticated users can upload files to ticketing-attachments bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Authenticated users can upload ticketing attachments'
    AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Authenticated users can upload ticketing attachments"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'ticketing-attachments');
  END IF;
END $$;

-- Policy: Authenticated users can view ticketing attachments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Authenticated users can view ticketing attachments'
    AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Authenticated users can view ticketing attachments"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'ticketing-attachments');
  END IF;
END $$;

-- Policy: Authenticated users can update ticketing attachments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Authenticated users can update ticketing attachments'
    AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Authenticated users can update ticketing attachments"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'ticketing-attachments');
  END IF;
END $$;

-- Policy: Authenticated users can delete ticketing attachments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Authenticated users can delete ticketing attachments'
    AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Authenticated users can delete ticketing attachments"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'ticketing-attachments');
  END IF;
END $$;

-- Policy: Public read access for ticketing attachments (since bucket is public)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read access for ticketing attachments'
    AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Public read access for ticketing attachments"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'ticketing-attachments');
  END IF;
END $$;

-- =====================================================
-- 4. COMMENTS
-- =====================================================
COMMENT ON COLUMN public.ticket_attachments.file_path IS 'Storage path in ticketing-attachments bucket';

-- =====================================================
-- Storage Folder Structure:
-- =====================================================
-- ticketing-attachments/
--   └── tickets/
--       └── {ticket_code}/
--           └── {timestamp}_{filename}
-- =====================================================
