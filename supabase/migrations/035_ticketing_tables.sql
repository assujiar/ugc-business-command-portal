-- ============================================
-- Ticketing Module - Core Tables
-- Part of UGC Business Command Portal Integration
-- Links to CRM's profiles and accounts tables
-- ============================================

-- ============================================
-- TICKET SEQUENCES TABLE
-- For generating unique ticket codes with daily sequence
-- Format: [TYPE][DEPT]ddmmyyxxx (e.g., RFQDOM200126001)
-- ============================================
CREATE TABLE IF NOT EXISTS public.ticket_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_type ticket_type NOT NULL,
    department ticketing_department NOT NULL,
    date_key VARCHAR(6) NOT NULL, -- ddmmyy format
    last_sequence INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ticket_type, department, date_key)
);

COMMENT ON TABLE public.ticket_sequences IS 'Sequence tracking for ticket code generation';

-- ============================================
-- SLA CONFIG TABLE
-- SLA targets per department/ticket type
-- ============================================
CREATE TABLE IF NOT EXISTS public.ticketing_sla_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department ticketing_department NOT NULL,
    ticket_type ticket_type NOT NULL,
    first_response_hours INTEGER DEFAULT 24,
    resolution_hours INTEGER DEFAULT 72,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(department, ticket_type)
);

COMMENT ON TABLE public.ticketing_sla_config IS 'SLA targets per department and ticket type';

-- ============================================
-- TICKETS TABLE
-- Main ticket entity - links to CRM accounts
-- ============================================
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_code VARCHAR(20) UNIQUE NOT NULL,
    ticket_type ticket_type NOT NULL,
    status ticket_status DEFAULT 'open',
    priority ticket_priority DEFAULT 'medium',
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    department ticketing_department NOT NULL,

    -- Link to CRM accounts (optional but recommended)
    account_id UUID REFERENCES public.accounts(account_id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(contact_id) ON DELETE SET NULL,

    -- User references (using CRM profiles)
    created_by UUID NOT NULL REFERENCES public.profiles(user_id),
    assigned_to UUID REFERENCES public.profiles(user_id),

    -- RFQ specific data (JSON for flexibility)
    rfq_data JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    first_response_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,

    -- Close tracking
    close_outcome ticket_close_outcome,
    close_reason TEXT,
    competitor_name VARCHAR(255),
    competitor_cost DECIMAL(15, 2)
);

COMMENT ON TABLE public.tickets IS 'All ticket records (RFQ and GEN types) - links to CRM accounts';

