-- ============================================
-- Ticketing Module - Enums
-- Part of UGC Business Command Portal Integration
-- ============================================

-- Ticket Type: RFQ (Request for Quote) or GEN (General Inquiry)
DO $$ BEGIN
    CREATE TYPE ticket_type AS ENUM ('RFQ', 'GEN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ticket Status with workflow states
DO $$ BEGIN
    CREATE TYPE ticket_status AS ENUM (
        'open',
        'need_response',
        'in_progress',
        'waiting_customer',
        'need_adjustment',
        'pending',
        'resolved',
        'closed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ticket Priority
DO $$ BEGIN
    CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ticket Close Outcome
DO $$ BEGIN
    CREATE TYPE ticket_close_outcome AS ENUM ('won', 'lost');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Quote Status
DO $$ BEGIN
    CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ticket Event Type (for audit trail)
DO $$ BEGIN
    CREATE TYPE ticket_event_type AS ENUM (
        'created',
        'assigned',
        'reassigned',
        'status_changed',
        'priority_changed',
        'comment_added',
        'attachment_added',
        'quote_created',
        'quote_sent',
        'resolved',
        'closed',
        'reopened'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ticketing Department (maps to operational departments)
DO $$ BEGIN
    CREATE TYPE ticketing_department AS ENUM (
        'MKT',  -- Marketing
        'SAL',  -- Sales
        'DOM',  -- Domestics Operations
        'EXI',  -- Exim Operations
        'DTD',  -- Import DTD Operations
        'TRF'   -- Warehouse & Traffic Operations
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE ticket_type IS 'Ticket types: RFQ for rate quotes, GEN for general inquiries';
COMMENT ON TYPE ticket_status IS 'Ticket workflow statuses';
COMMENT ON TYPE ticket_priority IS 'Ticket priority levels';
COMMENT ON TYPE ticket_close_outcome IS 'Ticket close outcomes for tracking win/loss';
COMMENT ON TYPE quote_status IS 'Rate quote statuses';
COMMENT ON TYPE ticket_event_type IS 'Event types for ticket audit trail';
COMMENT ON TYPE ticketing_department IS 'Department codes for ticketing assignment';
