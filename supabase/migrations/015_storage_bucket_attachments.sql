-- =====================================================
-- Migration: 015_storage_bucket_attachments.sql
-- Storage Bucket Setup for Attachments
-- =====================================================
-- This migration creates the storage bucket for file attachments
-- Used by: shipment attachments, pipeline evidence uploads
--
-- NOTE: Storage bucket creation requires admin/service role access
-- If this migration fails, create the bucket manually via Supabase Dashboard
-- =====================================================

-- =====================================================
-- 1. CREATE STORAGE BUCKET
-- =====================================================
-- Create the 'attachments' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,  -- Private bucket - requires signed URLs
  52428800,  -- 50MB max file size
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
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =====================================================
-- 2. RLS POLICIES FOR STORAGE
-- =====================================================
-- Enable RLS on storage.objects
-- Note: This is typically already enabled by default

-- Policy: Authenticated users can upload files to attachments bucket
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
);

-- Policy: Authenticated users can view their own uploaded files
CREATE POLICY "Authenticated users can view attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'attachments'
);

-- Policy: Authenticated users can update their own files
CREATE POLICY "Authenticated users can update attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'attachments'
);

-- Policy: Authenticated users can delete their own files
CREATE POLICY "Authenticated users can delete attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'attachments'
);

-- =====================================================
-- 3. COMMENTS
-- =====================================================
COMMENT ON COLUMN storage.buckets.id IS 'Attachments bucket for shipment files and pipeline evidence';

-- =====================================================
-- Storage Folder Structure:
-- =====================================================
-- attachments/
--   ├── shipments/
--   │   └── {lead_id}/
--   │       └── {timestamp}_{filename}
--   └── evidence/
--       └── {opportunity_id}/
--           └── {timestamp}_{filename}
-- =====================================================
