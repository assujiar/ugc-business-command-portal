-- =====================================================
-- Migration: 044_add_sender_visibility_to_tickets.sql
-- Add sender info fields and visibility toggle for Ops
-- =====================================================
-- When creating RFQ ticket, user can choose to show/hide
-- sender information from Ops users
-- =====================================================

-- Add sender info columns to tickets table
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS sender_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS sender_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS sender_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS show_sender_to_ops BOOLEAN DEFAULT true;

-- Add comments
COMMENT ON COLUMN public.tickets.sender_name IS 'Contact name for this ticket (copied from account/contact)';
COMMENT ON COLUMN public.tickets.sender_email IS 'Contact email for this ticket (copied from account/contact)';
COMMENT ON COLUMN public.tickets.sender_phone IS 'Contact phone for this ticket (copied from account/contact)';
COMMENT ON COLUMN public.tickets.show_sender_to_ops IS 'Whether Ops users can see sender info (name, email, phone, account)';

-- Create index for the visibility flag
CREATE INDEX IF NOT EXISTS idx_tickets_show_sender_to_ops ON public.tickets(show_sender_to_ops);