-- Create indexes for tickets
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_code ON public.tickets(ticket_code);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type ON public.tickets(ticket_type);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON public.tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_department ON public.tickets(department);
CREATE INDEX IF NOT EXISTS idx_tickets_account_id ON public.tickets(account_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON public.tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON public.tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status_dept ON public.tickets(status, department);

-- ============================================
-- TICKET EVENTS TABLE (AUDIT TRAIL)
-- Append-only event log for all ticket actions
-- ============================================
CREATE TABLE IF NOT EXISTS public.ticket_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    event_type ticket_event_type NOT NULL,
    actor_user_id UUID NOT NULL REFERENCES public.profiles(user_id),

    -- Event data
    old_value JSONB,
    new_value JSONB,
    notes TEXT,

    -- Metadata
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.ticket_events IS 'Append-only audit trail for all ticket actions';

-- Create indexes for ticket_events
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id ON public.ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_events_event_type ON public.ticket_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ticket_events_actor ON public.ticket_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_events_created_at ON public.ticket_events(created_at DESC);

-- ============================================
-- TICKET ASSIGNMENTS TABLE
-- Track assignment history
-- ============================================
CREATE TABLE IF NOT EXISTS public.ticket_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    assigned_to UUID NOT NULL REFERENCES public.profiles(user_id),
    assigned_by UUID NOT NULL REFERENCES public.profiles(user_id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);

COMMENT ON TABLE public.ticket_assignments IS 'Ticket assignment history';

-- Create indexes for ticket_assignments
CREATE INDEX IF NOT EXISTS idx_ticket_assignments_ticket_id ON public.ticket_assignments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assignments_assigned_to ON public.ticket_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_ticket_assignments_assigned_at ON public.ticket_assignments(assigned_at DESC);

-- ============================================
-- TICKET COMMENTS TABLE
-- Internal and external communications
-- ============================================
CREATE TABLE IF NOT EXISTS public.ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(user_id),
    content TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE,

    -- For tracking response times
    response_time_seconds INTEGER,
    response_direction VARCHAR(20), -- 'inbound' or 'outbound'

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.ticket_comments IS 'Ticket comments (internal notes and customer communications)';

-- Create indexes for ticket_comments
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON public.ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_user_id ON public.ticket_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_created_at ON public.ticket_comments(created_at DESC);

-- ============================================
-- TICKET ATTACHMENTS TABLE
-- File storage references
-- ============================================
CREATE TABLE IF NOT EXISTS public.ticket_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES public.ticket_comments(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL, -- bytes
    uploaded_by UUID NOT NULL REFERENCES public.profiles(user_id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.ticket_attachments IS 'File attachments for tickets';

-- Create indexes for ticket_attachments
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id ON public.ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_comment_id ON public.ticket_attachments(comment_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_uploaded_by ON public.ticket_attachments(uploaded_by);

-- ============================================
-- TICKET RATE QUOTES TABLE
-- Rate proposals for RFQ tickets
-- ============================================
CREATE TABLE IF NOT EXISTS public.ticket_rate_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    quote_number VARCHAR(30) UNIQUE NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'IDR',
    valid_until DATE NOT NULL,
    terms TEXT,
    status quote_status DEFAULT 'draft',
    created_by UUID NOT NULL REFERENCES public.profiles(user_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.ticket_rate_quotes IS 'Rate quotes/proposals for RFQ tickets';

-- Create indexes for ticket_rate_quotes
CREATE INDEX IF NOT EXISTS idx_ticket_rate_quotes_ticket_id ON public.ticket_rate_quotes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_rate_quotes_quote_number ON public.ticket_rate_quotes(quote_number);
CREATE INDEX IF NOT EXISTS idx_ticket_rate_quotes_status ON public.ticket_rate_quotes(status);
CREATE INDEX IF NOT EXISTS idx_ticket_rate_quotes_created_by ON public.ticket_rate_quotes(created_by);

-- ============================================
-- SLA TRACKING TABLE
-- Track actual SLA performance per ticket
-- ============================================
CREATE TABLE IF NOT EXISTS public.ticket_sla_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID UNIQUE NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    first_response_at TIMESTAMPTZ,
    first_response_sla_hours INTEGER NOT NULL,
    first_response_met BOOLEAN,
    resolution_at TIMESTAMPTZ,
    resolution_sla_hours INTEGER NOT NULL,
    resolution_met BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.ticket_sla_tracking IS 'Actual SLA performance tracking per ticket';

-- Create index for ticket_sla_tracking
CREATE INDEX IF NOT EXISTS idx_ticket_sla_tracking_ticket_id ON public.ticket_sla_tracking(ticket_id);

-- ============================================
-- UPDATED_AT TRIGGER FOR TICKETING TABLES
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_ticketing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
DROP TRIGGER IF EXISTS set_ticketing_updated_at ON public.tickets;
CREATE TRIGGER set_ticketing_updated_at
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticketing_updated_at();

DROP TRIGGER IF EXISTS set_ticketing_updated_at ON public.ticket_sequences;
CREATE TRIGGER set_ticketing_updated_at
    BEFORE UPDATE ON public.ticket_sequences
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticketing_updated_at();

DROP TRIGGER IF EXISTS set_ticketing_updated_at ON public.ticketing_sla_config;
CREATE TRIGGER set_ticketing_updated_at
    BEFORE UPDATE ON public.ticketing_sla_config
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticketing_updated_at();

DROP TRIGGER IF EXISTS set_ticketing_updated_at ON public.ticket_comments;
CREATE TRIGGER set_ticketing_updated_at
    BEFORE UPDATE ON public.ticket_comments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticketing_updated_at();

DROP TRIGGER IF EXISTS set_ticketing_updated_at ON public.ticket_rate_quotes;
CREATE TRIGGER set_ticketing_updated_at
    BEFORE UPDATE ON public.ticket_rate_quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticketing_updated_at();

DROP TRIGGER IF EXISTS set_ticketing_updated_at ON public.ticket_sla_tracking;
CREATE TRIGGER set_ticketing_updated_at
    BEFORE UPDATE ON public.ticket_sla_tracking
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticketing_updated_at();

-- ============================================
-- SEED DATA: SLA CONFIG (Default SLA for each department)
-- ============================================
INSERT INTO public.ticketing_sla_config (department, ticket_type, first_response_hours, resolution_hours)
VALUES
    -- Marketing
    ('MKT', 'RFQ', 4, 48),
    ('MKT', 'GEN', 4, 24),
    -- Sales
    ('SAL', 'RFQ', 4, 48),
    ('SAL', 'GEN', 4, 24),
    -- Domestics Operations
    ('DOM', 'RFQ', 4, 48),
    ('DOM', 'GEN', 4, 24),
    -- Exim Operations
    ('EXI', 'RFQ', 4, 48),
    ('EXI', 'GEN', 4, 24),
    -- Import DTD Operations
    ('DTD', 'RFQ', 4, 48),
    ('DTD', 'GEN', 4, 24),
    -- Warehouse & Traffic Operations
    ('TRF', 'RFQ', 4, 48),
    ('TRF', 'GEN', 4, 24)
ON CONFLICT (department, ticket_type) DO UPDATE SET
    first_response_hours = EXCLUDED.first_response_hours,
    resolution_hours = EXCLUDED.resolution_hours;
